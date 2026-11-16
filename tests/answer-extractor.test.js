/**
 * Tests for AnswerExtractor local solving logic
 */

const { AnswerExtractor } = require('../src/answer-extractor');

const mockPage = {
  $: jest.fn(),
  $$: jest.fn(),
  evaluate: jest.fn()
};

describe('AnswerExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new AnswerExtractor(mockPage);
    jest.clearAllMocks();
  });

  describe('solveMultipleChoice', () => {
    test('returns first option when no question', () => {
      const result = extractor.solveMultipleChoice(null, [{ value: 'a', label: 'Option A' }]);
      expect(result.answer).toBe('a');
      expect(result.confidence).toBe(0.2);
    });

    test('matches keywords from question', () => {
      const question = 'What is the sum of 5 and 3?';
      const options = [
        { value: '8', label: 'Eight' },
        { value: '15', label: 'Fifteen' },
        { value: '2', label: 'Two' }
      ];
      const result = extractor.solveMultipleChoice(question, options);
      expect(result.answer).toBe('8');
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('solveBoolean', () => {
    test('detects true keywords', () => {
      const result = extractor.solveBoolean('Este adevărat că 2+2=4?');
      expect(result.answer).toBe('true');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('detects false keywords', () => {
      const result = extractor.solveBoolean('Nu este corect că 2+2=5.');
      expect(result.answer).toBe('false');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('returns null for ambiguous', () => {
      const result = extractor.solveBoolean('What is the capital of France?');
      expect(result.answer).toBeNull();
      expect(result.confidence).toBe(0);
    });
  });

  describe('solveNumeric', () => {
    test('detects sum', () => {
      const result = extractor.solveNumeric('Calculează suma a 5 și 3');
      expect(result.answer).toBe('8');
      expect(result.confidence).toBe(0.75);
    });

    test('detects difference', () => {
      const result = extractor.solveNumeric('Care este diferența dintre 10 și 4?');
      expect(result.answer).toBe('6');
      expect(result.confidence).toBe(0.75);
    });

    test('detects product', () => {
      const result = extractor.solveNumeric('Produsul lui 6 și 7 este?');
      expect(result.answer).toBe('42');
      expect(result.confidence).toBe(0.75);
    });

    test('detects division', () => {
      const result = extractor.solveNumeric('Împarte 20 la 4');
      expect(result.answer).toBe('5');
      expect(result.confidence).toBe(0.75);
    });

    test('returns first number as fallback', () => {
      const result = extractor.solveNumeric('Numărul este 42');
      expect(result.answer).toBe('42');
      expect(result.confidence).toBe(0.3);
    });
  });

  describe('solveFraction', () => {
    test('finds and simplifies fraction', () => {
      const result = extractor.solveFraction('Simplifică fracția 4/8');
      expect(result.answer).toBe('1/2');
      expect(result.confidence).toBe(0.6);
    });

    test('returns null when no fraction', () => {
      const result = extractor.solveFraction('What is 5 + 3?');
      expect(result.answer).toBeNull();
      expect(result.confidence).toBe(0);
    });
  });

  describe('solveText', () => {
    test('returns unable for text questions', () => {
      const result = extractor.solveText('Scrie o demonstrație');
      expect(result.answer).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('human input');
    });
  });

  describe('Romanian math patterns', () => {
    test('detects Romanian sum (suma)', () => {
      const result = extractor.solveNumeric('Calculează suma a 5 și 3');
      expect(result.answer).toBe('8');
    });

    test('detects Romanian difference (diferența)', () => {
      const result = extractor.solveNumeric('Care este diferența dintre 10 și 4?');
      expect(result.answer).toBe('6');
    });

    test('detects Romanian product (produsul)', () => {
      const result = extractor.solveNumeric('Produsul lui 6 și 7 este?');
      expect(result.answer).toBe('42');
    });

    test('detects Romanian division (împărțire)', () => {
      const result = extractor.solveNumeric('Împarte 20 la 4');
      expect(result.answer).toBe('5');
    });

    test('detects power (puterea)', () => {
      const result = extractor.solveNumeric('2 la puterea 3');
      expect(result.answer).toBe('8');
    });

    test('detects percentage (procent)', () => {
      const result = extractor.solveNumeric('20 procent din 50');
      expect(result.answer).toBe('10');
    });

    test('detects area of rectangle', () => {
      const result = extractor.solveNumeric('Aria dreptunghiului 5 și 3');
      expect(result.answer).toBe('15');
    });

    test('detects perimeter of square', () => {
      const result = extractor.solveNumeric('Perimetru pătrat 4');
      expect(result.answer).toBe('16');
    });

    test('simplifies fraction (simplifică)', () => {
      const result = extractor.solveFraction('Simplifică fracția 4/8');
      expect(result.answer).toBe('1/2');
    });

    test('solves simple equation x + a = b', () => {
      const result = extractor.solveNumeric('Găsește x: x + 5 = 12');
      expect(result.answer).toBe('7');
    });
  });

  describe('solveGenericMath', () => {
    test('handles unknown type with Romanian patterns', () => {
      const result = extractor.solveGenericMath('Calculează suma a 7 și 5');
      expect(result.answer).toBe('12');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('handles unknown type with basic operations', () => {
      const result = extractor.solveGenericMath('Adună 3 4 5');
      expect(result.answer).toBe('12');
    });
  });
});