/**
 * Content Script
 * Orchestrates data extraction from the page and sends results to service worker
 */

// Import extractors - Note: Content scripts can't use ES modules directly in Manifest V3
// These functions are inlined during build or we load them differently

// For now, we'll define extraction logic inline and structure for modularity

/**
 * Main extraction orchestrator
 * @returns {Object} All extracted data
 */
function performFullExtraction() {
  try {
    return {
      structuredData: extractStructuredData(),
      metaTags: extractMetaTags(),
      contentQuality: extractContentQuality(),
      contentStructure: extractContentStructure(),
      trustSignals: extractTrustSignals(),
      pageInfo: {
        url: window.location.href,
        title: document.title,
        domain: window.location.hostname,
        pathname: window.location.pathname,
        extractedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('pdpIQ: Extraction error', error);
    return {
      error: error.message,
      pageInfo: {
        url: window.location.href,
        title: document.title
      }
    };
  }
}

// Listen for extraction requests from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_DATA') {
    console.log('pdpIQ: Starting extraction');
    const startTime = performance.now();

    const extractedData = performFullExtraction();

    const endTime = performance.now();
    extractedData.extractionTime = Math.round(endTime - startTime);

    console.log(`pdpIQ: Extraction complete in ${extractedData.extractionTime}ms`);

    // Send results back
    chrome.runtime.sendMessage({
      type: 'EXTRACTION_COMPLETE',
      data: extractedData,
      url: window.location.href,
      timestamp: Date.now()
    });

    sendResponse({ success: true });
  }

  if (message.type === 'PING') {
    sendResponse({ success: true, ready: true });
  }
});

// ==========================================
// STRUCTURED DATA EXTRACTOR
// ==========================================

function extractStructuredData() {
  const results = {
    jsonLd: [],
    microdata: [],
    schemas: {
      product: null,
      offer: null,
      aggregateRating: null,
      reviews: [],
      faq: null,
      breadcrumb: null,
      organization: null,
      brand: null,
      images: []
    }
  };

  // Extract JSON-LD
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent.trim());
      results.jsonLd.push({ valid: true, data });
      categorizeSchemas(data, results.schemas);
    } catch (e) {
      results.jsonLd.push({ valid: false, error: e.message });
    }
  });

  // Extract Microdata
  document.querySelectorAll('[itemscope]').forEach(scope => {
    if (scope.closest('[itemscope]') !== scope && scope.parentElement?.closest('[itemscope]')) return;
    const item = extractMicrodataItem(scope);
    if (item.type) results.microdata.push(item);
  });

  return results;
}

function extractMicrodataItem(scope) {
  const item = { type: scope.getAttribute('itemtype') || '', properties: {} };
  scope.querySelectorAll('[itemprop]').forEach(prop => {
    const propScope = prop.closest('[itemscope]');
    if (propScope !== scope && propScope !== prop) return;
    const name = prop.getAttribute('itemprop');
    const value = prop.hasAttribute('itemscope') ? extractMicrodataItem(prop) :
                  (prop.content || prop.href || prop.src || prop.textContent.trim());
    item.properties[name] = value;
  });
  return item;
}

function categorizeSchemas(data, schemas) {
  const items = data['@graph'] || [data];
  items.forEach(item => {
    if (!item || !item['@type']) return;
    const type = (Array.isArray(item['@type']) ? item['@type'][0] : item['@type']).toLowerCase();

    if (type === 'product') {
      schemas.product = {
        name: item.name,
        description: item.description,
        image: extractImageUrl(item.image),
        sku: item.sku,
        gtin: item.gtin || item.gtin13,
        brand: item.brand?.name || item.brand,
        hasOffer: !!item.offers,
        hasRating: !!item.aggregateRating
      };
      if (item.offers) {
        const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
        schemas.offer = offers.map(o => ({
          price: o.price || o.lowPrice,
          priceCurrency: o.priceCurrency,
          availability: o.availability
        }));
      }
      if (item.aggregateRating) {
        schemas.aggregateRating = {
          ratingValue: parseFloat(item.aggregateRating.ratingValue),
          reviewCount: parseInt(item.aggregateRating.reviewCount, 10) || null,
          bestRating: parseFloat(item.aggregateRating.bestRating) || 5
        };
      }
    }
    if (type === 'faqpage') {
      const questions = (item.mainEntity || []).filter(e => e['@type'] === 'Question');
      schemas.faq = {
        questionCount: questions.length,
        questions: questions.map(q => ({
          question: q.name,
          answer: q.acceptedAnswer?.text,
          answerLength: (q.acceptedAnswer?.text || '').length
        }))
      };
    }
    if (type === 'breadcrumblist') {
      schemas.breadcrumb = {
        itemCount: (item.itemListElement || []).length,
        items: (item.itemListElement || []).map(el => ({ position: el.position, name: el.name }))
      };
    }
    if (type === 'organization') {
      schemas.organization = { name: item.name, logo: extractImageUrl(item.logo), url: item.url };
    }
  });
}

