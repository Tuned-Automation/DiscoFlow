import { eventBus } from './services/EventBus.js';
import { AudioService } from './services/AudioService.js';
import { TranscriptionService } from './services/TranscriptionService.js';
import { AIService } from './services/AIService.js';
import { SessionService } from './services/SessionService.js';
import { SetupView } from './components/SetupView.js';
import { SessionView } from './components/SessionView.js';
import { ReviewView } from './components/ReviewView.js';
import { SettingsModal } from './components/SettingsModal.js';

/**
 * Discovery Tool — Main Application
 */
class App {
  constructor() {
    this.container = document.getElementById('app');
    this.currentView = null;
    
    // Services
    this.audioService = new AudioService();
    this.transcriptionService = new TranscriptionService();
    this.aiService = new AIService();
    this.sessionService = new SessionService();
    this.settingsModal = new SettingsModal({
      aiService: this.aiService,
      transcriptionService: this.transcriptionService
    });

    // Load saved API keys
    this._loadSettings();
    
    // Bind global events
    this._bindEvents();
    
    // Start with setup view
    this.showSetup();
  }

  _loadSettings() {
    const anthropicKey = localStorage.getItem('discovery-anthropic-key') || '';
    const openaiKey = localStorage.getItem('discovery-openai-key') || '';
    const model = localStorage.getItem('discovery-model') || 'claude-sonnet-4-20250514';

    this.aiService.init(anthropicKey, model);
    this.transcriptionService.init(openaiKey);
  }

  _bindEvents() {
    eventBus.on('app:start-session', (data) => {
      // Check for API keys
      const anthropicKey = localStorage.getItem('discovery-anthropic-key');
      const openaiKey = localStorage.getItem('discovery-openai-key');
      
      if (!anthropicKey || !openaiKey) {
        this.settingsModal.show();
        // Re-listen for settings saved, then start session
        eventBus.once('settings:saved', () => {
          this._startSession(data);
        });
        return;
      }
      
      this._startSession(data);
    });

    eventBus.on('app:end-session', () => {
      this.showReview();
    });

    eventBus.on('app:new-session', () => {
      this.showSetup();
    });

    eventBus.on('app:show-settings', () => {
      this.settingsModal.show();
    });
  }

  _startSession(data) {
    // Create fresh audio service for each session
    this.audioService = new AudioService();
    this.transcriptionService.clearTranscript();
    this.sessionService.createSession(data);
    this.showSession();
  }

  showSetup() {
    this._destroyCurrentView();
    this.container.className = '';
    const setupView = new SetupView(this.container, this.sessionService);
    setupView.render();
    this.currentView = setupView;
  }

  showSession() {
    this._destroyCurrentView(false); // don't destroy audio
    this.container.className = 'session-view';
    const sessionView = new SessionView(this.container, {
      audioService: this.audioService,
      transcriptionService: this.transcriptionService,
      aiService: this.aiService,
      sessionService: this.sessionService
    });
    sessionView.render();
    this.currentView = sessionView;
  }

  showReview() {
    // Destroy audio when leaving session
    this._destroyCurrentView(true);
    this.container.className = '';
    const reviewView = new ReviewView(this.container, this.sessionService);
    reviewView.render();
    this.currentView = reviewView;
  }

  _destroyCurrentView(destroyAudio = false) {
    if (this.currentView?.destroy) {
      this.currentView.destroy();
    }
    if (destroyAudio && this.audioService) {
      this.audioService.destroy();
    }
    this.container.innerHTML = '';
  }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
