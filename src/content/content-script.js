/**
 * Content Script
 * Orchestrates data extraction from the page and sends results to service worker
 */

// Import extractors - Note: Content scripts can't use ES modules directly in Manifest V3
// These functions are inlined during build or we load them differently

// For now, we'll define extraction logic inline and structure for modularity

// ==========================================
// JSON-LD CACHE (performance optimization)
// Parses JSON-LD scripts once and reuses across all extractors
// ==========================================

let _jsonLdCache = null;

/**
 * Get parsed JSON-LD data (cached)
 * Parses all JSON-LD scripts once and caches the result
 * @returns {Array} Array of {valid, data, error} objects
 */
function getParsedJsonLd() {
  if (_jsonLdCache !== null) return _jsonLdCache;

  _jsonLdCache = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent.trim());
      _jsonLdCache.push({ valid: true, data });
    } catch (e) {
      _jsonLdCache.push({ valid: false, error: e.message });
    }
  });

  return _jsonLdCache;
}

/**
 * Iterate over all schema items from JSON-LD (generator)
 * Handles @graph arrays, top-level arrays, and single objects
 * @param {Array|null} typeFilter - Optional array of types to filter (lowercase)
 * @yields {{type: string, item: Object}}
 */
function* iterateSchemaItems(typeFilter = null) {
  const jsonLdData = getParsedJsonLd();

  for (const { valid, data } of jsonLdData) {
    if (!valid) continue;

    // Handle @graph, arrays, and single objects
    let items;
    if (data['@graph']) {
      items = data['@graph'];
    } else if (Array.isArray(data)) {
      items = data;
    } else {
      items = [data];
    }

    for (const item of items) {
      if (!item || !item['@type']) continue;

      const type = (Array.isArray(item['@type']) ? item['@type'][0] : item['@type']).toLowerCase();

      if (!typeFilter || typeFilter.includes(type)) {
        yield { type, item };
      }
    }
  }
}

/**
 * Clear JSON-LD cache (call after extraction completes)
 */
function clearJsonLdCache() {
  _jsonLdCache = null;
}

/**
 * Main extraction orchestrator
 * @returns {Object} All extracted data
 */
