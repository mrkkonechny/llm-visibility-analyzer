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
   * @param {Object} aiDiscoverabilityData - AI discoverability network data (optional)
   * @returns {Object} Complete scoring result
   */
  calculateScore(extractedData, imageVerification = null, aiDiscoverabilityData = null) {
    // Calculate category scores
    const categoryScores = {
      structuredData: this.scoreStructuredData(extractedData.structuredData),
      protocolMeta: this.scoreProtocolMeta(extractedData.metaTags, imageVerification),
      contentQuality: this.scoreContentQuality(extractedData.contentQuality),
      contentStructure: this.scoreContentStructure(extractedData.contentStructure),
      authorityTrust: this.scoreAuthorityTrust(extractedData.trustSignals),
      aiDiscoverability: this.scoreAIDiscoverability(extractedData.aiDiscoverability, aiDiscoverabilityData)
    };

    // Calculate weighted total
    const totalScore = Math.round(
      categoryScores.structuredData.score * CATEGORY_WEIGHTS.structuredData +
      categoryScores.protocolMeta.score * CATEGORY_WEIGHTS.protocolMeta +
      categoryScores.contentQuality.score * CATEGORY_WEIGHTS.contentQuality +
      categoryScores.contentStructure.score * CATEGORY_WEIGHTS.contentStructure +
      categoryScores.authorityTrust.score * CATEGORY_WEIGHTS.authorityTrust +
      categoryScores.aiDiscoverability.score * CATEGORY_WEIGHTS.aiDiscoverability
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
    const breadcrumbCount = data?.schemas?.breadcrumb?.itemCount || 0;
    factors.push({
      name: 'Breadcrumb Schema',
      status: hasBreadcrumb ? 'pass' : 'fail',
      points: breadcrumbScore,
      maxPoints: weights.breadcrumbSchema,
      details: hasBreadcrumb ? `${breadcrumbCount} level${breadcrumbCount !== 1 ? 's' : ''} found` : 'Missing breadcrumb schema'
    });
    rawScore += breadcrumbScore;

    // Organization Schema (5 points)
    const hasOrg = data?.schemas?.organization !== null || data?.schemas?.brand !== null;
    const orgScore = hasOrg ? weights.organizationSchema : 0;
    const orgName = data?.schemas?.organization?.name || data?.schemas?.brand?.name;
    factors.push({
      name: 'Organization/Brand Schema',
      status: hasOrg ? 'pass' : 'fail',
      points: orgScore,
      maxPoints: weights.organizationSchema,
      details: hasOrg ? (orgName ? `Found: ${orgName}` : 'Schema present') : 'Missing organization/brand schema'
    });
    rawScore += orgScore;

    // Image Schema (5 points)
    const hasImageSchema = data?.schemas?.images?.length > 0;
    const imageSchemaScore = hasImageSchema ? weights.imageSchema : 0;
    const imageCount = data?.schemas?.images?.length || 0;
    factors.push({
      name: 'ImageObject Schema',
      status: hasImageSchema ? 'pass' : 'fail',
      points: imageSchemaScore,
      maxPoints: weights.imageSchema,
      details: hasImageSchema ? `${imageCount} image${imageCount !== 1 ? 's' : ''} in schema` : 'No ImageObject schema'
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
    const descSource = desc.source ? ` (${desc.source})` : '';
    factors.push({
      name: 'Description Length',
      status: wordCount >= 100 ? 'pass' : wordCount >= 50 ? 'warning' : 'fail',
      points: descScore,
      maxPoints: weights.descriptionLength,
      details: `${wordCount} words${descSource}${wordCount < 100 ? ' (aim for 100+)' : ''}`
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
    const specSource = specs.source ? ` (${specs.source})` : '';

    factors.push({
      name: 'Specifications',
      status: specCount >= 5 ? 'pass' : specCount >= 3 ? 'warning' : 'fail',
      points: Math.min(weights.specificationCount, specScore),
      maxPoints: weights.specificationCount,
      contextual: true,
      details: `${specCount} specification${specCount !== 1 ? 's' : ''} found${specSource}`
    });
    rawScore += Math.min(weights.specificationCount, specScore);

    // Feature Count (10 points)
    const featureCount = features.count || 0;
    const featureScore = features.countScore ? Math.round((features.countScore / 100) * weights.featureCount) : 0;
    const featureSource = features.source ? ` (${features.source})` : '';
    factors.push({
      name: 'Features List',
      status: featureCount >= 5 ? 'pass' : featureCount >= 3 ? 'warning' : 'fail',
      points: featureScore,
      maxPoints: weights.featureCount,
      details: `${featureCount} feature${featureCount !== 1 ? 's' : ''} found${featureSource}`
    });
    rawScore += featureScore;

    // FAQ Presence (10 points)
    const faqCount = faq.count || 0;
    const faqScore = faq.countScore ? Math.round((faq.countScore / 100) * weights.faqPresence) : 0;
    const faqSource = faq.source ? ` (${faq.source})` : '';
    factors.push({
      name: 'FAQ Section',
      status: faqCount >= 3 ? 'pass' : faqCount > 0 ? 'warning' : 'fail',
      points: faqScore,
      maxPoints: weights.faqPresence,
      details: faqCount > 0 ? `${faqCount} FAQ${faqCount !== 1 ? 's' : ''}${faqSource}` : 'No FAQ found'
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
      contextual: this.context === 'need',
      details: details.hasDimensions
        ? (details.dimensionsText || 'Dimensions found')
        : 'No dimensions found'
    });
    rawScore += Math.min(weights.dimensions, dimensionsScore);

    // Materials (5 points)
    const materialsScore = details.hasMaterials ? weights.materials : 0;
    factors.push({
      name: 'Materials',
      status: details.hasMaterials ? 'pass' : 'fail',
      points: materialsScore,
      maxPoints: weights.materials,
      details: details.hasMaterials
        ? (details.materialsText || 'Materials found')
        : 'No materials information found'
    });
    rawScore += materialsScore;

    // Care Instructions (3 points)
    const careScore = details.hasCareInstructions ? weights.careInstructions : 0;
    factors.push({
      name: 'Care Instructions',
      status: details.hasCareInstructions ? 'pass' : 'fail',
      points: careScore,
      maxPoints: weights.careInstructions,
      details: details.hasCareInstructions
        ? (details.careText || 'Care instructions found')
        : 'No care instructions found'
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
      contextual: true,
      details: details.hasWarranty
        ? (details.warrantyText || 'Warranty found')
        : 'No warranty information found'
    });
    rawScore += Math.min(weights.warrantyInfo, warrantyScore);

    // Compatibility Info (10 points) - Contextual
    let compatScore = details.hasCompatibility ? weights.compatibilityInfo : 0;
    compatScore = Math.round(compatScore * this.multipliers.compatibilityInfo);
    factors.push({
      name: 'Compatibility Information',
      status: details.hasCompatibility ? 'pass' : 'fail',
      points: Math.min(weights.compatibilityInfo, compatScore),
      maxPoints: weights.compatibilityInfo,
      contextual: true,
      details: details.hasCompatibility
        ? (details.compatibilityText || 'Compatibility info found')
        : 'No compatibility information found'
    });
    rawScore += Math.min(weights.compatibilityInfo, compatScore);

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
    const semanticElements = semantic.elements || {};
    const foundElements = Object.entries(semanticElements)
      .filter(([tag, count]) => count > 0)
      .map(([tag, count]) => `<${tag}>${count > 1 ? '×' + count : ''}`)
      .join(', ');
    const missingKey = [];
    if (!semanticElements.main) missingKey.push('<main>');
    if (!semanticElements.article) missingKey.push('<article>');
    factors.push({
      name: 'Semantic HTML',
      status: semantic.hasMain ? 'pass' : semantic.hasArticle ? 'warning' : 'fail',
      points: semanticScore,
      maxPoints: weights.semanticHTML,
      details: foundElements ? `Found: ${foundElements}` + (missingKey.length ? ` | Missing: ${missingKey.join(', ')}` : '') : 'No semantic elements found'
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
    const ulCount = lists.unorderedCount || 0;
    const olCount = lists.orderedCount || 0;
    factors.push({
      name: 'List Structure',
      status: lists.hasProperLists ? 'pass' : 'fail',
      points: listScore,
      maxPoints: weights.listStructure,
      details: lists.hasProperLists
        ? `${olCount} ordered, ${ulCount} unordered list${ulCount !== 1 ? 's' : ''}`
        : 'No structured lists found'
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
      maxPoints: weights.reviewRecency,
      details: reviews.mostRecentDate
        ? `Most recent: ${reviews.mostRecentDate}`
        : (reviews.hasRecentReviews === null ? 'No review dates found' : 'Reviews may be outdated')
    });
    rawScore += recencyScore;

    // Review Depth (10 points)
    const depthScore = reviews.depthScore ? Math.round((reviews.depthScore / 100) * weights.reviewDepth) : 0;
    const avgLength = reviews.averageReviewLength || 0;
    const reviewsAnalyzed = reviews.reviewsAnalyzed || 0;
    factors.push({
      name: 'Review Depth',
      status: avgLength >= 100 ? 'pass' : avgLength >= 50 ? 'warning' : 'fail',
      points: depthScore,
      maxPoints: weights.reviewDepth,
      details: reviewsAnalyzed > 0
        ? `Avg ${avgLength} chars (${reviewsAnalyzed} review${reviewsAnalyzed !== 1 ? 's' : ''} analyzed)`
        : 'No review text found to analyze'
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
    const certSource = certs.source ? ` (${certs.source})` : '';
    // Use detailed matches if available, otherwise fall back to items
    const certDetails = certs.details && certs.details.length > 0
      ? certs.details.slice(0, 3).map(c => c.matched || c.name).join(', ')
      : (certs.items || []).slice(0, 3).join(', ');
    factors.push({
      name: 'Certifications',
      status: certs.count > 0 ? 'pass' : 'fail',
      points: Math.min(weights.certifications * 1.6, certScore),
      maxPoints: weights.certifications,
      contextual: true,
      details: certs.count > 0 ? `${certDetails}${certSource}` : 'No certifications found'
    });
    rawScore += Math.min(weights.certifications * 1.6, certScore);

    // Awards (5 points)
    const awardScore = awards.count > 0 ? weights.awards : 0;
    const awardSource = awards.source ? ` (${awards.source})` : '';
    // Use detailed matches if available
    const awardDetails = awards.details && awards.details.length > 0
      ? awards.details.slice(0, 2).map(a => a.matched || a.name).join(', ')
      : (awards.items || []).slice(0, 2).join(', ');
    factors.push({
      name: 'Awards',
      status: awards.count > 0 ? 'pass' : 'fail',
      points: awardScore,
      maxPoints: weights.awards,
      details: awards.count > 0 ? `${awardDetails}${awardSource}` : 'No awards found'
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

  /**
   * Score AI Discoverability category (10% weight)
   * @param {Object} pageData - AI discoverability data from content script
   * @param {Object} networkData - Network fetch data (robots.txt, llms.txt, Last-Modified)
   */
  scoreAIDiscoverability(pageData, networkData) {
    const factors = [];
    let rawScore = 0;
    const maxScore = 100;
    const weights = FACTOR_WEIGHTS.aiDiscoverability;
    const robots = networkData?.robots || {};
    const llms = networkData?.llms || {};
    const lastModified = networkData?.lastModified || {};
    const schemaDate = pageData?.schemaDate || {};
    const visibleDate = pageData?.visibleDate || {};

    // AI Crawler Access (35 points)
    const crawlerResult = this.scoreAICrawlerAccess(robots, weights.aiCrawlerAccess);
    factors.push(crawlerResult.factor);
    rawScore += crawlerResult.score;

    // Content Freshness (30 points)
    const freshnessResult = this.scoreContentFreshness(schemaDate, lastModified, weights.contentFreshness);
    factors.push(freshnessResult.factor);
    rawScore += freshnessResult.score;

    // llms.txt Presence (20 points)
    const llmsResult = this.scoreLlmsTxt(llms, weights.llmsTxtPresence);
    factors.push(llmsResult.factor);
    rawScore += llmsResult.score;

    // Date Signals Present (15 points)
    const dateResult = this.scoreDateSignals(schemaDate, visibleDate, weights.dateSignalsPresent);
    factors.push(dateResult.factor);
    rawScore += dateResult.score;

    return {
      score: Math.min(100, rawScore),
      maxScore,
      factors,
      weight: CATEGORY_WEIGHTS.aiDiscoverability,
      categoryName: 'AI Discoverability'
    };
  }

  /**
   * Score AI crawler access based on robots.txt rules
   * @param {Object} robotsData - Parsed robots.txt data
   * @param {number} maxPoints - Maximum points for this factor
   */
  scoreAICrawlerAccess(robotsData, maxPoints) {
    let score = 0;
    let status = 'unknown';
    let details = 'Unable to check robots.txt';

    if (robotsData.accessible === false && robotsData.error) {
      // CORS blocked - can't determine
      status = 'warning';
      details = 'robots.txt not accessible (CORS)';
      score = maxPoints * 0.5; // Give partial credit
    } else if (robotsData.accessible === false) {
      // No robots.txt - assume allowed
      status = 'pass';
      details = 'No robots.txt (AI crawlers allowed)';
      score = maxPoints;
    } else if (robotsData.accessible) {
      const blockedCount = robotsData.blockedCrawlers?.length || 0;
      const allowedCount = robotsData.allowedCrawlers?.length || 0;
      const totalMajor = blockedCount + allowedCount;

      if (blockedCount === 0) {
        status = 'pass';
        details = `All major AI crawlers allowed`;
        score = maxPoints;
      } else if (blockedCount < totalMajor) {
        status = 'warning';
        details = `${blockedCount}/${totalMajor} AI crawlers blocked: ${robotsData.blockedCrawlers.slice(0, 3).join(', ')}`;
        score = Math.round(maxPoints * (allowedCount / totalMajor));
      } else {
        status = 'fail';
        details = `All major AI crawlers blocked`;
        score = 0;
      }
    }

    return {
      score,
      factor: {
        name: 'AI Crawler Access',
        status,
        points: score,
        maxPoints,
        critical: status === 'fail',
        details
      }
    };
  }

  /**
   * Score content freshness based on date signals
   * Freshness thresholds:
   * - ≤7 days: 100%
   * - 8-30 days: 83%
   * - 31-90 days: 67%
   * - 91-180 days: 33%
   * - 181-365 days: 17%
   * - >365 days: 0%
   */
  scoreContentFreshness(schemaDate, lastModified, maxPoints) {
    let score = 0;
    let status = 'unknown';
    let details = 'No freshness signals found';
    let mostRecentDate = null;

    // Find the most recent date from available sources
    const dateSources = [
      { date: schemaDate.dateModified, source: 'schema dateModified' },
      { date: schemaDate.datePublished, source: 'schema datePublished' },
      { date: lastModified?.lastModified, source: 'Last-Modified header' }
    ];

    const now = new Date();
    for (const { date, source } of dateSources) {
      if (date) {
        try {
          const parsed = new Date(date);
          // Skip invalid dates and future dates (could indicate data errors)
          if (!isNaN(parsed.getTime()) && parsed <= now) {
            if (!mostRecentDate || parsed > mostRecentDate.date) {
              mostRecentDate = { date: parsed, source };
            }
          }
        } catch (e) {
          // Skip invalid dates
        }
      }
    }

    if (mostRecentDate) {
      const ageInDays = Math.floor((now - mostRecentDate.date) / (1000 * 60 * 60 * 24));

      let freshnessPercent;
      if (ageInDays <= 7) {
        freshnessPercent = 100;
      } else if (ageInDays <= 30) {
        freshnessPercent = 83;
      } else if (ageInDays <= 90) {
        freshnessPercent = 67;
      } else if (ageInDays <= 180) {
        freshnessPercent = 33;
      } else if (ageInDays <= 365) {
        freshnessPercent = 17;
      } else {
        freshnessPercent = 0;
      }

      score = Math.round((freshnessPercent / 100) * maxPoints);
      status = freshnessPercent >= 67 ? 'pass' : freshnessPercent >= 33 ? 'warning' : 'fail';

      const ageText = ageInDays === 0 ? 'today' :
                      ageInDays === 1 ? '1 day ago' :
                      ageInDays < 30 ? `${ageInDays} days ago` :
                      ageInDays < 365 ? `${Math.floor(ageInDays / 30)} months ago` :
                      `${Math.floor(ageInDays / 365)}+ years ago`;

      details = `Last updated ${ageText} (${mostRecentDate.source})`;
    } else {
      status = 'fail';
      score = 0;
    }

    return {
      score,
      factor: {
        name: 'Content Freshness',
        status,
        points: score,
        maxPoints,
        details
      }
    };
  }

  /**
   * Score llms.txt presence
   * @param {Object} llmsData - llms.txt fetch results
   * @param {number} maxPoints - Maximum points for this factor
   */
  scoreLlmsTxt(llmsData, maxPoints) {
    let score = 0;
    let status = 'fail';
    let details = 'No llms.txt found';

    if (llmsData.found) {
      if (llmsData.llmsTxt?.found && llmsData.llmsFullTxt?.found) {
        status = 'pass';
        score = maxPoints;
        details = 'Both llms.txt and llms-full.txt found';
      } else if (llmsData.llmsTxt?.found) {
        status = 'pass';
        score = maxPoints;
        details = 'llms.txt found';
      } else if (llmsData.llmsFullTxt?.found) {
        status = 'pass';
        score = Math.round(maxPoints * 0.8);
        details = 'llms-full.txt found (llms.txt recommended)';
      }
    }

    return {
      score,
      factor: {
        name: 'llms.txt Presence',
        status,
        points: score,
        maxPoints,
        details
      }
    };
  }

  /**
   * Score date signals presence (schema + visible)
   * @param {Object} schemaDate - Schema date signals
   * @param {Object} visibleDate - Visible date signals
   * @param {number} maxPoints - Maximum points for this factor
   */
  scoreDateSignals(schemaDate, visibleDate, maxPoints) {
    let score = 0;
    let status = 'fail';
    let details = 'No date signals detected';
    const signals = [];

    // Check schema dates
    if (schemaDate.dateModified) {
      signals.push('dateModified');
      score += maxPoints * 0.5;
    }
    if (schemaDate.datePublished) {
      signals.push('datePublished');
      score += maxPoints * 0.25;
    }

    // Check visible dates
    if (visibleDate.found) {
      signals.push(`visible (${visibleDate.dateType || 'date'})`);
      score += maxPoints * 0.25;
    }

    // Cap at max points
    score = Math.min(maxPoints, score);

    if (signals.length > 0) {
      status = signals.includes('dateModified') ? 'pass' : 'warning';
      details = `Found: ${signals.join(', ')}`;
    }

    return {
      score,
      factor: {
        name: 'Date Signals',
        status,
        points: score,
        maxPoints,
        details
      }
    };
  }
}
