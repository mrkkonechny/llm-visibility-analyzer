/**
 * Content Structure Extractor
 * Analyzes HTML structure, headings, semantic elements, and accessibility
 */

/**
 * Extract content structure information
 * @returns {Object} Structure analysis
 */
export function extractContentStructure() {
  return {
    headings: analyzeHeadings(),
    semanticHTML: analyzeSemanticHTML(),
    contentRatio: calculateContentRatio(),
    tables: analyzeTables(),
    lists: analyzeLists(),
    accessibility: analyzeAccessibility(),
    images: analyzeImages(),
    jsDependency: assessJSDependency()
  };
}

/**
 * Analyze heading structure
 * @returns {Object} Heading analysis
 */
function analyzeHeadings() {
  const headings = {
    h1: { count: 0, texts: [] },
    h2: { count: 0, texts: [] },
    h3: { count: 0, texts: [] },
    h4: { count: 0, texts: [] },
    h5: { count: 0, texts: [] },
    h6: { count: 0, texts: [] }
  };

  for (let level = 1; level <= 6; level++) {
    const elements = document.querySelectorAll(`h${level}`);
    headings[`h${level}`] = {
      count: elements.length,
      texts: Array.from(elements)
        .map(el => el.textContent.trim())
        .filter(t => t.length > 0)
        .slice(0, 10) // Limit to first 10
    };
  }

  // Find the product title from h1
  const productTitle = headings.h1.texts[0] || null;

  // Check heading hierarchy
  const hierarchy = validateHeadingHierarchy(headings);

  return {
    ...headings,
    productTitle,
    hasH1: headings.h1.count > 0,
    hasSingleH1: headings.h1.count === 1,
    multipleH1: headings.h1.count > 1,
    hierarchyValid: hierarchy.valid,
    hierarchyIssues: hierarchy.issues,
    totalHeadings: Object.values(headings).reduce((sum, h) => sum + h.count, 0)
  };
}

/**
 * Validate heading hierarchy
 * @param {Object} headings - Heading data
 * @returns {Object} Hierarchy validation result
 */
function validateHeadingHierarchy(headings) {
  const issues = [];
  let valid = true;

  // Check for missing H1
  if (headings.h1.count === 0) {
    issues.push('Missing H1 heading');
    valid = false;
  }

  // Check for multiple H1s
  if (headings.h1.count > 1) {
    issues.push(`Multiple H1 headings (${headings.h1.count} found)`);
    valid = false;
  }

  // Check for skipped levels
  const levels = [];
  for (let i = 1; i <= 6; i++) {
    if (headings[`h${i}`].count > 0) {
      levels.push(i);
    }
  }

  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      issues.push(`Skipped heading level: H${levels[i - 1]} to H${levels[i]}`);
      valid = false;
    }
  }

  return { valid, issues };
}

/**
 * Analyze semantic HTML usage
 * @returns {Object} Semantic HTML analysis
 */
function analyzeSemanticHTML() {
  const semanticElements = {
    main: document.querySelectorAll('main').length,
    article: document.querySelectorAll('article').length,
    section: document.querySelectorAll('section').length,
    aside: document.querySelectorAll('aside').length,
    nav: document.querySelectorAll('nav').length,
    header: document.querySelectorAll('header').length,
    footer: document.querySelectorAll('footer').length,
    figure: document.querySelectorAll('figure').length,
    figcaption: document.querySelectorAll('figcaption').length,
    details: document.querySelectorAll('details').length,
    summary: document.querySelectorAll('summary').length,
    time: document.querySelectorAll('time').length,
    mark: document.querySelectorAll('mark').length,
    address: document.querySelectorAll('address').length
  };

  // Count key semantic elements for scoring
  const hasMain = semanticElements.main > 0;
  const hasArticle = semanticElements.article > 0;
  const hasSection = semanticElements.section > 0;

  // Calculate semantic score
  let score = 0;
  if (hasMain) score += 30;
  if (hasArticle) score += 25;
  if (hasSection) score += 20;
  if (semanticElements.header > 0) score += 10;
  if (semanticElements.nav > 0) score += 10;
  if (semanticElements.figure > 0) score += 5;

  return {
    elements: semanticElements,
    hasMain,
    hasArticle,
    hasSection,
    score: Math.min(100, score),
    // Check for div soup
    divCount: document.querySelectorAll('div').length,
    spanCount: document.querySelectorAll('span').length,
    semanticRatio: calculateSemanticRatio(semanticElements)
  };
}

