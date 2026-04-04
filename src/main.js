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
import { OnboardingTour } from './components/OnboardingTour.js';

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

  _init() {
    // Show a loading state immediately so there's never a blank screen
    this._showLoading();

    // onAuthStateChange fires INITIAL_SESSION from localStorage — no network
    // round-trip needed, unlike getSession() which may refresh the token first.
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (session?.user) {
          await this._onSignedIn(session.user);
        } else {
          this._showLogin();
        }
      } else if (event === 'SIGNED_IN' && session) {
        await this._onSignedIn(session.user);
      } else if (event === 'SIGNED_OUT') {
        this._onSignedOut();
      }
    });
  }

  _showLoading() {
    this.container.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        flex-direction: column;
        gap: 1rem;
        color: var(--text-tertiary);
      ">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="20" fill="url(#lg-load)" />
          <path d="M12 20c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="20" cy="20" r="3" fill="#fff"/>
          <defs>
            <linearGradient id="lg-load" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop stop-color="#6366f1"/>
              <stop offset="1" stop-color="#8b5cf6"/>
            </linearGradient>
          </defs>
        </svg>
        <span style="font-size: 0.875rem; letter-spacing: 0.05em;">Loading…</span>
      </div>
    `;
  }

  async _onSignedIn(user) {
    this.sessionService.setUserId(user.id);
    this._loadSettings();
    // Show setup immediately with built-in templates; custom templates
    // load in the background and the view updates reactively via the event bus.
    this.showSetup();
    this.templateService.load();
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
    // Small delay so the DOM is fully painted before we measure element positions
    setTimeout(() => OnboardingTour.showSetupTour(), 400);
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
    setTimeout(() => OnboardingTour.showSessionTour(), 400);
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
