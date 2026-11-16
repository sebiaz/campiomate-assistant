/**
 * CampioMate Assistant - Main entry point
 * Local browser assistant for solving CampioMate.ro exercises
 */

const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const { BrowserManager } = require('./browser');
const { ExerciseDetector } = require('./exercise-detector');
const { AnswerExtractor } = require('./answer-extractor');
const { UI } = require('./ui');
const { HistoryTracker } = require('./history');
const { loadConfig } = require('./config');
const { logger } = require('./logger');

const config = loadConfig();

class CampioMateAssistant {
  constructor(options = {}) {
    this.browser = new BrowserManager();
    this.ui = new UI();
    this.history = new HistoryTracker();
    this.dryRun = options.dryRun || config.dryRun;
    this.autoSubmit = options.autoSubmit || config.autoSubmit;
    this.currentExercise = null;
  }

  async initialize() {
    logger.info('Initializing CampioMate Assistant', {
      dryRun: this.dryRun,
      autoSubmit: this.autoSubmit
    });

    await this.browser.launch();
    logger.info('Browser ready');
  }

  async run() {
    try {
      await this.initialize();

      let running = true;
      while (running) {
        const choice = await this.ui.showMainMenu();

        switch (choice) {
          case '1':
            await this.solveExercisesFlow();
            break;
          case '2':
            await this.browseCatalogFlow();
            break;
          case '3':
            this.showHistory();
            break;
          case '4':
            await this.settingsMenu();
            break;
          case '5':
          case 'exit':
          case 'quit':
            running = false;
            break;
          default:
            this.ui.log('Invalid option', 'warning');
        }
      }
    } catch (error) {
      logger.error('Fatal error', { error: error.message, stack: error.stack });
      this.ui.log(`Error: ${error.message}`, 'error');
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Main exercise solving flow
   */
  async solveExercisesFlow() {
    this.ui.log('Navigating to training page...');

    await this.browser.navigate('/training');

    // Check if we need to login
    const isLoggedIn = await this.checkLoginStatus();
    if (!isLoggedIn) {
      this.ui.log('Login required to solve exercises', 'warning');
      await this.ui.promptLogin();

      // Re-check after login
      const stillLoggedIn = await this.checkLoginStatus();
      if (!stillLoggedIn) {
        this.ui.log('Still not logged in. Cannot proceed.', 'error');
        return;
      }
    }

    // Get list of exercises
    const exercises = await this.getExerciseList();
    if (exercises.length === 0) {
      this.ui.log('No exercises found', 'warning');
      return;
    }

    this.ui.log(`Found ${exercises.length} exercises`);

    // Process each exercise
    for (let i = 0; i < exercises.length; i++) {
      const exercise = exercises[i];
      this.ui.showProgress(i + 1, exercises.length, exercise.topic);

      // Check if already attempted
      if (this.history.wasAttempted(exercise.worksheetId)) {
        this.ui.log(`Already attempted: ${exercise.topic}`, 'info');
        continue;
      }

      await this.processExercise(exercise);
    }

    this.ui.log('All exercises processed!', 'success');
    this.showSessionSummary();
  }

  /**
   * Browse training catalog without login
   */
  async browseCatalogFlow() {
    this.ui.log('Loading training catalog...');
    await this.browser.navigate('/training');

    const exercises = await this.getExerciseList();

    console.log('\n📚 TRAINING CATALOG:');
    console.log('='.repeat(60));
    exercises.forEach((ex, i) => {
      const attempted = this.history.wasAttempted(ex.worksheetId) ? ' ✓' : '';
      console.log(`${i + 1}. ${ex.topic} [${ex.grade}, ${ex.level}, ${ex.round}]${attempted}`);
    });
    console.log('='.repeat(60));
    console.log(`Total: ${exercises.length} exercises`);
  }

  /**
   * Process a single exercise
   */
  async processExercise(exercise) {
    const worksheetId = exercise.worksheetId;
    const exerciseUrl = `/training/item/${worksheetId}`;

    this.ui.log(`Opening: ${exercise.topic}`);

    try {
      // Navigate to exercise
      await this.browser.navigate(exerciseUrl);

      // Wait for page to load
      await this.browser.page.waitForTimeout(2000);

      // Detect exercise data
      const detector = new ExerciseDetector(this.browser.page);
      const exerciseData = await detector.getExerciseData();

      if (!exerciseData.isExercisePage) {
        this.ui.log('Not an exercise page (may need login)', 'warning');
        this.history.recordAttempt(exerciseData, { answer: null, confidence: 0, confidenceLabel: 'unable', method: 'none', reasoning: 'Not exercise page' }, 'error');
        return;
      }

      // Try to solve
      const extractor = new AnswerExtractor(this.browser.page);
      const answerResult = await extractor.solve(exerciseData);

      // Review with user
      const userDecision = await this.ui.reviewAnswer(exerciseData, answerResult);

      switch (userDecision.action) {
        case 'submit':
          if (userDecision.answer) {
            await this.submitAnswer(userDecision.answer);
            this.history.recordAttempt(exerciseData, answerResult, 'submitted');
            this.ui.log('Answer submitted!', 'success');
          }
          break;
        case 'skip':
          this.history.recordAttempt(exerciseData, answerResult, 'skipped');
          this.ui.log('Skipped', 'info');
          break;
        case 'quit':
          throw new Error('USER_QUIT');
        case 'cancel':
          this.ui.log('Cancelled', 'warning');
          break;
      }

      // Go back to training list
      await this.browser.navigate('/training');
      await this.browser.page.waitForTimeout(1000);

    } catch (error) {
      if (error.message === 'USER_QUIT') throw error;
      logger.error('Error processing exercise', { worksheetId, error: error.message });
      this.ui.log(`Error: ${error.message}`, 'error');
      this.history.recordAttempt({ worksheetId }, { answer: null, confidence: 0 }, 'error');
    }
  }

  /**
   * Check if user is logged in
   */
  async checkLoginStatus() {
    // Check for login indicators
    const loginBtn = await this.browser.page.$('button:has-text("Autentificare"), a:has-text("Autentificare")');
    const logoutBtn = await this.browser.page.$('a:has-text("Deconectare"), button:has-text("Deconectare")');

    return !!logoutBtn && !loginBtn;
  }

  /**
   * Get list of exercises from training page
   */
  async getExerciseList() {
    const exercises = await this.browser.page.evaluate(() => {
      const rows = document.querySelectorAll('tr.cm-training-row');
      const list = [];
      rows.forEach(row => {
        const worksheetId = row.getAttribute('data-worksheet');
        const topicEl = row.querySelector('.cm-training-topic');
        const gradeEl = row.querySelector('.cm-training-grade');
        const levelEl = row.querySelector('.cm-training-level');
        const roundEl = row.querySelector('.cm-training-round');

        if (worksheetId && topicEl) {
          list.push({
            worksheetId,
            topic: topicEl.textContent?.trim(),
            grade: gradeEl?.textContent?.trim(),
            level: levelEl?.textContent?.trim(),
            round: roundEl?.textContent?.trim()
          });
        }
      });
      return list;
    });

    return exercises || [];
  }

  /**
   * Submit answer on exercise page
   */
  async submitAnswer(answer) {
    if (this.dryRun) {
      this.ui.log(`[DRY RUN] Would submit: ${answer}`, 'warning');
      return;
    }

    const submitSelectors = config.selectors.exercisePage.submitButton.split(', ');

    for (const selector of submitSelectors) {
      try {
        const btn = await this.browser.page.$(selector);
        if (btn) {
          // Find input and fill
          const input = await this.browser.page.$('input[type="text"], textarea, input[type="radio"]:checked');
          if (input) {
            const tagName = await input.evaluate(el => el.tagName.toLowerCase());
            const type = await input.getAttribute('type');

            if (tagName === 'textarea' || (tagName === 'input' && type === 'text')) {
              await input.fill(answer);
            } else if (type === 'radio') {
              // Already checked
            }
          }

          await btn.click();
          await this.browser.page.waitForTimeout(1000);
          this.ui.log('Answer submitted via browser', 'success');
          return true;
        }
      } catch (e) {
        logger.debug('Submit selector failed', { selector, error: e.message });
      }
    }

    this.ui.log('Could not find submit button', 'error');
    return false;
  }

  /**
   * Show session summary
   */
  showSessionSummary() {
    const stats = this.history.getSessionStats();
    console.log('\n📊 SESSION SUMMARY:');
    console.log('='.repeat(40));
    console.log(`Attempted: ${stats.attempted}`);
    console.log(`Submitted: ${stats.submitted}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);
    console.log('='.repeat(40));
  }

  /**
   * Show history
   */
  showHistory() {
    const recent = this.history.getRecent(20);
    const global = this.history.getGlobalStats();

    console.log('\n📜 EXERCISE HISTORY:');
    console.log('='.repeat(60));
    recent.forEach((ex, i) => {
      const status = ex.userAction === 'submitted' ? '✅' : ex.userAction === 'skipped' ? '⏭️' : '❌';
      console.log(`${i + 1}. ${status} ${ex.worksheetId} - ${ex.type} - ${ex.confidenceLabel} (${ex.method})`);
      if (ex.proposedAnswer) console.log(`   Answer: ${ex.proposedAnswer}`);
    });
    console.log('='.repeat(60));
    console.log(`Global: ${global.totalAttempted} attempted, ${global.totalSubmitted} submitted`);
  }

  /**
   * Settings menu
   */
  async settingsMenu() {
    this.ui.log('Current settings:', 'info');
    console.log(`  Auto-submit: ${this.autoSubmit}`);
    console.log(`  Dry-run: ${this.dryRun}`);
    console.log(`  AI enabled: ${config.ai.enabled}`);
    console.log(`  Log level: ${config.logging.level}`);
  }

  async cleanup() {
    this.ui.log('Shutting down...');
    this.history.saveSession();
    await this.browser.close();
    this.ui.close();
    logger.info('Assistant stopped');
  }
}

// CLI entry point
async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('dry-run', { type: 'boolean', description: 'Run without submitting answers', default: false })
    .option('auto-submit', { type: 'boolean', description: 'Automatically submit answers', default: false })
    .option('headless', { type: 'boolean', description: 'Run browser in headless mode', default: false })
    .option('config', { type: 'string', description: 'Path to config file' })
    .help()
    .alias('help', 'h')
    .argv;

  // Apply CLI overrides
  if (argv.dryRun) process.env.CAMPIO_DRY_RUN = 'true';
  if (argv.autoSubmit) process.env.CAMPIO_AUTO_SUBMIT = 'true';
  if (argv.headless) process.env.CAMPIO_HEADLESS = 'true';

  const assistant = new CampioMateAssistant({
    dryRun: argv.dryRun,
    autoSubmit: argv.autoSubmit
  });

  await assistant.run();
}

main().catch(console.error);