/**
 * Calculate semantic to non-semantic element ratio
 * @param {Object} semanticElements - Count of semantic elements
 * @returns {number} Ratio (0-1)
 */
function calculateSemanticRatio(semanticElements) {
  const semanticCount = Object.values(semanticElements).reduce((sum, c) => sum + c, 0);
  const divCount = document.querySelectorAll('div').length;
  const spanCount = document.querySelectorAll('span').length;

  const total = semanticCount + divCount + spanCount;
  if (total === 0) return 0;

  return Math.round((semanticCount / total) * 100) / 100;
}

/**
 * Calculate content-to-chrome ratio
 * @returns {Object} Content ratio analysis
 */
function calculateContentRatio() {
  // Get main content area
  const mainContent = document.querySelector('main') ||
                      document.querySelector('[role="main"]') ||
                      document.querySelector('article') ||
                      document.querySelector('.product-detail, .product-details, .pdp-content');

  if (!mainContent) {
    return {
      mainContentFound: false,
      ratio: 0,
      score: 0
    };
  }

  const mainContentLength = mainContent.innerText.trim().length;
  const totalLength = document.body.innerText.trim().length;

  const ratio = totalLength > 0 ? mainContentLength / totalLength : 0;

  return {
    mainContentFound: true,
    contentLength: mainContentLength,
    totalLength,
    ratio: Math.round(ratio * 100) / 100,
    score: ratio > 0.5 ? 100 : Math.round(ratio * 200)
  };
}

/**
 * Analyze table usage
 * @returns {Object} Table analysis
 */
function analyzeTables() {
  const tables = document.querySelectorAll('table');
  const specsInTables = [];
  let hasProperTables = false;

  tables.forEach((table, index) => {
    const hasHeader = table.querySelector('thead, th') !== null;
    const rowCount = table.querySelectorAll('tr').length;
    const hasCaption = table.querySelector('caption') !== null;

    // Check if it looks like a specs table
    const isSpecsTable = table.closest('.specifications, .specs, .product-specs') !== null ||
                         (rowCount >= 3 && rowCount <= 30 &&
                          table.querySelectorAll('td').length / rowCount <= 3);

    if (hasHeader && rowCount > 0) {
      hasProperTables = true;
    }

    if (isSpecsTable) {
      specsInTables.push({
        index,
        rowCount,
        hasHeader,
        hasCaption
      });
    }
  });

  // Check for div-based grids that should be tables
  const divGrids = document.querySelectorAll('.specs-grid, .attribute-grid, [class*="grid"]');
  const hasDivGridForSpecs = Array.from(divGrids).some(grid => {
    const text = grid.innerText.toLowerCase();
    return text.includes('dimensions') || text.includes('weight') || text.includes('material');
  });

  return {
    tableCount: tables.length,
    specsInTables: specsInTables.length,
    hasProperTables,
    hasDivGridForSpecs,
    score: specsInTables.length > 0 && hasProperTables ? 100 :
           specsInTables.length > 0 ? 75 :
           hasDivGridForSpecs ? 25 : 0
  };
}

/**
 * Analyze list usage
 * @returns {Object} List analysis
 */
function analyzeLists() {
  const unorderedLists = document.querySelectorAll('ul');
  const orderedLists = document.querySelectorAll('ol');
  const descriptionLists = document.querySelectorAll('dl');

  // Count feature/benefit lists specifically
  let featureListCount = 0;

  unorderedLists.forEach(ul => {
    const parent = ul.closest('.features, .benefits, .highlights, .product-features');
    if (parent) featureListCount++;

    // Also check if in main content area with 3+ items
    const items = ul.querySelectorAll('li');
    if (items.length >= 3 && items.length <= 15) {
      const mainContent = document.querySelector('main, article, .product-detail');
      if (mainContent && mainContent.contains(ul)) {
        featureListCount++;
      }
    }
  });

  const hasProperLists = unorderedLists.length > 0 || orderedLists.length > 0;
  const hasDescriptionLists = descriptionLists.length > 0;

  return {
    unorderedCount: unorderedLists.length,
    orderedCount: orderedLists.length,
    descriptionListCount: descriptionLists.length,
    featureListCount,
    hasProperLists,
    hasDescriptionLists,
    score: hasProperLists ? (featureListCount > 0 ? 100 : 75) : 25
  };
}

