import { eventBus } from './EventBus.js';

/**
 * AIService — Anthropic Claude API integration for generating follow-up questions
 * Supports streaming, both Sonnet (speed) and Opus (depth)
 */
export class AIService {
  constructor() {
    this.apiKey = '';
    this.model = 'claude-sonnet-4-20250514'; // Sonnet for speed
    this.isGenerating = false;
    this.questionHistory = [];
    this.questionId = 0;
    this._progressiveCount = 0;
  }

  init(apiKey, model) {
    this.apiKey = apiKey;
    if (model) this.model = model;
  }

  setModel(model) {
    this.model = model;
  }

  /**
   * Generate follow-up questions based on the session context
   * @param {Object} context - { intention, myContext, clientContext, transcript, template }
   * @returns {Promise<void>} - emits events as questions stream in
   */
  async generateQuestions(context) {
    if (this.isGenerating || !this.apiKey) {
      if (!this.apiKey) {
        eventBus.emit('ai:error', { message: 'Anthropic API key not set. Open Settings to add it.' });
      }
      return;
    }

    this.isGenerating = true;
    this._progressiveCount = 0;
    eventBus.emit('ai:generating-start');

    const systemPrompt = this._buildSystemPrompt(context);
    const userMessage = this._buildUserMessage(context);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 600,
          temperature: 0.7,
          stream: true,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }]
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `API error: ${response.status}`);
      }

      // Stream the response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                fullText += parsed.delta.text;
                const currentText = this._tryEmitProgress(fullText);
                eventBus.emit('ai:generating-delta', { text: fullText, currentText });
              }
            } catch (e) {
              // Skip malformed JSON chunks
            }
          }
        }
      }

      // Emit any question not yet progressively detected (the last one, which has no
      // following numbered line to trigger it, plus any edge-case remainder)
      const allParsed = this._parseQuestions(fullText);
      const remaining = allParsed.slice(this._progressiveCount);
      remaining.forEach(q => {
        q.id = ++this.questionId;
        q.asked = false;
        q.timestamp = Date.now();
        this.questionHistory.push(q);
      });

      eventBus.emit('ai:questions-ready', { questions: remaining, rawText: fullText });

    } catch (err) {
      console.error('AI generation error:', err);
      eventBus.emit('ai:error', { message: err.message });
    } finally {
      this.isGenerating = false;
      eventBus.emit('ai:generating-end');
    }
  }

  markAsked(questionId) {
    const q = this.questionHistory.find(q => q.id === questionId);
    if (q) {
      q.asked = true;
      eventBus.emit('ai:question-asked', { questionId });
    }
  }

  getQuestionHistory() {
    return [...this.questionHistory];
  }

  /**
   * Detect newly completed questions in the streaming text and emit them immediately.
   * A question is considered complete when the next numbered line has started streaming.
   * Returns the in-progress (incomplete) portion of text for the streaming preview.
   */
  _tryEmitProgress(fullText) {
    // Split on newline followed by a numbered question start (e.g. "\n2. " or "\n3) ")
    const sections = fullText.split(/\n(?=\d+[\.\)]\s)/);

    // All sections except the last are fully complete questions
    const completeSections = sections.slice(0, -1);

    for (let i = this._progressiveCount; i < completeSections.length; i++) {
      const parsed = this._parseQuestions(completeSections[i]);
      if (parsed.length > 0) {
        const q = parsed[0];
        q.id = ++this.questionId;
        q.asked = false;
        q.timestamp = Date.now();
        this.questionHistory.push(q);
        eventBus.emit('ai:question-ready', { question: q });
        this._progressiveCount++;
      }
    }

    // If the last section ends with a closing bracket, it's a fully-formed question
    // whose completion we can't detect by the usual "next number started" heuristic.
    const lastSection = sections[sections.length - 1] || '';
    if (lastSection && /\]\s*$/.test(lastSection) && this._progressiveCount === completeSections.length) {
      const parsed = this._parseQuestions(lastSection);
      if (parsed.length > 0) {
        const q = parsed[0];
        q.id = ++this.questionId;
        q.asked = false;
        q.timestamp = Date.now();
        this.questionHistory.push(q);
        eventBus.emit('ai:question-ready', { question: q });
        this._progressiveCount++;
      }
    }

    return lastSection;
  }

  _buildSystemPrompt(context) {
    let focusInstruction = '';
    const steering = context.steering || { depth: 0, emotion: 0, length: 'standard' };
    
    // Depth steering (-1 = Lateral, 0 = Balanced, 1 = Deeper)
    if (steering.depth === -1) focusInstruction += '\n- FOCUS: Go lateral. Change the topic and explore completely new, related adjacent areas. Do not dig deeper.';
    else if (steering.depth === 1) focusInstruction += '\n- FOCUS: Go deeper. Drill down intensely into the currently discussed topic. Ask "why" and "how".';
    
    // Emotion steering (-1 = Strategy, 0 = Balanced, 1 = Emotion)
    if (steering.emotion === -1) focusInstruction += '\n- FOCUS: Be completely strategy driven. Ask about high-level strategy, metrics, statistics, logic, and concrete processes.';
    else if (steering.emotion === 1) focusInstruction += '\n- FOCUS: Be deeply emotion driven. Ask about feelings, interpersonal dynamics, fears, and personal motivations.';
    
    // Length steering
    if (steering.length === 'quick') focusInstruction += '\n- LENGTH: Quick fire questions. Very short, sharp, concise phrasing. No preamble.';
    else if (steering.length === 'long') focusInstruction += '\n- LENGTH: Longer questions. Include a little bit of explanation, context, or framing before asking the core question.';

    return `You are an expert discovery interviewer assistant. Your role is to generate sharp, insightful follow-up questions in real-time during a discovery interview.

CRITICAL RULES:
- Generate 1-3 follow-up questions, numbered
- Questions should be concise but deep — aimed at uncovering insights the client may not realize they have
- Questions must flow naturally from what was just discussed
- Prioritize "why" and "how" questions over "what" questions
- If the client is giving surface-level answers, probe deeper
- If an interesting thread emerges, follow it before moving on
- If the current topic seems exhausted, suggest a pivot to the next relevant area
- Be specific, not generic. Reference details from the transcript
- Each question should have a brief rationale tag in [brackets] at the end${focusInstruction}

INTERVIEW CONTEXT:
- Goal: ${context.intention || 'General discovery'}
- Interviewer: ${context.myContext || 'Not specified'}
- Client: ${context.clientContext || 'Not specified'}
${context.template ? `- Template guidance: ${context.template.topicAreas || ''}` : ''}

Format each question as:
1. [Direction: Deeper/Emotion/Edge Case/Next] [Question text] [rationale]
2. [Direction: Deeper/Emotion/Edge Case/Next] [Question text] [rationale]
3. [Direction: Deeper/Emotion/Edge Case/Next] [Question text] [rationale]

Directions meaning:
- Deeper: Asking to dive deeper into the same topic
- Emotion: Exploring emotion or feelings around the topic
- Edge Case: Finding exceptions, edge cases, or boundaries
- Next: Moving the conversation forward to a new intel area`;
  }

  _buildUserMessage(context) {
    const transcript = context.transcript || 'No transcript yet.';
    return `Here's the conversation transcript so far:

${transcript}

Based on the above conversation and the discovery goal, what are the best follow-up questions I should ask right now? Focus on what will get the most valuable insights from the client.`;
  }

  _parseQuestions(text) {
    const questions = [];
    const lines = text.split('\n').filter(l => l.trim());
    
    for (const line of lines) {
      const match = line.match(/^\d+[\.\)]\s*(.+)/);
      if (match) {
        let textRest = match[1].trim();
        let rationale = '';
        let type = 'Follow-up';
        
        // Extract direction from the start
        const typeMatch = textRest.match(/^\[(?:Direction:\s*)?([^\]]+)\]\s*/i);
        if (typeMatch) {
          type = typeMatch[1].trim();
          textRest = textRest.replace(typeMatch[0], '').trim();
        }

        // Extract rationale in brackets at the end
        const rationaleMatch = textRest.match(/\[([^\]]+)\]\s*$/);
        if (rationaleMatch) {
          rationale = rationaleMatch[1];
          textRest = textRest.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
        }

        questions.push({
          text: textRest,
          rationale: rationale,
          type: type
        });
      }
    }

    // If no numbered questions found, treat the whole text as one question
    if (questions.length === 0 && text.trim()) {
      questions.push({
        text: text.trim(),
        rationale: '',
        type: 'Next'
      });
    }

    return questions;
  }
}
