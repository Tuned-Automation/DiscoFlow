import { eventBus } from '../services/EventBus.js';

/**
 * ProfilesView — Manage client profiles (shown as a modal/panel).
 */
export class ProfilesView {
  constructor(profileService) {
    this.profileService = profileService;
    this._overlay = null;
  }

  async show(onSelect) {
    this._onSelect = onSelect;
    const profiles = await this.profileService.getAll();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'profiles-modal';

    overlay.innerHTML = `
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3>Client Profiles</h3>
          <button class="btn btn-ghost btn-icon btn-sm" id="close-profiles">&times;</button>
        </div>
        <div class="modal-body">
          <div id="profiles-list">
            ${profiles.length === 0
              ? '<p style="color: var(--text-tertiary); text-align: center; padding: 2rem 0;">No profiles yet. Create one below.</p>'
              : profiles.map(p => this._renderProfileCard(p)).join('')}
          </div>
          <div class="divider"></div>
          <div id="profile-form-area">
            <button class="btn btn-ghost btn-sm" id="toggle-profile-form">+ New Profile</button>
            <div id="profile-form" style="display: none; margin-top: 1rem;">
              ${this._renderForm()}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._overlay = overlay;
    this._bindEvents();
  }

  _renderProfileCard(p) {
    return `
      <div class="profile-card" data-profile-id="${p.id}">
        <div class="profile-card-main">
          <div class="profile-card-name">${p.name}</div>
          ${p.company ? `<div class="profile-card-meta">${p.role ? `${p.role} · ` : ''}${p.company}</div>` : ''}
          ${p.context ? `<div class="profile-card-context">${p.context.slice(0, 120)}${p.context.length > 120 ? '…' : ''}</div>` : ''}
          ${p.tags?.length ? `<div class="profile-card-tags">${p.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
        </div>
        <div class="profile-card-actions">
          <button class="btn btn-primary btn-sm select-profile-btn" data-profile-id="${p.id}">Select</button>
          <button class="btn btn-ghost btn-sm delete-profile-btn" data-profile-id="${p.id}">Delete</button>
        </div>
      </div>
    `;
  }

  _renderForm() {
    return `
      <div class="input-group">
        <label class="input-label" for="pf-name">Name *</label>
        <input class="input" id="pf-name" placeholder="Client name" />
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="input-group">
          <label class="input-label" for="pf-company">Company</label>
          <input class="input" id="pf-company" placeholder="Acme Corp" />
        </div>
        <div class="input-group">
          <label class="input-label" for="pf-role">Role</label>
          <input class="input" id="pf-role" placeholder="CEO, Product Manager…" />
        </div>
      </div>
      <div class="input-group">
        <label class="input-label" for="pf-context">Background / Notes</label>
        <textarea class="textarea" id="pf-context" rows="3" placeholder="Key context about this client — what they do, their situation, your relationship..."></textarea>
      </div>
      <div class="input-group">
        <label class="input-label" for="pf-tags">Tags (comma-separated)</label>
        <input class="input" id="pf-tags" placeholder="enterprise, SaaS, returning-client" />
      </div>
      <div class="template-form-actions">
        <button class="btn btn-ghost btn-sm" id="cancel-profile-form">Cancel</button>
        <button class="btn btn-primary btn-sm" id="save-profile-btn">Save Profile</button>
      </div>
    `;
  }

  _bindEvents() {
    const overlay = this._overlay;
    const close = () => overlay.remove();

    overlay.querySelector('#close-profiles').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Toggle form
    overlay.querySelector('#toggle-profile-form').addEventListener('click', () => {
      const form = overlay.querySelector('#profile-form');
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });

    overlay.querySelector('#cancel-profile-form')?.addEventListener('click', () => {
      overlay.querySelector('#profile-form').style.display = 'none';
    });

    // Save profile
    overlay.querySelector('#save-profile-btn')?.addEventListener('click', async () => {
      const name = overlay.querySelector('#pf-name').value.trim();
      if (!name) { overlay.querySelector('#pf-name').focus(); return; }
      const company = overlay.querySelector('#pf-company').value.trim();
      const role = overlay.querySelector('#pf-role').value.trim();
      const context = overlay.querySelector('#pf-context').value.trim();
      const tagsRaw = overlay.querySelector('#pf-tags').value.trim();
      const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

      try {
        await this.profileService.create({ name, company, role, context, tags });
        // Refresh list
        const profiles = await this.profileService.getAll();
        overlay.querySelector('#profiles-list').innerHTML = profiles.map(p => this._renderProfileCard(p)).join('');
        overlay.querySelector('#profile-form').style.display = 'none';
        this._bindListEvents();
      } catch (err) {
        console.error('Failed to create profile', err);
      }
    });

    this._bindListEvents();
  }

  _bindListEvents() {
    const overlay = this._overlay;

    overlay.querySelectorAll('.select-profile-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.profileId;
        const profile = await this.profileService.getById(id);
        if (this._onSelect) this._onSelect(profile);
        overlay.remove();
      });
    });

    overlay.querySelectorAll('.delete-profile-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.profileId;
        if (!confirm('Delete this profile?')) return;
        await this.profileService.delete(id);
        const profiles = await this.profileService.getAll();
        overlay.querySelector('#profiles-list').innerHTML = profiles.length === 0
          ? '<p style="color: var(--text-tertiary); text-align: center; padding: 2rem 0;">No profiles yet. Create one below.</p>'
          : profiles.map(p => this._renderProfileCard(p)).join('');
        this._bindListEvents();
      });
    });
  }
}