function performFullExtraction() {
  // Clear JSON-LD cache for fresh extraction
  clearJsonLdCache();

  try {
    const result = {
      structuredData: extractStructuredData(),
      metaTags: extractMetaTags(),
      contentQuality: extractContentQuality(),
      contentStructure: extractContentStructure(),
      trustSignals: extractTrustSignals(),
      aiDiscoverability: extractAIDiscoverabilitySignals(),
      pageInfo: {
        url: window.location.href,
        title: document.title,
        domain: window.location.hostname,
        pathname: window.location.pathname,
        extractedAt: new Date().toISOString()
      }
    };

    // Clear cache after extraction to free memory
    clearJsonLdCache();
    return result;
  } catch (error) {
    console.error('pdpIQ: Extraction error', error);
    clearJsonLdCache();
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

    // Send results back (include requestId to prevent race conditions)
    chrome.runtime.sendMessage({
      type: 'EXTRACTION_COMPLETE',
      data: extractedData,
      url: window.location.href,
      timestamp: Date.now(),
      requestId: message.requestId
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

  // Extract JSON-LD (uses cached parsing for performance)
  const parsedJsonLd = getParsedJsonLd();
  parsedJsonLd.forEach(({ valid, data, error }) => {
    if (valid) {
      results.jsonLd.push({ valid: true, data });
      categorizeSchemas(data, results.schemas);
    } else {
      results.jsonLd.push({ valid: false, error });
    }
  });

  // Extract Microdata
  document.querySelectorAll('[itemscope]').forEach(scope => {
    if (scope.closest('[itemscope]') !== scope && scope.parentElement?.closest('[itemscope]')) return;
    const item = extractMicrodataItem(scope);
    if (item.type) results.microdata.push(item);
  });

  // Categorize microdata schemas
  categorizeMicrodataSchemas(results.microdata, results.schemas);

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
  // Handle three formats:
  // 1. Array at top level: [{@type: "Product"}, {@type: "Organization"}]
  // 2. Object with @graph: {"@graph": [{@type: "Product"}, ...]}
  // 3. Single object: {@type: "Product"}
  let items;
  if (Array.isArray(data)) {
    items = data;
  } else if (data['@graph']) {
    items = data['@graph'];
  } else {
    items = [data];
  }

  items.forEach(item => {
    if (!item || !item['@type']) return;
    const type = (Array.isArray(item['@type']) ? item['@type'][0] : item['@type']).toLowerCase();

    if (type === 'product' || type === 'productgroup') {
      const brandName = extractBrandName(item.brand) || extractBrandName(item.manufacturer);
      schemas.product = {
        name: item.name,
        description: item.description,
        image: extractImageUrl(item.image),
        sku: item.sku || item.productGroupID,
        gtin: item.gtin || item.gtin13 || item.gtin14 || item.gtin12 || item.gtin8,
        mpn: item.mpn,
        brand: brandName,
        hasOffer: !!item.offers || !!(item.hasVariant && item.hasVariant.length > 0),
        hasRating: !!item.aggregateRating,
        isProductGroup: type === 'productgroup'
      };
      // Extract offers - check direct offers first, then hasVariant for ProductGroup
      let offersSource = item.offers;
      if (!offersSource && item.hasVariant) {
        // ProductGroup: extract offers from first variant that has them
        const variants = Array.isArray(item.hasVariant) ? item.hasVariant : [item.hasVariant];
        for (const variant of variants) {
          if (variant && variant.offers) {
            offersSource = variant.offers;
            break;
          }
        }
      }
      if (offersSource) {
        const offers = Array.isArray(offersSource) ? offersSource : [offersSource];
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
      // Extract nested brand/organization schemas
      if (!schemas.brand && item.brand) {
        const brandObj = Array.isArray(item.brand) ? item.brand[0] : item.brand;
        if (brandObj && typeof brandObj === 'object' && brandObj['@type']) {
          schemas.brand = {
            name: brandObj.name || null,
            logo: extractImageUrl(brandObj.logo) || null,
            url: brandObj.url || null,
            source: 'product-nested'
          };
        }
      }
      if (!schemas.organization && item.manufacturer) {
        const mfgObj = Array.isArray(item.manufacturer) ? item.manufacturer[0] : item.manufacturer;
        if (mfgObj && typeof mfgObj === 'object' && mfgObj['@type']) {
          schemas.organization = {
            name: mfgObj.name || null,
            logo: extractImageUrl(mfgObj.logo) || null,
            url: mfgObj.url || null,
            source: 'product-nested'
          };
        }
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

/**
 * Extract brand/organization name from various schema formats
 * Handles: string, object with name, array of objects, array of strings
 * @param {any} brandData - Brand data in various formats
 * @returns {string|null} Brand name or null
 */
function extractBrandName(brandData) {
  if (!brandData) return null;
  if (typeof brandData === 'string') return brandData;
  if (Array.isArray(brandData)) {
    if (brandData.length === 0) return null;
    const first = brandData[0];
    if (typeof first === 'string') return first;
    return first?.name || null;
  }
  return brandData?.name || null;
}

function categorizeMicrodataSchemas(microdataItems, schemas) {
  microdataItems.forEach(item => {
    if (!item.type) return;
    const type = item.type.replace(/^https?:\/\/schema\.org\//, '').toLowerCase();

    if ((type === 'product' || type === 'productgroup') && !schemas.product) {
      schemas.product = {
        name: item.properties.name || null,
        description: item.properties.description || null,
        image: item.properties.image || null,
        sku: item.properties.sku || item.properties.productGroupID || null,
        brand: extractBrandName(item.properties.brand?.properties?.name || item.properties.brand) || extractBrandName(item.properties.manufacturer),
        hasOffer: !!item.properties.offers || !!item.properties.hasVariant,
        hasRating: !!item.properties.aggregateRating,
        isProductGroup: type === 'productgroup',
        source: 'microdata'
      };
      // Extract nested offers from Product
      if (item.properties.offers && !schemas.offer) {
        const offers = Array.isArray(item.properties.offers) ? item.properties.offers : [item.properties.offers];
        schemas.offer = offers.map(o => ({
          price: o.properties?.price || o.properties?.lowPrice || null,
          priceCurrency: o.properties?.priceCurrency || null,
          availability: o.properties?.availability || null,
          source: 'microdata'
        }));
      }
      // Extract nested aggregateRating from Product
      if (item.properties.aggregateRating && !schemas.aggregateRating) {
        const rating = item.properties.aggregateRating;
        schemas.aggregateRating = {
          ratingValue: parseFloat(rating.properties?.ratingValue) || null,
          reviewCount: parseInt(rating.properties?.reviewCount, 10) || null,
          ratingCount: parseInt(rating.properties?.ratingCount, 10) || null,
          bestRating: parseFloat(rating.properties?.bestRating) || 5,
          source: 'microdata'
        };
      }
      // Extract nested reviews from Product
      if (item.properties.review && schemas.reviews.length === 0) {
        const reviews = Array.isArray(item.properties.review) ? item.properties.review : [item.properties.review];
        schemas.reviews = reviews.map(r => ({
          author: r.properties?.author?.properties?.name || r.properties?.author || null,
          datePublished: r.properties?.datePublished || null,
          reviewBody: r.properties?.reviewBody || r.properties?.description || null,
          reviewRating: r.properties?.reviewRating ? {
            ratingValue: parseFloat(r.properties.reviewRating.properties?.ratingValue) || null,
            bestRating: parseFloat(r.properties.reviewRating.properties?.bestRating) || 5
          } : null,
          source: 'microdata'
        }));
      }
    }

    if (type === 'offer' && !schemas.offer) {
      schemas.offer = [{
        price: item.properties.price || item.properties.lowPrice || null,
        priceCurrency: item.properties.priceCurrency || null,
        availability: item.properties.availability || null,
        source: 'microdata'
      }];
    }

    if (type === 'aggregaterating' && !schemas.aggregateRating) {
      schemas.aggregateRating = {
        ratingValue: parseFloat(item.properties.ratingValue) || null,
        reviewCount: parseInt(item.properties.reviewCount, 10) || null,
        ratingCount: parseInt(item.properties.ratingCount, 10) || null,
        bestRating: parseFloat(item.properties.bestRating) || 5,
        source: 'microdata'
      };
    }

    if (type === 'review') {
      schemas.reviews.push({
        author: item.properties.author?.properties?.name || item.properties.author || null,
        datePublished: item.properties.datePublished || null,
        reviewBody: item.properties.reviewBody || item.properties.description || null,
        reviewRating: item.properties.reviewRating ? {
          ratingValue: parseFloat(item.properties.reviewRating.properties?.ratingValue) || null,
          bestRating: parseFloat(item.properties.reviewRating.properties?.bestRating) || 5
        } : null,
        source: 'microdata'
      });
    }

    if (type === 'faqpage' && !schemas.faq) {
      const mainEntity = item.properties.mainEntity || [];
      const questions = Array.isArray(mainEntity) ? mainEntity : [mainEntity];
      schemas.faq = {
        questionCount: questions.length,
        questions: questions.filter(q => q.type?.includes('Question')).map(q => ({
          question: q.properties?.name || null,
          answer: q.properties?.acceptedAnswer?.properties?.text || null,
          answerLength: (q.properties?.acceptedAnswer?.properties?.text || '').length
        })),
        source: 'microdata'
      };
    }

    if (type === 'breadcrumblist' && !schemas.breadcrumb) {
      const listElements = item.properties.itemListElement || [];
      const elements = Array.isArray(listElements) ? listElements : [listElements];
      schemas.breadcrumb = {
        itemCount: elements.length,
        items: elements.map(el => ({
          position: el.properties?.position || null,
          name: el.properties?.name || null,
          url: el.properties?.item || null
        })),
        source: 'microdata'
      };
    }

    if (type === 'organization' && !schemas.organization) {
      schemas.organization = {
        name: item.properties.name || null,
        logo: item.properties.logo?.properties?.url || item.properties.logo || null,
        url: item.properties.url || null,
        source: 'microdata'
      };
    }

    if (type === 'brand' && !schemas.brand) {
      schemas.brand = {
        name: item.properties.name || null,
        logo: item.properties.logo?.properties?.url || item.properties.logo || null,
        url: item.properties.url || null,
        source: 'microdata'
      };
    }

    if (type === 'imageobject') {
      schemas.images.push({
        url: item.properties.url || item.properties.contentUrl || null,
        caption: item.properties.caption || null,
        width: item.properties.width || null,
        height: item.properties.height || null,
        source: 'microdata'
      });
    }
  });
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
  const selectors = [
    '.product-description', '.description', '#description', '[data-component="description"]',
    // Shopify selectors
    '.product-single__description', '.product__description', '.rte', '.rte-formatter',
    // Additional Shopify theme patterns
    '.product__info-description', '.product-single__content', '.product__content',
    '[data-product-description]', '#tab-description', '.tab-content[data-tab="description"]',
    '.product-details__description', '.accordion__content', '.collapsible-content',
    // Attribute-based fallbacks
    '[class*="product-description"]', '[class*="product_description"]',
    '[id*="product-description"]', '[id*="ProductDescription"]'
  ];
  let el = null;
  for (const sel of selectors) {
    try {
      el = document.querySelector(sel);
      if (el && el.innerText.length > 50) break;
      el = null;
    } catch (e) {
      // Invalid selector, skip
    }
  }

  let text = el?.innerText || '';
  let source = el ? 'dom' : null;

  // Fallback: Extract description from JSON-LD structured data if no DOM element found
  if (!el || text.length < 50) {
    const schemaDescription = extractDescriptionFromSchema();
    if (schemaDescription && schemaDescription.length > text.length) {
      text = schemaDescription;
      source = 'schema';
    }
  }

  const words = text.split(/\s+/).filter(w => w.length > 0);

  return {
    found: !!el || text.length > 0,
    source: source,
    wordCount: words.length,
    hasEmotionalLanguage: /amazing|beautiful|perfect|love|best|incredible|stunning/i.test(text),
    hasBenefitStatements: /you (can|will|get)|helps? (you|your)|designed (for|to)/i.test(text),
    hasTechnicalTerms: /\d+\s*(mm|cm|in|kg|lb|mAh|GB|MHz|GHz)/i.test(text),
    lengthScore: words.length < 100 ? Math.round((words.length / 100) * 50) :
                 words.length < 200 ? 50 + Math.round(((words.length - 100) / 100) * 30) :
                 words.length < 400 ? 80 + Math.round(((words.length - 200) / 200) * 20) : 100
  };
}

/**
 * Extract description from JSON-LD Product schema as fallback
 * Uses cached JSON-LD data for performance
 * @returns {string|null} Description text or null
 */
function extractDescriptionFromSchema() {
  for (const { item } of iterateSchemaItems(['product'])) {
    if (item.description && typeof item.description === 'string') {
      // Use textarea for safe HTML entity decoding (doesn't execute scripts)
      const textarea = document.createElement('textarea');
      textarea.innerHTML = item.description;
      // Get decoded text, then strip any remaining HTML tags
      const decoded = textarea.value;
      return decoded.replace(/<[^>]*>/g, '').trim();
    }
  }

  return null;
}

function extractSpecifications() {
  const specs = [];
  const selectors = [
    '.specifications', '.specs', '.product-specs', '.technical-specs', '#specifications',
    // Shopify selectors
    '.product__specs', '.product-single__specs', '.product-specifications',
    '.product-attributes', '.product-details', '.product-meta',
    '[data-product-specs]', '[data-specifications]',
    // Attribute-based fallbacks
    '[class*="specification"]', '[class*="specs"]', '[class*="attributes"]'
  ];

  for (const sel of selectors) {
    try {
      const container = document.querySelector(sel);
      if (container) {
        extractSpecsFromContainer(container, specs);
      }
    } catch (e) {
      // Invalid selector, skip
    }
  }

  // Fallback: Look for spec-like lists in content areas (li with "Label: Value" pattern)
  if (specs.length === 0) {
    const contentSelectors = [
      '.product-single__description', '.product__description', '.product-description',
      '.rte', '.rte-formatter', '.product__content', '.product-single__content',
      '.description', '#description', 'main', '[role="main"]', 'article'
    ];
    for (const sel of contentSelectors) {
      try {
        const containers = document.querySelectorAll(sel);
        containers.forEach(container => {
          if (specs.length === 0) {
            extractSpecsFromListItems(container, specs);
          }
        });
        if (specs.length > 0) break;
      } catch (e) {
        // Invalid selector, skip
      }
    }
  }

  // Final fallback: Search entire body for spec-like list items
  if (specs.length === 0) {
    extractSpecsFromListItems(document.body, specs);
  }

  // Fallback: Extract from JSON-LD additionalProperty if still no specs
  if (specs.length === 0) {
    extractSpecsFromSchema(specs);
  }

  let source = specs.length > 0 ? (specs[0].source || 'dom') : null;

  return {
    found: specs.length > 0,
    source: source,
    count: specs.length,
    items: specs.slice(0, 30),
    countScore: specs.length < 5 ? Math.round((specs.length / 5) * 25) :
                specs.length < 10 ? 25 + Math.round(((specs.length - 5) / 5) * 25) :
                specs.length < 20 ? 50 + Math.round(((specs.length - 10) / 10) * 30) : 100
  };
}

function extractSpecsFromContainer(container, specs) {
  // Extract from tables
  container.querySelectorAll('tr').forEach(row => {
    const cells = row.querySelectorAll('td, th');
    if (cells.length >= 2) {
      const name = cells[0].textContent.trim();
      const value = cells[1].textContent.trim();
      if (name && value && name.length < 100 && value.length < 200) {
        specs.push({ name, value, hasUnit: hasUnitPattern(value) });
      }
    }
  });

  // Extract from definition lists
  container.querySelectorAll('dt').forEach(dt => {
    const dd = dt.nextElementSibling;
    if (dd?.tagName === 'DD') {
      const name = dt.textContent.trim();
      const value = dd.textContent.trim();
      if (name && value) {
        specs.push({ name, value, hasUnit: hasUnitPattern(value) });
      }
    }
  });

  // Extract from list items with "Label: Value" pattern
  extractSpecsFromListItems(container, specs);
}

function extractSpecsFromListItems(container, specs) {
  container.querySelectorAll('li').forEach(li => {
    // Skip list items that are likely navigation or too short
    const fullText = li.textContent.trim().replace(/\s+/g, ' ');
    if (fullText.length < 5 || fullText.length > 300) return;

    // Pattern 1: <strong>Label:</strong> Value or <b>Label:</b> Value
    const strong = li.querySelector('strong, b');
    if (strong) {
      const labelText = strong.textContent.trim();
      const label = labelText.replace(/:$/, '').trim();
      // Get value by removing the label from full text
      let value = fullText;
      const labelIndex = value.indexOf(labelText);
      if (labelIndex !== -1) {
        value = value.substring(labelIndex + labelText.length);
      }
      value = value.trim().replace(/^:\s*/, '').trim();

      if (label && value && label.length >= 2 && label.length < 50 && value.length >= 1 && value.length < 200) {
        // Avoid adding duplicates
        if (!specs.some(s => s.name === label)) {
          specs.push({ name: label, value, hasUnit: hasUnitPattern(value) });
        }
        return;
      }
    }

    // Pattern 2: "Label: Value" in plain text (colon-separated)
    const colonMatch = fullText.match(/^([^:]{2,40}):\s*(.{1,150})$/);
    if (colonMatch) {
      const name = colonMatch[1].trim();
      const value = colonMatch[2].trim();
      if (name && value && !specs.some(s => s.name === name)) {
        specs.push({ name, value, hasUnit: hasUnitPattern(value) });
      }
    }
  });
}

function extractSpecsFromSchema(specs) {
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent.trim());
      const items = data['@graph'] || [data];
      items.forEach(item => {
        if (!item) return;
        const type = (Array.isArray(item['@type']) ? item['@type'][0] : item['@type'] || '').toLowerCase();
        if (type === 'product' || type === 'productgroup') {
          // Extract from additionalProperty
          if (item.additionalProperty && Array.isArray(item.additionalProperty)) {
            item.additionalProperty.forEach(prop => {
              if (prop.name && prop.value) {
                specs.push({ name: prop.name, value: String(prop.value), hasUnit: hasUnitPattern(String(prop.value)), source: 'schema' });
              }
            });
          }
          // Extract common spec fields
          const specFields = ['weight', 'width', 'height', 'depth', 'color', 'material', 'model', 'mpn', 'gtin', 'gtin13', 'gtin14', 'isbn'];
          specFields.forEach(field => {
            if (item[field]) {
              const value = typeof item[field] === 'object' ? (item[field].value || JSON.stringify(item[field])) : String(item[field]);
              specs.push({ name: field.charAt(0).toUpperCase() + field.slice(1), value, hasUnit: hasUnitPattern(value), source: 'schema' });
            }
          });
        }
      });
    } catch (e) {
      // Invalid JSON, skip
    }
  });
}

function hasUnitPattern(text) {
  return /\d+\s*(mm|cm|m|in|inch|"|ft|kg|lb|lbs|oz|g|ml|L|gal|gallon|mAh|GB|TB|MHz|GHz|W|V|A|hp|HP|GPH|GPM|PSI|°F|°C|ft³|CFM)/i.test(text);
}

function extractFeatures() {
  const features = [];
  const selectors = [
    '.features', '.product-features', '.key-features', '.highlights', '#features',
    // Shopify selectors
    '.product__features', '.product-single__features', '.feature-list',
    '[data-product-features]', '[data-features]',
    // Attribute-based fallbacks
    '[class*="feature"]', '[class*="benefit"]', '[class*="highlight"]'
  ];

  for (const sel of selectors) {
    try {
      const container = document.querySelector(sel);
      if (container) {
        extractFeaturesFromContainer(container, features);
      }
    } catch (e) {
      // Invalid selector, skip
    }
  }

  // Fallback: Look for feature lists in content areas
  if (features.length === 0) {
    // Find lists that follow "feature" or "benefit" headings
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b');
    headings.forEach(heading => {
      const text = heading.textContent.toLowerCase();
      if (text.includes('feature') || text.includes('benefit') || text.includes('highlight') || text.includes('why choose')) {
        // Look for the next ul/ol sibling or within parent
        let list = heading.nextElementSibling;
        while (list && !['UL', 'OL'].includes(list.tagName)) {
          list = list.nextElementSibling;
        }
        if (list) {
          extractFeaturesFromContainer(list, features);
        }
        // Also check parent for ul
        const parent = heading.closest('div, section, article');
        if (parent && features.length === 0) {
          const ul = parent.querySelector('ul, ol');
          if (ul) extractFeaturesFromContainer(ul, features);
        }
      }
    });
  }

  // Fallback: Look for feature-like lists in description area (items with dash/em-dash pattern, not colon pattern)
  if (features.length === 0) {
    const contentSelectors = [
      '.product-single__description', '.product__description', '.product-description',
      '.rte', '.description', '#description', 'main', 'article'
    ];
    for (const sel of contentSelectors) {
      try {
        const container = document.querySelector(sel);
        if (container) {
          extractFeatureLikeItems(container, features);
          if (features.length > 0) break;
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
  }

  let source = features.length > 0 ? (features[0].source || 'dom') : null;

  return {
    found: features.length > 0,
    source: source,
    count: features.length,
    items: features.slice(0, 15),
    countScore: features.length < 3 ? Math.round((features.length / 3) * 25) :
                features.length < 5 ? 25 + Math.round(((features.length - 3) / 2) * 25) :
                features.length < 10 ? 50 + Math.round(((features.length - 5) / 5) * 30) : 100
  };
}

function extractFeaturesFromContainer(container, features) {
  container.querySelectorAll('li').forEach(li => {
    const text = li.textContent.trim().replace(/\s+/g, ' ');
    if (text.length > 15 && text.length < 500) {
      // Avoid duplicates
      if (!features.some(f => f.text === text)) {
        features.push({ text });
      }
    }
  });
}

function extractFeatureLikeItems(container, features) {
  // Look for list items that are features (not specs)
  // Features typically: have dash/em-dash, describe benefits, don't have "Label: Value" pattern
  container.querySelectorAll('li').forEach(li => {
    const text = li.textContent.trim().replace(/\s+/g, ' ');
    if (text.length < 20 || text.length > 400) return;

    // Skip if it looks like a spec (has colon with short label and value)
    if (/^[^:]{2,30}:\s*\S/.test(text)) return;

    // Check for feature patterns
    const hasStrong = li.querySelector('strong, b');
    const hasDash = /[–—-]\s/.test(text); // em-dash, en-dash, or hyphen followed by space

    // Feature pattern: <strong>Name</strong> – description
    if (hasStrong && hasDash) {
      if (!features.some(f => f.text === text)) {
        features.push({ text });
      }
      return;
    }

    // Feature pattern: starts with action verb or benefit language
    const benefitPattern = /^(enjoy|experience|get|includes?|provides?|offers?|delivers?|ensures?|features?|designed|built|made|perfect|ideal|great|easy|quick|fast|reliable|durable|powerful|efficient)/i;
    if (benefitPattern.test(text)) {
      if (!features.some(f => f.text === text)) {
        features.push({ text });
      }
    }
  });
}

function extractFaqContent() {
  const faqs = [];
  let source = null;
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
      if (faqs.length > 0) source = 'dom';
    }
  }

  // Fallback: Extract FAQs from FAQPage schema
  if (faqs.length === 0) {
    const schemaFaqs = extractFaqFromSchema();
    if (schemaFaqs.length > 0) {
      faqs.push(...schemaFaqs);
      source = 'schema';
    }
  }

  return {
    found: faqs.length > 0,
    source: source,
    count: faqs.length,
    items: faqs.slice(0, 10), // Include the actual FAQ items for details display
    countScore: faqs.length < 3 ? Math.round((faqs.length / 3) * 50) :
                faqs.length < 5 ? 50 + Math.round(((faqs.length - 3) / 2) * 25) : 100
  };
}

/**
 * Extract FAQs from FAQPage schema as fallback
 * @returns {Array} Array of FAQ objects
 */
function extractFaqFromSchema() {
  const faqs = [];

  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent.trim());
      const items = data['@graph'] || [data];
      items.forEach(item => {
        if (!item) return;
        const type = (Array.isArray(item['@type']) ? item['@type'][0] : item['@type'] || '').toLowerCase();
        if (type === 'faqpage' && item.mainEntity) {
          const questions = Array.isArray(item.mainEntity) ? item.mainEntity : [item.mainEntity];
          questions.forEach(q => {
            if (q['@type'] === 'Question' && q.name) {
              faqs.push({
                question: q.name,
                answerLength: (q.acceptedAnswer?.text || '').length,
                source: 'schema'
              });
            }
          });
        }
      });
    } catch (e) {
      // Invalid JSON, skip
    }
  });

  return faqs;
}

function extractProductDetails(text) {
  const lower = text.toLowerCase();
  const details = {
    hasDimensions: false,
    dimensionsText: null,
    hasMaterials: false,
    materialsText: null,
    hasCareInstructions: false,
    careText: null,
    hasWarranty: false,
    warrantyText: null,
    hasCompatibility: false,
    compatibilityText: null,
    source: 'dom'
  };

  // Extract dimensions with actual matched text
  const dimensionPatterns = [
    /(\d+(?:\.\d+)?\s*(?:"|in|inch|inches|cm|mm|m|ft|feet)\s*(?:x|×)\s*\d+(?:\.\d+)?\s*(?:"|in|inch|inches|cm|mm|m|ft|feet)(?:\s*(?:x|×)\s*\d+(?:\.\d+)?\s*(?:"|in|inch|inches|cm|mm|m|ft|feet))?)/i,
    /dimensions?[:\s]+([^.\n]{5,50})/i,
    /size[:\s]+([^.\n]{5,50})/i,
    /((?:length|width|height|depth)[:\s]+\d+(?:\.\d+)?\s*(?:"|in|inch|cm|mm|m|ft))/i
  ];
  for (const pattern of dimensionPatterns) {
    const match = text.match(pattern);
    if (match) {
      details.hasDimensions = true;
      details.dimensionsText = match[1] ? match[1].trim().substring(0, 60) : match[0].trim().substring(0, 60);
      break;
    }
  }

  // Extract materials with actual matched text
  const materialPatterns = [
    /(?:made (?:of|from|with)|material[:\s]+|constructed (?:of|from))([^.,\n]{3,50})/i,
    /\b((?:100%\s+)?(?:cotton|polyester|leather|genuine leather|faux leather|metal|aluminum|aluminium|steel|stainless steel|plastic|wood|wooden|bamboo|ceramic|glass|silicone|nylon|rubber|canvas|suede|velvet|linen|silk|wool|cashmere|denim|mesh|foam|titanium|copper|brass|iron|oak|maple|walnut|pine|mahogany|teak|acrylic|polycarbonate|abs|pvc|eva|neoprene|lycra|spandex|microfiber|fleece|polyurethane|pu leather))\b/i
  ];
  for (const pattern of materialPatterns) {
    const match = text.match(pattern);
    if (match) {
      details.hasMaterials = true;
      details.materialsText = match[1] ? match[1].trim().substring(0, 50) : match[0].trim().substring(0, 50);
      break;
    }
  }

  // Extract care instructions with actual matched text
  const carePatterns = [
    /(machine wash[^.]{0,30})/i,
    /(hand wash[^.]{0,30})/i,
    /(dry clean[^.]{0,30})/i,
    /care instructions?[:\s]+([^.\n]{5,60})/i,
    /(wash(?:able)? (?:in|on|with)[^.]{0,30})/i,
    /(do not (?:wash|bleach|iron|tumble dry)[^.]{0,30})/i,
    /(wipe clean[^.]{0,30})/i
  ];
  for (const pattern of carePatterns) {
    const match = text.match(pattern);
    if (match) {
      details.hasCareInstructions = true;
      details.careText = match[1] ? match[1].trim().substring(0, 60) : match[0].trim().substring(0, 60);
      break;
    }
  }

  // Extract warranty with actual matched text (context-aware to avoid false positives)
  const warrantyPatterns = [
    /(\d+[\s-]*(?:year|month|day|yr|mo)[\s-]*(?:limited\s+)?(?:warranty|guarantee))/i,
    /((?:limited\s+)?(?:lifetime|full)\s+(?:warranty|guarantee))/i,
    /(?:warranty|guarantee)[:\s]+([^.\n]{5,50})/i,
    /(warranted? (?:for|against)[^.]{0,40})/i,
    /((?:manufacturer'?s?|factory)\s+(?:warranty|guarantee)[^.]{0,30})/i
  ];
  // Negative patterns to avoid false positives
  const warrantyNegative = /no warranty|without warranty|warranty (?:not|does not)|void(?:s|ed)? (?:the\s+)?warranty/i;

  if (!warrantyNegative.test(lower)) {
    for (const pattern of warrantyPatterns) {
      const match = text.match(pattern);
      if (match) {
        details.hasWarranty = true;
        details.warrantyText = match[1] ? match[1].trim().substring(0, 50) : match[0].trim().substring(0, 50);
        break;
      }
    }
  }

  // Extract compatibility with actual matched text
  const compatPatterns = [
    /compatible (?:with|for)[:\s]*([^.\n]{5,80})/i,
    /works with[:\s]*([^.\n]{5,80})/i,
    /fits[:\s]*([^.\n]{5,80})/i,
    /designed for[:\s]*([^.\n]{5,80})/i,
    /(?:supports?|for use with)[:\s]*([^.\n]{5,80})/i
  ];
  for (const pattern of compatPatterns) {
    const match = text.match(pattern);
    if (match) {
      details.hasCompatibility = true;
      details.compatibilityText = match[1] ? match[1].trim().substring(0, 80) : match[0].trim().substring(0, 80);
      break;
    }
  }

  // Fallback: Extract from Product schema additionalProperty
  extractProductDetailsFromSchema(details);

  return details;
}

/**
 * Extract product details from Product schema additionalProperty as fallback
 * @param {Object} details - The details object to populate
 */
function extractProductDetailsFromSchema(details) {
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent.trim());
      const items = data['@graph'] || [data];
      items.forEach(item => {
        if (!item) return;
        const type = (Array.isArray(item['@type']) ? item['@type'][0] : item['@type'] || '').toLowerCase();
        if (type === 'product' || type === 'productgroup') {
          // Check direct properties
          if (!details.hasDimensions) {
            const dims = [];
            if (item.width) dims.push(`W: ${formatSchemaValue(item.width)}`);
            if (item.height) dims.push(`H: ${formatSchemaValue(item.height)}`);
            if (item.depth) dims.push(`D: ${formatSchemaValue(item.depth)}`);
            if (dims.length > 0) {
              details.hasDimensions = true;
              details.dimensionsText = dims.join(', ');
              details.source = 'schema';
            }
          }
          if (!details.hasMaterials && item.material) {
            details.hasMaterials = true;
            details.materialsText = formatSchemaValue(item.material).substring(0, 50);
            details.source = 'schema';
          }
          if (!details.hasWarranty && item.warranty) {
            details.hasWarranty = true;
            details.warrantyText = formatSchemaValue(item.warranty).substring(0, 50);
            details.source = 'schema';
          }

          // Check additionalProperty array
          if (item.additionalProperty && Array.isArray(item.additionalProperty)) {
            item.additionalProperty.forEach(prop => {
              const name = (prop.name || '').toLowerCase();
              const value = String(prop.value || '');

              if (!details.hasDimensions && /dimension|size|length|width|height|depth/i.test(name)) {
                details.hasDimensions = true;
                details.dimensionsText = `${prop.name}: ${value}`.substring(0, 60);
                details.source = 'schema';
              }
              if (!details.hasMaterials && /material|fabric|composition/i.test(name)) {
                details.hasMaterials = true;
                details.materialsText = value.substring(0, 50);
                details.source = 'schema';
              }
              if (!details.hasCareInstructions && /care|wash|clean/i.test(name)) {
                details.hasCareInstructions = true;
                details.careText = value.substring(0, 60);
                details.source = 'schema';
              }
              if (!details.hasWarranty && /warranty|guarantee/i.test(name)) {
                details.hasWarranty = true;
                details.warrantyText = value.substring(0, 50);
                details.source = 'schema';
              }
              if (!details.hasCompatibility && /compatible|compatibility|fits|works with/i.test(name)) {
                details.hasCompatibility = true;
                details.compatibilityText = value.substring(0, 80);
                details.source = 'schema';
              }
            });
          }
        }
      });
    } catch (e) {
      // Invalid JSON, skip
    }
  });
}

/**
 * Format a schema value (handles QuantitativeValue objects)
 * @param {any} value - The schema value
 * @returns {string} Formatted string
 */
function formatSchemaValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value.value !== undefined) {
    return value.unitCode ? `${value.value} ${value.unitCode}` : String(value.value);
  }
  return JSON.stringify(value);
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
  let reviews = [];
  let mostRecentDate = null;
  let reviewLengths = [];

  // From structured data (uses cached JSON-LD for performance)
  const parsedJsonLd = getParsedJsonLd();
  parsedJsonLd.forEach(({ valid, data }) => {
    if (!valid) return;
    const items = data['@graph'] || (Array.isArray(data) ? data : [data]);
    items.forEach(item => {
        if (item.aggregateRating) {
          rating = parseFloat(item.aggregateRating.ratingValue);
          count = parseInt(item.aggregateRating.reviewCount, 10) || parseInt(item.aggregateRating.ratingCount, 10);
        }
        // Extract individual reviews for depth/recency analysis
        const itemType = (Array.isArray(item['@type']) ? item['@type'][0] : item['@type'] || '').toLowerCase();
        if ((itemType === 'product' || itemType === 'productgroup') && item.review) {
          const reviewList = Array.isArray(item.review) ? item.review : [item.review];
          reviewList.forEach(r => {
            if (r.datePublished) {
              const date = new Date(r.datePublished);
              if (!isNaN(date.getTime())) {
                if (!mostRecentDate || date > mostRecentDate) {
                  mostRecentDate = date;
                }
              }
            }
            if (r.reviewBody) {
              reviewLengths.push(r.reviewBody.length);
            }
          });
        }
        if (item['@type'] === 'Review') {
          if (item.datePublished) {
            const date = new Date(item.datePublished);
            if (!isNaN(date.getTime())) {
              if (!mostRecentDate || date > mostRecentDate) {
                mostRecentDate = date;
              }
            }
          }
          if (item.reviewBody) {
            reviewLengths.push(item.reviewBody.length);
          }
        }
      });
  });

  // Fallback to DOM for rating
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

  // Extract review dates from DOM if not found in schema
  if (!mostRecentDate) {
    const dateSelectors = [
      '[itemprop="datePublished"]',
      '.review-date',
      '.review-time',
      '.review-meta time',
      '.review [datetime]',
      '.review-item time',
      '.comment-date'
    ];
    for (const sel of dateSelectors) {
      const dateEls = document.querySelectorAll(sel);
      dateEls.forEach(el => {
        const dateStr = el.getAttribute('datetime') || el.getAttribute('content') || el.textContent;
        if (dateStr) {
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            if (!mostRecentDate || date > mostRecentDate) {
              mostRecentDate = date;
            }
          }
        }
      });
      if (mostRecentDate) break;
    }
  }

  // Extract review text lengths from DOM if not found in schema
  if (reviewLengths.length === 0) {
    const reviewTextSelectors = [
      '[itemprop="reviewBody"]',
      '.review-text',
      '.review-content',
      '.review-body',
      '.review-description',
      '.comment-text',
      '.review-message'
    ];
    for (const sel of reviewTextSelectors) {
      const textEls = document.querySelectorAll(sel);
      textEls.forEach(el => {
        const text = el.textContent.trim();
        if (text.length > 10) {
          reviewLengths.push(text.length);
        }
      });
      if (reviewLengths.length > 0) break;
    }
  }

  // Calculate average review length
  const averageReviewLength = reviewLengths.length > 0
    ? Math.round(reviewLengths.reduce((a, b) => a + b, 0) / reviewLengths.length)
    : 0;

  // Check if reviews are recent (within last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const hasRecentReviews = mostRecentDate ? mostRecentDate > sixMonthsAgo : null;

  // Format the most recent date for display
  const mostRecentDateStr = mostRecentDate
    ? mostRecentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return {
    count: count || 0,
    averageRating: rating,
    hasRating: rating !== null,
    hasReviews: count > 0,
    hasRecentReviews: hasRecentReviews,
    mostRecentDate: mostRecentDateStr,
    averageReviewLength: averageReviewLength,
    reviewsAnalyzed: reviewLengths.length,
    countScore: !count ? 0 : count < 10 ? Math.round((count / 10) * 25) :
                count < 50 ? 25 + Math.round(((count - 10) / 40) * 35) :
                count < 200 ? 60 + Math.round(((count - 50) / 150) * 25) : 100,
    ratingScore: !rating ? 0 : rating < 3 ? 25 : rating < 3.5 ? 50 : rating < 4 ? 75 : rating < 4.5 ? 90 : 100,
    depthScore: averageReviewLength < 50 ? 25 : averageReviewLength < 100 ? 50 : averageReviewLength < 200 ? 75 : 100
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
  const text = document.body.innerText;
  const lower = text.toLowerCase();
  const certs = [];
  let source = 'dom';

  // Context-aware certification patterns with negative lookbehind simulation
  const patterns = [
    {
      name: 'FDA Approved',
      pattern: /fda\s*(?:approved|cleared|registered)/gi,
      negative: /not\s+fda|no\s+fda|without\s+fda|pending\s+fda|awaiting\s+fda/i
    },
    {
      name: 'CE Certified',
      pattern: /ce\s*(?:mark(?:ed)?|certified|compliant)/gi,
      negative: /not\s+ce|no\s+ce|without\s+ce/i
    },
    {
      name: 'UL Listed',
      pattern: /ul\s*(?:listed|certified|recognized|approved)/gi,
      negative: /not\s+ul|no\s+ul|without\s+ul/i
    },
    {
      name: 'Energy Star',
      pattern: /energy\s*star(?:\s+(?:certified|rated|compliant))?/gi,
      negative: /not\s+energy\s*star|no\s+energy\s*star/i
    },
    {
      name: 'ISO Certified',
      pattern: /iso\s*\d{4,}(?:[-:]\d+)?(?:\s+certified)?/gi,
      negative: /not\s+iso|no\s+iso|without\s+iso/i
    },
    {
      name: 'USDA Organic',
      pattern: /usda\s*(?:certified\s+)?organic/gi,
      negative: /not\s+usda|no\s+usda|without\s+usda/i
    },
    {
      name: 'Non-GMO',
      pattern: /non[\s-]?gmo(?:\s+(?:project\s+)?verified)?/gi,
      negative: null
    },
    {
      name: 'Fair Trade',
      pattern: /fair\s*trade(?:\s+certified)?/gi,
      negative: /not\s+fair\s*trade|no\s+fair\s*trade/i
    },
    {
      name: 'Cruelty Free',
      pattern: /cruelty[\s-]?free|leaping\s+bunny/gi,
      negative: /not\s+cruelty[\s-]?free/i
    },
    {
      name: 'Vegan',
      pattern: /\bvegan(?:\s+certified)?/gi,
      negative: /not\s+vegan|non[\s-]?vegan/i
    },
    {
      name: 'Gluten Free',
      pattern: /gluten[\s-]?free(?:\s+certified)?/gi,
      negative: /not\s+gluten[\s-]?free|contains\s+gluten/i
    },
    {
      name: 'Kosher',
      pattern: /\bkosher(?:\s+certified)?/gi,
      negative: /not\s+kosher|non[\s-]?kosher/i
    },
    {
      name: 'Halal',
      pattern: /\bhalal(?:\s+certified)?/gi,
      negative: /not\s+halal|non[\s-]?halal/i
    },
    {
      name: 'FSC Certified',
      pattern: /fsc\s*(?:certified|approved)/gi,
      negative: /not\s+fsc|no\s+fsc/i
    },
    {
      name: 'GOTS Certified',
      pattern: /gots\s*(?:certified|organic)/gi,
      negative: /not\s+gots|no\s+gots/i
    },
    {
      name: 'OEKO-TEX',
      pattern: /oeko[\s-]?tex(?:\s+(?:standard|certified))?/gi,
      negative: /not\s+oeko/i
    },
    {
      name: 'B Corp',
      pattern: /\bb[\s-]?corp(?:oration)?(?:\s+certified)?/gi,
      negative: /not\s+b[\s-]?corp/i
    },
    {
      name: 'ETL Listed',
      pattern: /etl\s*(?:listed|certified)/gi,
      negative: /not\s+etl|no\s+etl/i
    },
    {
      name: 'RoHS Compliant',
      pattern: /rohs\s*(?:compliant|certified)/gi,
      negative: /not\s+rohs|no\s+rohs/i
    },
    {
      name: 'FCC Certified',
      pattern: /fcc\s*(?:certified|compliant|approved)/gi,
      negative: /not\s+fcc|no\s+fcc/i
    }
  ];

  patterns.forEach(({ name, pattern, negative }) => {
    // Check negative pattern first (context-aware)
    if (negative && negative.test(lower)) {
      return; // Skip - found negative context
    }

    const match = text.match(pattern);
    if (match) {
      certs.push({
        name: name,
        matched: match[0].trim(), // Store what was actually matched
        source: 'dom'
      });
    }
  });

  // Fallback: Check Product schema for certifications
  const schemaCerts = extractCertificationsFromSchema();
  if (schemaCerts.length > 0) {
    schemaCerts.forEach(cert => {
      // Avoid duplicates
      if (!certs.some(c => c.name.toLowerCase() === cert.name.toLowerCase())) {
        certs.push(cert);
        source = 'schema';
      }
    });
  }

  return {
    found: certs.length > 0,
    count: certs.length,
    items: certs.map(c => c.name), // Backwards compatible
    details: certs, // Full details with matched text
    source: certs.length > 0 ? (certs.some(c => c.source === 'schema') ? 'schema' : 'dom') : null,
    score: certs.length > 0 ? Math.min(100, 50 + certs.length * 15) : 0
  };
}

/**
 * Extract certifications from Product schema
 * @returns {Array} Array of certification objects
 */
function extractCertificationsFromSchema() {
  const certs = [];

  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent.trim());
      const items = data['@graph'] || [data];
      items.forEach(item => {
        if (!item) return;
        const type = (Array.isArray(item['@type']) ? item['@type'][0] : item['@type'] || '').toLowerCase();

        if (type === 'product' || type === 'productgroup') {
          // Check certification field (schema.org spec)
          if (item.certification) {
            const certifications = Array.isArray(item.certification) ? item.certification : [item.certification];
            certifications.forEach(cert => {
              const certName = cert.name || cert.certificationIdentification || cert;
              if (certName && typeof certName === 'string') {
                certs.push({ name: certName, matched: certName, source: 'schema' });
              }
            });
          }

          // Check additionalProperty for certification keywords
          if (item.additionalProperty && Array.isArray(item.additionalProperty)) {
            item.additionalProperty.forEach(prop => {
              const name = (prop.name || '').toLowerCase();
              const value = String(prop.value || '');

              if (/certification|certified|compliance|compliant/i.test(name) ||
                  /certification|certified/i.test(value)) {
                certs.push({
                  name: value || prop.name,
                  matched: `${prop.name}: ${value}`,
                  source: 'schema'
                });
              }
            });
          }
        }
      });
    } catch (e) {
      // Invalid JSON, skip
    }
  });

  return certs;
}

function extractAwards() {
  const text = document.body.innerText;
  const awards = [];
  let source = 'dom';

  // Award patterns with actual text capture
  const patterns = [
    { name: 'Award Winner', pattern: /(?:award[\s-]?winner|won\s+(?:the\s+)?[\w\s]+award|received\s+(?:the\s+)?[\w\s]+award)/gi },
    { name: 'Best of Year', pattern: /best\s+of\s+\d{4}/gi },
    { name: "Editor's Choice", pattern: /editor'?s?\s*choice(?:\s+award)?/gi },
    { name: 'Best Seller', pattern: /(?:#?\d+\s+)?best[\s-]?seller/gi },
    { name: 'Top Rated', pattern: /top[\s-]?rated(?:\s+\d{4})?/gi },
    { name: 'Product of the Year', pattern: /product\s+of\s+the\s+year/gi },
    { name: 'Innovation Award', pattern: /innovation\s+award/gi },
    { name: 'Design Award', pattern: /(?:red\s+dot|if|good\s+)?design\s+award/gi },
    { name: "People's Choice", pattern: /people'?s?\s*choice(?:\s+award)?/gi },
    { name: 'Gold Award', pattern: /(?:gold|silver|bronze)\s+(?:medal|award)/gi },
    { name: 'Top Pick', pattern: /top\s+pick(?:\s+\d{4})?/gi },
    { name: 'Recommended', pattern: /(?:highly\s+)?recommended\s+by\s+[\w\s]+/gi },
    { name: 'Certified Best', pattern: /certified\s+(?:best|top)/gi },
    { name: 'Critics Choice', pattern: /critics?\s*choice(?:\s+award)?/gi },
    { name: 'Consumer Choice', pattern: /consumer\s+choice(?:\s+award)?/gi }
  ];

  patterns.forEach(({ name, pattern }) => {
    const match = text.match(pattern);
    if (match) {
      awards.push({
        name: name,
        matched: match[0].trim().substring(0, 50), // Store what was actually matched
        source: 'dom'
      });
    }
  });

  // Fallback: Check Product schema for awards
  const schemaAwards = extractAwardsFromSchema();
  if (schemaAwards.length > 0) {
    schemaAwards.forEach(award => {
      // Avoid duplicates
      if (!awards.some(a => a.name.toLowerCase() === award.name.toLowerCase())) {
        awards.push(award);
        source = 'schema';
      }
    });
  }

  return {
    found: awards.length > 0,
    count: awards.length,
    items: awards.map(a => a.matched || a.name), // Show actual matched text
    details: awards, // Full details
    source: awards.length > 0 ? (awards.some(a => a.source === 'schema') ? 'schema' : 'dom') : null,
    score: awards.length > 0 ? Math.min(100, 40 + awards.length * 20) : 0
  };
}

/**
 * Extract awards from Product schema
 * @returns {Array} Array of award objects
 */
function extractAwardsFromSchema() {
  const awards = [];

  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent.trim());
      const items = data['@graph'] || [data];
      items.forEach(item => {
        if (!item) return;
        const type = (Array.isArray(item['@type']) ? item['@type'][0] : item['@type'] || '').toLowerCase();

        if (type === 'product' || type === 'productgroup') {
          // Check award field (schema.org spec)
          if (item.award) {
            const awardList = Array.isArray(item.award) ? item.award : [item.award];
            awardList.forEach(award => {
              if (typeof award === 'string' && award.length > 0) {
                awards.push({ name: award, matched: award, source: 'schema' });
              }
            });
          }

          // Check additionalProperty for award keywords
          if (item.additionalProperty && Array.isArray(item.additionalProperty)) {
            item.additionalProperty.forEach(prop => {
              const name = (prop.name || '').toLowerCase();
              const value = String(prop.value || '');

              if (/award|recognition|accolade/i.test(name)) {
                awards.push({
                  name: value || prop.name,
                  matched: value || prop.name,
                  source: 'schema'
                });
              }
            });
          }
        }
      });
    } catch (e) {
      // Invalid JSON, skip
    }
  });

  return awards;
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

// ==========================================
// AI DISCOVERABILITY EXTRACTOR
// ==========================================

/**
 * Extract AI discoverability signals from the page
 * Note: robots.txt and llms.txt are fetched via service worker (network requests)
 * This function extracts date signals from the page content
 * @returns {Object} AI discoverability signals
 */
function extractAIDiscoverabilitySignals() {
  const schemaDate = extractSchemaDateSignals();
  const visibleDate = extractVisibleDateSignals();

  return {
    schemaDate,
    visibleDate,
    hasAnyDateSignal: !!(schemaDate.dateModified || schemaDate.datePublished || visibleDate.found)
  };
}

/**
 * Extract date signals from schema.org markup
 * @returns {Object} Schema date signals
 */
function extractSchemaDateSignals() {
  const result = {
    dateModified: null,
    datePublished: null,
    dateCreated: null,
    source: null
  };

  // Check JSON-LD
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    if (result.dateModified) return; // Already found

    try {
      const data = JSON.parse(script.textContent.trim());
      const items = data['@graph'] || (Array.isArray(data) ? data : [data]);

      items.forEach(item => {
        if (!item || result.dateModified) return;

        // Check Product, Article, WebPage types
        const type = (Array.isArray(item['@type']) ? item['@type'][0] : item['@type'] || '').toLowerCase();
        if (['product', 'article', 'webpage', 'newsarticle', 'blogposting'].includes(type)) {
          if (item.dateModified) {
            result.dateModified = item.dateModified;
            result.source = 'json-ld';
          }
          if (item.datePublished && !result.datePublished) {
            result.datePublished = item.datePublished;
            result.source = result.source || 'json-ld';
          }
          if (item.dateCreated && !result.dateCreated) {
            result.dateCreated = item.dateCreated;
            result.source = result.source || 'json-ld';
          }
        }
      });
    } catch (e) {
      // Invalid JSON, skip
    }
  });

  // Check microdata
  if (!result.dateModified) {
    const dateModifiedEl = document.querySelector('[itemprop="dateModified"]');
    if (dateModifiedEl) {
      result.dateModified = dateModifiedEl.content || dateModifiedEl.getAttribute('datetime') || dateModifiedEl.textContent.trim();
      result.source = 'microdata';
    }
  }

  if (!result.datePublished) {
    const datePublishedEl = document.querySelector('[itemprop="datePublished"]');
    if (datePublishedEl) {
      result.datePublished = datePublishedEl.content || datePublishedEl.getAttribute('datetime') || datePublishedEl.textContent.trim();
      result.source = result.source || 'microdata';
    }
  }

  // Check meta tags
  if (!result.dateModified) {
    const metaModified = document.querySelector('meta[property="article:modified_time"], meta[name="last-modified"]');
    if (metaModified) {
      result.dateModified = metaModified.content;
      result.source = 'meta';
    }
  }

  if (!result.datePublished) {
    const metaPublished = document.querySelector('meta[property="article:published_time"], meta[name="publish-date"]');
    if (metaPublished) {
      result.datePublished = metaPublished.content;
      result.source = result.source || 'meta';
    }
  }

  return result;
}

