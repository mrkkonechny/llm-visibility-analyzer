/**
 * Content Quality Extractor
 * Analyzes description, specifications, features, FAQ, and product details
 */

/**
 * Extract and analyze content quality metrics
 * @returns {Object} Content quality data
 */
export function extractContentQuality() {
  const mainContent = getMainContentArea();
  const bodyText = document.body.innerText;

  return {
    description: analyzeDescription(mainContent),
    specifications: extractSpecifications(),
    features: extractFeatures(),
    faq: extractFaqContent(),
    productDetails: extractProductDetails(bodyText),
    textMetrics: analyzeTextMetrics(mainContent)
  };
}

/**
 * Get the main content area of the page
 * @returns {Element|null} Main content element
 */
function getMainContentArea() {
  // Try semantic elements first
  const selectors = [
    'main',
    '[role="main"]',
    'article',
    '.product-detail',
    '.product-details',
    '.pdp-content',
    '#product-detail',
    '#product-content',
    '.product-page',
    '.product-info',
    '[data-component="product"]',
    '.product-description'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.innerText.length > 200) {
      return element;
    }
  }

  // Fallback to body
  return document.body;
}

/**
 * Analyze product description
 * @param {Element} content - Content container
 * @returns {Object} Description analysis
 */
function analyzeDescription(content) {
  // Try to find description-specific elements
  const descriptionSelectors = [
    '.product-description',
    '.description',
    '#description',
    '[data-component="description"]',
    '.product-info__description',
    '.pdp-description',
    // Shopify selectors
    '.product-single__description',
    '.product__description',
    '.rte',
    '.rte-formatter',
    // Additional Shopify theme patterns
    '.product__info-description',
    '.product-single__content',
    '.product__content',
    '[data-product-description]',
    '#tab-description',
    '.tab-content[data-tab="description"]',
    '.product-details__description',
    '.accordion__content',
    '.collapsible-content',
    // Attribute-based fallbacks
    '[class*="product-description"]',
    '[class*="product_description"]',
    '[id*="product-description"]',
    '[id*="ProductDescription"]'
  ];

  let descriptionElement = null;
  for (const selector of descriptionSelectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText.length > 50) {
      descriptionElement = el;
      break;
    }
  }

  const text = descriptionElement?.innerText || '';
  const words = text.split(/\s+/).filter(w => w.length > 0);

  return {
    found: !!descriptionElement,
    text: text.substring(0, 1000),
    length: text.length,
    wordCount: words.length,

    // Quality indicators
    hasEmotionalLanguage: detectEmotionalLanguage(text),
    hasBenefitStatements: detectBenefitStatements(text),
    hasTechnicalTerms: detectTechnicalTerms(text),
    hasCallToAction: detectCallToAction(text),

    // Scoring thresholds
    lengthScore: calculateLengthScore(words.length),

    // Detected elements
    emotionalPhrases: extractEmotionalPhrases(text),
    benefitPhrases: extractBenefitPhrases(text)
  };
}

/**
 * Extract product specifications
 * @returns {Object} Specifications data
 */
function extractSpecifications() {
  const specs = [];

  // Look for specification tables
  const specSelectors = [
    '.specifications',
    '.specs',
    '.product-specs',
    '.technical-specs',
    '#specifications',
    '#specs',
    '.product-attributes',
    '[data-component="specifications"]'
  ];

  for (const selector of specSelectors) {
    const container = document.querySelector(selector);
    if (container) {
      // Extract from tables
      container.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length >= 2) {
          specs.push({
            name: cells[0].textContent.trim(),
            value: cells[1].textContent.trim(),
            hasUnit: detectUnit(cells[1].textContent)
          });
        }
      });

      // Extract from definition lists
      container.querySelectorAll('dt').forEach(dt => {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') {
          specs.push({
            name: dt.textContent.trim(),
            value: dd.textContent.trim(),
            hasUnit: detectUnit(dd.textContent)
          });
        }
      });

      // Extract from key-value divs
      container.querySelectorAll('.spec-row, .attribute-row, .spec-item').forEach(row => {
        const label = row.querySelector('.spec-name, .attribute-name, .spec-label, label');
        const value = row.querySelector('.spec-value, .attribute-value, .spec-data');
        if (label && value) {
          specs.push({
            name: label.textContent.trim(),
            value: value.textContent.trim(),
            hasUnit: detectUnit(value.textContent)
          });
        }
      });
    }
  }

  // Also look for standalone tables that might be specs
  if (specs.length === 0) {
    document.querySelectorAll('table').forEach(table => {
      const rows = table.querySelectorAll('tr');
      if (rows.length >= 3 && rows.length <= 30) {
        rows.forEach(row => {
          const cells = row.querySelectorAll('td, th');
          if (cells.length === 2) {
            const name = cells[0].textContent.trim();
            const value = cells[1].textContent.trim();
            if (name.length < 50 && value.length < 200) {
              specs.push({
                name,
                value,
                hasUnit: detectUnit(value)
              });
            }
          }
        });
      }
    });
  }

  const specsWithUnits = specs.filter(s => s.hasUnit).length;

  return {
    found: specs.length > 0,
    count: specs.length,
    items: specs.slice(0, 50), // Limit to prevent huge payloads
    specsWithUnits,
    detailScore: calculateSpecsDetailScore(specs),
    countScore: calculateSpecsCountScore(specs.length)
  };
}

