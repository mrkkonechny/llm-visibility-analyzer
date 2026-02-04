/**
 * Scoring Weights Configuration
 * Defines category weights and context-based multipliers
 */

/**
 * Category descriptions for tooltips
 */
export const CATEGORY_DESCRIPTIONS = {
  structuredData: 'JSON-LD and schema.org markup that helps AI understand product data',
  protocolMeta: 'Open Graph, Twitter Cards, and meta tags for sharing and discovery',
  contentQuality: 'Product descriptions, specifications, features, and FAQ content',
  contentStructure: 'Semantic HTML, headings, accessibility, and image alt text',
  authorityTrust: 'Reviews, ratings, brand clarity, and trust signals',
  aiDiscoverability: 'AI crawler access and llms.txt presence for AI system discovery'
};

/**
 * Category weights (must sum to 1.0)
 */
export const CATEGORY_WEIGHTS = {
  structuredData: 0.23,    // 23% (was 25%)
  protocolMeta: 0.18,      // 18% (was 20%)
  contentQuality: 0.23,    // 23% (was 25%)
  contentStructure: 0.13,  // 13% (was 15%)
  authorityTrust: 0.13,    // 13% (was 15%)
  aiDiscoverability: 0.10  // 10% (NEW)
};

/**
 * Context-based weight multipliers
 * Applied to specific factors based on consumer context
 */
export const CONTEXT_MULTIPLIERS = {
  want: {
    // "Want" context: emotional, lifestyle-driven purchases
    // Emphasize emotional appeal, social proof
    emotionalBenefitCopy: 1.5,
    technicalSpecifications: 0.6,
    compatibilityInfo: 0.4,
    socialProof: 1.4,
    certifications: 0.5,
    reviewCount: 1.4,
    reviewRating: 1.3,
    benefitStatements: 1.5,
    warrantyInfo: 0.7,
    comparisonContent: 0.6
  },
  need: {
    // "Need" context: functional, specification-driven purchases
    // Emphasize technical details, compatibility, certifications
    emotionalBenefitCopy: 0.5,
    technicalSpecifications: 1.5,
    compatibilityInfo: 2.0,
    socialProof: 0.8,
    certifications: 1.6,
    reviewCount: 0.8,
    reviewRating: 1.0,
    benefitStatements: 0.5,
    warrantyInfo: 1.4,
    comparisonContent: 1.4
  },
  hybrid: {
    // "Hybrid" context: balanced consideration
    // Neutral multipliers
    emotionalBenefitCopy: 1.0,
    technicalSpecifications: 1.0,
    compatibilityInfo: 1.0,
    socialProof: 1.0,
    certifications: 1.0,
    reviewCount: 1.0,
    reviewRating: 1.0,
    benefitStatements: 1.0,
    warrantyInfo: 1.0,
    comparisonContent: 1.0
  }
};

/**
 * Factor weights within each category
 */
export const FACTOR_WEIGHTS = {
  // Structured Data (25% of total)
  structuredData: {
    productSchema: 30,      // Critical
    offerSchema: 20,        // Critical
    aggregateRating: 15,
    reviewSchema: 10,
    faqSchema: 10,
    breadcrumbSchema: 5,
    organizationSchema: 5,
    imageSchema: 5
  },

  // Protocol & Meta Compliance (20% of total)
  protocolMeta: {
    ogImage: 20,            // Critical - must not be WebP
    ogImageFormat: 15,      // Critical - JPEG/PNG only
    ogTitle: 10,
    ogDescription: 10,
    ogType: 5,
    twitterCard: 10,
    twitterImage: 5,
    canonical: 10,
    metaDescription: 10,
    robotsAllowsIndex: 5    // Critical if blocked
  },

  // Content Quality (25% of total)
  contentQuality: {
    descriptionLength: 15,
    descriptionQuality: 10,  // Contextual
    specificationCount: 10,  // Contextual
    specificationDetail: 5,  // Contextual
    featureCount: 10,
    faqPresence: 10,
    dimensions: 5,           // Contextual
    materials: 5,
    careInstructions: 3,
    warrantyInfo: 7,         // Contextual
    compatibilityInfo: 10,   // Contextual
    comparisonContent: 5     // Contextual
  },

  // Content Structure (15% of total)
  contentStructure: {
    h1Presence: 15,
    headingHierarchy: 12,
    semanticHTML: 12,
    contentRatio: 12,
    tableStructure: 10,
    listStructure: 8,
    ariaLabels: 6,
    primaryImageAlt: 10,
    allImagesAlt: 8,
    jsDependency: 10,
    readability: 8
  },

  // Authority & Trust (13% of total)
  authorityTrust: {
    reviewCount: 25,         // Contextual
    averageRating: 20,       // Contextual
    reviewRecency: 15,
    reviewDepth: 10,
    brandClarity: 15,
    certifications: 10,      // Contextual
    awards: 5
  },

  // AI Discoverability (10% of total)
  aiDiscoverability: {
    aiCrawlerAccess: 65,     // robots.txt rules for major AI bots
    llmsTxtPresence: 35      // /llms.txt and /llms-full.txt presence
  }
};

