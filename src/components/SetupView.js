import { eventBus } from '../services/EventBus.js';

/**
 * SetupView — Session setup screen with templates, intention, and context
 */
export class SetupView {
  constructor(container, sessionService) {
    this.container = container;
    this.sessionService = sessionService;
    this.selectedTemplate = null;
    this.showTemplateForm = false;
  }

  render() {
    const templates = this.sessionService.getTemplates();

    this.container.innerHTML = `
      <div class="setup-view">
        <div class="setup-header">
          <h1>Discovery Tool</h1>
          <p>AI-powered interview assistant that helps you ask the right questions at the right time</p>
        </div>

        <div class="setup-form">
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
                <textarea class="textarea" id="client-context" placeholder="Client name, company, role, relevant background info..." rows="3"></textarea>
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

  _bindEvents() {
    // Template selection
    this.container.querySelectorAll('.template-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-template')) {
          const id = e.target.dataset.deleteId;
          this.sessionService.deleteTemplate(id);
          if (this.selectedTemplate?.id === id) this.selectedTemplate = null;
          this.render();
          return;
        }
        
        const id = pill.dataset.templateId;
        const templates = this.sessionService.getTemplates();
        this.selectedTemplate = templates.find(t => t.id === id) || null;
        
        // Fill intention from template
        if (this.selectedTemplate) {
          document.getElementById('intention').value = this.selectedTemplate.intention;
        }
        
        // Update active state
        this.container.querySelectorAll('.template-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      });
    });

    // Add template button
    this.container.querySelector('#add-template-btn')?.addEventListener('click', () => {
      this.showTemplateForm = !this.showTemplateForm;
      this._renderTemplateForm();
    });

    // Start session
    this.container.querySelector('#start-session-btn').addEventListener('click', () => {
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
        template: this.selectedTemplate
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

    container.querySelector('#tpl-save').addEventListener('click', () => {
      const name = document.getElementById('tpl-name').value.trim();
      const intention = document.getElementById('tpl-intention').value.trim();
      const topicAreas = document.getElementById('tpl-topics').value.trim();
      const contextPrompt = document.getElementById('tpl-context').value.trim();

      if (!name) {
        document.getElementById('tpl-name').focus();
        return;
      }

      this.sessionService.addTemplate({
        name,
        intention,
        topicAreas,
        contextPrompt,
        suggestedQuestions: []
      });

      this.showTemplateForm = false;
      this.render();
    });
  }
}