function extractImageUrl(image) {
  if (!image) return null;
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) return image[0]?.url || image[0];
  return image.url || image.contentUrl;
}

// ==========================================
// META TAGS EXTRACTOR
// ==========================================

function extractMetaTags() {
  const og = { title: null, description: null, image: null, type: null, url: null, imageWidth: null, imageHeight: null, imageAlt: null };
  const twitter = { card: null, title: null, description: null, image: null };
  const standard = { description: null, keywords: null };

  document.querySelectorAll('meta[property^="og:"]').forEach(meta => {
    const prop = meta.getAttribute('property');
    const content = meta.content;
    if (prop === 'og:title') og.title = content;
    if (prop === 'og:description') og.description = content;
    if (prop === 'og:image') og.image = content;
    if (prop === 'og:type') og.type = content;
    if (prop === 'og:url') og.url = content;
    if (prop === 'og:image:width') og.imageWidth = parseInt(content, 10);
    if (prop === 'og:image:height') og.imageHeight = parseInt(content, 10);
    if (prop === 'og:image:alt') og.imageAlt = content;
  });

  document.querySelectorAll('meta[name^="twitter:"]').forEach(meta => {
    const name = meta.getAttribute('name');
    if (name === 'twitter:card') twitter.card = meta.content;
    if (name === 'twitter:title') twitter.title = meta.content;
    if (name === 'twitter:description') twitter.description = meta.content;
    if (name === 'twitter:image') twitter.image = meta.content;
  });

  const descMeta = document.querySelector('meta[name="description"]');
  standard.description = descMeta?.content;
  const keywordsMeta = document.querySelector('meta[name="keywords"]');
  standard.keywords = keywordsMeta?.content;

  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  const robotsMeta = document.querySelector('meta[name="robots"]');

  return {
    openGraph: {
      ...og,
      metrics: {
        hasTitle: !!og.title,
        titleLength: og.title?.length || 0,
        hasDescription: !!og.description,
        descriptionLength: og.description?.length || 0,
        hasImage: !!og.image,
        hasImageDimensions: !!(og.imageWidth && og.imageHeight),
        isProductType: og.type === 'product'
      }
    },
    twitterCards: {
      ...twitter,
      metrics: {
        hasCard: !!twitter.card,
        isLargeImage: twitter.card === 'summary_large_image',
        hasImage: !!twitter.image
      }
    },
    standard: {
      ...standard,
      metrics: {
        hasDescription: !!standard.description,
        descriptionLength: standard.description?.length || 0
      }
    },
    canonical: {
      url: canonical,
      present: !!canonical,
      matchesCurrentUrl: canonical ? normalizeUrl(canonical) === normalizeUrl(window.location.href) : null
    },
    robots: {
      content: robotsMeta?.content,
      noindex: (robotsMeta?.content || '').toLowerCase().includes('noindex'),
      isBlocked: (robotsMeta?.content || '').toLowerCase().includes('noindex')
    },
    technical: {
      isHttps: window.location.protocol === 'https:',
      hasLang: !!document.documentElement.lang
    }
  };
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    return (parsed.origin + parsed.pathname).toLowerCase().replace(/\/$/, '').replace('://www.', '://');
  } catch { return url.toLowerCase().replace(/\/$/, ''); }
}

