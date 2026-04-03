import { supabase } from './SupabaseService.js';
import { eventBus } from './EventBus.js';

/**
 * SessionService — manages session lifecycle backed by Supabase.
 * The public API is intentionally kept close to the original so that
 * existing views require minimal changes.
 */
export class SessionService {
  constructor() {
    this.currentSession = null;
    this._userId = null;
  }

  /**
   * Call after authentication so the service knows which user to save as.
   */
  setUserId(userId) {
    this._userId = userId;
  }

  // ===== Session lifecycle =====

  /**
   * Creates a new in-memory session and immediately persists it to Supabase.
   * Returns the session object (id is provisional until Supabase confirms).
   */
  async createSession({ intention, myContext, clientContext, template, profileId = null }) {
    const id = crypto.randomUUID();
    this.currentSession = {
      id,
      createdAt: Date.now(),
      intention,
      myContext,
      clientContext,
      template,
      profileId,
      transcript: [],
      questions: [],
      status: 'active',
      duration: 0,
    };

    await this._upsert();
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

  async endSession() {
    if (!this.currentSession) return;
    this.currentSession.status = 'completed';
    this.currentSession.endedAt = Date.now();
    await this._upsert();
    eventBus.emit('session:ended', this.currentSession);
    return this.currentSession;
  }

  getSession() {
    return this.currentSession;
  }

  async loadSession(id) {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    this.currentSession = this._fromRow(data);
    return this.currentSession;
  }

  async getAllSessions() {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(row => this._fromRow(row));
  }

  async deleteSession(id) {
    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (error) throw error;
    if (this.currentSession?.id === id) this.currentSession = null;
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

  /** Fire-and-forget upsert for high-frequency updates (transcript, questions). */
  _save() {
    this._upsert().catch(err => console.error('[SessionService] save error', err));
  }

  async _upsert() {
    if (!this.currentSession || !this._userId) return;
    const s = this.currentSession;

    const { error } = await supabase.from('sessions').upsert({
      id: s.id,
      user_id: this._userId,
      profile_id: s.profileId || null,
      intention: s.intention || '',
      my_context: s.myContext || '',
      client_context: s.clientContext || '',
      template_id: s.template?.id || null,
      transcript: s.transcript,
      questions: s.questions,
      status: s.status,
      duration: s.duration,
      created_at: new Date(s.createdAt).toISOString(),
      ended_at: s.endedAt ? new Date(s.endedAt).toISOString() : null,
    });

    if (error) console.error('[SessionService] upsert error', error);
  }

  _fromRow(row) {
    return {
      id: row.id,
      createdAt: new Date(row.created_at).getTime(),
      endedAt: row.ended_at ? new Date(row.ended_at).getTime() : null,
      intention: row.intention,
      myContext: row.my_context,
      clientContext: row.client_context,
      profileId: row.profile_id,
      template: row.template_id ? { id: row.template_id } : null,
      transcript: row.transcript || [],
      questions: row.questions || [],
      status: row.status,
      duration: row.duration,
    };
  }

  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
