/**
 * Exercise/Question detection module
 * Detects exercise type, extracts question text, identifies answer format
 */

const { loadConfig } = require('./config');
const { logger } = require('./logger');

const config = loadConfig();

class ExerciseDetector {
  constructor(page) {
    this.page = page;
  }

  /**
   * Detect if we're on an exercise page
   */
  async isExercisePage() {
    const url = this.page.url();
    return url.includes('/training/item/');
  }

  /**
   * Extract worksheet ID from URL
   */
  getWorksheetId() {
    const url = this.page.url();
    const match = url.match(/\/training\/item\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Detect exercise type from page indicators
   */
  async detectExerciseType() {
    // Check for answer type icons in the page
    const answerTypes = Object.keys(config.answerTypes);

    for (const type of answerTypes) {
      const iconSelector = `svg use[href*="${config.answerTypes[type].icon}"]`;
      const found = await this.page.$(iconSelector);
      if (found) {
        logger.info('Detected exercise type via icon', { type });
        return type;
      }
    }

    // Fallback: check input types
    const inputType = await this.page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="text"], textarea, input[type="radio"], input[type="checkbox"]');
      if (inputs.length === 0) return 'unknown';

      const firstInput = inputs[0];
      if (firstInput.type === 'radio') return 'multiple-choice';
      if (firstInput.type === 'checkbox') return 'checkbox';
      if (firstInput.tagName === 'TEXTAREA') return 'text';

      // Check for pattern hints
      const placeholder = firstInput.placeholder || '';
      if (placeholder.includes('frac') || placeholder.includes('/')) return 'fraction';
      if (placeholder.match(/\d+/)) return 'numeric';

      return 'text';
    });

    logger.info('Detected exercise type via input', { type: inputType });
    return inputType;
  }

  /**
   * Extract question text from the page
   */
  async extractQuestion() {
    const selectors = config.selectors.exercisePage.questionText.split(', ');

    for (const selector of selectors) {
      try {
        const text = await this.page.textContent(selector);
        if (text && text.trim().length > 10) {
          logger.info('Found question text', { selector, length: text.length });
          return text.trim();
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: try to find any substantial text in exercise container
    const containerSelectors = config.selectors.exercisePage.questionContainer.split(', ');
    for (const selector of containerSelectors) {
      try {
        const text = await this.page.textContent(selector);
        if (text && text.trim().length > 20) {
          // Filter out navigation text
          const filtered = text.replace(/Acasă|Clasament|Transferuri|Pregătire|Articole|Autentificare|Înapoi|Despre|GDPR|Termeni|Regulament|Contact/gi, '').trim();
          if (filtered.length > 20) {
            logger.info('Found question text in container', { selector, length: filtered.length });
            return filtered;
          }
        }
      } catch (e) {
        // Continue
      }
    }

    logger.warn('Could not extract question text');
    return null;
  }

  /**
   * Extract answer options for multiple choice
   */
  async extractOptions() {
    const options = [];

    // Radio buttons
    const radios = await this.page.$$('input[type="radio"]');
    for (const radio of radios) {
      const value = await radio.getAttribute('value');
      const label = await radio.evaluate(el => {
        const label = document.querySelector(`label[for="${el.id}"]`);
        return label ? label.textContent : el.parentElement?.textContent;
      });
      options.push({ value, label: label?.trim(), type: 'radio' });
    }

    // Checkboxes
    const checkboxes = await this.page.$$('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
      const value = await checkbox.getAttribute('value');
      const label = await checkbox.evaluate(el => {
        const label = document.querySelector(`label[for="${el.id}"]`);
        return label ? label.textContent : el.parentElement?.textContent;
      });
      options.push({ value, label: label?.trim(), type: 'checkbox' });
    }

    // Custom choice elements
    const customChoices = await this.page.$$('.choice-option, .answer-choice, [data-choice]');
    for (const choice of customChoices) {
      const text = await choice.textContent();
      const value = await choice.getAttribute('data-value') || await choice.getAttribute('value');
      options.push({ value, label: text?.trim(), type: 'custom' });
    }

    logger.info('Extracted options', { count: options.length });
    return options;
  }

  /**
   * Get answer input element info
   */
  async getAnswerInputInfo() {
    const selectors = config.selectors.exercisePage.answerInput.split(', ');

    for (const selector of selectors) {
      const element = await this.page.$(selector);
      if (element) {
        const tagName = await element.evaluate(el => el.tagName.toLowerCase());
        const type = await element.getAttribute('type');
        const placeholder = await element.getAttribute('placeholder');
        const name = await element.getAttribute('name');
        const id = await element.getAttribute('id');

        return { selector, tagName, type, placeholder, name, id };
      }
    }

    return null;
  }

  /**
   * Check if answer was already submitted
   */
  async isAnswerSubmitted() {
    // Look for success indicators
    const successSelectors = [
      '.alert-success',
      '.text-success',
      '[class*="correct"]',
      '[class*="success"]',
      'button:has-text("Următorul")',
      'button:has-text("Next")'
    ];

    for (const selector of successSelectors) {
      const found = await this.page.$(selector);
      if (found) return true;
    }

    // Check if submit button is disabled or changed
    const submitBtn = await this.page.$(config.selectors.exercisePage.submitButton.split(', ')[0]);
    if (submitBtn) {
      const disabled = await submitBtn.getAttribute('disabled');
      const text = await submitBtn.textContent();
      if (disabled || text?.includes('Salvat') || text?.includes('Saved')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get full exercise data
   */
  async getExerciseData() {
    const worksheetId = this.getWorksheetId();
    const isExercisePage = await this.isExercisePage();
    const type = await this.detectExerciseType();
    const question = await this.extractQuestion();
    const options = await this.extractOptions();
    const inputInfo = await this.getAnswerInputInfo();
    const submitted = await this.isAnswerSubmitted();

    return {
      worksheetId,
      isExercisePage,
      type,
      question,
      options,
      inputInfo,
      submitted,
      url: this.page.url(),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { ExerciseDetector };