/**
 * Analyze accessibility features
 * @returns {Object} Accessibility analysis
 */
function analyzeAccessibility() {
  // ARIA labels
  const ariaLabels = document.querySelectorAll('[aria-label]');
  const ariaDescribedBy = document.querySelectorAll('[aria-describedby]');
  const ariaLabelledBy = document.querySelectorAll('[aria-labelledby]');
  const roles = document.querySelectorAll('[role]');

  // Form labels
  const inputs = document.querySelectorAll('input, select, textarea');
  const inputsWithLabels = Array.from(inputs).filter(input => {
    const id = input.id;
    if (id && document.querySelector(`label[for="${id}"]`)) return true;
    if (input.closest('label')) return true;
    if (input.getAttribute('aria-label')) return true;
    return false;
  });

  // Interactive elements accessibility
  const buttons = document.querySelectorAll('button, [role="button"]');
  const buttonsWithLabels = Array.from(buttons).filter(btn => {
    return btn.textContent.trim().length > 0 ||
           btn.getAttribute('aria-label') ||
           btn.querySelector('img[alt]');
  });

  const links = document.querySelectorAll('a');
  const linksWithText = Array.from(links).filter(link => {
    return link.textContent.trim().length > 0 ||
           link.getAttribute('aria-label');
  });

  // Skip links
  const hasSkipLink = document.querySelector('a[href="#main"], a[href="#content"], .skip-link') !== null;

  // Language attribute
  const hasLangAttr = document.documentElement.hasAttribute('lang');

  return {
    ariaLabels: ariaLabels.length,
    ariaDescribedBy: ariaDescribedBy.length,
    ariaLabelledBy: ariaLabelledBy.length,
    roles: roles.length,
    inputCount: inputs.length,
    inputsWithLabels: inputsWithLabels.length,
    inputLabelRatio: inputs.length > 0 ? inputsWithLabels.length / inputs.length : 1,
    buttonCount: buttons.length,
    buttonsWithLabels: buttonsWithLabels.length,
    buttonLabelRatio: buttons.length > 0 ? buttonsWithLabels.length / buttons.length : 1,
    linkCount: links.length,
    linksWithText: linksWithText.length,
    hasSkipLink,
    hasLangAttr,
    score: calculateAccessibilityScore({
      ariaLabels: ariaLabels.length,
      roles: roles.length,
      inputLabelRatio: inputs.length > 0 ? inputsWithLabels.length / inputs.length : 1,
      hasLangAttr
    })
  };
}

/**
 * Calculate accessibility score
 * @param {Object} data - Accessibility data
 * @returns {number} Score (0-100)
 */
function calculateAccessibilityScore(data) {
  let score = 0;

  // ARIA usage
  if (data.ariaLabels > 0) score += 20;
  if (data.roles > 0) score += 15;

  // Form accessibility
  score += Math.round(data.inputLabelRatio * 30);

  // Language
  if (data.hasLangAttr) score += 15;

  // Base score for having any accessibility features
  score += 20;

  return Math.min(100, score);
}

/**
 * Analyze images
 * @returns {Object} Image analysis
 */
function analyzeImages() {
  const images = document.querySelectorAll('img');
  const imagesArray = Array.from(images);

  // Categorize by alt text quality
  const withAlt = imagesArray.filter(img => img.hasAttribute('alt'));
  const withMeaningfulAlt = imagesArray.filter(img => {
    const alt = img.getAttribute('alt');
    return alt && alt.trim().length >= 5;
  });
  const decorativeImages = imagesArray.filter(img => {
    const alt = img.getAttribute('alt');
    return alt === ''; // Intentionally empty for decorative images
  });
  const missingAlt = imagesArray.filter(img => !img.hasAttribute('alt'));

  // Find primary product image
  const primaryImage = findPrimaryProductImage();

  // Get og:image for comparison
  const ogImage = document.querySelector('meta[property="og:image"]')?.content;

  return {
    totalCount: images.length,
    withAlt: withAlt.length,
    withMeaningfulAlt: withMeaningfulAlt.length,
    decorativeImages: decorativeImages.length,
    missingAlt: missingAlt.length,
    altCoverage: images.length > 0 ? withAlt.length / images.length : 1,
    meaningfulAltCoverage: images.length > 0 ? withMeaningfulAlt.length / images.length : 1,
    primaryImage: primaryImage ? {
      src: primaryImage.src,
      alt: primaryImage.alt,
      hasAlt: !!primaryImage.alt,
      altLength: primaryImage.alt?.length || 0
    } : null,
    ogImagePresent: !!ogImage,
    ogImageUrl: ogImage,
    score: calculateImageScore(images.length, withMeaningfulAlt.length, primaryImage)
  };
}