// ==========================================
// CONTENT QUALITY EXTRACTOR
// ==========================================

function extractContentQuality() {
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

function getMainContentArea() {
  const selectors = ['main', '[role="main"]', 'article', '.product-detail', '.product-details', '.pdp-content', '#product-detail'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.length > 200) return el;
  }
  return document.body;
}

function analyzeDescription(content) {
  const selectors = ['.product-description', '.description', '#description', '[data-component="description"]'];
  let el = null;
  for (const sel of selectors) {
    el = document.querySelector(sel);
    if (el && el.innerText.length > 50) break;
  }
  const text = el?.innerText || '';
  const words = text.split(/\s+/).filter(w => w.length > 0);

  return {
    found: !!el,
    wordCount: words.length,
    hasEmotionalLanguage: /amazing|beautiful|perfect|love|best|incredible|stunning/i.test(text),
    hasBenefitStatements: /you (can|will|get)|helps? (you|your)|designed (for|to)/i.test(text),
    hasTechnicalTerms: /\d+\s*(mm|cm|in|kg|lb|mAh|GB|MHz|GHz)/i.test(text),
    lengthScore: words.length < 100 ? Math.round((words.length / 100) * 50) :
                 words.length < 200 ? 50 + Math.round(((words.length - 100) / 100) * 30) :
                 words.length < 400 ? 80 + Math.round(((words.length - 200) / 200) * 20) : 100
  };
}

function extractSpecifications() {
  const specs = [];
  const selectors = ['.specifications', '.specs', '.product-specs', '.technical-specs', '#specifications'];

  for (const sel of selectors) {
    const container = document.querySelector(sel);
    if (container) {
      container.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length >= 2) {
          specs.push({ name: cells[0].textContent.trim(), value: cells[1].textContent.trim(),
                       hasUnit: /\d+\s*(mm|cm|in|kg|lb|oz|mAh|GB|MHz)/i.test(cells[1].textContent) });
        }
      });
      container.querySelectorAll('dt').forEach(dt => {
        const dd = dt.nextElementSibling;
        if (dd?.tagName === 'DD') {
          specs.push({ name: dt.textContent.trim(), value: dd.textContent.trim(),
                       hasUnit: /\d+\s*(mm|cm|in|kg|lb|oz|mAh|GB|MHz)/i.test(dd.textContent) });
        }
      });
    }
  }

  return {
    found: specs.length > 0,
    count: specs.length,
    items: specs.slice(0, 30),
    countScore: specs.length < 5 ? Math.round((specs.length / 5) * 25) :
                specs.length < 10 ? 25 + Math.round(((specs.length - 5) / 5) * 25) :
                specs.length < 20 ? 50 + Math.round(((specs.length - 10) / 10) * 30) : 100
  };
}

function extractFeatures() {
  const features = [];
  const selectors = ['.features', '.product-features', '.key-features', '.highlights', '#features'];

  for (const sel of selectors) {
    const container = document.querySelector(sel);
    if (container) {
      container.querySelectorAll('li').forEach(li => {
        const text = li.textContent.trim();
        if (text.length > 10 && text.length < 500) features.push({ text });
      });
    }
  }

  return {
    found: features.length > 0,
    count: features.length,
    items: features.slice(0, 15),
    countScore: features.length < 3 ? Math.round((features.length / 3) * 25) :
                features.length < 5 ? 25 + Math.round(((features.length - 3) / 2) * 25) :
                features.length < 10 ? 50 + Math.round(((features.length - 5) / 5) * 30) : 100
  };
}

function extractFaqContent() {
  const faqs = [];
  const selectors = ['.faq', '.faqs', '#faq', '.frequently-asked-questions'];

  for (const sel of selectors) {
    const container = document.querySelector(sel);
    if (container) {
      container.querySelectorAll('.question, dt, summary, [data-question]').forEach(q => {
        const answer = q.nextElementSibling || q.closest('.faq-item')?.querySelector('.answer, dd');
        if (q.textContent.trim().length > 10) {
          faqs.push({ question: q.textContent.trim(), answerLength: (answer?.textContent || '').length });
        }
      });
    }
  }

  return {
    found: faqs.length > 0,
    count: faqs.length,
    countScore: faqs.length < 3 ? Math.round((faqs.length / 3) * 50) :
                faqs.length < 5 ? 50 + Math.round(((faqs.length - 3) / 2) * 25) : 100
  };
}

