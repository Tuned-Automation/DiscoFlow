import { supabase } from './SupabaseService.js';
import { eventBus } from './EventBus.js';

/**
 * TemplateService — manages conversation templates.
 * Default templates are hardcoded; custom templates are stored in Supabase.
 */
export class TemplateService {
  constructor() {
    this._custom = [];
    this._loaded = false;
  }

  /**
   * Load custom templates from Supabase (call once after login).
   */
  async load() {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .order('created_at');
    if (error) {
      console.error('TemplateService: failed to load templates', error);
      return;
    }
    this._custom = data.map(row => ({
      id: row.id,
      name: row.name,
      intention: row.intention,
      topicAreas: row.topic_areas,
      suggestedQuestions: row.suggested_questions,
      contextPrompt: row.context_prompt,
      isCustom: true,
    }));
    this._loaded = true;
    eventBus.emit('templates:updated', this.getAll());
  }

  /**
   * Returns all templates (defaults + custom).
   */
  getAll() {
    return [...this._getDefaults(), ...this._custom];
  }

  getById(id) {
    return this.getAll().find(t => t.id === id) || null;
  }

  async add({ name, intention, topicAreas, contextPrompt, suggestedQuestions = [] }) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('templates')
      .insert({
        user_id: user.id,
        name,
        intention,
        topic_areas: topicAreas,
        suggested_questions: suggestedQuestions,
        context_prompt: contextPrompt,
      })
      .select()
      .single();
    if (error) throw error;

    const template = {
      id: data.id,
      name: data.name,
      intention: data.intention,
      topicAreas: data.topic_areas,
      suggestedQuestions: data.suggested_questions,
      contextPrompt: data.context_prompt,
      isCustom: true,
    };
    this._custom.push(template);
    eventBus.emit('templates:updated', this.getAll());
    return template;
  }

  async delete(id) {
    const isDefault = this._getDefaults().some(t => t.id === id);
    if (isDefault) return;

    const { error } = await supabase.from('templates').delete().eq('id', id);
    if (error) throw error;
    this._custom = this._custom.filter(t => t.id !== id);
    eventBus.emit('templates:updated', this.getAll());
  }

  _getDefaults() {
    return [
      {
        id: 'product-discovery',
        name: 'Product Discovery',
        isCustom: false,
        intention: "Understand the user's problems, workflows, and unmet needs to identify product opportunities.",
        topicAreas: 'Current workflow, pain points, workarounds, ideal outcome, priorities, constraints, decision criteria',
        suggestedQuestions: [
          'Walk me through your typical day when you encounter this problem.',
          "What have you tried to solve this? What worked and what didn't?",
          'If you had a magic wand, what would the ideal solution look like?',
          'How do you currently measure success in this area?',
        ],
        contextPrompt: 'Focus on uncovering latent needs and Jobs-to-be-Done. Push past surface-level answers to understand root motivations.',
      },
      {
        id: 'user-research',
        name: 'User Research',
        isCustom: false,
        intention: 'Deeply understand user behaviors, motivations, mental models, and pain points.',
        topicAreas: 'User journey, mental models, emotional triggers, context of use, social influences, habits',
        suggestedQuestions: [
          'Tell me about the last time you did this. What happened step by step?',
          "What was the hardest part? Why do you think that is?",
          'How did that make you feel? What were you thinking at that moment?',
          'Who else is involved in this process? How do they influence your decisions?',
        ],
        contextPrompt: 'Focus on stories and specific examples over opinions. Look for gaps between what people say and do. Probe emotional responses.',
      },
      {
        id: 'sales-discovery',
        name: 'Sales Discovery',
        isCustom: false,
        intention: "Qualify the opportunity and understand the buyer's situation, needs, and decision process.",
        topicAreas: 'Current situation, challenges, impact, timeline, budget, decision makers, evaluation criteria, competition',
        suggestedQuestions: [
          'What triggered you to start looking for a solution now?',
          "What happens if you don't solve this problem?",
          'Who else is involved in evaluating and deciding on this?',
          'What does your timeline look like for making a decision?',
        ],
        contextPrompt: 'Use MEDDPICC or SPIN methodology. Quantify pain where possible. Understand the buying process and all stakeholders.',
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
          'Who else should I be talking to about this?',
        ],
        contextPrompt: 'Focus on alignment and uncovering hidden constraints or politics. Get specific on success criteria and metrics.',
      },
    ];
  }
}
