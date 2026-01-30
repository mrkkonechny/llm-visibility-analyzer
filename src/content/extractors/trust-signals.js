/**
 * Trust Signals Extractor
 * Extracts reviews, ratings, brand information, certifications, and trust indicators
 */

/**
 * Extract all trust signals from the page
 * @returns {Object} Trust signals data
 */
export function extractTrustSignals() {
  return {
    reviews: extractReviewSignals(),
    brand: extractBrandSignals(),
    certifications: extractCertifications(),
    awards: extractAwards(),
    expertAttribution: detectExpertAttribution(),
    trustBadges: extractTrustBadges(),
    socialProof: extractSocialProof()
  };
}

/**
 * Extract review-related signals
 * @returns {Object} Review data
 */
function extractReviewSignals() {
  // Try to get from structured data first (more reliable)
  const structuredRating = getStructuredRating();

  // Also extract from DOM for comparison/fallback
  const domReviewData = extractReviewsFromDOM();

  // Combine sources, preferring structured data
  const reviewCount = structuredRating.reviewCount || domReviewData.count || 0;
  const ratingValue = structuredRating.ratingValue || domReviewData.rating || null;

  // Extract individual reviews for depth analysis
  const individualReviews = extractIndividualReviews();
  const avgReviewLength = calculateAverageReviewLength(individualReviews);

  // Check for recent reviews
  const hasRecentReviews = checkRecentReviews(individualReviews);

  // Check for verified purchases
  const hasVerifiedPurchases = detectVerifiedPurchases();

  return {
    count: reviewCount,
    averageRating: ratingValue,
    bestRating: structuredRating.bestRating || 5,
    hasRating: ratingValue !== null,
    hasReviews: reviewCount > 0,

    // Review quality indicators
    individualReviewsFound: individualReviews.length,
    averageReviewLength: avgReviewLength,
    hasRecentReviews,
    hasVerifiedPurchases,

    // Scoring
    countScore: calculateReviewCountScore(reviewCount),
    ratingScore: calculateRatingScore(ratingValue),
    depthScore: calculateReviewDepthScore(avgReviewLength),
    recencyScore: hasRecentReviews ? 100 : 50,

    // Source
    dataSource: structuredRating.ratingValue ? 'structured-data' :
                domReviewData.rating ? 'dom' : 'none'
  };
}

/**
 * Get rating from structured data
 * @returns {Object} Rating from structured data
 */
function getStructuredRating() {
  const result = {
    ratingValue: null,
    reviewCount: null,
    ratingCount: null,
    bestRating: 5
  };

  // Check JSON-LD
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  scripts.forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      const items = data['@graph'] || [data];

      items.forEach(item => {
        // Look for AggregateRating
        const rating = item.aggregateRating || item;
        if (rating['@type'] === 'AggregateRating' || item['@type'] === 'Product') {
          const r = item.aggregateRating || rating;
          if (r.ratingValue) {
            result.ratingValue = parseFloat(r.ratingValue);
            result.reviewCount = parseInt(r.reviewCount, 10) || parseInt(r.ratingCount, 10) || null;
            result.ratingCount = parseInt(r.ratingCount, 10) || null;
            result.bestRating = parseFloat(r.bestRating) || 5;
          }
        }
      });
    } catch (e) {
      // Invalid JSON-LD
    }
  });

  // Check microdata
  if (!result.ratingValue) {
    const ratingEl = document.querySelector('[itemprop="ratingValue"]');
    const reviewCountEl = document.querySelector('[itemprop="reviewCount"]');

    if (ratingEl) {
      result.ratingValue = parseFloat(ratingEl.content || ratingEl.textContent);
    }
    if (reviewCountEl) {
      result.reviewCount = parseInt(reviewCountEl.content || reviewCountEl.textContent, 10);
    }
  }

  return result;
}

/**
 * Extract review data from DOM elements
 * @returns {Object} DOM-extracted review data
 */
