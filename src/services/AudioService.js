import { eventBus } from './EventBus.js';

/**
 * AudioService — manages microphone, push-to-talk, audio visualization, and recording
 * 
 * Key fix: Instead of using MediaRecorder timeslice (which produces fragments),
 * we cycle the recorder — stop + start — every N seconds to produce standalone files.
 */
export class AudioService {
  constructor() {
    this.stream = null;
    this.mediaRecorder = null;
    this.audioContext = null;
    this.analyser = null;
    this.isRecording = false;
    this.isPaused = false;
    this.isPTTActive = false;
    this.fullChunks = []; // all audio data for full recording
    this.cycleTimer = null;
    this.visualizerData = new Uint8Array(32);
    this.animFrameId = null;
    this.currentChunks = []; // chunks for current cycle
    this.currentSpeaker = 'client';
    
    // VAD State
    this.cycleStartTime = 0;
    this.lastSpeechTime = 0;
    this.isSpeaking = false;
  }

  async init() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        } 
      });

      // Audio context for visualization
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);

      this.visualizerData = new Uint8Array(this.analyser.frequencyBinCount);
      this._startVisualizerLoop();

      eventBus.emit('audio:ready');
      return true;
    } catch (err) {
      console.error('Microphone access failed:', err);
      eventBus.emit('audio:error', { message: 'Microphone access denied. Please allow microphone access.' });
      return false;
    }
  }

  startRecording() {
    if (!this.stream || this.isRecording) return;
    this.isRecording = true;
    this.fullChunks = [];
    this._startCycle();
    eventBus.emit('audio:recording-started');
  }

  stopRecording() {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.isPaused = false;
    clearTimeout(this.cycleTimer);
    
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    
    eventBus.emit('audio:recording-stopped');
  }

  pauseRecording() {
    if (!this.isRecording || this.isPaused) return;
    this.isPaused = true;
    clearTimeout(this.cycleTimer);
    
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    
    eventBus.emit('audio:recording-paused');
  }

  resumeRecording() {
    if (!this.isRecording || !this.isPaused) return;
    this.isPaused = false;
    this._startCycle();
    eventBus.emit('audio:recording-resumed');
  }

  /**
   * Start a new recording cycle. Each cycle produces a standalone audio file.
   * We stop the previous recorder and start a new one every ~4 seconds.
   */
  _startCycle() {
    if (!this.isRecording || !this.stream) return;

    const mimeType = this._getSupportedMimeType();
    this.currentChunks = [];
    
    // Capture the speaker for this specific cycle in a closure
    const cycleSpeaker = this.isPTTActive ? 'interviewer' : 'client';
    this.currentSpeaker = cycleSpeaker;

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.currentChunks.push(e.data);
        this.fullChunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      if (this.currentChunks.length > 0) {
        const blob = new Blob(this.currentChunks, { type: mimeType });
        
        // Only send if the blob has meaningful size (> 1KB means there's likely audio)
        if (blob.size > 1000) {
          const ext = mimeType.includes('webm') ? 'webm' 
                    : mimeType.includes('mp4') ? 'mp4' 
                    : mimeType.includes('ogg') ? 'ogg' : 'webm';
          
          eventBus.emit('audio:chunk', {
            blob,
            extension: ext,
            mimeType,
            speaker: cycleSpeaker,
            timestamp: Date.now()
          });
        }
      }
    };

    this.mediaRecorder.start();
    this.cycleStartTime = Date.now();
    this.lastSpeechTime = Date.now();
    this.isSpeaking = false;
  }

  setPTTActive(active) {
    if (this.isPTTActive === active) return;
    this.isPTTActive = active;
    
    // Immediately break the current recording cycle when PTT toggles.
    // This allows the previous chunk to be emitted with the old speaker label,
    // and correctly tags the subsequent chunk with the new speaker label 
    // precisely when the button is pressed/released.
    if (this.isRecording && !this.isPaused && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      setTimeout(() => this._startCycle(), 50);
    } else {
      this.currentSpeaker = active ? 'interviewer' : 'client';
    }

    eventBus.emit('audio:ptt-changed', { active });
  }

  getVisualizerData() {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.visualizerData);
    }
    return this.visualizerData;
  }

  getFullRecording() {
    if (this.fullChunks.length === 0) return null;
    return new Blob(this.fullChunks, { type: this._getSupportedMimeType() });
  }

  _getSupportedMimeType() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'audio/webm';
  }

  _startVisualizerLoop() {
    const loop = () => {
      this.animFrameId = requestAnimationFrame(loop);
      this.getVisualizerData();
      
      // VAD logic for chunking
      if (this.isRecording && !this.isPaused && this.mediaRecorder) {
        let sum = 0;
        for (let i = 0; i < this.visualizerData.length; i++) {
          sum += this.visualizerData[i];
        }
        const avg = sum / this.visualizerData.length;
        
        // Threshold around 5-10 represents speech. Ambient noise is usually lower
        if (avg > 5) {
          this.isSpeaking = true;
          this.lastSpeechTime = Date.now();
        } else if (this.isSpeaking && (Date.now() - this.lastSpeechTime > 1200)) {
          // Silence detected after speech
          const cycleDuration = Date.now() - this.cycleStartTime;
          // Only trigger cycle if chunk is at least 2 seconds, to prevent micro-chunks
          if (cycleDuration > 2000) {
            this.isSpeaking = false;
            // Stop recorder, _startCycle called on next tick
            if (this.mediaRecorder.state === 'recording') {
              this.mediaRecorder.stop();
              setTimeout(() => this._startCycle(), 50);
            }
          }
        }
        
        // Fallback: force chunk if it gets too long (>15s) so we get transcripts
        if (Date.now() - this.cycleStartTime > 15000) {
           if (this.mediaRecorder.state === 'recording') {
              this.mediaRecorder.stop();
              setTimeout(() => this._startCycle(), 50);
           }
        }
      }

      eventBus.emit('audio:visualizer-update', this.visualizerData);
    };
    loop();
  }

  destroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.cycleTimer) clearTimeout(this.cycleTimer);
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    if (this.audioContext) this.audioContext.close();
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.isRecording = false;
  }
}