function extractProductDetails(text) {
  const lower = text.toLowerCase();
  return {
    hasDimensions: /\d+\s*(x|×)\s*\d+/i.test(text) || /dimension|size|length|width|height/i.test(lower),
    hasMaterials: /cotton|polyester|leather|metal|aluminum|steel|plastic|wood/i.test(lower) || /made (of|from)|material/i.test(lower),
    hasCareInstructions: /machine wash|hand wash|dry clean|care instruction/i.test(lower),
    hasWarranty: /warranty|guarantee/i.test(lower),
    hasCompatibility: /compatible (with|for)|works with|fits|designed for/i.test(lower)
  };
}

function analyzeTextMetrics(content) {
  const text = content?.innerText || '';
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  // Simple readability approximation
  let readabilityScore = 60;
  if (words.length > 0 && sentences.length > 0) {
    const avgWordsPerSentence = words.length / sentences.length;
    readabilityScore = Math.max(0, Math.min(100, 100 - (avgWordsPerSentence - 15) * 3));
  }

  return {
    totalWords: words.length,
    totalSentences: sentences.length,
    readabilityScore: Math.round(readabilityScore)
  };
}

// ==========================================
// CONTENT STRUCTURE EXTRACTOR
// ==========================================

function extractContentStructure() {
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

function analyzeHeadings() {
  const headings = {};
  for (let i = 1; i <= 6; i++) {
    const elements = document.querySelectorAll(`h${i}`);
    headings[`h${i}`] = { count: elements.length, texts: Array.from(elements).map(el => el.textContent.trim()).slice(0, 5) };
  }

  const issues = [];
  if (headings.h1.count === 0) issues.push('Missing H1');
  if (headings.h1.count > 1) issues.push('Multiple H1s');

  return {
    ...headings,
    hasH1: headings.h1.count > 0,
    hasSingleH1: headings.h1.count === 1,
    hierarchyIssues: issues,
    hierarchyValid: issues.length === 0
  };
}

function analyzeSemanticHTML() {
  const counts = {
    main: document.querySelectorAll('main').length,
    article: document.querySelectorAll('article').length,
    section: document.querySelectorAll('section').length,
    aside: document.querySelectorAll('aside').length,
    nav: document.querySelectorAll('nav').length,
    header: document.querySelectorAll('header').length,
    footer: document.querySelectorAll('footer').length
  };

  let score = 0;
  if (counts.main > 0) score += 30;
  if (counts.article > 0) score += 25;
  if (counts.section > 0) score += 20;
  if (counts.header > 0) score += 10;
  if (counts.nav > 0) score += 10;

  return { elements: counts, hasMain: counts.main > 0, hasArticle: counts.article > 0, score: Math.min(100, score) };
}

function calculateContentRatio() {
  const main = document.querySelector('main, [role="main"], article, .product-detail');
  if (!main) return { mainContentFound: false, ratio: 0, score: 0 };

  const ratio = main.innerText.length / document.body.innerText.length;
  return { mainContentFound: true, ratio: Math.round(ratio * 100) / 100, score: ratio > 0.5 ? 100 : Math.round(ratio * 200) };
}

function analyzeTables() {
  const tables = document.querySelectorAll('table');
  const hasProper = Array.from(tables).some(t => t.querySelector('thead, th'));
  return { tableCount: tables.length, hasProperTables: hasProper, score: hasProper ? 100 : tables.length > 0 ? 50 : 0 };
}

function analyzeLists() {
  const ul = document.querySelectorAll('ul').length;
  const ol = document.querySelectorAll('ol').length;
  return { unorderedCount: ul, orderedCount: ol, hasProperLists: ul > 0 || ol > 0, score: (ul + ol) > 0 ? 100 : 25 };
}

function analyzeAccessibility() {
  const aria = document.querySelectorAll('[aria-label]').length;
  const roles = document.querySelectorAll('[role]').length;
  const imgs = document.querySelectorAll('img');
  const withAlt = document.querySelectorAll('img[alt]').length;

  return {
    ariaLabels: aria,
    roles,
    imageCount: imgs.length,
    imagesWithAlt: withAlt,
    altCoverage: imgs.length > 0 ? withAlt / imgs.length : 1,
    score: Math.min(100, (aria > 0 ? 30 : 0) + (roles > 0 ? 20 : 0) + (imgs.length > 0 ? Math.round((withAlt / imgs.length) * 50) : 50))
  };
}

function analyzeImages() {
  const images = document.querySelectorAll('img');
  const withAlt = Array.from(images).filter(img => img.alt && img.alt.length >= 5);
  const ogImage = document.querySelector('meta[property="og:image"]')?.content;

  // Find primary product image
  const primarySelectors = ['.product-image img', '.product-photo img', '.gallery-main img', '.primary-image img'];
  let primary = null;
  for (const sel of primarySelectors) {
    primary = document.querySelector(sel);
    if (primary) break;
  }

  return {
    totalCount: images.length,
    withMeaningfulAlt: withAlt.length,
    altCoverage: images.length > 0 ? withAlt.length / images.length : 1,
    primaryImage: primary ? { src: primary.src, alt: primary.alt, hasAlt: !!primary.alt } : null,
    ogImagePresent: !!ogImage,
    ogImageUrl: ogImage,
    score: images.length > 0 ? Math.round((withAlt.length / images.length) * 100) : 100
  };
}

function assessJSDependency() {
  const hasReact = document.querySelector('#root, [data-reactroot]') !== null;
  const hasVue = document.querySelector('[data-v-app], [data-v-]') !== null;
  const mainInJs = document.querySelector('main, article')?.closest('#root, #app, [data-reactroot]');

  return {
    frameworkDetected: hasReact ? 'React' : hasVue ? 'Vue' : null,
    mainContentInJsContainer: !!mainInJs,
    dependencyLevel: mainInJs ? 'high' : (hasReact || hasVue) ? 'medium' : 'low',
    score: mainInJs ? 40 : (hasReact || hasVue) ? 60 : 100
  };
}

// ==========================================
// TRUST SIGNALS EXTRACTOR
// ==========================================

function extractTrustSignals() {
  return {
    reviews: extractReviewSignals(),
    brand: extractBrandSignals(),
    certifications: extractCertifications(),
    awards: extractAwards(),
    expertAttribution: detectExpertAttribution(),
    socialProof: extractSocialProof()
  };
}

function extractReviewSignals() {
  let rating = null, count = null;

  // From structured data
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      const items = data['@graph'] || [data];
      items.forEach(item => {
        if (item.aggregateRating) {
          rating = parseFloat(item.aggregateRating.ratingValue);
          count = parseInt(item.aggregateRating.reviewCount, 10) || parseInt(item.aggregateRating.ratingCount, 10);
        }
        if (item['@type'] === 'Product' && item.aggregateRating) {
          rating = parseFloat(item.aggregateRating.ratingValue);
          count = parseInt(item.aggregateRating.reviewCount, 10);
        }
      });
    } catch (e) {}
  });

  // Fallback to DOM
  if (!rating) {
    const ratingEl = document.querySelector('[itemprop="ratingValue"], .rating-value, .average-rating');
    if (ratingEl) rating = parseFloat(ratingEl.content || ratingEl.getAttribute('data-rating') || ratingEl.textContent);
  }
  if (!count) {
    const countEl = document.querySelector('[itemprop="reviewCount"], .review-count, .reviews-count');
    if (countEl) {
      const match = (countEl.content || countEl.textContent).match(/(\d[\d,]*)/);
      if (match) count = parseInt(match[1].replace(/,/g, ''), 10);
    }
  }

  return {
    count: count || 0,
    averageRating: rating,
    hasRating: rating !== null,
    hasReviews: count > 0,
    countScore: !count ? 0 : count < 10 ? Math.round((count / 10) * 25) :
                count < 50 ? 25 + Math.round(((count - 10) / 40) * 35) :
                count < 200 ? 60 + Math.round(((count - 50) / 150) * 25) : 100,
    ratingScore: !rating ? 0 : rating < 3 ? 25 : rating < 3.5 ? 50 : rating < 4 ? 75 : rating < 4.5 ? 90 : 100
  };
}

