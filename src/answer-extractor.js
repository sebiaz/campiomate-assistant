/**
 * Answer extraction and solving module
 * Uses local reasoning and optionally external AI to solve exercises
 */

const { loadConfig } = require('./config');
const { logger } = require('./logger');

const config = loadConfig();

class AnswerExtractor {
  constructor(page) {
    this.page = page;
  }

  /**
   * Solve exercise based on type and question
   */
  async solve(exerciseData) {
    const { type, question, options, inputInfo } = exerciseData;

    logger.info('Attempting to solve exercise', {
      type,
      hasQuestion: !!question,
      optionsCount: options?.length
    });

    // Try local solving first
    let result = await this.solveLocally(exerciseData);

    // If local solving fails and AI is enabled, try AI
    if (!result || result.confidence < 0.7) {
      if (config.ai.enabled) {
        logger.info('Local solve uncertain, trying AI', { confidence: result?.confidence });
        result = await this.solveWithAI(exerciseData);
      } else {
        logger.warn('AI not enabled, returning local result');
      }
    }

    // Determine confidence label
    let confidenceLabel = 'unable';
    if (result && result.confidence >= 0.8) confidenceLabel = 'high';
    else if (result && result.confidence >= 0.5) confidenceLabel = 'uncertain';

    return {
      ...result,
      confidenceLabel,
      method: result?.method || 'none',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Local solving strategies
   */
  async solveLocally(exerciseData) {
    const { type, question, options } = exerciseData;

    // Multiple choice - try to find obviously correct answer
    if (options && options.length > 0) {
      return this.solveMultipleChoice(question, options);
    }

    // Type-specific solving
    switch (type) {
      case 'boolean':
        return this.solveBoolean(question);
      case 'numeric':
      case 'integer':
      case 'natural':
      case 'decimal':
        return this.solveNumeric(question);
      case 'fraction':
      case 'numberFraction':
        return this.solveFraction(question);
      case 'text':
      case 'periodic':
        return this.solveText(question);
      default:
        // Try generic math solving for unknown types
        return this.solveGenericMath(question);
    }
  }

  /**
   * Solve multiple choice by keyword matching
   */
  solveMultipleChoice(question, options) {
    if (options.length === 0) {
      return { answer: null, confidence: 0, method: 'multiple-choice', reasoning: 'No options' };
    }

    // If no question, return first option with low confidence
    if (!question) {
      return {
        answer: options[0].value || options[0].label,
        confidence: 0.2,
        method: 'multiple-choice',
        reasoning: 'No question provided, returning first option'
      };
    }

    // Extract numbers from question for numeric matching
    const questionNumbers = question.match(/-?\d+(?:\.\d+)?/g) || [];

    // Try to compute answer from question if it's a simple math problem
    const computedAnswer = this.computeMathAnswer(question);
    if (computedAnswer !== null) {
      for (const option of options) {
        const value = (option.value || '').toLowerCase();
        const label = (option.label || '').toLowerCase();
        if (value === computedAnswer.toLowerCase() || label === computedAnswer.toLowerCase()) {
          return {
            answer: option.value || option.label,
            confidence: 0.85,
            method: 'multiple-choice',
            reasoning: `Computed answer ${computedAnswer} matches option`
          };
        }
      }
    }

    // Simple heuristic: look for math expressions in options that match question
    const questionLower = question.toLowerCase();

    // Also extract potential answer numbers from options
    for (const option of options) {
      const label = (option.label || '').toLowerCase();
      const value = (option.value || '').toLowerCase();

      // Check if option contains key terms from question
      const questionKeywords = questionLower.match(/\b\d+\b|\b\w{4,}\b/g) || [];
      const optionText = label + ' ' + value;

      let matches = 0;
      for (const keyword of questionKeywords) {
        // Use word boundary matching for numbers to avoid substring matches (e.g., "15" containing "5")
        if (/^\d+$/.test(keyword)) {
          // For numeric keywords, check for whole number match
          const regex = new RegExp(`\\b${keyword}\\b`);
          if (regex.test(optionText)) matches++;
        } else {
          // For word keywords, use simple includes
          if (optionText.includes(keyword)) matches++;
        }
      }

      // Also check if option value/label matches question numbers (whole number match)
      for (const num of questionNumbers) {
        const regex = new RegExp(`\\b${num}\\b`);
        if (regex.test(label) || regex.test(value)) {
          matches += 2; // Strong match for numbers
        }
      }

      if (matches >= 2) {
        return {
          answer: option.value || option.label,
          confidence: Math.min(0.6 + matches * 0.1, 0.85),
          method: 'multiple-choice',
          reasoning: `Matched ${matches} keywords from question`
        };
      }
    }

    // If no good match, return first option with low confidence
    return {
      answer: options[0].value || options[0].label,
      confidence: 0.2,
      method: 'multiple-choice',
      reasoning: 'No clear match, returning first option'
    };
  }

  /**
   * Compute simple math answer from question
   */
  computeMathAnswer(question) {
    if (!question) return null;

    const q = question.toLowerCase();
    const numbers = question.match(/-?\d+(?:\.\d+)?/g) || [];

    if (numbers.length < 2) return null;

    const n1 = parseFloat(numbers[0]);
    const n2 = parseFloat(numbers[1]);

    // Sum
    if (q.includes('sum') || q.includes('adun') || q.includes('+')) {
      return (n1 + n2).toString();
    }

    // Difference
    if (q.includes('diferen') || q.includes('scad') || (q.includes('-') && !q.includes('-'))) {
      return (n1 - n2).toString();
    }

    // Product
    if (q.includes('produs') || q.includes('înmul') || q.includes('×') || q.includes('*')) {
      return (n1 * n2).toString();
    }

    // Division
    if (q.includes('împarte') || q.includes('împărț') || q.includes('cât') || q.includes('/') || q.includes('÷')) {
      if (n2 !== 0) return (n1 / n2).toString();
    }

    return null;
  }

  /**
   * Generic math solver for unknown exercise types
   * Tries to detect and solve common Romanian math problem patterns
   */
  solveGenericMath(question) {
    if (!question) {
      return { answer: null, confidence: 0, method: 'generic', reasoning: 'No question' };
    }

    const q = question.toLowerCase();
    const numbers = question.match(/-?\d+(?:\.\d+)?/g) || [];

    if (numbers.length === 0) {
      return { answer: null, confidence: 0, method: 'generic', reasoning: 'No numbers found' };
    }

    // Try all known Romanian math patterns
    const result = this.tryRomanianMathPatterns(q, numbers);
    if (result) return result;

    // Try basic arithmetic with all numbers
    if (numbers.length >= 2) {
      // Check for multiple operations
      const ops = this.detectOperations(q);
      if (ops.length > 0) {
        const result = this.applyOperations(numbers, ops);
        if (result !== null) {
          return { answer: result.toString(), confidence: 0.6, method: 'generic', reasoning: `Applied operations: ${ops.join(', ')}` };
        }
      }
    }

    return {
      answer: numbers[0],
      confidence: 0.2,
      method: 'generic',
      reasoning: 'First number as fallback'
    };
  }

  /**
   * Try Romanian-specific math problem patterns
   */
  tryRomanianMathPatterns(q, numbers) {
    const n1 = numbers.length > 0 ? parseFloat(numbers[0]) : null;
    const n2 = numbers.length > 1 ? parseFloat(numbers[1]) : null;
    const n3 = numbers.length > 2 ? parseFloat(numbers[2]) : null;

    // Single-number geometry problems (square perimeter/area)
    if (n1 !== null && ((q.includes('perimetru') || q.includes('perimetrul')) && (q.includes('pătrat') || q.includes('patrat')))) {
      return { answer: (4 * n1).toString(), confidence: 0.7, method: 'numeric', reasoning: 'Perimetru pătrat' };
    }
    if (n1 !== null && ((q.includes('arie') || q.includes('aria')) && (q.includes('pătrat') || q.includes('patrat')))) {
      return { answer: (n1 * n1).toString(), confidence: 0.7, method: 'numeric', reasoning: 'Aria pătratului' };
    }

    // Need at least 2 numbers for other patterns
    if (numbers.length < 2) return null;

    // Sum patterns (Romanian) - add all numbers
    if (q.includes('suma') || q.includes('adună') || q.includes('adun') ||
        q.includes('plus') || q.includes('mai mare') || q.includes('cât face') && q.includes('+')) {
      const sum = numbers.reduce((a, b) => parseFloat(a) + parseFloat(b), 0);
      return { answer: sum.toString(), confidence: 0.75, method: 'numeric', reasoning: 'Sumă (Romanian)' };
    }

    // Difference patterns (Romanian) - first minus rest
    if (q.includes('diferența') || q.includes('diferen') || q.includes('scade') || q.includes('scăd') ||
        q.includes('minus') || q.includes('mai mic') || q.includes('cât face') && q.includes('-')) {
      const diff = numbers.reduce((a, b) => parseFloat(a) - parseFloat(b));
      return { answer: diff.toString(), confidence: 0.75, method: 'numeric', reasoning: 'Diferență (Romanian)' };
    }

    // Product patterns (Romanian) - multiply all numbers
    if (q.includes('produsul') || q.includes('produs') || q.includes('înmulțește') || q.includes('înmul') ||
        q.includes('ori de') || q.includes('înmulțit') || q.includes('cât face') && q.includes('×')) {
      const prod = numbers.reduce((a, b) => parseFloat(a) * parseFloat(b), 1);
      return { answer: prod.toString(), confidence: 0.75, method: 'numeric', reasoning: 'Produs (Romanian)' };
    }

    // Division patterns (Romanian)
    if (q.includes('împărț') || q.includes('imparte') || q.includes('câtul') || q.includes('cât') ||
        q.includes('împărțit') || q.includes('la') && (q.includes('împ') || q.includes('cât')) ||
        q.includes('cât face') && q.includes(':')) {
      if (n2 !== 0) {
        return { answer: (n1 / n2).toString(), confidence: 0.75, method: 'numeric', reasoning: 'Împărțire (Romanian)' };
      }
    }

    // Power/exponent patterns
    if (q.includes('puterea') || q.includes('la putere') || q.includes('ridicat la') || q.includes('^') || q.includes('²') || q.includes('³')) {
      return { answer: Math.pow(n1, n2).toString(), confidence: 0.7, method: 'numeric', reasoning: 'Putere (Romanian)' };
    }

    // Square root
    if (q.includes('radical') || q.includes('rădăcin') || q.includes('sqrt') || q.includes('√')) {
      return { answer: Math.sqrt(n1).toString(), confidence: 0.7, method: 'numeric', reasoning: 'Rădăcină (Romanian)' };
    }

    // Percentage
    if (q.includes('procent') || q.includes('%') || q.includes('la sută')) {
      if (numbers.length >= 2) {
        return { answer: ((n1 * n2) / 100).toString(), confidence: 0.7, method: 'numeric', reasoning: 'Procent (Romanian)' };
      }
    }

    // Fraction simplification
    if (q.includes('simplific') || q.includes('ireductibil') || q.includes('fracție')) {
      const fracMatch = q.match(/(\d+)\s*\/\s*(\d+)/);
      if (fracMatch) {
        const num = parseInt(fracMatch[1]);
        const den = parseInt(fracMatch[2]);
        const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
        const g = gcd(num, den);
        return { answer: `${num/g}/${den/g}`, confidence: 0.8, method: 'fraction', reasoning: 'Simplificare fracție (Romanian)' };
      }
    }

    // Equation solving (simple linear: "x + 5 = 12" or "găsește x")
    if (q.includes('găsește') || q.includes('află') || q.includes('rezolv') || q.includes('ecuație') || q.includes('x =') || q.includes('x+') || q.includes('x-')) {
      // Try to find pattern like "x + a = b" or "a + x = b"
      const eqMatch = q.match(/x\s*[\+\-]\s*(\d+)\s*=\s*(\d+)/);
      if (eqMatch) {
        const a = parseFloat(eqMatch[1]);
        const b = parseFloat(eqMatch[2]);
        if (q.includes('x +') || q.includes('x+')) return { answer: (b - a).toString(), confidence: 0.7, method: 'numeric', reasoning: 'Ecuație simplă x + a = b' };
        if (q.includes('x -') || q.includes('x-')) return { answer: (b + a).toString(), confidence: 0.7, method: 'numeric', reasoning: 'Ecuație simplă x - a = b' };
      }
      // Pattern: "a + x = b"
      const eqMatch2 = q.match(/(\d+)\s*\+\s*x\s*=\s*(\d+)/);
      if (eqMatch2) {
        const a = parseFloat(eqMatch2[1]);
        const b = parseFloat(eqMatch2[2]);
        return { answer: (b - a).toString(), confidence: 0.7, method: 'numeric', reasoning: 'Ecuație simplă a + x = b' };
      }
    }

    // Geometry: perimeter/area of rectangle
    if ((q.includes('perimetru') || q.includes('perimetrul')) && q.includes('dreptunghi')) {
      if (numbers.length >= 2) {
        return { answer: (2 * (n1 + n2)).toString(), confidence: 0.7, method: 'numeric', reasoning: 'Perimetru dreptunghi' };
      }
    }
    if ((q.includes('arie') || q.includes('aria')) && q.includes('dreptunghi')) {
      if (numbers.length >= 2) {
        return { answer: (n1 * n2).toString(), confidence: 0.7, method: 'numeric', reasoning: 'Aria dreptunghiului' };
      }
    }
    // Average/media
    if (q.includes('media') || q.includes('medie') || q.includes('average')) {
      if (numbers.length >= 2) {
        const sum = numbers.reduce((a, b) => parseFloat(a) + parseFloat(b), 0);
        return { answer: (sum / numbers.length).toString(), confidence: 0.7, method: 'numeric', reasoning: 'Media aritmetică' };
      }
    }

    return null;
  }

  /**
   * Detect operations from question text
   */
  detectOperations(q) {
    const ops = [];
    if (q.includes('sum') || q.includes('adun') || q.includes('plus') || q.includes('+')) ops.push('add');
    if (q.includes('diferen') || q.includes('scad') || q.includes('minus') || q.includes('-')) ops.push('subtract');
    if (q.includes('produs') || q.includes('înmul') || q.includes('ori') || q.includes('×') || q.includes('*')) ops.push('multiply');
    if (q.includes('împărț') || q.includes('imparte') || q.includes('cât') || q.includes('/') || q.includes(':')) ops.push('divide');
    return ops;
  }

  /**
   * Apply detected operations sequentially
   * If fewer ops than number pairs, repeat the last operation
   */
  applyOperations(numbers, ops) {
    if (numbers.length < 2 || ops.length === 0) return null;

    let result = parseFloat(numbers[0]);
    for (let i = 0; i < numbers.length - 1; i++) {
      const nextNum = parseFloat(numbers[i + 1]);
      const op = ops[Math.min(i, ops.length - 1)]; // Repeat last op if needed
      switch (op) {
        case 'add': result += nextNum; break;
        case 'subtract': result -= nextNum; break;
        case 'multiply': result *= nextNum; break;
        case 'divide':
          if (nextNum === 0) return null;
          result /= nextNum;
          break;
      }
    }
    return result;
  }

  /**
   * Solve boolean (true/false) questions
   */
  solveBoolean(question) {
    if (!question) {
      return { answer: null, confidence: 0, method: 'boolean', reasoning: 'No question' };
    }

    const q = question.toLowerCase();

    // Look for obvious true/false indicators
    const trueKeywords = ['adevărat', 'corect', 'da', 'true', 'yes', 'este adevărat', 'sunt adevărate', 'adevărate'];
    const falseKeywords = ['fals', 'incorect', 'false', 'no', 'nu este', 'nu sunt', 'nu e', 'n\'este', 'neadevărat'];

    // Special handling for "nu" - check if it's a negation word, not just part of another word
    let trueScore = 0;
    let falseScore = 0;

    for (const kw of trueKeywords) {
      if (q.includes(kw)) trueScore++;
    }
    for (const kw of falseKeywords) {
      if (q.includes(kw)) falseScore += 2; // Weight false keywords more heavily for negations
    }

    // Check for "nu " as standalone negation word (not part of "număr", "nu este" already counted)
    const nuMatches = q.match(/\bnu\b/g);
    if (nuMatches) {
      falseScore += nuMatches.length;
    }

    if (falseScore > trueScore) {
      return { answer: 'false', confidence: Math.min(0.6 + falseScore * 0.1, 0.85), method: 'boolean', reasoning: 'False keywords detected' };
    } else if (trueScore > falseScore) {
      return { answer: 'true', confidence: Math.min(0.6 + trueScore * 0.1, 0.85), method: 'boolean', reasoning: 'True keywords detected' };
    }

    return { answer: null, confidence: 0, method: 'boolean', reasoning: 'Cannot determine' };
  }

  /**
   * Solve numeric questions
   */
  solveNumeric(question) {
    if (!question) {
      return { answer: null, confidence: 0, method: 'numeric', reasoning: 'No question' };
    }

    // Extract numbers from question
    const numbers = question.match(/-?\d+(?:\.\d+)?/g) || [];

    if (numbers.length === 0) {
      return { answer: null, confidence: 0, method: 'numeric', reasoning: 'No numbers found' };
    }

    // Try Romanian math patterns first
    const romanianResult = this.tryRomanianMathPatterns(question.toLowerCase(), numbers);
    if (romanianResult) return romanianResult;

    // Simple heuristics for common math problems
    const q = question.toLowerCase();

    // Sum
    if (q.includes('sum') || q.includes('adun') || q.includes('+')) {
      const sum = numbers.reduce((a, b) => parseFloat(a) + parseFloat(b), 0);
      return { answer: sum.toString(), confidence: 0.7, method: 'numeric', reasoning: 'Sum of numbers' };
    }

    // Difference
    if (q.includes('diferen') || q.includes('scad') || q.includes('-')) {
      const diff = parseFloat(numbers[0]) - parseFloat(numbers[1] || 0);
      return { answer: diff.toString(), confidence: 0.7, method: 'numeric', reasoning: 'Difference of numbers' };
    }

    // Product
    if (q.includes('produs') || q.includes('înmul') || q.includes('înmul') || q.includes('×') || q.includes('*')) {
      const prod = numbers.reduce((a, b) => parseFloat(a) * parseFloat(b), 1);
      return { answer: prod.toString(), confidence: 0.7, method: 'numeric', reasoning: 'Product of numbers' };
    }

    // Division (handle both Romanian "împarte" and "împărț")
    if (q.includes('împarte') || q.includes('împărț') || q.includes('cât') || q.includes('/') || q.includes('÷') || q.includes('la ') && q.includes('împ')) {
      if (numbers.length >= 2) {
        const div = parseFloat(numbers[0]) / parseFloat(numbers[1]);
        return { answer: div.toString(), confidence: 0.7, method: 'numeric', reasoning: 'Division of numbers' };
      }
    }

    // Return first number as fallback
    return {
      answer: numbers[0],
      confidence: 0.3,
      method: 'numeric',
      reasoning: 'First number in question'
    };
  }

  /**
   * Solve fraction questions
   */
  solveFraction(question) {
    if (!question) {
      return { answer: null, confidence: 0, method: 'fraction', reasoning: 'No question' };
    }

    // Look for fraction patterns
    const fractionMatch = question.match(/(\d+)\s*\/\s*(\d+)/);
    if (fractionMatch) {
      const num = parseInt(fractionMatch[1]);
      const den = parseInt(fractionMatch[2]);
      // Try to simplify
      const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
      const g = gcd(num, den);
      return {
        answer: `${num/g}/${den/g}`,
        confidence: 0.6,
        method: 'fraction',
        reasoning: 'Found fraction in question'
      };
    }

    return { answer: null, confidence: 0, method: 'fraction', reasoning: 'No fraction pattern' };
  }

  /**
   * Solve text questions
   */
  solveText(question) {
    if (!question) {
      return { answer: null, confidence: 0, method: 'text', reasoning: 'No question' };
    }

    // For text answers, we can't really solve locally
    return {
      answer: null,
      confidence: 0,
      method: 'text',
      reasoning: 'Text answers require human input'
    };
  }

  /**
   * Generic solver fallback
   */
  solveGeneric(question) {
    return {
      answer: null,
      confidence: 0,
      method: 'generic',
      reasoning: 'Unknown exercise type'
    };
  }

  /**
   * Solve using external AI (if configured)
   */
  async solveWithAI(exerciseData) {
    if (!config.ai.enabled || !process.env[config.ai.apiKeyEnv]) {
      return { answer: null, confidence: 0, method: 'ai', reasoning: 'AI not configured' };
    }

    // This would integrate with OpenAI or other provider
    // For now, return a placeholder
    logger.warn('AI solving not fully implemented');

    return {
      answer: null,
      confidence: 0,
      method: 'ai',
      reasoning: 'AI integration placeholder'
    };
  }
}

module.exports = { AnswerExtractor };