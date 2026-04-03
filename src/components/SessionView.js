import { eventBus } from '../services/EventBus.js';

/**
 * SessionView — Main interview session screen
 * Composes TranscriptPanel, ControlBar, and AIPanel
 */
export class SessionView {
  constructor(container, { audioService, transcriptionService, aiService, sessionService }) {
    this.container = container;
    this.audio = audioService;
    this.transcription = transcriptionService;
    this.ai = aiService;
    this.session = sessionService;
    
    this.timerInterval = null;
    this.startTime = Date.now();
    this.elapsedBeforePause = 0;
    this.isPaused = false;
    this.isSpacebarDown = false;
    
    // Transcript state
    this.transcriptEntries = [];
    this.autoScroll = true;
    
    // AI state
    this.aiQuestions = [];
    this.isAIGenerating = false;
    this.streamingText = '';
  }

  render() {
    const session = this.session.getSession();
    
    this.container.innerHTML = `
      <!-- Top Bar -->
      <div class="session-topbar">
        <div class="session-topbar-left">
          <span class="badge badge-live" id="status-badge">LIVE</span>
          <span class="session-timer" id="session-timer">0:00</span>
          <span class="session-intention">${session?.intention || ''}</span>
        </div>
        <div class="session-topbar-right">
          <button class="btn btn-ghost btn-sm" id="settings-btn" title="Settings">⚙️</button>
          <button class="btn btn-danger btn-sm" id="end-session-btn">End Session</button>
        </div>
      </div>

      <!-- Main Area -->
      <div class="session-main">
        <!-- Transcript -->
        <div class="transcript-panel" id="transcript-panel">
          <div class="transcript-empty" id="transcript-empty">
            <div class="transcript-empty-icon">🎙️</div>
            <div>
              <p style="font-size: var(--font-md); color: var(--text-secondary); margin-bottom: var(--space-2);">Ready to record</p>
              <p style="font-size: var(--font-sm);">Hold the microphone button or press <kbd style="background:var(--bg-elevated);padding:2px 8px;border-radius:4px;font-size:var(--font-xs);">Space</kbd> when you're speaking</p>
            </div>
          </div>
          <div id="transcript-entries"></div>
        </div>

        <!-- Control Bar -->
        <div class="control-bar">
          <div class="audio-visualizer" id="audio-visualizer">
            ${Array.from({ length: 16 }, (_, i) => `<div class="audio-bar" id="bar-${i}" style="height: 4px;"></div>`).join('')}
          </div>
          
          <div class="speaker-indicator mode-client" id="speaker-indicator">
            <span id="speaker-icon">👤</span>
            <span id="speaker-label">Client speaking</span>
          </div>

          <button class="ptt-button" id="ptt-button" title="Hold to mark as your speech">
            <span class="ptt-icon">🎙️</span>
            <span style="font-size: 9px;">HOLD</span>
          </button>

          <button class="pause-btn" id="pause-button" title="Pause recording">
            <span class="pause-btn-icon" id="pause-icon">⏸</span>
            <span class="pause-btn-label" id="pause-label">PAUSE</span>
          </button>

          <div class="audio-visualizer" id="audio-visualizer-right">
            ${Array.from({ length: 16 }, (_, i) => `<div class="audio-bar" id="bar-r-${i}" style="height: 4px;"></div>`).join('')}
          </div>
        </div>
      </div>

      <!-- AI Panel -->
      <div class="ai-panel" id="ai-panel">
        <div class="ai-panel-header">
          <span class="panel-title">AI Assistant</span>
          <div style="display:flex;align-items:center;gap:var(--space-2);">
            <select class="select" id="model-selector" style="font-size: var(--font-xs);">
              <option value="claude-sonnet-4-20250514">Sonnet (Fast)</option>
              <option value="claude-opus-4-20250514">Opus (Deep)</option>
            </select>
          </div>
        </div>

        <div class="ai-panel-body" id="ai-panel-body">
          <div class="ai-panel-empty" id="ai-empty">
            <div class="ai-panel-empty-icon">🧠</div>
            <p style="font-size: var(--font-sm);">Start the conversation, then hit<br/>"Suggest Question" for AI-powered follow-ups</p>
          </div>
          <div id="ai-questions-list"></div>
          <div id="ai-streaming" style="display:none;"></div>
        </div>

        <div class="ai-panel-footer">
          <div class="ai-steering-controls">
            <!-- Length Toggles -->
            <div class="length-toggles" id="length-toggles">
              <button class="length-btn" data-value="quick">Quick Fire</button>
              <button class="length-btn active" data-value="standard">Standard</button>
              <button class="length-btn" data-value="long">Detailed</button>
            </div>
            
            <div class="slider-group">
              <div class="slider-labels">
                <span>Lateral (-1)</span>
                <span>Depth</span>
                <span>Deeper (+1)</span>
              </div>
              <input type="range" id="steer-depth" min="-1" max="1" step="1" value="0" class="steer-slider" />
            </div>
            <div class="slider-group" style="margin-top: 8px;">
              <div class="slider-labels">
                <span>Strategy (-1)</span>
                <span>Focus</span>
                <span>Emotion (+1)</span>
              </div>
              <input type="range" id="steer-emotion" min="-1" max="1" step="1" value="0" class="steer-slider" />
            </div>
          </div>
          <button class="btn btn-primary suggest-btn" id="suggest-btn">
            ⚡ Suggest Question
          </button>
        </div>
      </div>
    `;

    this._startServices();
    this._bindEvents();
    this._startTimer();
    this._startVisualizerLoop();
  }

