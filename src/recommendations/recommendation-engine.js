/**
 * Recommendation Engine
 * Generates prioritized recommendations based on scoring results
 */

import { calculatePriority, RECOMMENDATION_TEMPLATES } from './recommendation-rules.js';
import { getContextMultiplier } from '../scoring/weights.js';

/**
 * Recommendation Engine class
 */
export class RecommendationEngine {
  /**
   * @param {Object} scoreResult - Result from ScoringEngine
   * @param {Object} extractedData - Raw extracted data
   * @param {Object} imageVerification - og:image verification result
   */
  constructor(scoreResult, extractedData, imageVerification = null) {
    this.scoreResult = scoreResult;
    this.extractedData = extractedData;
    this.imageVerification = imageVerification;
    this.context = scoreResult.context || 'hybrid';
  }

  /**
   * Generate all recommendations
   * @returns {Array} Sorted array of recommendations
   */
  generateRecommendations() {
    const recommendations = [];

    // Check each category for issues
    recommendations.push(...this.checkProtocolMetaIssues());
    recommendations.push(...this.checkStructuredDataIssues());
    recommendations.push(...this.checkContentQualityIssues());
    recommendations.push(...this.checkContentStructureIssues());
    recommendations.push(...this.checkAuthorityTrustIssues());

    // Sort by priority (lower = higher priority)
    return this.prioritizeRecommendations(recommendations);
  }

  /**
   * Check Protocol & Meta issues
   */
  checkProtocolMetaIssues() {
    const recs = [];
    const og = this.extractedData.metaTags?.openGraph || {};
    const robots = this.extractedData.metaTags?.robots || {};
    const twitter = this.extractedData.metaTags?.twitterCards || {};
    const canonical = this.extractedData.metaTags?.canonical || {};
    const standard = this.extractedData.metaTags?.standard || {};

    // CRITICAL: Robots blocking
    if (robots.isBlocked) {
      recs.push(this.createRecommendation('robots-blocking'));
    }

    // CRITICAL: og:image missing
    if (!og.image) {
      recs.push(this.createRecommendation('og-image-missing'));
    } else {
      // CRITICAL: og:image is WebP
      if (this.imageVerification?.isWebP) {
        recs.push(this.createRecommendation('og-image-webp', {
          currentUrl: og.image,
          currentFormat: 'WebP'
        }));
      }
    }

    // og:title missing
    if (!og.title) {
      recs.push(this.createRecommendation('og-title-missing'));
    }

    // og:description missing
    if (!og.description) {
      recs.push(this.createRecommendation('og-description-missing'));
    }

    // Twitter Card missing
    if (!twitter.card) {
      recs.push(this.createRecommendation('twitter-card-missing'));
    }

    // Canonical URL issues
    if (!canonical.present) {
      recs.push({
        id: 'canonical-missing',
        title: 'Add canonical URL',
        description: 'Missing canonical URL can cause duplicate content issues.',
        impact: 'low',
        effort: 'low',
        category: 'protocolMeta',
        priority: calculatePriority('low', 'low')
      });
    }

    // Meta description missing
    if (!standard.description) {
      recs.push({
        id: 'meta-description-missing',
        title: 'Add meta description',
        description: 'Meta description provides a summary for search results and LLM context.',
        impact: 'medium',
        effort: 'low',
        category: 'protocolMeta',
        priority: calculatePriority('medium', 'low')
      });
    }

    return recs;
  }

  /**
   * Check Structured Data issues
   */
  checkStructuredDataIssues() {
    const recs = [];
    const schemas = this.extractedData.structuredData?.schemas || {};

    // Product schema missing
    if (!schemas.product) {
      recs.push(this.createRecommendation('product-schema-missing'));
    }

    // Offer schema missing (if Product exists but no Offer)
    if (schemas.product && !schemas.offer) {
      recs.push(this.createRecommendation('offer-schema-missing'));
    }

    // Rating schema missing (if reviews exist but no schema)
    if (!schemas.aggregateRating) {
      const reviews = this.extractedData.trustSignals?.reviews || {};
      if (reviews.count > 0) {
        recs.push(this.createRecommendation('rating-schema-missing'));
      }
    }

    // FAQ schema missing (if FAQ content exists but no schema)
    const faqContent = this.extractedData.contentQuality?.faq || {};
    if (!schemas.faq && faqContent.count > 0) {
      recs.push(this.createRecommendation('faq-schema-missing'));
    } else if (!schemas.faq && faqContent.count === 0) {
      // No FAQ content and no schema - recommend adding both
      recs.push({
        id: 'faq-schema-and-content-missing',
        title: 'Add FAQ section with schema markup',
        description: 'Adding FAQ content with schema helps LLMs answer common questions.',
        impact: 'medium',
        effort: 'medium',
        category: 'structuredData',
        priority: calculatePriority('medium', 'medium'),
        implementation: 'Create a FAQ section with 5+ questions, then add FAQPage schema markup.'
      });
    }

    // Breadcrumb schema missing
    if (!schemas.breadcrumb) {
      recs.push(this.createRecommendation('breadcrumb-schema-missing'));
    }

    return recs;
  }

