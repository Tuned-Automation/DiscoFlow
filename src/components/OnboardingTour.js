const STORAGE_KEY = 'disco-onboarding-done';
const SETUP_STEPS_COUNT = 4;
const TOTAL_STEPS = 7;

const SETUP_STEPS = [
  {
    targetId: 'template-pills',
    title: 'Pick a Template',
    text: 'Choose a discovery template to pre-fill your goal and give the AI context about your interview style. Try "Product Discovery" or "Sales Discovery" to start.',
    position: 'below',
  },
  {
    targetId: 'intention',
    title: 'Set Your Discovery Goal',
    text: 'This is the most important field. Describe what you want to uncover in this session — the AI uses it to tailor every follow-up suggestion it makes.',
    position: 'above',
  },
  {
    targetId: 'browse-profiles-btn',
    title: 'Save Client Profiles',
    text: 'Create reusable client profiles to auto-fill context for repeat conversations. Select one here and it populates the Client Context field automatically.',
    position: 'below',
  },
  {
    targetId: 'start-session-btn',
    title: 'Start Your Session',
    text: "When you're ready, click here to begin recording. If this is your first time, you'll be prompted to add your Anthropic and OpenAI API keys — both are required.",
    position: 'above',
  },
];

const SESSION_STEPS = [
  {
    targetId: 'ptt-button',
    title: 'Push-to-Talk',
    text: 'Hold this button (or hold Space on your keyboard) while YOU are speaking. This labels your audio separately so the AI knows whose voice belongs to whom.',
    position: 'above',
  },
  {
    targetId: 'suggest-btn',
    title: 'Get AI Suggestions',
    text: "After a few exchanges, hit this to get Claude-generated follow-up questions tailored to your conversation. Use the sliders above to steer toward deeper or more emotional questions.",
    position: 'above',
  },
  {
    targetId: 'end-session-btn',
    title: 'End & Review',
    text: "Click here when the interview is done. You'll get a full transcript, all AI-suggested questions with asked/not-asked status, and Markdown or JSON export options.",
    position: 'below',
  },
];

class OnboardingTourManager {
  constructor() {
    this._overlay = null;
    this._bubble = null;
    this._steps = [];
    this._currentStepIndex = 0;
    this._globalStepOffset = 0;
    this._resizeHandler = null;
  }

  isDone() {
    return localStorage.getItem(STORAGE_KEY) === '1';
  }

  showSetupTour() {
    if (this.isDone()) return;
    this._steps = SETUP_STEPS;
    this._currentStepIndex = 0;
    this._globalStepOffset = 0;
    this._start();
  }

  showSessionTour() {
    if (this.isDone()) return;
    this._steps = SESSION_STEPS;
    this._currentStepIndex = 0;
    this._globalStepOffset = SETUP_STEPS_COUNT;
    this._start();
  }

  _start() {
    this._cleanup();
    this._createOverlay();
    this._showCurrentStep();
  }

