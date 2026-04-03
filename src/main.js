import { eventBus } from './services/EventBus.js';
import { supabase } from './services/SupabaseService.js';
import { AudioService } from './services/AudioService.js';
import { TranscriptionService } from './services/TranscriptionService.js';
import { AIService } from './services/AIService.js';
import { SessionService } from './services/SessionService.js';
import { TemplateService } from './services/TemplateService.js';
import { ProfileService } from './services/ProfileService.js';
import { LoginView } from './components/LoginView.js';
import { SetupView } from './components/SetupView.js';
import { SessionView } from './components/SessionView.js';
import { ReviewView } from './components/ReviewView.js';
import { SettingsModal } from './components/SettingsModal.js';

class App {
  constructor() {
    this.container = document.getElementById('app');
    this.currentView = null;

    // Services
    this.audioService = new AudioService();
    this.transcriptionService = new TranscriptionService();
    this.aiService = new AIService();
    this.sessionService = new SessionService();
    this.templateService = new TemplateService();
    this.profileService = new ProfileService();
    this.settingsModal = new SettingsModal({
      aiService: this.aiService,
      transcriptionService: this.transcriptionService,
    });

    this._bindGlobalEvents();
    this._init();
  }

  async _init() {
    // Listen for auth state changes (handles magic link callback)
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await this._onSignedIn(session.user);
      } else if (event === 'SIGNED_OUT') {
        this._onSignedOut();
      }
    });

    // Check for an existing session on load
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await this._onSignedIn(session.user);
    } else {
      this._showLogin();
    }
  }

  async _onSignedIn(user) {
    this.sessionService.setUserId(user.id);
    this._loadSettings();
    // Load templates and then show setup
    await this.templateService.load();
    this.showSetup();
  }

  _onSignedOut() {
    this._showLogin();
  }

  _loadSettings() {
    const anthropicKey = localStorage.getItem('discovery-anthropic-key') || '';
    const openaiKey = localStorage.getItem('discovery-openai-key') || '';
    const model = localStorage.getItem('discovery-model') || 'claude-sonnet-4-20250514';
    this.aiService.init(anthropicKey, model);
    this.transcriptionService.init(openaiKey);
  }

  _bindGlobalEvents() {
    eventBus.on('app:start-session', async (data) => {
      const anthropicKey = localStorage.getItem('discovery-anthropic-key');
      const openaiKey = localStorage.getItem('discovery-openai-key');

      if (!anthropicKey || !openaiKey) {
        this.settingsModal.show();
        eventBus.once('settings:saved', () => this._startSession(data));
        return;
      }
      await this._startSession(data);
    });

    eventBus.on('app:end-session', () => this.showReview());
    eventBus.on('app:new-session', () => this.showSetup());
    eventBus.on('app:show-settings', () => this.settingsModal.show());
    eventBus.on('auth:signed-out', () => this._onSignedOut());
  }

  async _startSession(data) {
    this.audioService = new AudioService();
    this.transcriptionService.clearTranscript();
    await this.sessionService.createSession(data);
    this.showSession();
  }

  _showLogin() {
    this._destroyCurrentView();
    this.container.className = '';
    const loginView = new LoginView(this.container, () => {});
    loginView.render();
    this.currentView = loginView;
  }

  showSetup() {
    this._destroyCurrentView();
    this.container.className = '';
    const setupView = new SetupView(this.container, {
      sessionService: this.sessionService,
      templateService: this.templateService,
      profileService: this.profileService,
    });
    setupView.render();
    this.currentView = setupView;
  }

  showSession() {
    this._destroyCurrentView(false);
    this.container.className = 'session-view';
    const sessionView = new SessionView(this.container, {
      audioService: this.audioService,
      transcriptionService: this.transcriptionService,
      aiService: this.aiService,
      sessionService: this.sessionService,
    });
    sessionView.render();
    this.currentView = sessionView;
  }

  showReview() {
    this._destroyCurrentView(true);
    this.container.className = '';
    const reviewView = new ReviewView(this.container, this.sessionService);
    reviewView.render();
    this.currentView = reviewView;
  }

  _destroyCurrentView(destroyAudio = false) {
    if (this.currentView?.destroy) this.currentView.destroy();
    if (destroyAudio && this.audioService) this.audioService.destroy();
    this.container.innerHTML = '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