  /**
   * Check Content Quality issues
   */
  checkContentQualityIssues() {
    const recs = [];
    const desc = this.extractedData.contentQuality?.description || {};
    const specs = this.extractedData.contentQuality?.specifications || {};
    const features = this.extractedData.contentQuality?.features || {};
    const faq = this.extractedData.contentQuality?.faq || {};
    const details = this.extractedData.contentQuality?.productDetails || {};

    // Description too short (< 100 words)
    if (desc.wordCount < 100) {
      const template = RECOMMENDATION_TEMPLATES['description-short'];
      recs.push({
        ...template,
        id: 'description-short',
        priority: calculatePriority(template.impact, template.effort),
        currentState: `${desc.wordCount} words`,
        targetState: '200+ words'
      });
    }

    // Specifications missing or low
    if (specs.count < 5) {
      // Contextual - more important for "need" context
      const multiplier = getContextMultiplier(this.context, 'technicalSpecifications');
      const impact = multiplier > 1 ? 'high' : 'medium';

      recs.push({
        id: 'specs-low',
        title: 'Add more specifications',
        description: 'Detailed specifications help LLMs answer technical comparison questions.',
        impact,
        effort: 'medium',
        category: 'contentQuality',
        priority: calculatePriority(impact, 'medium'),
        contextual: true,
        currentState: `${specs.count} specs`,
        targetState: '10+ specs'
      });
    }

    // Features missing
    if (features.count < 3) {
      recs.push(this.createRecommendation('features-missing'));
    }

    // FAQ content missing
    if (faq.count < 3) {
      recs.push(this.createRecommendation('faq-content-missing'));
    }

    // Compatibility info missing (more important for "need" context)
    if (!details.hasCompatibility) {
      const multiplier = getContextMultiplier(this.context, 'compatibilityInfo');
      if (multiplier > 1) {
        recs.push({
          ...this.createRecommendation('compatibility-missing'),
          impact: 'high',
          priority: calculatePriority('high', 'low')
        });
      } else {
        recs.push(this.createRecommendation('compatibility-missing'));
      }
    }

    // Warranty info missing (more important for "need" context)
    if (!details.hasWarranty) {
      const multiplier = getContextMultiplier(this.context, 'warrantyInfo');
      const impact = multiplier > 1 ? 'medium' : 'low';

      recs.push({
        id: 'warranty-missing',
        title: 'Add warranty information',
        description: 'Warranty details build trust and help LLMs answer purchase-related questions.',
        impact,
        effort: 'low',
        category: 'contentQuality',
        priority: calculatePriority(impact, 'low'),
        contextual: multiplier > 1
      });
    }

    return recs;
  }

  /**
   * Check Content Structure issues
   */
  checkContentStructureIssues() {
    const recs = [];
    const headings = this.extractedData.contentStructure?.headings || {};
    const semantic = this.extractedData.contentStructure?.semanticHTML || {};
    const images = this.extractedData.contentStructure?.images || {};

    // H1 missing
    if (!headings.hasH1) {
      recs.push(this.createRecommendation('h1-missing'));
    }

    // Multiple H1s
    if (headings.h1?.count > 1) {
      recs.push(this.createRecommendation('multiple-h1'));
    }

    // Semantic HTML missing
    if (!semantic.hasMain && !semantic.hasArticle) {
      recs.push(this.createRecommendation('semantic-html-missing'));
    }

    // Primary image alt missing
    if (images.primaryImage && !images.primaryImage.hasAlt) {
      recs.push(this.createRecommendation('primary-image-alt-missing'));
    }

    // Low image alt coverage
    if (images.altCoverage < 0.8 && images.totalCount > 3) {
      recs.push({
        ...this.createRecommendation('images-alt-low'),
        currentState: `${Math.round(images.altCoverage * 100)}% coverage`,
        targetState: '90%+ coverage'
      });
    }

    // Heading hierarchy issues
    if (headings.hierarchyIssues?.length > 0) {
      recs.push({
        id: 'heading-hierarchy',
        title: 'Fix heading hierarchy',
        description: 'Proper heading hierarchy helps LLMs understand content structure.',
        impact: 'low',
        effort: 'low',
        category: 'contentStructure',
        priority: calculatePriority('low', 'low'),
        details: headings.hierarchyIssues.join('; ')
      });
    }

    return recs;
  }