/**
 * Find the primary product image
 * @returns {HTMLImageElement|null}
 */
function findPrimaryProductImage() {
  // Try common product image selectors
  const selectors = [
    '.product-image img',
    '.product-photo img',
    '.gallery-main img',
    '.primary-image img',
    '[data-main-image]',
    '.product-media img:first-child',
    '.product-gallery img:first-child'
  ];

  for (const selector of selectors) {
    const img = document.querySelector(selector);
    if (img && img.src) return img;
  }

  // Fallback: find largest image in product area
  const productArea = document.querySelector('.product, .pdp, article, main');
  if (productArea) {
    const imgs = productArea.querySelectorAll('img');
    let largest = null;
    let maxArea = 0;

    imgs.forEach(img => {
      const area = (img.naturalWidth || img.width) * (img.naturalHeight || img.height);
      if (area > maxArea) {
        maxArea = area;
        largest = img;
      }
    });

    return largest;
  }

  return null;
}

/**
 * Calculate image accessibility score
 * @param {number} total - Total images
 * @param {number} withAlt - Images with meaningful alt
 * @param {Object|null} primary - Primary image info
 * @returns {number} Score
 */
function calculateImageScore(total, withAlt, primary) {
  if (total === 0) return 100; // No images to score

  let score = 0;

  // Alt text coverage (60 points)
  const coverage = withAlt / total;
  score += Math.round(coverage * 60);

  // Primary image has alt (25 points)
  if (primary && primary.alt && primary.alt.length >= 10) {
    score += 25;
  } else if (primary && primary.alt) {
    score += 10;
  }

  // Bonus for high coverage
  if (coverage >= 0.9) score += 15;

  return Math.min(100, score);
}

/**
 * Assess JavaScript dependency for content
 * @returns {Object} JS dependency analysis
 */
function assessJSDependency() {
  // Check for noscript content
  const noscripts = document.querySelectorAll('noscript');
  const hasNoscriptContent = Array.from(noscripts).some(ns => ns.textContent.trim().length > 50);

  // Check for client-side rendering indicators
  const hasReactRoot = document.querySelector('#root, #app, [data-reactroot]') !== null;
  const hasVueApp = document.querySelector('#app[data-v-app], [data-v-]') !== null;
  const hasAngularApp = document.querySelector('[ng-app], [data-ng-app]') !== null;

  // Check if main content is in a JS framework container
  const mainContent = document.querySelector('main, article, .product-detail');
  const mainContentInJsContainer = mainContent &&
    (mainContent.closest('#root, #app, [data-reactroot], [data-v-app]') !== null);

  // Check for lazy-loaded content placeholders
  const lazyPlaceholders = document.querySelectorAll(
    '[data-src]:not([src]), .skeleton, .loading-placeholder, [class*="lazy"]'
  );

  // Estimate JS dependency
  let dependencyLevel = 'low';
  if (mainContentInJsContainer) {
    dependencyLevel = 'high';
  } else if (hasReactRoot || hasVueApp || hasAngularApp) {
    dependencyLevel = 'medium';
  } else if (lazyPlaceholders.length > 5) {
    dependencyLevel = 'medium';
  }

  // Check if product info is present without JS
  const productInfoPresent = document.querySelector('[itemtype*="Product"], .product-name, h1');

  return {
    hasNoscriptContent,
    frameworkDetected: hasReactRoot ? 'React' :
                       hasVueApp ? 'Vue' :
                       hasAngularApp ? 'Angular' : null,
    mainContentInJsContainer,
    lazyPlaceholders: lazyPlaceholders.length,
    dependencyLevel,
    productInfoPresent: !!productInfoPresent,
    score: dependencyLevel === 'low' ? 100 :
           dependencyLevel === 'medium' ? 60 :
           productInfoPresent ? 40 : 20
  };
}