/**
 * Grading thresholds
 */
export const GRADE_THRESHOLDS = {
  A: 90,
  B: 80,
  C: 70,
  D: 60,
  F: 0
};

/**
 * Get grade from score
 * @param {number} score - Score 0-100
 * @returns {string} Grade A-F
 */
export function getGrade(score) {
  if (score >= GRADE_THRESHOLDS.A) return 'A';
  if (score >= GRADE_THRESHOLDS.B) return 'B';
  if (score >= GRADE_THRESHOLDS.C) return 'C';
  if (score >= GRADE_THRESHOLDS.D) return 'D';
  return 'F';
}

/**
 * Get grade description
 * @param {string} grade - Letter grade
 * @returns {string} Description
 */
export function getGradeDescription(grade) {
  const descriptions = {
    A: 'Excellent LLM visibility; minor optimizations possible',
    B: 'Good foundation; specific gaps to address',
    C: 'Average visibility; significant opportunities',
    D: 'Below average; multiple critical issues',
    F: 'Poor visibility; fundamental changes needed'
  };
  return descriptions[grade] || '';
}

/**
 * Get context multiplier for a factor
 * @param {string} context - Consumer context (want/need/hybrid)
 * @param {string} factor - Factor name
 * @returns {number} Multiplier
 */
export function getContextMultiplier(context, factor) {
  return CONTEXT_MULTIPLIERS[context]?.[factor] || 1.0;
}

/**
 * Factor name to recommendation template ID mapping
 * Links factor display names to their corresponding recommendation templates
 */
export const FACTOR_RECOMMENDATIONS = {
  // Structured Data
  'Product Schema': 'product-schema-missing',
  'Offer Schema': 'offer-schema-missing',
  'AggregateRating Schema': 'rating-schema-missing',
  'FAQ Schema': 'faq-schema-missing',
  'Breadcrumb Schema': 'breadcrumb-schema-missing',

  // Protocol & Meta
  'og:image Present': 'og-image-missing',
  'og:image Format': 'og-image-webp',
  'og:title': 'og-title-missing',
  'og:description': 'og-description-missing',
  'Twitter Card': 'twitter-card-missing',
  'Robots Allows Indexing': 'robots-blocking',

  // Content Quality
  'Description Length': 'description-short',
  'Specifications': 'specs-missing',
  'Features List': 'features-missing',
  'FAQ Section': 'faq-content-missing',
  'Compatibility Information': 'compatibility-missing',

  // Content Structure
  'H1 Heading': 'h1-missing',
  'Semantic HTML': 'semantic-html-missing',
  'Primary Image Alt Text': 'primary-image-alt-missing',
  'Image Alt Coverage': 'images-alt-low',

  // Authority & Trust
  'Review Count': 'reviews-missing',
  'Brand Clarity': 'brand-unclear',
  'Certifications': 'certifications-missing',

  // AI Discoverability
  'AI Crawler Access': 'ai-crawler-blocked',
  'llms.txt Presence': 'llms-txt-missing'
};