/**
 * Extract product features
 * @returns {Object} Features data
 */
function extractFeatures() {
  const features = [];

  // Look for feature lists
  const featureSelectors = [
    '.features',
    '.product-features',
    '.key-features',
    '.highlights',
    '#features',
    '.feature-list',
    '[data-component="features"]'
  ];

  for (const selector of featureSelectors) {
    const container = document.querySelector(selector);
    if (container) {
      // Extract from lists
      container.querySelectorAll('li').forEach(li => {
        const text = li.textContent.trim();
        if (text.length > 10 && text.length < 500) {
          features.push({
            text,
            hasBenefit: detectBenefitStatements(text),
            hasEmotional: detectEmotionalLanguage(text)
          });
        }
      });
    }
  }

  // Look for bullet points in description if no dedicated section
  if (features.length === 0) {
    const mainContent = getMainContentArea();
    mainContent?.querySelectorAll('ul li, ol li').forEach(li => {
      const text = li.textContent.trim();
      if (text.length > 20 && text.length < 300 && !text.includes('$')) {
        features.push({
          text,
          hasBenefit: detectBenefitStatements(text),
          hasEmotional: detectEmotionalLanguage(text)
        });
      }
    });
  }

  const benefitFeatures = features.filter(f => f.hasBenefit).length;

  return {
    found: features.length > 0,
    count: features.length,
    items: features.slice(0, 20),
    benefitFocused: benefitFeatures,
    countScore: calculateFeatureCountScore(features.length)
  };
}

/**
 * Extract FAQ content from HTML (not schema)
 * @returns {Object} FAQ data
 */
function extractFaqContent() {
  const faqs = [];

  // Look for FAQ sections
  const faqSelectors = [
    '.faq',
    '.faqs',
    '.frequently-asked-questions',
    '#faq',
    '#faqs',
    '[data-component="faq"]',
    '.product-faq',
    '.questions-answers'
  ];

  for (const selector of faqSelectors) {
    const container = document.querySelector(selector);
    if (container) {
      // Look for accordion patterns
      container.querySelectorAll('[data-question], .question, .faq-question, dt, summary').forEach(q => {
        const questionText = q.textContent.trim();
        let answerText = '';

        // Try to find corresponding answer
        const answer = q.nextElementSibling ||
                       q.closest('.faq-item')?.querySelector('.answer, .faq-answer, dd') ||
                       q.closest('details')?.querySelector('p, .answer');

        if (answer) {
          answerText = answer.textContent.trim();
        }

        if (questionText.length > 10 && questionText.length < 300) {
          faqs.push({
            question: questionText,
            answer: answerText.substring(0, 500),
            answerLength: answerText.length
          });
        }
      });

      // Also check for details/summary pattern
      container.querySelectorAll('details').forEach(details => {
        const summary = details.querySelector('summary');
        const content = Array.from(details.children)
          .filter(el => el.tagName !== 'SUMMARY')
          .map(el => el.textContent.trim())
          .join(' ');

        if (summary) {
          faqs.push({
            question: summary.textContent.trim(),
            answer: content.substring(0, 500),
            answerLength: content.length
          });
        }
      });
    }
  }

  const avgAnswerLength = faqs.length > 0
    ? Math.round(faqs.reduce((sum, f) => sum + f.answerLength, 0) / faqs.length)
    : 0;

  return {
    found: faqs.length > 0,
    count: faqs.length,
    items: faqs.slice(0, 20),
    averageAnswerLength: avgAnswerLength,
    countScore: calculateFaqCountScore(faqs.length),
    qualityScore: avgAnswerLength >= 50 ? 100 : Math.round((avgAnswerLength / 50) * 100)
  };
}

