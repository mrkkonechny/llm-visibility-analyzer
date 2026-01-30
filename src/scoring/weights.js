/**
 * Scoring Weights Configuration
 * Defines category weights and context-based multipliers
 */

/**
 * Category weights (must sum to 1.0)
 */
export const CATEGORY_WEIGHTS = {
  structuredData: 0.25,    // 25%
  protocolMeta: 0.20,      // 20%
  contentQuality: 0.25,    // 25%
  contentStructure: 0.15,  // 15%
  authorityTrust: 0.15     // 15%
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

  // Authority & Trust (15% of total)
  authorityTrust: {
    reviewCount: 25,         // Contextual
    averageRating: 20,       // Contextual
    reviewRecency: 15,
    reviewDepth: 10,
    brandClarity: 15,
    certifications: 10,      // Contextual
    awards: 5
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