  /**
   * Check Authority & Trust issues
   */
  checkAuthorityTrustIssues() {
    const recs = [];
    const reviews = this.extractedData.trustSignals?.reviews || {};
    const brand = this.extractedData.trustSignals?.brand || {};
    const certs = this.extractedData.trustSignals?.certifications || {};

    // No reviews
    if (!reviews.hasReviews || reviews.count === 0) {
      recs.push(this.createRecommendation('reviews-missing'));
    } else if (reviews.count < 10) {
      // Low review count - contextual importance
      const multiplier = getContextMultiplier(this.context, 'reviewCount');
      const impact = multiplier > 1 ? 'high' : 'medium';

      recs.push({
        ...this.createRecommendation('reviews-low-count'),
        impact,
        priority: calculatePriority(impact, 'high'),
        currentState: `${reviews.count} reviews`,
        targetState: '50+ reviews'
      });
    }

    // Brand unclear
    if (!brand.name || brand.clarity === 'missing') {
      recs.push(this.createRecommendation('brand-unclear'));
    } else if (brand.clarity === 'present' && !brand.inH1 && !brand.inTitle) {
      recs.push({
        id: 'brand-visibility',
        title: 'Improve brand visibility',
        description: 'Add brand name to H1 heading and page title for clearer attribution.',
        impact: 'low',
        effort: 'low',
        category: 'authorityTrust',
        priority: calculatePriority('low', 'low')
      });
    }

    // Certifications missing (more important for "need" context)
    if (!certs.found) {
      const multiplier = getContextMultiplier(this.context, 'certifications');
      if (multiplier > 1) {
        recs.push({
          ...this.createRecommendation('certifications-missing'),
          impact: 'medium',
          priority: calculatePriority('medium', 'low'),
          contextual: true
        });
      }
    }

    return recs;
  }

  /**
   * Create a recommendation from a template
   * @param {string} templateId - Template ID
   * @param {Object} extras - Additional properties to merge
   * @returns {Object} Recommendation object
   */
  createRecommendation(templateId, extras = {}) {
    const template = RECOMMENDATION_TEMPLATES[templateId];
    if (!template) {
      console.warn(`Unknown recommendation template: ${templateId}`);
      return null;
    }

    return {
      id: templateId,
      title: template.title,
      description: template.description,
      impact: template.impact,
      effort: template.effort,
      category: template.category,
      priority: calculatePriority(template.impact, template.effort),
      implementation: template.implementation,
      ...extras
    };
  }

  /**
   * Prioritize and sort recommendations
   * @param {Array} recommendations - Array of recommendations
   * @returns {Array} Sorted recommendations
   */
  prioritizeRecommendations(recommendations) {
    // Filter out nulls
    const valid = recommendations.filter(r => r !== null);

    // Sort by priority (1 is highest), then by impact
    return valid.sort((a, b) => {
      // Priority first
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      // Then by impact
      const impactOrder = { high: 0, medium: 1, low: 2 };
      return (impactOrder[a.impact] || 2) - (impactOrder[b.impact] || 2);
    });
  }

  /**
   * Get top N recommendations
   * @param {number} n - Number of recommendations
   * @returns {Array} Top N recommendations
   */
  getTopRecommendations(n = 5) {
    return this.generateRecommendations().slice(0, n);
  }

  /**
   * Get recommendations by category
   * @param {string} category - Category name
   * @returns {Array} Filtered recommendations
   */
  getRecommendationsByCategory(category) {
    return this.generateRecommendations().filter(r => r.category === category);
  }

  /**
   * Get critical recommendations (high impact)
   * @returns {Array} Critical recommendations
   */
  getCriticalRecommendations() {
    return this.generateRecommendations().filter(r => r.impact === 'high');
  }

  /**
   * Get quick wins (high impact, low effort)
   * @returns {Array} Quick win recommendations
   */
  getQuickWins() {
    return this.generateRecommendations().filter(r =>
      (r.impact === 'high' || r.impact === 'medium') && r.effort === 'low'
    );
  }
}