/**
 * Extract product detail indicators
 * @param {string} bodyText - Full page text
 * @returns {Object} Product details presence
 */
function extractProductDetails(bodyText) {
  const text = bodyText.toLowerCase();

  return {
    hasDimensions: detectDimensions(text),
    hasMaterials: detectMaterials(text),
    hasCareInstructions: detectCareInstructions(text),
    hasWarranty: detectWarranty(text),
    hasCompatibility: detectCompatibility(text),
    hasWeight: detectWeight(text),
    hasCertifications: detectCertifications(text),
    hasCountryOfOrigin: detectCountryOfOrigin(text)
  };
}

/**
 * Analyze overall text metrics
 * @param {Element} content - Content container
 * @returns {Object} Text metrics
 */
function analyzeTextMetrics(content) {
  const text = content?.innerText || '';
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  return {
    totalWords: words.length,
    totalSentences: sentences.length,
    averageWordsPerSentence: sentences.length > 0
      ? Math.round(words.length / sentences.length)
      : 0,
    readabilityScore: calculateFleschKincaid(text),
    readabilityGrade: getReadabilityGrade(calculateFleschKincaid(text))
  };
}

// Detection helper functions

function detectEmotionalLanguage(text) {
  const emotionalWords = [
    'amazing', 'beautiful', 'stunning', 'perfect', 'love', 'best',
    'incredible', 'revolutionary', 'transform', 'dream', 'luxury',
    'premium', 'exclusive', 'elegant', 'sophisticated', 'exceptional',
    'remarkable', 'outstanding', 'fantastic', 'wonderful', 'brilliant'
  ];
  const lower = text.toLowerCase();
  return emotionalWords.some(word => lower.includes(word));
}

function detectBenefitStatements(text) {
  const benefitPatterns = [
    /you (can|will|get)/i,
    /helps? (you|your)/i,
    /makes? (it|your|life)/i,
    /save[sd]? (time|money|space)/i,
    /increase[sd]?|improve[sd]?|enhance[sd]?/i,
    /reduce[sd]?|eliminate[sd]?|prevent[sd]?/i,
    /enjoy|experience|discover/i,
    /designed (for|to)/i,
    /perfect for/i
  ];
  return benefitPatterns.some(pattern => pattern.test(text));
}

function detectTechnicalTerms(text) {
  const technicalPatterns = [
    /\d+\s*(mm|cm|in|inch|ft|m|kg|lb|oz|g|mAh|GB|TB|MHz|GHz|W|V|A)/i,
    /\d+x\d+/,
    /\d+\s*(fps|dpi|ppi|rpm)/i,
    /USB|HDMI|Bluetooth|WiFi|NFC/i
  ];
  return technicalPatterns.some(pattern => pattern.test(text));
}

function detectCallToAction(text) {
  const ctaPatterns = [
    /buy now/i,
    /add to cart/i,
    /shop now/i,
    /order (now|today)/i,
    /get (yours|it|started)/i
  ];
  return ctaPatterns.some(pattern => pattern.test(text));
}

