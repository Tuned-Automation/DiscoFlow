import { eventBus } from '../services/EventBus.js';
import { ProfilesView } from './ProfilesView.js';

/**
 * SetupView — Session setup screen with templates, intention, context, and profile picker.
 */
export class SetupView {
  constructor(container, { sessionService, templateService, profileService }) {
    this.container = container;
    this.sessionService = sessionService;
    this.templateService = templateService;
    this.profileService = profileService;
    this.selectedTemplate = null;
    this.selectedProfile = null;
    this.showTemplateForm = false;
  }

  render() {
    const templates = this.templateService.getAll();

    // Re-render just the template pills when custom templates finish loading
    this._templatesHandler = () => {
      const pillsEl = this.container.querySelector('#template-pills');
      if (!pillsEl) return;
      const allTemplates = this.templateService.getAll();
      pillsEl.innerHTML = allTemplates.map(t => `
        <div class="template-pill ${this.selectedTemplate?.id === t.id ? 'active' : ''}" data-template-id="${t.id}">
          <span>${t.name}</span>
          ${t.isCustom ? `<span class="delete-template" data-delete-id="${t.id}">&times;</span>` : ''}
        </div>
      `).join('');
      this._bindTemplateEvents();
    };
    eventBus.on('templates:updated', this._templatesHandler);

    this.container.innerHTML = `
      <div class="setup-view">
        <div class="setup-header">
          <h1>Disco Flow</h1>
          <p>AI-powered interview assistant that helps you ask the right questions at the right time</p>
        </div>

        <div class="setup-form">
          <!-- Client Profile -->
          <div class="setup-section card">
            <div class="card-body">
              <div class="template-manager-header">
                <label class="input-label">Client Profile</label>
                <button class="btn btn-ghost btn-sm" id="browse-profiles-btn">Browse Profiles</button>
              </div>
              <div id="selected-profile-display">
                ${this._renderProfileDisplay()}
              </div>
            </div>
          </div>

          <!-- Templates -->
          <div class="setup-section card">
            <div class="card-body">
              <div class="template-manager-header">
                <label class="input-label">Discovery Template</label>
                <button class="btn btn-ghost btn-sm" id="add-template-btn">
                  + New Template
                </button>
              </div>
              <div class="template-pills" id="template-pills">
                ${templates.map(t => `
                  <div class="template-pill ${this.selectedTemplate?.id === t.id ? 'active' : ''}" data-template-id="${t.id}">
                    <span>${t.name}</span>
                    ${t.isCustom ? `<span class="delete-template" data-delete-id="${t.id}">&times;</span>` : ''}
                  </div>
                `).join('')}
              </div>
              <div id="template-form-container"></div>
            </div>
          </div>

          <!-- Intention -->
          <div class="setup-section card">
            <div class="card-body">
              <div class="input-group">
                <label class="input-label" for="intention">Discovery Goal</label>
                <textarea class="textarea" id="intention" placeholder="What do you want to discover in this session? e.g., 'Understand why enterprise customers churn after 6 months'" rows="3">${this.selectedTemplate?.intention || ''}</textarea>
              </div>
            </div>
          </div>

          <!-- My Context -->
          <div class="setup-section card">
            <div class="card-body">
              <div class="input-group">
                <label class="input-label" for="my-context">Your Context</label>
                <textarea class="textarea" id="my-context" placeholder="Your role, expertise, what you already know about the topic..." rows="3"></textarea>
              </div>
            </div>
          </div>

          <!-- Client Context -->
          <div class="setup-section card">
            <div class="card-body">
              <div class="input-group">
                <label class="input-label" for="client-context">Client Context</label>
                <textarea class="textarea" id="client-context" placeholder="Client name, company, role, relevant background info..." rows="3">${this._profileContextHint()}</textarea>
              </div>
            </div>
          </div>

          <!-- Start Button -->
          <div class="setup-actions">
            <button class="btn btn-primary btn-lg" id="start-session-btn">
              Start Discovery Session →
            </button>
          </div>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _renderProfileDisplay() {
    if (!this.selectedProfile) {
      return `<p class="profile-none-hint">No profile selected — or fill in Client Context manually below.</p>`;
    }
    const p = this.selectedProfile;
    return `
      <div class="selected-profile">
        <div class="selected-profile-info">
          <span class="selected-profile-name">${p.name}</span>
          ${p.company ? `<span class="selected-profile-meta">${p.role ? `${p.role} · ` : ''}${p.company}</span>` : ''}
        </div>
        <button class="btn btn-ghost btn-sm" id="clear-profile-btn">Clear</button>
      </div>
    `;
  }

  _profileContextHint() {
    if (!this.selectedProfile) return '';
    const p = this.selectedProfile;
    const parts = [p.name, p.role, p.company, p.context].filter(Boolean);
    return parts.join(' · ');
  }

  _bindEvents() {
    // Profile browsing
    this.container.querySelector('#browse-profiles-btn')?.addEventListener('click', () => {
      const pv = new ProfilesView(this.profileService);
      pv.show((profile) => {
        this.selectedProfile = profile;
        this.render();
      });
    });

    this.container.querySelector('#clear-profile-btn')?.addEventListener('click', () => {
      this.selectedProfile = null;
      this.render();
    });

    this._bindTemplateEvents();

    // Add template button
    this.container.querySelector('#add-template-btn')?.addEventListener('click', () => {
      this.showTemplateForm = !this.showTemplateForm;
      this._renderTemplateForm();
    });

    // Start session
    this.container.querySelector('#start-session-btn').addEventListener('click', async () => {
      const intention = document.getElementById('intention').value.trim();
      const myContext = document.getElementById('my-context').value.trim();
      const clientContext = document.getElementById('client-context').value.trim();

      if (!intention) {
        document.getElementById('intention').focus();
        document.getElementById('intention').style.borderColor = 'var(--error)';
        setTimeout(() => {
          document.getElementById('intention').style.borderColor = '';
        }, 2000);
        return;
      }

      eventBus.emit('app:start-session', {
        intention,
        myContext,
        clientContext,
        template: this.selectedTemplate,
        profileId: this.selectedProfile?.id || null,
      });
    });
  }

  _renderTemplateForm() {
    const container = document.getElementById('template-form-container');

    if (!this.showTemplateForm) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div class="template-form">
        <div class="input-group">
          <label class="input-label" for="tpl-name">Template Name</label>
          <input class="input" id="tpl-name" placeholder="e.g., Technical Assessment" />
        </div>
        <div class="input-group">
          <label class="input-label" for="tpl-intention">Default Intention</label>
          <textarea class="textarea" id="tpl-intention" rows="2" placeholder="The default discovery goal for this template..."></textarea>
        </div>
        <div class="input-group">
          <label class="input-label" for="tpl-topics">Topic Areas</label>
          <input class="input" id="tpl-topics" placeholder="Comma-separated: architecture, scalability, security..." />
        </div>
        <div class="input-group">
          <label class="input-label" for="tpl-context">AI Context Prompt</label>
          <textarea class="textarea" id="tpl-context" rows="2" placeholder="Additional instructions for the AI about how to guide this type of interview..."></textarea>
        </div>
        <div id="tpl-error" style="display:none; color: var(--error); font-size: 0.85rem; margin-bottom: 0.5rem;"></div>
        <div class="template-form-actions">
          <button class="btn btn-ghost btn-sm" id="tpl-cancel">Cancel</button>
          <button class="btn btn-primary btn-sm" id="tpl-save">Save Template</button>
        </div>
      </div>
    `;

    container.querySelector('#tpl-cancel').addEventListener('click', () => {
      this.showTemplateForm = false;
      this._renderTemplateForm();
    });

    const saveBtn = container.querySelector('#tpl-save');
    const errorEl = container.querySelector('#tpl-error');

    saveBtn.addEventListener('click', async () => {
      const name = document.getElementById('tpl-name').value.trim();
      const intention = document.getElementById('tpl-intention').value.trim();
      const topicAreas = document.getElementById('tpl-topics').value.trim();
      const contextPrompt = document.getElementById('tpl-context').value.trim();

      if (!name) {
        document.getElementById('tpl-name').focus();
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      errorEl.style.display = 'none';

      try {
        await this.templateService.add({ name, intention, topicAreas, contextPrompt });
        this.showTemplateForm = false;
        this.render();
      } catch (err) {
        console.error('Failed to save template', err);
        errorEl.textContent = err.message || 'Failed to save. Please try again.';
        errorEl.style.display = 'block';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Template';
      }
    });
  }

  _bindTemplateEvents() {
    this.container.querySelectorAll('.template-pill').forEach(pill => {
      pill.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-template')) {
          const id = e.target.dataset.deleteId;
          await this.templateService.delete(id);
          if (this.selectedTemplate?.id === id) this.selectedTemplate = null;
          this.render();
          return;
        }

        const id = pill.dataset.templateId;
        this.selectedTemplate = this.templateService.getById(id);

        if (this.selectedTemplate) {
          document.getElementById('intention').value = this.selectedTemplate.intention || '';
        }

        this.container.querySelectorAll('.template-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      });
    });
  }

  destroy() {
    if (this._templatesHandler) {
      eventBus.off('templates:updated', this._templatesHandler);
      this._templatesHandler = null;
    }
  }
}
