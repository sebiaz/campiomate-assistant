/**
 * History tracking module
 * Tracks attempted exercises, submitted answers, and results
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

const HISTORY_DIR = path.join(__dirname, '..', 'data');
const HISTORY_FILE = path.join(HISTORY_DIR, 'history.json');
const SESSION_FILE = path.join(HISTORY_DIR, 'session.json');

class HistoryTracker {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.sessionData = {
      sessionId: this.sessionId,
      startTime: new Date().toISOString(),
      exercises: [],
      stats: { attempted: 0, submitted: 0, skipped: 0, errors: 0 }
    };
    this.history = this.loadHistory();
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(HISTORY_DIR)) {
      fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  loadHistory() {
    if (fs.existsSync(HISTORY_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
      } catch (e) {
        logger.warn('Failed to load history, starting fresh', { error: e.message });
      }
    }
    return { exercises: [], globalStats: { totalAttempted: 0, totalSubmitted: 0 } };
  }

  saveHistory() {
    try {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2));
    } catch (e) {
      logger.error('Failed to save history', { error: e.message });
    }
  }

  saveSession() {
    this.sessionData.endTime = new Date().toISOString();
    try {
      fs.writeFileSync(SESSION_FILE, JSON.stringify(this.sessionData, null, 2));
    } catch (e) {
      logger.error('Failed to save session', { error: e.message });
    }
  }

  /**
   * Record an exercise attempt
   */
  recordAttempt(exerciseData, answerResult, userAction) {
    const record = {
      id: `${this.sessionId}_${Date.now()}`,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      worksheetId: exerciseData.worksheetId,
      url: exerciseData.url,
      type: exerciseData.type,
      question: exerciseData.question?.slice(0, 500),
      proposedAnswer: answerResult.answer,
      confidence: answerResult.confidence,
      confidenceLabel: answerResult.confidenceLabel,
      method: answerResult.method,
      reasoning: answerResult.reasoning,
      userAction, // 'submitted', 'skipped', 'edited', 'error'
      finalAnswer: userAction === 'edited' ? answerResult.answer : (userAction === 'submitted' ? answerResult.answer : null)
    };

    this.sessionData.exercises.push(record);
    this.sessionData.stats.attempted++;

    if (userAction === 'submitted') {
      this.sessionData.stats.submitted++;
    } else if (userAction === 'skipped') {
      this.sessionData.stats.skipped++;
    } else if (userAction === 'error') {
      this.sessionData.stats.errors++;
    }

    // Also add to global history
    this.history.exercises.push(record);
    this.history.globalStats.totalAttempted++;
    if (userAction === 'submitted') {
      this.history.globalStats.totalSubmitted++;
    }

    this.saveSession();
    this.saveHistory();

    logger.info('Recorded exercise attempt', {
      worksheetId: exerciseData.worksheetId,
      action: userAction
    });

    return record;
  }

  /**
   * Get exercise history for a worksheet
   */
  getWorksheetHistory(worksheetId) {
    return this.history.exercises.filter(e => e.worksheetId === worksheetId);
  }

  /**
   * Check if worksheet was already attempted
   */
  wasAttempted(worksheetId) {
    return this.history.exercises.some(e => e.worksheetId === worksheetId);
  }

  /**
   * Get session stats
   */
  getSessionStats() {
    return { ...this.sessionData.stats };
  }

  /**
   * Get global stats
   */
  getGlobalStats() {
    return { ...this.history.globalStats };
  }

  /**
   * Get recent exercises
   */
  getRecent(limit = 10) {
    return this.sessionData.exercises.slice(-limit);
  }
}

module.exports = { HistoryTracker };