/**
 * Browser automation module using Playwright
 */

const { chromium } = require('playwright');
const { loadConfig } = require('./config');
const { logger } = require('./logger');

const config = loadConfig();

class BrowserManager {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isConnected = false;
  }

  async launch() {
    logger.info('Launching browser', { headless: config.browser.headless });

    this.browser = await chromium.launch({
      headless: config.browser.headless,
      slowMo: config.browser.slowMo,
      args: ['--disable-blink-features=AutomationControlled']
    });

    this.context = await this.browser.newContext({
      viewport: config.browser.viewport,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    this.page = await this.context.newPage();

    // Add console/error listeners
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        logger.debug('Browser console error', { text: msg.text() });
      }
    });

    this.page.on('pageerror', error => {
      logger.warn('Page error', { message: error.message });
    });

    this.isConnected = true;
    logger.info('Browser launched successfully');
  }

  async navigate(url, options = {}) {
    if (!this.isConnected) {
      throw new Error('Browser not connected. Call launch() first.');
    }

    const fullUrl = url.startsWith('http') ? url : `${config.baseUrl}${url}`;
    logger.info('Navigating', { url: fullUrl });

    try {
      const response = await this.page.goto(fullUrl, {
        waitUntil: 'domcontentloaded',
        timeout: config.timeout,
        ...options
      });

      // Wait for any dynamic content
      await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

      logger.info('Navigation complete', {
        url: this.page.url(),
        status: response?.status()
      });

      return response;
    } catch (error) {
      logger.error('Navigation failed', { url: fullUrl, error: error.message });
      throw error;
    }
  }

  async waitForSelector(selector, options = {}) {
    try {
      await this.page.waitForSelector(selector, {
        timeout: config.timeout,
        ...options
      });
      return true;
    } catch (error) {
      logger.debug('Selector not found', { selector, error: error.message });
      return false;
    }
  }

  async click(selector, options = {}) {
    logger.debug('Clicking element', { selector });
    try {
      await this.page.click(selector, { timeout: config.timeout, ...options });
      return true;
    } catch (error) {
      logger.warn('Click failed', { selector, error: error.message });
      return false;
    }
  }

  async fill(selector, value, options = {}) {
    logger.debug('Filling input', { selector, valueLength: value?.length });
    try {
      await this.page.fill(selector, value, { timeout: config.timeout, ...options });
      return true;
    } catch (error) {
      logger.warn('Fill failed', { selector, error: error.message });
      return false;
    }
  }

  async selectOption(selector, value, options = {}) {
    logger.debug('Selecting option', { selector, value });
    try {
      await this.page.selectOption(selector, value, { timeout: config.timeout, ...options });
      return true;
    } catch (error) {
      logger.warn('Select option failed', { selector, error: error.message });
      return false;
    }
  }

  async getText(selector) {
    try {
      const element = await this.page.$(selector);
      if (element) {
        return await element.textContent();
      }
      return null;
    } catch (error) {
      logger.debug('Get text failed', { selector, error: error.message });
      return null;
    }
  }

  async getAttribute(selector, attribute) {
    try {
      const element = await this.page.$(selector);
      if (element) {
        return await element.getAttribute(attribute);
      }
      return null;
    } catch (error) {
      logger.debug('Get attribute failed', { selector, attribute, error: error.message });
      return null;
    }
  }

  async evaluate(fn, ...args) {
    try {
      return await this.page.evaluate(fn, ...args);
    } catch (error) {
      logger.warn('Evaluate failed', { error: error.message });
      return null;
    }
  }

  async screenshot(path, options = {}) {
    try {
      await this.page.screenshot({ path, fullPage: true, ...options });
      logger.info('Screenshot saved', { path });
      return true;
    } catch (error) {
      logger.error('Screenshot failed', { path, error: error.message });
      return false;
    }
  }

  async getPageContent() {
    return await this.page.content();
  }

  async getPageText() {
    return await this.page.evaluate(() => document.body.innerText);
  }

  getPage() {
    return this.page;
  }

  getContext() {
    return this.context;
  }

  async close() {
    logger.info('Closing browser');
    if (this.page) await this.page.close().catch(() => {});
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
    this.isConnected = false;
  }
}

module.exports = { BrowserManager };