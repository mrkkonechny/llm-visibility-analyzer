/**
 * Scoring Engine
 * Calculates scores for each category and overall grade
 */

import {
  CATEGORY_WEIGHTS,
  CONTEXT_MULTIPLIERS,
  FACTOR_WEIGHTS,
  getGrade,
  getGradeDescription,
  getContextMultiplier
} from './weights.js';

/**
 * Main scoring engine class
 */
export class ScoringEngine {
  /**
   * @param {string} context - Consumer context: 'want', 'need', or 'hybrid'
   */
  constructor(context = 'hybrid') {
    this.context = context;
    this.multipliers = CONTEXT_MULTIPLIERS[context] || CONTEXT_MULTIPLIERS.hybrid;
  }

  /**
   * Calculate all scores from extracted data
   * @param {Object} extractedData - Data from content script
   * @param {Object} imageVerification - og:image verification result (optional)
   * @returns {Object} Complete scoring result
   */
  calculateScore(extractedData, imageVerification = null) {
    // Calculate category scores
    const categoryScores = {
      structuredData: this.scoreStructuredData(extractedData.structuredData),
      protocolMeta: this.scoreProtocolMeta(extractedData.metaTags, imageVerification),
      contentQuality: this.scoreContentQuality(extractedData.contentQuality),
      contentStructure: this.scoreContentStructure(extractedData.contentStructure),
      authorityTrust: this.scoreAuthorityTrust(extractedData.trustSignals)
    };

    // Calculate weighted total
    const totalScore = Math.round(
      categoryScores.structuredData.score * CATEGORY_WEIGHTS.structuredData +
      categoryScores.protocolMeta.score * CATEGORY_WEIGHTS.protocolMeta +
      categoryScores.contentQuality.score * CATEGORY_WEIGHTS.contentQuality +
      categoryScores.contentStructure.score * CATEGORY_WEIGHTS.contentStructure +
      categoryScores.authorityTrust.score * CATEGORY_WEIGHTS.authorityTrust
    );

    const grade = getGrade(totalScore);

    return {
      totalScore,
      grade,
      gradeDescription: getGradeDescription(grade),
      context: this.context,
      categoryScores,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Score Structured Data category (25% weight)
   */
  scoreStructuredData(data) {
    const factors = [];
    let rawScore = 0;
    const maxScore = 100;
    const weights = FACTOR_WEIGHTS.structuredData;

    // Product Schema (30 points) - Critical
    const hasProduct = data?.schemas?.product !== null;
    const productScore = hasProduct ? weights.productSchema : 0;
    factors.push({
      name: 'Product Schema',
      status: hasProduct ? 'pass' : 'fail',
      points: productScore,
      maxPoints: weights.productSchema,
      critical: true,
      details: hasProduct ? `Found: ${data.schemas.product.name || 'Product'}` : 'Missing Product schema markup'
    });
    rawScore += productScore;

    // Offer Schema (20 points) - Critical
    const hasOffer = data?.schemas?.offer !== null;
    const offerScore = hasOffer ? weights.offerSchema : 0;
    factors.push({
      name: 'Offer Schema',
      status: hasOffer ? 'pass' : 'fail',
      points: offerScore,
      maxPoints: weights.offerSchema,
      critical: true,
      details: hasOffer ? 'Price and availability structured' : 'Missing Offer schema'
    });
    rawScore += offerScore;

    // AggregateRating Schema (15 points)
    const hasRating = data?.schemas?.aggregateRating !== null;
    const ratingScore = hasRating ? weights.aggregateRating : 0;
    factors.push({
      name: 'AggregateRating Schema',
      status: hasRating ? 'pass' : 'fail',
      points: ratingScore,
      maxPoints: weights.aggregateRating,
      details: hasRating ?
        `Rating: ${data.schemas.aggregateRating.ratingValue}/5` :
        'Missing rating schema'
    });
    rawScore += ratingScore;

    // Review Schema (10 points)
    const hasReviews = data?.schemas?.reviews?.length > 0;
    const reviewScore = hasReviews ? weights.reviewSchema : 0;
    factors.push({
      name: 'Review Schema',
      status: hasReviews ? 'pass' : 'fail',
      points: reviewScore,
      maxPoints: weights.reviewSchema,
      details: hasReviews ?
        `${data.schemas.reviews.length} reviews structured` :
        'No structured reviews'
    });
    rawScore += reviewScore;

    // FAQ Schema (10 points)
    const hasFaq = data?.schemas?.faq !== null && data.schemas.faq?.questionCount > 0;
    const faqScore = hasFaq ? weights.faqSchema : 0;
    factors.push({
      name: 'FAQ Schema',
      status: hasFaq ? 'pass' : 'fail',
      points: faqScore,
      maxPoints: weights.faqSchema,
      details: hasFaq ?
        `${data.schemas.faq.questionCount} FAQs structured` :
        'No FAQ schema'
    });
    rawScore += faqScore;

    // Breadcrumb Schema (5 points)
    const hasBreadcrumb = data?.schemas?.breadcrumb !== null;
    const breadcrumbScore = hasBreadcrumb ? weights.breadcrumbSchema : 0;
    factors.push({
      name: 'Breadcrumb Schema',
      status: hasBreadcrumb ? 'pass' : 'fail',
      points: breadcrumbScore,
      maxPoints: weights.breadcrumbSchema
    });
    rawScore += breadcrumbScore;

    // Organization Schema (5 points)
    const hasOrg = data?.schemas?.organization !== null || data?.schemas?.brand !== null;
    const orgScore = hasOrg ? weights.organizationSchema : 0;
    factors.push({
      name: 'Organization/Brand Schema',
      status: hasOrg ? 'pass' : 'fail',
      points: orgScore,
      maxPoints: weights.organizationSchema
    });
    rawScore += orgScore;

    // Image Schema (5 points)
    const hasImageSchema = data?.schemas?.images?.length > 0;
    const imageSchemaScore = hasImageSchema ? weights.imageSchema : 0;
    factors.push({
      name: 'ImageObject Schema',
      status: hasImageSchema ? 'pass' : 'fail',
      points: imageSchemaScore,
      maxPoints: weights.imageSchema
    });
    rawScore += imageSchemaScore;

    return {
      score: rawScore,
      maxScore,
      factors,
      weight: CATEGORY_WEIGHTS.structuredData,
      categoryName: 'Structured Data'
    };
  }

  /**
   * Score Protocol & Meta Compliance category (20% weight)
   */
  scoreProtocolMeta(data, imageVerification) {
    const factors = [];
    let rawScore = 0;
    const maxScore = 100;
    const weights = FACTOR_WEIGHTS.protocolMeta;
    const og = data?.openGraph || {};
    const twitter = data?.twitterCards || {};

    // og:image presence (20 points) - Critical
    const hasOgImage = !!og.image;
    const ogImageScore = hasOgImage ? weights.ogImage : 0;
    factors.push({
      name: 'og:image Present',
      status: hasOgImage ? 'pass' : 'fail',
      points: ogImageScore,
      maxPoints: weights.ogImage,
      critical: true,
      details: hasOgImage ? og.image.substring(0, 50) + '...' : 'No og:image tag found'
    });
    rawScore += ogImageScore;

    // og:image format (15 points) - Critical
    // WebP = FAIL, JPEG/PNG = PASS
    let imageFormatScore = 0;
    let imageFormatStatus = 'unknown';
    let imageFormatDetails = 'Image format not verified';

    if (imageVerification) {
      if (imageVerification.isWebP) {
        imageFormatScore = 0;
        imageFormatStatus = 'fail';
        imageFormatDetails = 'CRITICAL: WebP format - invisible in LLM chats';
      } else if (imageVerification.isValidFormat) {
        imageFormatScore = weights.ogImageFormat;
        imageFormatStatus = 'pass';
        imageFormatDetails = `Format: ${imageVerification.format?.toUpperCase() || 'Valid'}`;
      } else {
        imageFormatScore = weights.ogImageFormat / 2;
        imageFormatStatus = 'warning';
        imageFormatDetails = `Format: ${imageVerification.format || 'Unknown'}`;
      }
    } else if (hasOgImage) {
      // Infer from URL if not verified
      const url = og.image.toLowerCase();
      if (url.endsWith('.webp') || url.includes('.webp?')) {
        imageFormatScore = 0;
        imageFormatStatus = 'fail';
        imageFormatDetails = 'CRITICAL: WebP format detected in URL';
      } else if (url.match(/\.(jpe?g|png|gif)(\?|$)/)) {
        imageFormatScore = weights.ogImageFormat;
        imageFormatStatus = 'pass';
        imageFormatDetails = 'Valid format detected';
      } else {
        imageFormatStatus = 'unknown';
        imageFormatDetails = 'Format needs verification';
      }
    }

    factors.push({
      name: 'og:image Format',
      status: imageFormatStatus,
      points: imageFormatScore,
      maxPoints: weights.ogImageFormat,
      critical: true,
      details: imageFormatDetails
    });
    rawScore += imageFormatScore;

    // og:title (10 points)
    const hasOgTitle = !!og.title && og.title.length > 0;
    const titleLength = og.title?.length || 0;
    const titleOptimal = titleLength > 0 && titleLength <= 60;
    const ogTitleScore = hasOgTitle ? (titleOptimal ? weights.ogTitle : weights.ogTitle * 0.7) : 0;
    factors.push({
      name: 'og:title',
      status: hasOgTitle ? (titleOptimal ? 'pass' : 'warning') : 'fail',
      points: ogTitleScore,
      maxPoints: weights.ogTitle,
      details: hasOgTitle ? `${titleLength} chars${titleLength > 60 ? ' (too long)' : ''}` : 'Missing'
    });
    rawScore += ogTitleScore;

    // og:description (10 points)
    const hasOgDesc = !!og.description && og.description.length > 0;
    const descLength = og.description?.length || 0;
    const descOptimal = descLength >= 100 && descLength <= 200;
    const ogDescScore = hasOgDesc ? (descOptimal ? weights.ogDescription : weights.ogDescription * 0.7) : 0;
    factors.push({
      name: 'og:description',
      status: hasOgDesc ? (descOptimal ? 'pass' : 'warning') : 'fail',
      points: ogDescScore,
      maxPoints: weights.ogDescription,
      details: hasOgDesc ? `${descLength} chars` : 'Missing'
    });
    rawScore += ogDescScore;

    // og:type = product (5 points)
    const isProductType = og.type === 'product' || og.type === 'og:product';
    const ogTypeScore = isProductType ? weights.ogType : 0;
    factors.push({
      name: 'og:type = product',
      status: isProductType ? 'pass' : 'fail',
      points: ogTypeScore,
      maxPoints: weights.ogType,
      details: og.type ? `Type: ${og.type}` : 'Missing og:type'
    });
    rawScore += ogTypeScore;

    // Twitter Card (10 points)
    const hasTwitterCard = !!twitter.card;
    const isLargeImage = twitter.card === 'summary_large_image';
    const twitterScore = hasTwitterCard ? (isLargeImage ? weights.twitterCard : weights.twitterCard * 0.7) : 0;
    factors.push({
      name: 'Twitter Card',
      status: hasTwitterCard ? (isLargeImage ? 'pass' : 'warning') : 'fail',
      points: twitterScore,
      maxPoints: weights.twitterCard,
      details: hasTwitterCard ? `Type: ${twitter.card}` : 'Missing twitter:card'
    });
    rawScore += twitterScore;

    // Twitter Image (5 points)
    const hasTwitterImage = !!twitter.image;
    const twitterImageScore = hasTwitterImage ? weights.twitterImage : 0;
    factors.push({
      name: 'Twitter Image',
      status: hasTwitterImage ? 'pass' : 'fail',
      points: twitterImageScore,
      maxPoints: weights.twitterImage
    });
    rawScore += twitterImageScore;

    // Canonical URL (10 points)
    const hasCanonical = data?.canonical?.present;
    const canonicalMatches = data?.canonical?.matchesCurrentUrl;
    const canonicalScore = hasCanonical ? (canonicalMatches ? weights.canonical : weights.canonical * 0.7) : 0;
    factors.push({
      name: 'Canonical URL',
      status: hasCanonical ? (canonicalMatches ? 'pass' : 'warning') : 'fail',
      points: canonicalScore,
      maxPoints: weights.canonical,
      details: hasCanonical ?
        (canonicalMatches ? 'Matches current URL' : 'Does not match current URL') :
        'Missing canonical'
    });
    rawScore += canonicalScore;

    // Meta Description (10 points)
    const hasMetaDesc = !!data?.standard?.description;
    const metaDescLength = data?.standard?.description?.length || 0;
    const metaDescOptimal = metaDescLength >= 120 && metaDescLength <= 160;
    const metaDescScore = hasMetaDesc ? (metaDescOptimal ? weights.metaDescription : weights.metaDescription * 0.7) : 0;
    factors.push({
      name: 'Meta Description',
      status: hasMetaDesc ? (metaDescOptimal ? 'pass' : 'warning') : 'fail',
      points: metaDescScore,
      maxPoints: weights.metaDescription,
      details: hasMetaDesc ? `${metaDescLength} chars` : 'Missing'
    });
    rawScore += metaDescScore;

    // Robots allows indexing (5 points) - Critical if blocked
    const isBlocked = data?.robots?.isBlocked;
    const robotsScore = isBlocked ? 0 : weights.robotsAllowsIndex;
    factors.push({
      name: 'Robots Allows Indexing',
      status: isBlocked ? 'fail' : 'pass',
      points: robotsScore,
      maxPoints: weights.robotsAllowsIndex,
      critical: isBlocked,
      details: isBlocked ? 'BLOCKED: noindex directive found' : 'Indexing allowed'
    });
    rawScore += robotsScore;

    return {
      score: rawScore,
      maxScore,
      factors,
      weight: CATEGORY_WEIGHTS.protocolMeta,
      categoryName: 'Protocol & Meta Compliance'
    };
  }

  /**
   * Score Content Quality category (25% weight)
   */
  scoreContentQuality(data) {
    const factors = [];
    let rawScore = 0;
    const maxScore = 100;
    const weights = FACTOR_WEIGHTS.contentQuality;
    const desc = data?.description || {};
    const specs = data?.specifications || {};
    const features = data?.features || {};
    const faq = data?.faq || {};
    const details = data?.productDetails || {};

    // Description Length (15 points)
    const wordCount = desc.wordCount || 0;
    const descScore = desc.lengthScore ? Math.round((desc.lengthScore / 100) * weights.descriptionLength) : 0;
    factors.push({
      name: 'Description Length',
      status: wordCount >= 100 ? 'pass' : wordCount >= 50 ? 'warning' : 'fail',
      points: descScore,
      maxPoints: weights.descriptionLength,
      details: `${wordCount} words${wordCount < 100 ? ' (aim for 100+)' : ''}`
    });
    rawScore += descScore;

    // Description Quality (10 points) - Contextual
    let descQualityScore = 0;
    const hasBenefits = desc.hasBenefitStatements;
    const hasEmotional = desc.hasEmotionalLanguage;
    const hasTechnical = desc.hasTechnicalTerms;

    // Apply context multipliers
    if (hasBenefits || hasEmotional) {
      descQualityScore += (weights.descriptionQuality / 2) * this.multipliers.emotionalBenefitCopy;
    }
    if (hasTechnical) {
      descQualityScore += (weights.descriptionQuality / 2) * this.multipliers.technicalSpecifications;
    }
    descQualityScore = Math.min(weights.descriptionQuality, Math.round(descQualityScore));

    factors.push({
      name: 'Description Quality',
      status: descQualityScore >= weights.descriptionQuality * 0.7 ? 'pass' : 'warning',
      points: descQualityScore,
      maxPoints: weights.descriptionQuality,
      contextual: true,
      details: [
        hasBenefits ? 'Benefits' : null,
        hasEmotional ? 'Emotional' : null,
        hasTechnical ? 'Technical' : null
      ].filter(Boolean).join(', ') || 'Needs improvement'
    });
    rawScore += descQualityScore;

    // Specification Count (10 points) - Contextual
    const specCount = specs.count || 0;
    let specScore = specs.countScore ? Math.round((specs.countScore / 100) * weights.specificationCount) : 0;
    specScore = Math.round(specScore * this.multipliers.technicalSpecifications);
    specScore = Math.min(weights.specificationCount * 1.5, specScore); // Cap at 150% of base

    factors.push({
      name: 'Specifications',
      status: specCount >= 5 ? 'pass' : specCount >= 3 ? 'warning' : 'fail',
      points: Math.min(weights.specificationCount, specScore),
      maxPoints: weights.specificationCount,
      contextual: true,
      details: `${specCount} specifications found`
    });
    rawScore += Math.min(weights.specificationCount, specScore);

    // Feature Count (10 points)
    const featureCount = features.count || 0;
    const featureScore = features.countScore ? Math.round((features.countScore / 100) * weights.featureCount) : 0;
    factors.push({
      name: 'Features List',
      status: featureCount >= 5 ? 'pass' : featureCount >= 3 ? 'warning' : 'fail',
      points: featureScore,
      maxPoints: weights.featureCount,
      details: `${featureCount} features found`
    });
    rawScore += featureScore;

    // FAQ Presence (10 points)
    const faqCount = faq.count || 0;
    const faqScore = faq.countScore ? Math.round((faq.countScore / 100) * weights.faqPresence) : 0;
    factors.push({
      name: 'FAQ Section',
      status: faqCount >= 3 ? 'pass' : faqCount > 0 ? 'warning' : 'fail',
      points: faqScore,
      maxPoints: weights.faqPresence,
      details: faqCount > 0 ? `${faqCount} FAQs` : 'No FAQ found'
    });
    rawScore += faqScore;

    // Dimensions (5 points) - Contextual for Need
    let dimensionsScore = details.hasDimensions ? weights.dimensions : 0;
    if (this.context === 'need') dimensionsScore = Math.round(dimensionsScore * 1.3);
    factors.push({
      name: 'Dimensions/Size',
      status: details.hasDimensions ? 'pass' : 'fail',
      points: Math.min(weights.dimensions, dimensionsScore),
      maxPoints: weights.dimensions,
      contextual: this.context === 'need'
    });
    rawScore += Math.min(weights.dimensions, dimensionsScore);

    // Materials (5 points)
    const materialsScore = details.hasMaterials ? weights.materials : 0;
    factors.push({
      name: 'Materials',
      status: details.hasMaterials ? 'pass' : 'fail',
      points: materialsScore,
      maxPoints: weights.materials
    });
    rawScore += materialsScore;

    // Care Instructions (3 points)
    const careScore = details.hasCareInstructions ? weights.careInstructions : 0;
    factors.push({
      name: 'Care Instructions',
      status: details.hasCareInstructions ? 'pass' : 'fail',
      points: careScore,
      maxPoints: weights.careInstructions
    });
    rawScore += careScore;

    // Warranty Info (7 points) - Contextual
    let warrantyScore = details.hasWarranty ? weights.warrantyInfo : 0;
    warrantyScore = Math.round(warrantyScore * this.multipliers.warrantyInfo);
    factors.push({
      name: 'Warranty Information',
      status: details.hasWarranty ? 'pass' : 'fail',
      points: Math.min(weights.warrantyInfo, warrantyScore),
      maxPoints: weights.warrantyInfo,
      contextual: true
    });
    rawScore += Math.min(weights.warrantyInfo, warrantyScore);

    // Compatibility Info (10 points) - Contextual
    let compatScore = details.hasCompatibility ? weights.compatibilityInfo : 0;
    compatScore = Math.round(compatScore * this.multipliers.compatibilityInfo);
    factors.push({
      name: 'Compatibility Information',
      status: details.hasCompatibility ? 'pass' : 'fail',
      points: Math.min(weights.compatibilityInfo * 2, compatScore), // Allow up to 2x for Need context
      maxPoints: weights.compatibilityInfo,
      contextual: true
    });
    rawScore += Math.min(weights.compatibilityInfo * 2, compatScore);

    return {
      score: Math.min(100, rawScore),
      maxScore,
      factors,
      weight: CATEGORY_WEIGHTS.contentQuality,
      categoryName: 'Content Depth & Quality'
    };
  }

  /**
   * Score Content Structure category (15% weight)
   */
  scoreContentStructure(data) {
    const factors = [];
    let rawScore = 0;
    const maxScore = 100;
    const weights = FACTOR_WEIGHTS.contentStructure;
    const headings = data?.headings || {};
    const semantic = data?.semanticHTML || {};
    const ratio = data?.contentRatio || {};
    const tables = data?.tables || {};
    const lists = data?.lists || {};
    const a11y = data?.accessibility || {};
    const images = data?.images || {};
    const js = data?.jsDependency || {};

    // H1 Presence (15 points)
    const hasSingleH1 = headings.hasSingleH1;
    const hasH1 = headings.hasH1;
    const h1Score = hasSingleH1 ? weights.h1Presence : (hasH1 ? weights.h1Presence * 0.5 : 0);
    factors.push({
      name: 'H1 Heading',
      status: hasSingleH1 ? 'pass' : hasH1 ? 'warning' : 'fail',
      points: h1Score,
      maxPoints: weights.h1Presence,
      details: hasSingleH1 ? 'Single H1 found' :
               hasH1 ? `${headings.h1?.count} H1s (should be 1)` : 'No H1 found'
    });
    rawScore += h1Score;

    // Heading Hierarchy (12 points)
    const hierarchyValid = headings.hierarchyValid;
    const hierarchyScore = hierarchyValid ? weights.headingHierarchy : weights.headingHierarchy * 0.5;
    factors.push({
      name: 'Heading Hierarchy',
      status: hierarchyValid ? 'pass' : 'warning',
      points: hierarchyScore,
      maxPoints: weights.headingHierarchy,
      details: hierarchyValid ? 'Valid hierarchy' : headings.hierarchyIssues?.join(', ') || 'Issues found'
    });
    rawScore += hierarchyScore;

    // Semantic HTML (12 points)
    const semanticScore = semantic.score ? Math.round((semantic.score / 100) * weights.semanticHTML) : 0;
    factors.push({
      name: 'Semantic HTML',
      status: semantic.hasMain ? 'pass' : semantic.hasArticle ? 'warning' : 'fail',
      points: semanticScore,
      maxPoints: weights.semanticHTML,
      details: semantic.hasMain ? 'Uses <main>' : semantic.hasArticle ? 'Uses <article>' : 'Limited semantic markup'
    });
    rawScore += semanticScore;

    // Content Ratio (12 points)
    const ratioScore = ratio.score ? Math.round((ratio.score / 100) * weights.contentRatio) : 0;
    factors.push({
      name: 'Content-to-Chrome Ratio',
      status: ratio.ratio >= 0.5 ? 'pass' : ratio.ratio >= 0.3 ? 'warning' : 'fail',
      points: ratioScore,
      maxPoints: weights.contentRatio,
      details: ratio.mainContentFound ? `${Math.round(ratio.ratio * 100)}% content` : 'Main content not identified'
    });
    rawScore += ratioScore;

    // Table Structure (10 points)
    const tableScore = tables.score ? Math.round((tables.score / 100) * weights.tableStructure) : 0;
    factors.push({
      name: 'Table Structure',
      status: tables.hasProperTables ? 'pass' : tables.tableCount > 0 ? 'warning' : 'fail',
      points: tableScore,
      maxPoints: weights.tableStructure,
      details: tables.hasProperTables ? 'Proper table markup' : 'No structured tables'
    });
    rawScore += tableScore;

    // List Structure (8 points)
    const listScore = lists.score ? Math.round((lists.score / 100) * weights.listStructure) : 0;
    factors.push({
      name: 'List Structure',
      status: lists.hasProperLists ? 'pass' : 'fail',
      points: listScore,
      maxPoints: weights.listStructure
    });
    rawScore += listScore;

    // ARIA Labels (6 points)
    const ariaScore = a11y.ariaLabels > 0 ? weights.ariaLabels : 0;
    factors.push({
      name: 'ARIA Labels',
      status: a11y.ariaLabels > 0 ? 'pass' : 'fail',
      points: ariaScore,
      maxPoints: weights.ariaLabels,
      details: a11y.ariaLabels > 0 ? `${a11y.ariaLabels} labels found` : 'No ARIA labels'
    });
    rawScore += ariaScore;

    // Primary Image Alt (10 points)
    const primaryHasAlt = images.primaryImage?.hasAlt;
    const primaryAltScore = primaryHasAlt ? weights.primaryImageAlt : 0;
    factors.push({
      name: 'Primary Image Alt Text',
      status: primaryHasAlt ? 'pass' : 'fail',
      points: primaryAltScore,
      maxPoints: weights.primaryImageAlt,
      details: primaryHasAlt ? 'Has alt text' : 'Missing alt text on primary image'
    });
    rawScore += primaryAltScore;

    // All Images Alt (8 points)
    const altCoverage = images.altCoverage || 0;
    const allAltScore = Math.round(altCoverage * weights.allImagesAlt);
    factors.push({
      name: 'Image Alt Coverage',
      status: altCoverage >= 0.9 ? 'pass' : altCoverage >= 0.5 ? 'warning' : 'fail',
      points: allAltScore,
      maxPoints: weights.allImagesAlt,
      details: `${Math.round(altCoverage * 100)}% of images have alt text`
    });
    rawScore += allAltScore;

    // JS Dependency (10 points)
    const jsScore = js.score ? Math.round((js.score / 100) * weights.jsDependency) : weights.jsDependency;
    factors.push({
      name: 'JavaScript Dependency',
      status: js.dependencyLevel === 'low' ? 'pass' : js.dependencyLevel === 'medium' ? 'warning' : 'fail',
      points: jsScore,
      maxPoints: weights.jsDependency,
      details: `${js.dependencyLevel || 'Low'} JS dependency${js.frameworkDetected ? ` (${js.frameworkDetected})` : ''}`
    });
    rawScore += jsScore;

    return {
      score: Math.min(100, rawScore),
      maxScore,
      factors,
      weight: CATEGORY_WEIGHTS.contentStructure,
      categoryName: 'Content Structure & Accessibility'
    };
  }

  /**
   * Score Authority & Trust category (15% weight)
   */
  scoreAuthorityTrust(data) {
    const factors = [];
    let rawScore = 0;
    const maxScore = 100;
    const weights = FACTOR_WEIGHTS.authorityTrust;
    const reviews = data?.reviews || {};
    const brand = data?.brand || {};
    const certs = data?.certifications || {};
    const awards = data?.awards || {};

    // Review Count (25 points) - Contextual
    let reviewCountScore = reviews.countScore ? Math.round((reviews.countScore / 100) * weights.reviewCount) : 0;
    reviewCountScore = Math.round(reviewCountScore * this.multipliers.reviewCount);
    factors.push({
      name: 'Review Count',
      status: reviews.count >= 50 ? 'pass' : reviews.count >= 10 ? 'warning' : 'fail',
      points: Math.min(weights.reviewCount * 1.5, reviewCountScore),
      maxPoints: weights.reviewCount,
      contextual: true,
      details: reviews.count > 0 ? `${reviews.count} reviews` : 'No reviews found'
    });
    rawScore += Math.min(weights.reviewCount * 1.5, reviewCountScore);

    // Average Rating (20 points) - Contextual
    let ratingScore = reviews.ratingScore ? Math.round((reviews.ratingScore / 100) * weights.averageRating) : 0;
    ratingScore = Math.round(ratingScore * this.multipliers.reviewRating);
    factors.push({
      name: 'Average Rating',
      status: reviews.averageRating >= 4 ? 'pass' : reviews.averageRating >= 3.5 ? 'warning' : 'fail',
      points: Math.min(weights.averageRating, ratingScore),
      maxPoints: weights.averageRating,
      contextual: true,
      details: reviews.averageRating ? `${reviews.averageRating.toFixed(1)}/5` : 'No rating'
    });
    rawScore += Math.min(weights.averageRating, ratingScore);

    // Review Recency (15 points)
    const recencyScore = reviews.hasRecentReviews !== false ? weights.reviewRecency : weights.reviewRecency * 0.5;
    factors.push({
      name: 'Review Recency',
      status: reviews.hasRecentReviews !== false ? 'pass' : 'warning',
      points: recencyScore,
      maxPoints: weights.reviewRecency
    });
    rawScore += recencyScore;

    // Review Depth (10 points)
    const depthScore = reviews.depthScore ? Math.round((reviews.depthScore / 100) * weights.reviewDepth) : 0;
    factors.push({
      name: 'Review Depth',
      status: reviews.averageReviewLength >= 100 ? 'pass' : reviews.averageReviewLength >= 50 ? 'warning' : 'fail',
      points: depthScore,
      maxPoints: weights.reviewDepth
    });
    rawScore += depthScore;

    // Brand Clarity (15 points)
    const brandScore = brand.score ? Math.round((brand.score / 100) * weights.brandClarity) : 0;
    factors.push({
      name: 'Brand Clarity',
      status: brand.clarity === 'excellent' ? 'pass' : brand.clarity === 'good' ? 'warning' : 'fail',
      points: brandScore,
      maxPoints: weights.brandClarity,
      details: brand.name ? `${brand.name} (${brand.clarity})` : 'Brand not identified'
    });
    rawScore += brandScore;

    // Certifications (10 points) - Contextual
    let certScore = certs.score ? Math.round((certs.score / 100) * weights.certifications) : 0;
    certScore = Math.round(certScore * this.multipliers.certifications);
    factors.push({
      name: 'Certifications',
      status: certs.count > 0 ? 'pass' : 'fail',
      points: Math.min(weights.certifications * 1.6, certScore),
      maxPoints: weights.certifications,
      contextual: true,
      details: certs.count > 0 ? certs.items.slice(0, 3).join(', ') : 'No certifications found'
    });
    rawScore += Math.min(weights.certifications * 1.6, certScore);

    // Awards (5 points)
    const awardScore = awards.count > 0 ? weights.awards : 0;
    factors.push({
      name: 'Awards',
      status: awards.count > 0 ? 'pass' : 'fail',
      points: awardScore,
      maxPoints: weights.awards,
      details: awards.count > 0 ? awards.items.slice(0, 2).join(', ') : 'No awards found'
    });
    rawScore += awardScore;

    return {
      score: Math.min(100, rawScore),
      maxScore,
      factors,
      weight: CATEGORY_WEIGHTS.authorityTrust,
      categoryName: 'Authority & Trust Signals'
    };
  }
}