function extractReviewsFromDOM() {
  const result = {
    rating: null,
    count: null
  };

  // Common rating display patterns
  const ratingSelectors = [
    '.rating-value',
    '.average-rating',
    '.star-rating-value',
    '[data-rating]',
    '.review-rating',
    '.product-rating'
  ];

  for (const selector of ratingSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      const value = parseFloat(el.getAttribute('data-rating') ||
                               el.getAttribute('content') ||
                               el.textContent);
      if (value && value >= 0 && value <= 5) {
        result.rating = value;
        break;
      }
    }
  }

  // Common review count patterns
  const countSelectors = [
    '.review-count',
    '.reviews-count',
    '.rating-count',
    '[data-review-count]',
    '.num-reviews'
  ];

  for (const selector of countSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.getAttribute('data-review-count') ||
                   el.textContent;
      const match = text.match(/(\d[\d,]*)/);
      if (match) {
        result.count = parseInt(match[1].replace(/,/g, ''), 10);
        break;
      }
    }
  }

  // Fallback: look for "X reviews" pattern in text
  if (!result.count) {
    const bodyText = document.body.innerText;
    const match = bodyText.match(/(\d[\d,]*)\s*reviews?/i);
    if (match) {
      result.count = parseInt(match[1].replace(/,/g, ''), 10);
    }
  }

  return result;
}

/**
 * Extract individual reviews for depth analysis
 * @returns {Array} Individual reviews
 */
function extractIndividualReviews() {
  const reviews = [];

  // Common review container selectors
  const reviewContainerSelectors = [
    '.review',
    '.customer-review',
    '.product-review',
    '[itemprop="review"]',
    '.review-item',
    '.reviews-list > li',
    '.review-card'
  ];

  for (const selector of reviewContainerSelectors) {
    const containers = document.querySelectorAll(selector);
    if (containers.length > 0) {
      containers.forEach(container => {
        const review = extractReviewFromContainer(container);
        if (review) {
          reviews.push(review);
        }
      });
      break; // Found reviews, stop looking
    }
  }

  return reviews.slice(0, 20); // Limit to 20 reviews
}

/**
 * Extract review data from a container element
 * @param {Element} container - Review container
 * @returns {Object|null} Review data
 */
function extractReviewFromContainer(container) {
  // Get review text
  const bodySelectors = ['.review-body', '.review-text', '.review-content', '[itemprop="reviewBody"]', 'p'];
  let reviewText = '';
  for (const sel of bodySelectors) {
    const el = container.querySelector(sel);
    if (el) {
      reviewText = el.textContent.trim();
      break;
    }
  }

  if (reviewText.length < 20) return null;

  // Get date
  const dateSelectors = ['.review-date', '[itemprop="datePublished"]', 'time', '.date'];
  let dateText = null;
  for (const sel of dateSelectors) {
    const el = container.querySelector(sel);
    if (el) {
      dateText = el.getAttribute('datetime') ||
                 el.getAttribute('content') ||
                 el.textContent.trim();
      break;
    }
  }

  // Get rating
  const ratingEl = container.querySelector('[itemprop="ratingValue"], .rating, .stars');
  let rating = null;
  if (ratingEl) {
    rating = parseFloat(ratingEl.getAttribute('content') ||
                        ratingEl.getAttribute('data-rating') ||
                        ratingEl.textContent);
  }

  // Check for verified purchase
  const isVerified = container.textContent.toLowerCase().includes('verified') ||
                     container.querySelector('.verified-purchase, .verified-buyer') !== null;

  return {
    text: reviewText.substring(0, 1000),
    length: reviewText.length,
    date: dateText,
    parsedDate: parseReviewDate(dateText),
    rating,
    isVerified
  };
}

/**
 * Parse review date string
 * @param {string} dateText - Date text
 * @returns {Date|null} Parsed date
 */
