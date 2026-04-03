import { eventBus } from '../services/EventBus.js';

/**
 * ReviewView — Post-session review with transcript, questions, and export
 */
export class ReviewView {
  constructor(container, sessionService) {
    this.container = container;
    this.session = sessionService;
  }

  render() {
    const session = this.session.getSession();
    if (!session) {
      this.container.innerHTML = '<div class="review-view"><p>No session data available.</p></div>';
      return;
    }

    const duration = this._formatDuration(session.duration);
    const transcriptCount = session.transcript?.length || 0;
    const questionCount = session.questions?.length || 0;
    const askedCount = session.questions?.filter(q => q.asked).length || 0;

    this.container.innerHTML = `
      <div class="review-view">
        <div class="review-header">
          <h2>Session Review</h2>
          <p style="color: var(--text-secondary); margin-top: var(--space-2);">${session.intention}</p>
        </div>

        <!-- Stats -->
        <div class="review-stats">
          <div class="card review-stat">
            <div class="review-stat-value">${duration}</div>
            <div class="review-stat-label">Duration</div>
          </div>
          <div class="card review-stat">
            <div class="review-stat-value">${transcriptCount}</div>
            <div class="review-stat-label">Segments</div>
          </div>
          <div class="card review-stat">
            <div class="review-stat-value">${questionCount}</div>
            <div class="review-stat-label">AI Questions</div>
          </div>
          <div class="card review-stat">
            <div class="review-stat-value">${askedCount}</div>
            <div class="review-stat-label">Asked</div>
          </div>
        </div>

        <!-- Actions -->
        <div class="review-actions">
          <button class="btn btn-primary" id="export-md-btn">📄 Export Markdown</button>
          <button class="btn btn-secondary" id="export-json-btn">📋 Export JSON</button>
          <button class="btn btn-secondary" id="new-session-btn">🔄 New Session</button>
        </div>

        <!-- Transcript -->
        <div class="review-section">
          <h3>📝 Transcript</h3>
          <div class="card">
            <div class="card-body" style="max-height: 400px; overflow-y: auto;">
              ${session.transcript?.length > 0 
                ? session.transcript.map(seg => `
                  <div class="transcript-entry speaker-${seg.speaker}" style="margin-bottom: var(--space-2);">
                    <span class="transcript-speaker">${seg.speaker === 'interviewer' ? 'You' : 'Client'}</span>
                    <span class="transcript-text">${this._escapeHtml(seg.text)}</span>
                  </div>
                `).join('')
                : '<p style="color: var(--text-tertiary);">No transcript recorded.</p>'
              }
            </div>
          </div>
        </div>

        <!-- Questions -->
        ${questionCount > 0 ? `
          <div class="review-section">
            <h3>🧠 AI Suggested Questions</h3>
            <div style="display: flex; flex-direction: column; gap: var(--space-3);">
              ${session.questions.map((q, i) => {
                const typeLabels = {
                  'deeper': { cls: 'type-deeper', text: '🔍 Deeper' },
                  'emotion': { cls: 'type-emotion', text: '❤️ Emotion' },
                  'edge case': { cls: 'type-edge-case', text: '⚡ Edge Case' },
                  'next': { cls: 'type-next', text: '➡️ Next Topic' },
                  'follow-up': { cls: 'type-follow-up', text: '➡️ Follow-up' }
                };
                const typeKey = (q.type || 'follow-up').toLowerCase();
                const displayObj = typeLabels[typeKey] || { cls: 'type-follow-up', text: q.type };

                return `
                  <div class="ai-question ${q.asked ? 'asked' : ''}">
                    <div class="ai-question-text">${i + 1}. ${this._escapeHtml(q.text)}</div>
                    <div class="ai-question-meta">
                      <span class="ai-question-type ${displayObj.cls}">${displayObj.text}</span>
                      <span class="badge ${q.asked ? 'badge-active' : 'badge-muted'}">${q.asked ? '✓ Asked' : 'Not asked'}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    document.getElementById('export-md-btn')?.addEventListener('click', () => {
      const md = this.session.exportAsMarkdown();
      this._downloadFile(md, 'discovery-session.md', 'text/markdown');
    });

    document.getElementById('export-json-btn')?.addEventListener('click', () => {
      const json = this.session.exportAsJSON();
      this._downloadFile(json, 'discovery-session.json', 'application/json');
    });

    document.getElementById('new-session-btn')?.addEventListener('click', () => {
      eventBus.emit('app:new-session');
    });
  }

  _downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  _formatDuration(ms) {
    if (!ms) return '0:00';
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