/**
 * Extract visible date signals from page content
 * @returns {Object} Visible date signals
 */
function extractVisibleDateSignals() {
  const result = {
    found: false,
    dateText: null,
    dateType: null, // 'updated', 'published', 'modified', 'unknown'
    parsedDate: null
  };

  const bodyText = document.body.innerText;

  // Date patterns to match
  const patterns = [
    // "Updated on [date]", "Last updated [date]", "Updated: [date]"
    {
      regex: /(?:last\s+)?updated(?:\s+on)?[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i,
      type: 'updated'
    },
    // "Published [date]", "Published on [date]"
    {
      regex: /published(?:\s+on)?[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i,
      type: 'published'
    },
    // "Last modified [date]"
    {
      regex: /last\s+modified[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i,
      type: 'modified'
    },
    // "As of [date]"
    {
      regex: /as\s+of[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i,
      type: 'updated'
    },
    // "Date: [date]"
    {
      regex: /\bdate[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i,
      type: 'unknown'
    }
  ];

  for (const { regex, type } of patterns) {
    const match = bodyText.match(regex);
    if (match) {
      result.found = true;
      result.dateText = match[0].trim().substring(0, 50);
      result.dateType = type;

      // Try to parse the date
      try {
        const parsed = new Date(match[1]);
        if (!isNaN(parsed.getTime())) {
          result.parsedDate = parsed.toISOString();
        }
      } catch (e) {
        // Date parsing failed, but we still found a date signal
      }

      break;
    }
  }

  // Also check for time elements with datetime attribute
  if (!result.found) {
    const timeEls = document.querySelectorAll('time[datetime]');
    for (const timeEl of timeEls) {
      const datetime = timeEl.getAttribute('datetime');
      if (datetime) {
        try {
          const parsed = new Date(datetime);
          if (!isNaN(parsed.getTime())) {
            result.found = true;
            result.dateText = timeEl.textContent.trim().substring(0, 50) || datetime;
            result.dateType = 'unknown';
            result.parsedDate = parsed.toISOString();
            break;
          }
        } catch (e) {
          // Skip invalid dates
        }
      }
    }
  }

  return result;
}

// Log that content script is loaded
console.log('pdpIQ: Content script loaded');