function parseReviewDate(dateText) {
  if (!dateText) return null;

  // Try ISO format first
  const isoDate = new Date(dateText);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try relative dates
  const now = new Date();
  const relativePatternsPatterns = [
    { pattern: /(\d+)\s*days?\s*ago/i, unit: 'days' },
    { pattern: /(\d+)\s*weeks?\s*ago/i, unit: 'weeks' },
    { pattern: /(\d+)\s*months?\s*ago/i, unit: 'months' },
    { pattern: /(\d+)\s*years?\s*ago/i, unit: 'years' }
  ];

  for (const { pattern, unit } of relativePatternsPatterns) {
    const match = dateText.match(pattern);
    if (match) {
      const value = parseInt(match[1], 10);
      const date = new Date(now);
      switch (unit) {
        case 'days': date.setDate(date.getDate() - value); break;
        case 'weeks': date.setDate(date.getDate() - value * 7); break;
        case 'months': date.setMonth(date.getMonth() - value); break;
        case 'years': date.setFullYear(date.getFullYear() - value); break;
      }
      return date;
    }
  }

  return null;
}

/**
 * Calculate average review length
 * @param {Array} reviews - Reviews array
 * @returns {number} Average length
 */
function calculateAverageReviewLength(reviews) {
  if (reviews.length === 0) return 0;
  const totalLength = reviews.reduce((sum, r) => sum + r.length, 0);
  return Math.round(totalLength / reviews.length);
}

/**
 * Check if there are recent reviews
 * @param {Array} reviews - Reviews array
 * @returns {boolean} Has recent reviews
 */
function checkRecentReviews(reviews) {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  return reviews.some(r => r.parsedDate && r.parsedDate >= ninetyDaysAgo);
}

/**
 * Detect verified purchase indicators
 * @returns {boolean} Has verified purchases
 */
function detectVerifiedPurchases() {
  const text = document.body.innerText.toLowerCase();
  return text.includes('verified purchase') ||
         text.includes('verified buyer') ||
         document.querySelector('.verified-purchase, .verified-buyer') !== null;
}

/**
 * Extract brand signals
 * @returns {Object} Brand data
 */
function extractBrandSignals() {
  // Try structured data first
  let brandName = null;
  let brandLogo = null;

  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  scripts.forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      const items = data['@graph'] || [data];

      items.forEach(item => {
        if (item['@type'] === 'Product' && item.brand) {
          brandName = typeof item.brand === 'string' ? item.brand : item.brand.name;
        }
        if (item['@type'] === 'Organization' || item['@type'] === 'Brand') {
          brandName = brandName || item.name;
          brandLogo = item.logo?.url || item.logo;
        }
      });
    } catch (e) {}
  });

  // Check microdata
  if (!brandName) {
    const brandEl = document.querySelector('[itemprop="brand"]');
    if (brandEl) {
      brandName = brandEl.content || brandEl.textContent.trim();
    }
  }

  // Check H1 for brand
  const h1 = document.querySelector('h1');
  const h1ContainsBrand = h1 && brandName && h1.textContent.toLowerCase().includes(brandName.toLowerCase());

  // Check title for brand
  const titleContainsBrand = brandName && document.title.toLowerCase().includes(brandName.toLowerCase());

  return {
    name: brandName,
    logo: brandLogo,
    inH1: h1ContainsBrand,
    inTitle: titleContainsBrand,
    inSchema: brandName !== null,
    clarity: calculateBrandClarity(brandName, h1ContainsBrand, titleContainsBrand),
    score: calculateBrandScore(brandName, h1ContainsBrand, titleContainsBrand)
  };
}

/**
 * Calculate brand clarity level
 */
function calculateBrandClarity(name, inH1, inTitle) {
  if (!name) return 'missing';
  if (inH1 && inTitle) return 'excellent';
  if (inH1 || inTitle) return 'good';
  return 'present';
}

/**
 * Calculate brand score
 */
