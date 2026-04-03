import { eventBus } from './EventBus.js';

/**
 * TranscriptionService — sends audio chunks to OpenAI Whisper API for transcription
 * Tuned for speed: processes chunks sequentially to avoid duplicates
 */
export class TranscriptionService {
  constructor() {
    this.apiKey = '';
    this.isActive = false;
    this.processing = false;
    this.queue = [];
    this.transcriptSegments = [];
    this.segmentId = 0;
    this._boundChunkHandler = null;
  }

  init(apiKey) {
    this.apiKey = apiKey;

    // Remove old listener if re-initializing
    if (this._boundChunkHandler) {
      eventBus.off('audio:chunk', this._boundChunkHandler);
    }

    this._boundChunkHandler = (chunk) => {
      if (this.isActive && this.apiKey) {
        this.queue.push(chunk);
        this._processQueue();
      }
    };

    eventBus.on('audio:chunk', this._boundChunkHandler);
  }

  start() {
    this.isActive = true;
    this.queue = [];
    eventBus.emit('transcription:started');
  }

  stop() {
    this.isActive = false;
    this.queue = [];
    eventBus.emit('transcription:stopped');
  }

  async _processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const chunk = this.queue.shift();
      try {
        // Pre-check: skip chunks with no meaningful audio energy
        const hasSpeech = await this._hasAudioEnergy(chunk.blob);
        if (!hasSpeech) {
          continue;
        }

        const text = await this._transcribeChunk(chunk);
        if (text && text.trim() && !this._isNoise(text.trim())) {
          const segment = {
            id: ++this.segmentId,
            speaker: chunk.speaker,
            text: text.trim(),
            timestamp: chunk.timestamp,
            isFinal: true
          };
          this.transcriptSegments.push(segment);
          eventBus.emit('transcription:segment', segment);
        }
      } catch (err) {
        console.error('Transcription error:', err);
        eventBus.emit('transcription:error', { message: err.message });
      }
    }

    this.processing = false;
  }

  /**
   * Analyse audio blob energy to detect if it contains actual speech.
   * Returns false for silent/ambient-noise-only chunks, saving API calls.
   */
  async _hasAudioEnergy(blob) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      try {
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const channelData = audioBuffer.getChannelData(0);
        
        // Calculate RMS energy
        let sumSquares = 0;
        for (let i = 0; i < channelData.length; i++) {
          sumSquares += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sumSquares / channelData.length);
        
        audioCtx.close();
        
        // Threshold tuned for typical speech vs ambient noise
        // RMS below 0.01 is effectively silence/very quiet background
        return rms > 0.01;
      } catch {
        audioCtx.close();
        // If decoding fails, let it through to Whisper
        return true;
      }
    } catch {
      // If we can't read the blob at all, let it through
      return true;
    }
  }

  async _transcribeChunk(chunk) {
    // Create a properly-named file with the correct extension
    const ext = chunk.extension || 'webm';
    const mimeType = chunk.mimeType || chunk.blob.type || 'audio/webm';
    const file = new File([chunk.blob], `audio.${ext}`, { type: mimeType });
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'text');
    formData.append('language', 'en');
    
    // Use recent transcript as context prompt instead of hardcoded string to avoid hallucinations
    const recentText = this.transcriptSegments.slice(-3).map(s => s.text).join(' ');
    if (recentText) {
      formData.append('prompt', recentText);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      let errMessage;
      try {
        errMessage = JSON.parse(errText).error?.message;
      } catch {
        errMessage = errText;
      }
      throw new Error(errMessage || `Whisper API error: ${response.status}`);
    }

    return await response.text();
  }

  /**
   * Filter out common Whisper hallucinations on silence.
   * Uses both exact match and substring match for comprehensive filtering.
   */
  _isNoise(text) {
    const lower = text.toLowerCase().replace(/[!.,?;:'"()[\]]/g, '').trim();

    // Too short to be meaningful speech
    if (lower.length < 3) return true;

    // Exact-match hallucinations
    const exactPatterns = [
      'you', 'bye', 'the end', 'so', 'um', 'uh', 'hmm',
      'ah', 'oh', 'huh', 'yeah', 'okay', 'ok', 'yes', 'no',
      'thank you', 'thanks', 'thank', 'cheers', 'cheer', 'mate',
      'silence', 'music', 'applause', 'laughter', 'see you', 'oh boy'
    ];
    if (exactPatterns.includes(lower)) return true;

    // Substring-match hallucinations — Whisper outputs these on silence
    const substringPatterns = [
      'thank you for watching',
      'thanks for watching',
      'thank you for listening',
      'thanks for listening',
      'hope you enjoyed',
      'like and subscribe',
      'please subscribe',
      'subscribe to',
      'see you next',
      'see you in the next',
      'next video',
      'next episode',
      'stay tuned',
      'dont forget to',
      'don\'t forget to',
      'hit the bell',
      'leave a comment',
      'share this video',
      'follow me on',
      'check out my',
      'link in the description',
      'thanks for your support',
      'subtitles by',
      'translated by',
      'captions by',
      'transcribed by',
      'copyright',
      'all rights reserved',
      'music playing',
      'background music',
      'review no',
      'pissedconsumer',
      'rev.com',
      'amara.org',
      'its been great'
    ];
    if (substringPatterns.some(p => lower.includes(p))) return true;

    // Repeated single characters/words (e.g. "you you you" or "cheers cheers cheers")
    const words = lower.split(/\s+/);
    if (words.length > 1 && words.every(w => w === words[0]) && words[0].length <= 10) return true;

    // Ellipsis-only or punctuation-only
    if (/^[.\s…]+$/.test(lower)) return true;

    return false;
  }

  getFullTranscript() {
    return this.transcriptSegments.map(s => 
      `[${s.speaker === 'interviewer' ? 'You' : 'Client'}]: ${s.text}`
    ).join('\n');
  }

  getSegments() {
    return [...this.transcriptSegments];
  }

  getRecentSegments(count = 10) {
    return this.transcriptSegments.slice(-count);
  }

  clearTranscript() {
    this.transcriptSegments = [];
    this.segmentId = 0;
  }
}
