import { signInWithEmail } from '../services/SupabaseService.js';

/**
 * LoginView — Passwordless magic link login screen.
 */
export class LoginView {
  constructor(container, onSuccess) {
    this.container = container;
    this.onSuccess = onSuccess;
    this._sending = false;
  }

  render() {
    this.container.innerHTML = `
      <div class="login-view">
        <div class="login-card card">
          <div class="login-logo">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="20" cy="20" r="20" fill="url(#lg)" />
              <path d="M12 20c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
              <circle cx="20" cy="20" r="3" fill="#fff"/>
              <defs>
                <linearGradient id="lg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#6366f1"/>
                  <stop offset="1" stop-color="#8b5cf6"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 class="login-title">Disco Flow</h1>
          <p class="login-subtitle">AI-powered discovery call assistant</p>

          <div id="login-form-area">
            <div class="input-group" style="margin-top: 2rem;">
              <label class="input-label" for="login-email">Sign in with your email</label>
              <input
                class="input"
                id="login-email"
                type="email"
                placeholder="you@example.com"
                autocomplete="email"
              />
            </div>
            <button class="btn btn-primary btn-lg" id="login-btn" style="width: 100%; margin-top: 1rem;">
              Send Magic Link
            </button>
            <p class="login-hint">No password needed — we'll email you a sign-in link.</p>
          </div>

          <div id="login-sent-area" style="display: none;">
            <div class="login-sent-icon">✉️</div>
            <h2 class="login-sent-title">Check your email</h2>
            <p class="login-sent-body">We sent a sign-in link to <strong id="login-sent-email"></strong>. Click the link to continue.</p>
            <button class="btn btn-ghost btn-sm" id="login-resend" style="margin-top: 1rem;">
              Resend link
            </button>
          </div>

          <div id="login-error" class="login-error" style="display: none;"></div>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    const emailInput = this.container.querySelector('#login-email');
    const btn = this.container.querySelector('#login-btn');

    const submit = async () => {
      if (this._sending) return;
      const email = emailInput.value.trim();
      if (!email || !email.includes('@')) {
        emailInput.focus();
        emailInput.style.borderColor = 'var(--error)';
        setTimeout(() => { emailInput.style.borderColor = ''; }, 2000);
        return;
      }
      await this._sendLink(email);
    };

    btn.addEventListener('click', submit);
    emailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });

    this.container.querySelector('#login-resend')?.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      if (email) await this._sendLink(email);
    });
  }

  async _sendLink(email) {
    this._sending = true;
    this._hideError();

    try {
      await signInWithEmail(email);
      this.container.querySelector('#login-form-area').style.display = 'none';
      const sent = this.container.querySelector('#login-sent-area');
      sent.style.display = 'block';
      this.container.querySelector('#login-sent-email').textContent = email;
    } catch (err) {
      this._showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      this._sending = false;
    }
  }

  _showError(msg) {
    const el = this.container.querySelector('#login-error');
    el.textContent = msg;
    el.style.display = 'block';
  }

  _hideError() {
    const el = this.container.querySelector('#login-error');
    if (el) el.style.display = 'none';
  }

  destroy() {}
}
