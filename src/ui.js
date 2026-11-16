/**
 * User Interface module - Review before submit
 * Provides CLI prompts for answer confirmation
 */

const readline = require('readline');
const { loadConfig } = require('./config');
const { logger } = require('./logger');

const config = loadConfig();

class UI {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Display exercise info and proposed answer
   */
  async reviewAnswer(exerciseData, answerResult) {
    return new Promise((resolve) => {
      console.log('\n' + '='.repeat(60));
      console.log('CAMPIO MATE ASSISTANT - ANSWER REVIEW');
      console.log('='.repeat(60));

      console.log('\n📋 EXERCISE INFO:');
      console.log(`   Worksheet ID: ${exerciseData.worksheetId || 'unknown'}`);
      console.log(`   Type: ${exerciseData.type || 'unknown'}`);
      console.log(`   URL: ${exerciseData.url}`);

      if (exerciseData.question) {
        console.log('\n❓ QUESTION:');
        // Truncate long questions
        const q = exerciseData.question.length > 500
          ? exerciseData.question.slice(0, 500) + '...'
          : exerciseData.question;
        console.log(`   ${q}`);
      }

      if (exerciseData.options && exerciseData.options.length > 0) {
        console.log('\n📝 OPTIONS:');
        exerciseData.options.forEach((opt, i) => {
          console.log(`   ${i + 1}. ${opt.label || opt.value} (value: ${opt.value})`);
        });
      }

      console.log('\n🤖 PROPOSED ANSWER:');
      console.log(`   Answer: ${answerResult.answer || 'UNABLE TO SOLVE'}`);
      console.log(`   Confidence: ${answerResult.confidenceLabel?.toUpperCase() || 'UNKNOWN'} (${(answerResult.confidence * 100).toFixed(0)}%)`);
      console.log(`   Method: ${answerResult.method}`);
      console.log(`   Reasoning: ${answerResult.reasoning}`);

      if (answerResult.confidenceLabel === 'unable') {
        console.log('\n⚠️  WARNING: Unable to solve this exercise reliably.');
      } else if (answerResult.confidenceLabel === 'uncertain') {
        console.log('\n⚠️  CAUTION: Low confidence answer. Please verify carefully.');
      }

      console.log('\n' + '-'.repeat(60));

      if (config.autoSubmit) {
        console.log('🔄 AUTO-SUBMIT ENABLED - Submitting automatically...');
        console.log('   Press Ctrl+C within 3 seconds to cancel...');

        setTimeout(() => {
          resolve({ action: 'submit', answer: answerResult.answer });
        }, 3000);

        // Allow cancellation
        this.rl.once('SIGINT', () => {
          console.log('\n❌ Cancelled by user');
          resolve({ action: 'cancel' });
        });
        return;
      }

      console.log('ACTIONS:');
      console.log('  [s] Submit this answer');
      console.log('  [e] Edit answer manually');
      console.log('  [n] Skip / Next exercise');
      console.log('  [q] Quit');
      console.log('-'.repeat(60));

      this.rl.question('Choice: ', (input) => {
        const choice = input.trim().toLowerCase();

        switch (choice) {
          case 's':
          case 'submit':
            resolve({ action: 'submit', answer: answerResult.answer });
            break;
          case 'e':
          case 'edit':
            this.promptCustomAnswer().then(customAnswer => {
              resolve({ action: 'submit', answer: customAnswer });
            });
            break;
          case 'n':
          case 'next':
          case 'skip':
            resolve({ action: 'skip' });
            break;
          case 'q':
          case 'quit':
          case 'exit':
            resolve({ action: 'quit' });
            break;
          default:
            console.log('Invalid choice. Skipping...');
            resolve({ action: 'skip' });
        }
      });
    });
  }

  /**
   * Prompt for custom answer
   */
  async promptCustomAnswer() {
    return new Promise((resolve) => {
      this.rl.question('Enter your answer: ', (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Show main menu
   */
  async showMainMenu() {
    return new Promise((resolve) => {
      console.log('\n' + '='.repeat(50));
      console.log('CAMPIO MATE ASSISTANT');
      console.log('='.repeat(50));
      console.log('1. Start solving exercises (requires login)');
      console.log('2. Browse training catalog (no login needed)');
      console.log('3. View exercise history');
      console.log('4. Settings');
      console.log('5. Exit');
      console.log('-'.repeat(50));

      this.rl.question('Choose option: ', (input) => {
        const choice = input.trim();
        resolve(choice);
      });
    });
  }

  /**
   * Prompt for login
   */
  async promptLogin() {
    return new Promise((resolve) => {
      console.log('\n🔐 LOGIN REQUIRED');
      console.log('Please log in to CampioMate in the browser window.');
      console.log('The assistant will wait for you to complete login.');
      console.log('-'.repeat(50));
      this.rl.question('Press Enter when logged in...', () => {
        resolve();
      });
    });
  }

  /**
   * Show progress
   */
  showProgress(current, total, message) {
    const percent = total > 0 ? ((current / total) * 100).toFixed(1) : 0;
    const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
    console.log(`\r[${bar}] ${percent}% (${current}/${total}) ${message}`);
  }

  /**
   * Show message
   */
  log(message, type = 'info') {
    const prefixes = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      debug: '🔍'
    };
    console.log(`${prefixes[type] || 'ℹ️'} ${message}`);
  }

  /**
   * Close readline
   */
  close() {
    this.rl.close();
  }
}

module.exports = { UI };