function extractBrandSignals() {
  let brandName = null;

  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      const items = data['@graph'] || [data];
      items.forEach(item => {
        if (item['@type'] === 'Product' && item.brand) {
          brandName = typeof item.brand === 'string' ? item.brand : item.brand.name;
        }
      });
    } catch (e) {}
  });

  if (!brandName) {
    const brandEl = document.querySelector('[itemprop="brand"]');
    brandName = brandEl?.content || brandEl?.textContent?.trim();
  }

  const h1 = document.querySelector('h1');
  const inH1 = h1 && brandName && h1.textContent.toLowerCase().includes(brandName.toLowerCase());
  const inTitle = brandName && document.title.toLowerCase().includes(brandName.toLowerCase());

  return {
    name: brandName,
    inH1,
    inTitle,
    clarity: !brandName ? 'missing' : (inH1 && inTitle) ? 'excellent' : (inH1 || inTitle) ? 'good' : 'present',
    score: !brandName ? 0 : 40 + (inH1 ? 30 : 0) + (inTitle ? 30 : 0)
  };
}

function extractCertifications() {
  const text = document.body.innerText.toLowerCase();
  const certs = [];
  const patterns = [
    ['FDA Approved', /fda\s*(?:approved|cleared)/i],
    ['CE Certified', /ce\s*(?:mark|certified)/i],
    ['UL Listed', /ul\s*(?:listed|certified)/i],
    ['Energy Star', /energy\s*star/i],
    ['ISO Certified', /iso\s*\d{4,}/i],
    ['USDA Organic', /usda\s*organic/i],
    ['Non-GMO', /non[\s-]?gmo/i],
    ['Fair Trade', /fair\s*trade/i],
    ['Cruelty Free', /cruelty[\s-]?free/i]
  ];

  patterns.forEach(([name, pattern]) => {
    if (pattern.test(text)) certs.push(name);
  });

  return { found: certs.length > 0, count: certs.length, items: certs,
           score: certs.length > 0 ? Math.min(100, 50 + certs.length * 15) : 0 };
}