function detectUnit(text) {
  return /\d+\s*(mm|cm|in|inch|"|ft|m|kg|lb|lbs|oz|g|ml|L|mAh|GB|TB|MHz|GHz|W|V|A|fps|dpi|ppi|rpm)/i.test(text);
}

function detectDimensions(text) {
  return /\d+\s*(x|×)\s*\d+/i.test(text) ||
         /(dimension|size|length|width|height|depth).*\d+/i.test(text);
}

function detectMaterials(text) {
  const materials = ['cotton', 'polyester', 'leather', 'metal', 'aluminum', 'steel',
                     'plastic', 'wood', 'glass', 'ceramic', 'silicone', 'rubber',
                     'fabric', 'nylon', 'wool', 'silk', 'bamboo', 'titanium'];
  return materials.some(m => text.includes(m)) ||
         /made (of|from|with)/i.test(text) ||
         /material[:\s]/i.test(text);
}

function detectCareInstructions(text) {
  return /machine wash|hand wash|dry clean|wipe clean|care instruction/i.test(text) ||
         /do not (wash|bleach|iron|tumble)/i.test(text) ||
         /cleaning|maintenance/i.test(text);
}

function detectWarranty(text) {
  return /warranty|guarantee/i.test(text) ||
         /\d+\s*(year|month|day)s?\s*(warranty|guarantee)/i.test(text) ||
         /limited warranty|lifetime warranty/i.test(text);
}

function detectCompatibility(text) {
  return /compatible (with|for)|works with|fits|designed for/i.test(text) ||
         /compatibility|supported (device|model|system)/i.test(text);
}

function detectWeight(text) {
  return /weight[:\s]|weighs\s/i.test(text) ||
         /\d+\s*(kg|lb|lbs|oz|g|gram|kilogram|pound|ounce)/i.test(text);
}

function detectCertifications(text) {
  return /certified|certification|fda|ce mark|ul listed|energy star/i.test(text) ||
         /iso\s*\d+|rohs|fcc/i.test(text);
}

function detectCountryOfOrigin(text) {
  return /made in|manufactured in|country of origin/i.test(text);
}

function extractEmotionalPhrases(text) {
  const phrases = [];
  const patterns = [
    /love (this|the|your|how)/gi,
    /perfect for/gi,
    /amazing quality/gi,
    /beautiful design/gi,
    /best (choice|option|product)/gi
  ];
  patterns.forEach(p => {
    const matches = text.match(p);
    if (matches) phrases.push(...matches);
  });
  return phrases.slice(0, 5);
}

function extractBenefitPhrases(text) {
  const phrases = [];
  const patterns = [
    /helps you [\w\s]+/gi,
    /designed to [\w\s]+/gi,
    /makes it easy to [\w\s]+/gi,
    /save[sd]? [\w\s]+/gi
  ];
  patterns.forEach(p => {
    const matches = text.match(p);
    if (matches) phrases.push(...matches.map(m => m.substring(0, 50)));
  });
  return phrases.slice(0, 5);
}

// Scoring helper functions

function calculateLengthScore(wordCount) {
  if (wordCount < 100) return Math.round((wordCount / 100) * 50);
  if (wordCount < 200) return 50 + Math.round(((wordCount - 100) / 100) * 30);
  if (wordCount < 400) return 80 + Math.round(((wordCount - 200) / 200) * 20);
  return 100;
}

function calculateSpecsCountScore(count) {
  if (count < 5) return Math.round((count / 5) * 25);
  if (count < 10) return 25 + Math.round(((count - 5) / 5) * 25);
  if (count < 20) return 50 + Math.round(((count - 10) / 10) * 30);
  return 100;
}

function calculateSpecsDetailScore(specs) {
  if (specs.length === 0) return 0;
  const withUnits = specs.filter(s => s.hasUnit).length;
  return Math.round((withUnits / specs.length) * 100);
}

function calculateFeatureCountScore(count) {
  if (count < 3) return Math.round((count / 3) * 25);
  if (count < 5) return 25 + Math.round(((count - 3) / 2) * 25);
  if (count < 10) return 50 + Math.round(((count - 5) / 5) * 30);
  return 100;
}

function calculateFaqCountScore(count) {
  if (count < 3) return Math.round((count / 3) * 50);
  if (count < 5) return 50 + Math.round(((count - 3) / 2) * 25);
  return 100;
}

/**
 * Calculate Flesch-Kincaid readability score
 * @param {string} text - Text to analyze
 * @returns {number} Readability score (0-100)
 */
function calculateFleschKincaid(text) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  if (words.length === 0 || sentences.length === 0) return 0;

  // Count syllables (approximation)
  const syllables = words.reduce((total, word) => {
    return total + countSyllables(word);
  }, 0);

  // Flesch Reading Ease formula
  const score = 206.835 -
                (1.015 * (words.length / sentences.length)) -
                (84.6 * (syllables / words.length));

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Count syllables in a word (approximation)
 * @param {string} word - Word to count
 * @returns {number} Syllable count
 */
function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;

  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');

  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

/**
 * Get readability grade from score
 * @param {number} score - Flesch-Kincaid score
 * @returns {string} Grade description
 */
function getReadabilityGrade(score) {
  if (score >= 90) return 'Very Easy (5th grade)';
  if (score >= 80) return 'Easy (6th grade)';
  if (score >= 70) return 'Fairly Easy (7th grade)';
  if (score >= 60) return 'Standard (8th-9th grade)';
  if (score >= 50) return 'Fairly Difficult (10th-12th grade)';
  if (score >= 30) return 'Difficult (College)';
  return 'Very Difficult (Professional)';
}