function calculateBrandScore(name, inH1, inTitle) {
  if (!name) return 0;
  let score = 40; // Base score for having brand
  if (inH1) score += 30;
  if (inTitle) score += 30;
  return score;
}

/**
 * Extract certifications
 * @returns {Object} Certifications data
 */
function extractCertifications() {
  const text = document.body.innerText.toLowerCase();
  const certifications = [];

  const certPatterns = [
    { name: 'FDA Approved', pattern: /fda\s*(?:approved|cleared|registered)/i },
    { name: 'CE Certified', pattern: /ce\s*(?:mark|certified|compliant)/i },
    { name: 'UL Listed', pattern: /ul\s*(?:listed|certified)/i },
    { name: 'Energy Star', pattern: /energy\s*star/i },
    { name: 'ISO Certified', pattern: /iso\s*\d{4,}/i },
    { name: 'RoHS Compliant', pattern: /rohs\s*(?:compliant|certified)/i },
    { name: 'FCC Certified', pattern: /fcc\s*(?:certified|compliant|approved)/i },
    { name: 'USDA Organic', pattern: /usda\s*organic/i },
    { name: 'Non-GMO', pattern: /non[\s-]?gmo/i },
    { name: 'Fair Trade', pattern: /fair\s*trade/i },
    { name: 'Cruelty Free', pattern: /cruelty[\s-]?free/i },
    { name: 'Vegan Certified', pattern: /vegan\s*(?:certified|society)/i },
    { name: 'B Corp', pattern: /b[\s-]?corp/i },
    { name: 'Carbon Neutral', pattern: /carbon[\s-]?neutral/i },
    { name: 'FSC Certified', pattern: /fsc\s*(?:certified|forest)/i },
    { name: 'GOTS Certified', pattern: /gots\s*(?:certified|organic)/i }
  ];

  certPatterns.forEach(({ name, pattern }) => {
    if (pattern.test(text)) {
      certifications.push(name);
    }
  });

  // Also check for certification badges/images
  const certImages = document.querySelectorAll('img[alt*="certif"], img[alt*="approved"], img[alt*="compliant"]');

  return {
    found: certifications.length > 0,
    count: certifications.length,
    items: certifications,
    certificationImages: certImages.length,
    score: certifications.length > 0 ? Math.min(100, 50 + certifications.length * 15) : 0
  };
}

/**
 * Extract awards and recognition
 * @returns {Object} Awards data
 */
