import { eventBus } from '../services/EventBus.js';
import { supabase, signOut } from '../services/SupabaseService.js';

/**
 * SettingsModal — API key configuration, model settings, and account info.
 */
export class SettingsModal {
  constructor({ aiService, transcriptionService }) {
    this.ai = aiService;
    this.transcription = transcriptionService;
  }

  async show() {
    const anthropicKey = localStorage.getItem('discovery-anthropic-key') || '';
    const openaiKey = localStorage.getItem('discovery-openai-key') || '';
    const model = localStorage.getItem('discovery-model') || 'claude-sonnet-4-20250514';

    const { data: { user } } = await supabase.auth.getUser();
    const userEmail = user?.email || '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'settings-modal';

    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Settings</h3>
          <button class="btn btn-ghost btn-icon btn-sm" id="close-settings">&times;</button>
        </div>
        <div class="modal-body">

          ${userEmail ? `
          <div class="settings-section">
            <div class="settings-section-title">Account</div>
            <div class="settings-row">
              <span class="settings-row-label">${userEmail}</span>
              <button class="btn btn-ghost btn-sm" id="sign-out-btn">Sign out</button>
            </div>
          </div>
          <div class="divider"></div>
          ` : ''}

          <div class="settings-section">
            <div class="settings-section-title">API Keys</div>
            <div class="input-group">
              <label class="input-label" for="anthropic-key">Anthropic API Key</label>
              <input class="input" id="anthropic-key" type="password" value="${anthropicKey}" placeholder="sk-ant-..." />
              <span style="font-size: var(--font-xs); color: var(--text-tertiary);">Required for AI question generation</span>
            </div>
            <div class="input-group">
              <label class="input-label" for="openai-key">OpenAI API Key</label>
              <input class="input" id="openai-key" type="password" value="${openaiKey}" placeholder="sk-..." />
              <span style="font-size: var(--font-xs); color: var(--text-tertiary);">Required for Whisper transcription</span>
            </div>
          </div>

          <div class="divider"></div>

          <div class="settings-section">
            <div class="settings-section-title">AI Model</div>
            <div class="settings-row">
              <span class="settings-row-label">Default Model</span>
              <select class="select" id="default-model">
                <option value="claude-sonnet-4-20250514" ${model === 'claude-sonnet-4-20250514' ? 'selected' : ''}>Claude Sonnet (Fast)</option>
                <option value="claude-opus-4-20250514" ${model === 'claude-opus-4-20250514' ? 'selected' : ''}>Claude Opus (Deep)</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cancel-settings">Cancel</button>
          <button class="btn btn-primary" id="save-settings">Save Settings</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#close-settings').addEventListener('click', close);
    overlay.querySelector('#cancel-settings').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#sign-out-btn')?.addEventListener('click', async () => {
      close();
      await signOut();
      eventBus.emit('auth:signed-out');
    });

    overlay.querySelector('#save-settings').addEventListener('click', () => {
      const newAnthropicKey = document.getElementById('anthropic-key').value.trim();
      const newOpenaiKey = document.getElementById('openai-key').value.trim();
      const newModel = document.getElementById('default-model').value;

      localStorage.setItem('discovery-anthropic-key', newAnthropicKey);
      localStorage.setItem('discovery-openai-key', newOpenaiKey);
      localStorage.setItem('discovery-model', newModel);

      this.ai.init(newAnthropicKey, newModel);
      this.transcription.init(newOpenaiKey);

      close();
      eventBus.emit('settings:saved');
      this._showToast('Settings saved', 'success');
    });
  }

  _showToast(message, type) {
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
    setTimeout(() => toast.remove(), 3000);
  }
}