  async _startServices() {
    // Initialize audio
    const audioReady = await this.audio.init();
    if (audioReady) {
      this.audio.startRecording();
      this.transcription.start();
    }
  }

  _bindEvents() {
    // Push-to-talk button (mouse)
    const pttBtn = document.getElementById('ptt-button');
    pttBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._setPTT(true);
    });
    pttBtn.addEventListener('mouseup', () => this._setPTT(false));
    pttBtn.addEventListener('mouseleave', () => {
      if (this.audio.isPTTActive) this._setPTT(false);
    });

    // Push-to-talk button (touch)
    pttBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._setPTT(true);
    });
    pttBtn.addEventListener('touchend', () => this._setPTT(false));

    // Keyboard: Spacebar as PTT
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.isSpacebarDown && !this._isInputFocused()) {
        e.preventDefault();
        this.isSpacebarDown = true;
        this._setPTT(true);
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && this.isSpacebarDown) {
        e.preventDefault();
        this.isSpacebarDown = false;
        this._setPTT(false);
      }
    });

    // Suggest question
    document.getElementById('suggest-btn').addEventListener('click', () => {
      this._requestQuestions();
    });

    // Model selector
    document.getElementById('model-selector').addEventListener('change', (e) => {
      this.ai.setModel(e.target.value);
    });

    // Settings button
    document.getElementById('settings-btn').addEventListener('click', () => {
      eventBus.emit('app:show-settings');
    });

    // Pause / Resume
    document.getElementById('pause-button').addEventListener('click', () => {
      this._togglePause();
    });

    // End session
    document.getElementById('end-session-btn').addEventListener('click', () => {
      this.audio.stopRecording();
      this.transcription.stop();
      clearInterval(this.timerInterval);
      this.session.endSession();
      eventBus.emit('app:end-session');
    });

    // Length toggles
    const lengthBtns = document.querySelectorAll('.length-btn');
    lengthBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        lengthBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Transcript scroll detection
    const panel = document.getElementById('transcript-panel');
    panel.addEventListener('scroll', () => {
      const nearBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 100;
      this.autoScroll = nearBottom;
    });

    // Event listeners
    eventBus.on('transcription:segment', (segment) => this._addTranscriptEntry(segment));
    eventBus.on('ai:generating-start', () => this._onAIStart());
    eventBus.on('ai:generating-delta', (data) => this._onAIDelta(data));
    eventBus.on('ai:questions-ready', (data) => this._onAIReady(data));
    eventBus.on('ai:generating-end', () => this._onAIEnd());
    eventBus.on('ai:error', (data) => this._showToast(data.message, 'error'));
    eventBus.on('audio:error', (data) => this._showToast(data.message, 'error'));
    eventBus.on('transcription:error', (data) => this._showToast(data.message, 'error'));
  }

  _setPTT(active) {
    this.audio.setPTTActive(active);
    const pttBtn = document.getElementById('ptt-button');
    const indicator = document.getElementById('speaker-indicator');
    const icon = document.getElementById('speaker-icon');
    const label = document.getElementById('speaker-label');

    if (active) {
      pttBtn.classList.add('active');
      indicator.className = 'speaker-indicator mode-interviewer';
      icon.textContent = '🎤';
      label.textContent = 'You speaking';
    } else {
      pttBtn.classList.remove('active');
      indicator.className = 'speaker-indicator mode-client';
      icon.textContent = '👤';
      label.textContent = 'Client speaking';
    }
  }

  _addTranscriptEntry(segment) {
    const emptyEl = document.getElementById('transcript-empty');
    if (emptyEl) emptyEl.style.display = 'none';

    const list = document.getElementById('transcript-entries');
    const entry = document.createElement('div');
    entry.className = `transcript-entry speaker-${segment.speaker}`;
    
    const elapsed = Math.floor((segment.timestamp - this.startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    
    entry.innerHTML = `
      <span class="transcript-speaker">${segment.speaker === 'interviewer' ? 'You' : 'Client'}</span>
      <span class="transcript-text">${this._escapeHtml(segment.text)}</span>
      <span class="transcript-timestamp">${mins}:${secs.toString().padStart(2, '0')}</span>
    `;

    list.appendChild(entry);
    this.transcriptEntries.push(segment);
    this.session.addTranscriptSegment(segment);

    // Auto-scroll
    if (this.autoScroll) {
      const panel = document.getElementById('transcript-panel');
      panel.scrollTop = panel.scrollHeight;
    }
  }

  _requestQuestions() {
    const session = this.session.getSession();
    if (!session) return;

    const transcript = this.transcriptEntries.map(s => 
      `[${s.speaker === 'interviewer' ? 'You' : 'Client'}]: ${s.text}`
    ).join('\n');

    const depth = document.getElementById('steer-depth')?.value || 0;
    const emotion = document.getElementById('steer-emotion')?.value || 0;
    const lengthBtn = document.querySelector('.length-btn.active');
    const length = lengthBtn ? lengthBtn.dataset.value : 'standard';

    this.ai.generateQuestions({
      intention: session.intention,
      myContext: session.myContext,
      clientContext: session.clientContext,
      template: session.template,
      transcript,
      steering: { depth: parseInt(depth), emotion: parseInt(emotion), length }
    });
  }

  _onAIStart() {
    this.isAIGenerating = true;
    this.streamingText = '';
    
    const emptyEl = document.getElementById('ai-empty');
    if (emptyEl) emptyEl.style.display = 'none';

    const streamEl = document.getElementById('ai-streaming');
    streamEl.style.display = 'block';
    streamEl.innerHTML = `
      <div class="ai-question" style="border-color: var(--accent-primary);">
        <div class="thinking-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;

    document.getElementById('suggest-btn').disabled = true;
    document.getElementById('suggest-btn').textContent = '⏳ Thinking...';
  }

  _onAIDelta({ text }) {
    this.streamingText = text;
    const streamEl = document.getElementById('ai-streaming');
    streamEl.innerHTML = `
      <div class="ai-question" style="border-color: var(--accent-primary);">
        <div class="ai-question-text" style="white-space: pre-wrap;">${this._escapeHtml(text)}</div>
      </div>
    `;

    // Auto-scroll AI panel
    const panel = document.getElementById('ai-panel-body');
    panel.scrollTop = panel.scrollHeight;
  }

  _onAIReady({ questions }) {
    const streamEl = document.getElementById('ai-streaming');
    streamEl.style.display = 'none';
    streamEl.innerHTML = '';

    const list = document.getElementById('ai-questions-list');
    
    questions.forEach(q => {
      const card = document.createElement('div');
      card.className = 'ai-question';
      card.dataset.questionId = q.id;
      
      const typeLabels = {
        'deeper': { cls: 'type-deeper', text: '🔍 Deeper' },
        'emotion': { cls: 'type-emotion', text: '❤️ Emotion' },
        'edge case': { cls: 'type-edge-case', text: '⚡ Edge Case' },
        'next': { cls: 'type-next', text: '➡️ Next Topic' },
        'follow-up': { cls: 'type-follow-up', text: '➡️ Follow-up' }
      };

      const typeKey = (q.type || 'follow-up').toLowerCase();
      const displayObj = typeLabels[typeKey] || { cls: 'type-follow-up', text: q.type };

      card.innerHTML = `
        <div class="ai-question-text">${this._escapeHtml(q.text)}</div>
        <div class="ai-question-meta">
          <span class="ai-question-type ${displayObj.cls}">${displayObj.text}</span>
          <div class="ai-question-actions">
            ${q.rationale ? `<span class="badge badge-muted" title="${this._escapeHtml(q.rationale)}" style="cursor:help;">💡</span>` : ''}
            <button class="btn btn-ghost btn-sm mark-asked-btn" data-qid="${q.id}" title="Mark as asked">✓ Asked</button>
          </div>
        </div>
      `;

      list.appendChild(card);
      this.session.addQuestion(q);
    });

    // Bind mark-as-asked buttons
    list.querySelectorAll('.mark-asked-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const qid = parseInt(btn.dataset.qid);
        this.ai.markAsked(qid);
        const card = btn.closest('.ai-question');
        card.classList.add('asked');
      });
    });

    // Auto-scroll
    const panel = document.getElementById('ai-panel-body');
    panel.scrollTop = panel.scrollHeight;
  }

  _onAIEnd() {
    this.isAIGenerating = false;
    document.getElementById('suggest-btn').disabled = false;
    document.getElementById('suggest-btn').textContent = '⚡ Suggest Question';
  }

  _togglePause() {
    if (this.isPaused) {
      // Resume
      this.isPaused = false;
      this.startTime = Date.now();
      this.audio.resumeRecording();
      this.transcription.start();
      this._startTimer();

      // Update UI
      const badge = document.getElementById('status-badge');
      badge.className = 'badge badge-live';
      badge.textContent = 'LIVE';
      document.getElementById('pause-icon').textContent = '⏸';
      document.getElementById('pause-label').textContent = 'PAUSE';
      document.getElementById('pause-button').classList.remove('is-paused');
      document.getElementById('ptt-button').disabled = false;
      document.getElementById('ptt-button').style.opacity = '1';
    } else {
      // Pause
      this.isPaused = true;
      this.elapsedBeforePause += Date.now() - this.startTime;
      clearInterval(this.timerInterval);
      this.audio.pauseRecording();
      this.transcription.stop();

      // Update UI
      const badge = document.getElementById('status-badge');
      badge.className = 'badge badge-paused';
      badge.textContent = 'PAUSED';
      document.getElementById('pause-icon').textContent = '▶';
      document.getElementById('pause-label').textContent = 'RESUME';
      document.getElementById('pause-button').classList.add('is-paused');
      document.getElementById('ptt-button').disabled = true;
      document.getElementById('ptt-button').style.opacity = '0.4';

      // Release PTT if active
      if (this.audio.isPTTActive) {
        this._setPTT(false);
      }
    }
  }

  _startTimer() {
    this.startTime = Date.now();
    this.timerInterval = setInterval(() => {
      const totalMs = this.elapsedBeforePause + (Date.now() - this.startTime);
      const elapsed = Math.floor(totalMs / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      const timerEl = document.getElementById('session-timer');
      if (timerEl) timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      this.session.updateDuration(totalMs);
    }, 1000);
  }

  _startVisualizerLoop() {
    const bars = 16;
    
    const updateBars = () => {
      if (!this.audio.analyser) {
        requestAnimationFrame(updateBars);
        return;
      }
      
      const data = this.audio.getVisualizerData();
      
      for (let i = 0; i < bars; i++) {
        const value = data[i] || 0;
        const height = Math.max(4, (value / 255) * 40);
        
        const barL = document.getElementById(`bar-${i}`);
        const barR = document.getElementById(`bar-r-${bars - 1 - i}`);
        
        if (barL) barL.style.height = `${height}px`;
        if (barR) barR.style.height = `${height}px`;
      }
      
      requestAnimationFrame(updateBars);
    };
    
    requestAnimationFrame(updateBars);
  }

  _isInputFocused() {
    const active = document.activeElement;
    return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 300ms ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  destroy() {
    clearInterval(this.timerInterval);
  }
}