function extractAwards() {
  const text = document.body.innerText.toLowerCase();
  const awards = [];
  const patterns = [
    ['Award Winner', /award[\s-]?winner/i],
    ['Best of', /best\s+of\s+\d{4}/i],
    ["Editor's Choice", /editor'?s?\s*choice/i],
    ['Best Seller', /best[\s-]?seller/i]
  ];

  patterns.forEach(([name, pattern]) => {
    if (pattern.test(text)) awards.push(name);
  });

  return { found: awards.length > 0, count: awards.length, items: awards,
           score: awards.length > 0 ? Math.min(100, 40 + awards.length * 20) : 0 };
}

function detectExpertAttribution() {
  const text = document.body.innerText.toLowerCase();
  const found = /expert\s+review|as\s+(?:seen|featured)\s+(?:in|on)|clinically\s+(?:tested|proven)|dermatologist/i.test(text);
  return { found, score: found ? 100 : 0 };
}

function extractSocialProof() {
  const text = document.body.innerText.toLowerCase();
  const soldMatch = text.match(/(\d[\d,]+)\s*(?:sold|purchased)/i);
  const customerMatch = text.match(/(\d[\d,]+)\s*(?:happy\s+)?customers?/i);

  return {
    soldCount: soldMatch ? parseInt(soldMatch[1].replace(/,/g, ''), 10) : null,
    customerCount: customerMatch ? parseInt(customerMatch[1].replace(/,/g, ''), 10) : null,
    testimonials: document.querySelector('.testimonial, .testimonials') !== null
  };
}

// Log that content script is loaded
console.log('pdpIQ: Content script loaded');
