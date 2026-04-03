import { eventBus } from './EventBus.js';

/**
 * SessionService — manages session lifecycle, persistence, and templates
 */
export class SessionService {
  constructor() {
    this.currentSession = null;
    this.templates = [];
    this._db = null;
    this._initDB();
    this._loadTemplates();
  }

  createSession({ intention, myContext, clientContext, template }) {
    this.currentSession = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      intention,
      myContext,
      clientContext,
      template,
      transcript: [],
      questions: [],
      status: 'active',
      duration: 0
    };
    
    this._save();
    eventBus.emit('session:created', this.currentSession);
    return this.currentSession;
  }

  addTranscriptSegment(segment) {
    if (!this.currentSession) return;
    this.currentSession.transcript.push(segment);
    this._save();
  }

  addQuestion(question) {
    if (!this.currentSession) return;
    this.currentSession.questions.push(question);
    this._save();
  }

  updateDuration(duration) {
    if (!this.currentSession) return;
    this.currentSession.duration = duration;
    this._save();
  }

  endSession() {
    if (!this.currentSession) return;
    this.currentSession.status = 'completed';
    this.currentSession.endedAt = Date.now();
    this._save();
    eventBus.emit('session:ended', this.currentSession);
    return this.currentSession;
  }

  getSession() {
    return this.currentSession;
  }

  async loadSession(id) {
    const db = await this._initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const req = tx.objectStore('sessions').get(id);
      req.onsuccess = () => {
        this.currentSession = req.result || null;
        resolve(this.currentSession);
      };
      req.onerror = () => reject(tx.error);
    });
  }

  async getAllSessions() {
    return this._getAllSessions();
  }

  async deleteSession(id) {
    const db = await this._initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').delete(id);
      tx.oncomplete = () => {
        if (this.currentSession?.id === id) {
          this.currentSession = null;
        }
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  // ===== Templates =====
  
  getTemplates() {
    return [...this.templates];
  }

  addTemplate(template) {
    template.id = crypto.randomUUID();
    template.createdAt = Date.now();
    template.isCustom = true;
    this.templates.push(template);
    this._saveTemplates();
    eventBus.emit('templates:updated', this.templates);
    return template;
  }

  updateTemplate(id, updates) {
    const idx = this.templates.findIndex(t => t.id === id);
    if (idx >= 0) {
      this.templates[idx] = { ...this.templates[idx], ...updates };
      this._saveTemplates();
      eventBus.emit('templates:updated', this.templates);
    }
  }

  deleteTemplate(id) {
    this.templates = this.templates.filter(t => t.id !== id);
    this._saveTemplates();
    eventBus.emit('templates:updated', this.templates);
  }

  // ===== Export =====
  
  exportAsMarkdown() {
    const s = this.currentSession;
    if (!s) return '';

    let md = `# Discovery Session\n\n`;
    md += `**Date:** ${new Date(s.createdAt).toLocaleString()}\n`;
    md += `**Duration:** ${this._formatDuration(s.duration)}\n`;
    md += `**Goal:** ${s.intention}\n\n`;

    if (s.myContext) md += `## Interviewer Context\n${s.myContext}\n\n`;
    if (s.clientContext) md += `## Client Context\n${s.clientContext}\n\n`;

    md += `## Transcript\n\n`;
    s.transcript.forEach(seg => {
      const speaker = seg.speaker === 'interviewer' ? '**You**' : '**Client**';
      md += `${speaker}: ${seg.text}\n\n`;
    });

    if (s.questions.length > 0) {
      md += `## AI Suggested Questions\n\n`;
      s.questions.forEach((q, i) => {
        const status = q.asked ? '✅' : '⬜';
        md += `${status} ${i + 1}. ${q.text}\n`;
        if (q.rationale) md += `   _${q.rationale}_\n`;
        md += '\n';
      });
    }

    return md;
  }

  exportAsJSON() {
    return JSON.stringify(this.currentSession, null, 2);
  }

  // ===== Private =====

  async _initDB() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('DiscoveryToolDB', 1);
      
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }
      };
      
      request.onsuccess = async (e) => {
        this._db = e.target.result;
        // Migrate legacy localStorage sessions
        const oldData = localStorage.getItem('discovery-sessions');
        if (oldData) {
          try {
            const oldSessions = JSON.parse(oldData);
            for (const s of oldSessions) {
              await this._saveSessionToDB(s);
            }
            localStorage.removeItem('discovery-sessions');
          } catch (err) {
            console.error('Migration failed', err);
          }
        }
        resolve(this._db);
      };
      
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async _saveSessionToDB(session) {
    const db = await this._initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(session);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  _save() {
    if (!this.currentSession) return;
    this._saveSessionToDB(this.currentSession).catch(err => console.error('DB save error:', err));
  }

  async _getAllSessions() {
    const db = await this._initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const req = tx.objectStore('sessions').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(tx.error);
    });
  }

  _loadTemplates() {
    try {
      const saved = JSON.parse(localStorage.getItem('discovery-templates') || '[]');
      // Merge with defaults
      this.templates = [...this._getDefaultTemplates()];
      
      // Add custom templates
      saved.forEach(t => {
        if (t.isCustom && !this.templates.find(dt => dt.id === t.id)) {
          this.templates.push(t);
        }
      });
    } catch {
      this.templates = this._getDefaultTemplates();
    }
  }

  _saveTemplates() {
    // Only save custom templates
    const custom = this.templates.filter(t => t.isCustom);
    localStorage.setItem('discovery-templates', JSON.stringify(custom));
  }

  _getDefaultTemplates() {
    return [
      {
        id: 'product-discovery',
        name: 'Product Discovery',
        isCustom: false,
        intention: 'Understand the user\'s problems, workflows, and unmet needs to identify product opportunities.',
        topicAreas: 'Current workflow, pain points, workarounds, ideal outcome, priorities, constraints, decision criteria',
        suggestedQuestions: [
          'Walk me through your typical day when you encounter this problem.',
          'What have you tried to solve this? What worked and what didn\'t?',
          'If you had a magic wand, what would the ideal solution look like?',
          'How do you currently measure success in this area?'
        ],
        contextPrompt: 'Focus on uncovering latent needs and Jobs-to-be-Done. Push past surface-level answers to understand root motivations.'
      },
      {
        id: 'user-research',
        name: 'User Research',
        isCustom: false,
        intention: 'Deeply understand user behaviors, motivations, mental models, and pain points.',
        topicAreas: 'User journey, mental models, emotional triggers, context of use, social influences, habits',
        suggestedQuestions: [
          'Tell me about the last time you did this. What happened step by step?',
          'What was the hardest part? Why do you think that is?',
          'How did that make you feel? What were you thinking at that moment?',
          'Who else is involved in this process? How do they influence your decisions?'
        ],
        contextPrompt: 'Focus on stories and specific examples over opinions. Look for gaps between what people say and do. Probe emotional responses.'
      },
      {
        id: 'sales-discovery',
        name: 'Sales Discovery',
        isCustom: false,
        intention: 'Qualify the opportunity and understand the buyer\'s situation, needs, and decision process.',
        topicAreas: 'Current situation, challenges, impact, timeline, budget, decision makers, evaluation criteria, competition',
        suggestedQuestions: [
          'What triggered you to start looking for a solution now?',
          'What happens if you don\'t solve this problem?',
          'Who else is involved in evaluating and deciding on this?',
          'What does your timeline look like for making a decision?'
        ],
        contextPrompt: 'Use MEDDPICC or SPIN methodology. Quantify pain where possible. Understand the buying process and all stakeholders.'
      },
      {
        id: 'stakeholder-interview',
        name: 'Stakeholder Interview',
        isCustom: false,
        intention: 'Align on vision, priorities, constraints, and success criteria with key stakeholders.',
        topicAreas: 'Vision, success metrics, priorities, risks, constraints, dependencies, organizational dynamics',
        suggestedQuestions: [
          'What does success look like for this initiative in your eyes?',
          'What keeps you up at night about this project?',
          'What constraints or non-negotiables should we be aware of?',
          'Who else should I be talking to about this?'
        ],
        contextPrompt: 'Focus on alignment and uncovering hidden constraints or politics. Get specific on success criteria and metrics.'
      }
    ];
  }

  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