  _createOverlay() {
    this._overlay = document.createElement('div');
    this._overlay.className = 'onboarding-overlay';
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this._advance();
    });
    document.body.appendChild(this._overlay);
  }

  _showCurrentStep() {
    if (this._bubble) {
      this._bubble.remove();
      this._bubble = null;
    }

    const step = this._steps[this._currentStepIndex];
    const target = document.getElementById(step.targetId);

    if (!target) {
      this._advance();
      return;
    }

    this._highlightTarget(target);

    const globalIndex = this._globalStepOffset + this._currentStepIndex;
    const isLast = globalIndex === TOTAL_STEPS - 1;

    this._bubble = document.createElement('div');
    this._bubble.className = 'onboarding-bubble';
    this._bubble.innerHTML = `
      <div class="onboarding-bubble-header">
        <span class="onboarding-step-label">Step ${globalIndex + 1} of ${TOTAL_STEPS}</span>
        <button class="onboarding-skip-btn" aria-label="Skip tour">Skip tour</button>
      </div>
      <div class="onboarding-bubble-title">${step.title}</div>
      <div class="onboarding-bubble-text">${step.text}</div>
      <div class="onboarding-bubble-footer">
        <button class="btn btn-ghost btn-sm onboarding-back-btn" ${this._currentStepIndex === 0 && this._globalStepOffset === 0 ? 'style="visibility:hidden"' : ''}>← Back</button>
        <button class="btn btn-primary btn-sm onboarding-next-btn">${isLast ? 'Got it!' : 'Next →'}</button>
      </div>
    `;

    document.body.appendChild(this._bubble);

    this._bubble.querySelector('.onboarding-skip-btn').addEventListener('click', () => this._dismiss());
    this._bubble.querySelector('.onboarding-next-btn').addEventListener('click', () => this._advance());

    const backBtn = this._bubble.querySelector('.onboarding-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => this._back());
    }

    this._positionBubble(target, step.position);

    this._resizeHandler = () => this._positionBubble(target, step.position);
    window.addEventListener('resize', this._resizeHandler);

    requestAnimationFrame(() => {
      if (this._bubble) this._bubble.classList.add('onboarding-bubble--visible');
    });
  }

  _highlightTarget(target) {
    document.querySelectorAll('.onboarding-highlight').forEach(el => el.classList.remove('onboarding-highlight'));
    target.classList.add('onboarding-highlight');
  }

  _positionBubble(target, preferredPosition) {
    const rect = target.getBoundingClientRect();
    const bubbleWidth = 320;
    const arrowSize = 10;
    const gap = arrowSize + 8;
    const padding = 12;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    this._bubble.style.width = `${bubbleWidth}px`;
    this._bubble.style.maxWidth = `calc(100vw - ${padding * 2}px)`;

    // Re-measure after width set
    const bh = this._bubble.offsetHeight || 160;
    const bw = Math.min(bubbleWidth, vw - padding * 2);

    let pos = preferredPosition;

    // Flip if not enough space
    if (pos === 'below' && rect.bottom + gap + bh > vh - padding) pos = 'above';
    if (pos === 'above' && rect.top - gap - bh < padding) pos = 'below';
    if (pos === 'right' && rect.right + gap + bw > vw - padding) pos = 'left';
    if (pos === 'left' && rect.left - gap - bw < padding) pos = 'right';

    let top, left;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    if (pos === 'below') {
      top = rect.bottom + gap;
      left = Math.max(padding, Math.min(centerX - bw / 2, vw - bw - padding));
    } else if (pos === 'above') {
      top = rect.top - gap - bh;
      left = Math.max(padding, Math.min(centerX - bw / 2, vw - bw - padding));
    } else if (pos === 'right') {
      top = Math.max(padding, Math.min(centerY - bh / 2, vh - bh - padding));
      left = rect.right + gap;
    } else {
      top = Math.max(padding, Math.min(centerY - bh / 2, vh - bh - padding));
      left = rect.left - gap - bw;
    }

    this._bubble.style.top = `${top}px`;
    this._bubble.style.left = `${left}px`;

    // Remove all arrow classes and apply the correct one
    this._bubble.classList.remove(
      'arrow-top', 'arrow-bottom', 'arrow-left', 'arrow-right'
    );

    const arrowClass = pos === 'below' ? 'arrow-top'
      : pos === 'above' ? 'arrow-bottom'
      : pos === 'right' ? 'arrow-left'
      : 'arrow-right';
    this._bubble.classList.add(arrowClass);

    // Position the arrow horizontally/vertically to point at the target center
    if (pos === 'below' || pos === 'above') {
      const arrowLeft = Math.max(16, Math.min(centerX - left - arrowSize, bw - 16 - arrowSize * 2));
      this._bubble.style.setProperty('--arrow-offset', `${arrowLeft}px`);
    } else {
      const arrowTop = Math.max(16, Math.min(centerY - top - arrowSize, bh - 16 - arrowSize * 2));
      this._bubble.style.setProperty('--arrow-offset', `${arrowTop}px`);
    }
  }

  _advance() {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    if (this._currentStepIndex < this._steps.length - 1) {
      this._currentStepIndex++;
      this._showCurrentStep();
    } else {
      // End of this view's steps
      const globalIndex = this._globalStepOffset + this._currentStepIndex;
      if (globalIndex === TOTAL_STEPS - 1) {
        this._dismiss();
      } else {
        // More steps on next view — clean up overlay/bubble, mark partial progress
        this._cleanup();
      }
    }
  }

  _back() {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    if (this._currentStepIndex > 0) {
      this._currentStepIndex--;
      this._showCurrentStep();
    }
  }

  _dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    this._cleanup();
  }

  _cleanup() {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    document.querySelectorAll('.onboarding-highlight').forEach(el => el.classList.remove('onboarding-highlight'));
    if (this._bubble) { this._bubble.remove(); this._bubble = null; }
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
  }
}

export const OnboardingTour = new OnboardingTourManager();