function extractAwards() {
  const text = document.body.innerText.toLowerCase();
  const awards = [];

  const awardPatterns = [
    { name: 'Award Winner', pattern: /award[\s-]?winner|won\s+(?:the\s+)?award/i },
    { name: 'Best of', pattern: /best\s+of\s+\d{4}/i },
    { name: "Editor's Choice", pattern: /editor'?s?\s*choice/i },
    { name: 'Top Rated', pattern: /top[\s-]?rated/i },
    { name: 'Best Seller', pattern: /best[\s-]?seller/i },
    { name: 'Product of the Year', pattern: /product\s+of\s+the\s+year/i },
    { name: 'Innovation Award', pattern: /innovation\s+award/i },
    { name: 'Design Award', pattern: /design\s+award|red\s+dot|if\s+design/i }
  ];

  awardPatterns.forEach(({ name, pattern }) => {
    if (pattern.test(text)) {
      awards.push(name);
    }
  });

  return {
    found: awards.length > 0,
    count: awards.length,
    items: awards,
    score: awards.length > 0 ? Math.min(100, 40 + awards.length * 20) : 0
  };
}

/**
 * Detect expert attribution
 * @returns {Object} Expert attribution data
 */
function detectExpertAttribution() {
  const text = document.body.innerText.toLowerCase();

  const expertIndicators = [
    /expert\s+review/i,
    /reviewed\s+by\s+[\w\s]+,?\s*(?:md|phd|expert)/i,
    /as\s+(?:seen|featured)\s+(?:in|on)/i,
    /recommended\s+by\s+(?:doctors?|experts?|professionals?)/i,
    /clinically\s+(?:tested|proven)/i,
    /laboratory\s+tested/i,
    /dermatologist\s+(?:tested|recommended)/i
  ];

  const found = expertIndicators.some(pattern => pattern.test(text));

  // Check for "as seen in" logos
  const asSeenIn = document.querySelectorAll('.as-seen-in, .featured-in, .press-logos');

  return {
    found,
    hasAsSeenIn: asSeenIn.length > 0,
    score: found ? 100 : (asSeenIn.length > 0 ? 60 : 0)
  };
}

/**
 * Extract trust badges
 * @returns {Object} Trust badges data
 */
function extractTrustBadges() {
  const badges = [];

  // Common trust badge selectors
  const badgeSelectors = [
    '.trust-badge',
    '.trust-seal',
    '.security-badge',
    '.payment-badge',
    '.guarantee-badge'
  ];

  badgeSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      badges.push({
        type: selector.replace('.', ''),
        text: el.textContent.trim().substring(0, 100)
      });
    });
  });

  // Check for common trust indicators in images
  const trustImagePatterns = [
    'secure',
    'guarantee',
    'money-back',
    'ssl',
    'payment',
    'verified'
  ];

  document.querySelectorAll('img').forEach(img => {
    const alt = (img.alt || '').toLowerCase();
    const src = (img.src || '').toLowerCase();
    if (trustImagePatterns.some(p => alt.includes(p) || src.includes(p))) {
      badges.push({
        type: 'trust-image',
        alt: img.alt
      });
    }
  });

  return {
    found: badges.length > 0,
    count: badges.length,
    items: badges.slice(0, 10)
  };
}

/**
 * Extract social proof indicators
 * @returns {Object} Social proof data
 */
function extractSocialProof() {
  const text = document.body.innerText.toLowerCase();

  const indicators = {
    soldCount: null,
    viewCount: null,
    customerCount: null,
    testimonials: false
  };

  // Check for sold count
  const soldMatch = text.match(/(\d[\d,]+)\s*(?:sold|purchased|bought)/i);
  if (soldMatch) {
    indicators.soldCount = parseInt(soldMatch[1].replace(/,/g, ''), 10);
  }

  // Check for view count
  const viewMatch = text.match(/(\d[\d,]+)\s*(?:views?|people\s+viewing)/i);
  if (viewMatch) {
    indicators.viewCount = parseInt(viewMatch[1].replace(/,/g, ''), 10);
  }

  // Check for customer count
  const customerMatch = text.match(/(\d[\d,]+)\s*(?:happy\s+)?customers?/i);
  if (customerMatch) {
    indicators.customerCount = parseInt(customerMatch[1].replace(/,/g, ''), 10);
  }

  // Check for testimonials
  indicators.testimonials = document.querySelector('.testimonial, .testimonials, [data-testimonial]') !== null;

  return indicators;
}

// Scoring helper functions

function calculateReviewCountScore(count) {
  if (!count || count === 0) return 0;
  if (count < 10) return Math.round((count / 10) * 25);
  if (count < 50) return 25 + Math.round(((count - 10) / 40) * 35);
  if (count < 200) return 60 + Math.round(((count - 50) / 150) * 25);
  return 100;
}

function calculateRatingScore(rating) {
  if (!rating) return 0;
  if (rating < 3) return 25;
  if (rating < 3.5) return 50;
  if (rating < 4) return 75;
  if (rating < 4.5) return 90;
  return 100;
}

function calculateReviewDepthScore(avgLength) {
  if (avgLength < 50) return Math.round((avgLength / 50) * 40);
  if (avgLength < 100) return 40 + Math.round(((avgLength - 50) / 50) * 30);
  if (avgLength < 200) return 70 + Math.round(((avgLength - 100) / 100) * 30);
  return 100;
}
