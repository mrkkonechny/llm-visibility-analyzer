/**
 * Structured Data Extractor
 * Extracts JSON-LD, Microdata, and RDFa markup from the page
 */

/**
 * Extract all structured data from the page
 * @returns {Object} Extracted structured data
 */
export function extractStructuredData() {
  const results = {
    jsonLd: extractJsonLd(),
    microdata: extractMicrodata(),
    rdfa: extractRdfa(),
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

  // Categorize schemas from all sources
  categorizeSchemas(results.jsonLd, results.schemas);
  categorizeMicrodataSchemas(results.microdata, results.schemas);

  return results;
}

/**
 * Extract JSON-LD structured data
 * @returns {Array} Array of parsed JSON-LD objects
 */
function extractJsonLd() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  const results = [];

  scripts.forEach(script => {
    try {
      const content = script.textContent.trim();
      if (content) {
        const data = JSON.parse(content);
        results.push({
          valid: true,
          data
        });
      }
    } catch (e) {
      results.push({
        valid: false,
        error: e.message,
        raw: script.textContent.substring(0, 500)
      });
    }
  });

  return results;
}

/**
 * Extract Microdata structured data
 * @returns {Array} Array of microdata items
 */
function extractMicrodata() {
  const items = [];
  const scopes = document.querySelectorAll('[itemscope]');

  scopes.forEach(scope => {
    // Skip nested itemscopes that will be processed as part of parent
    if (scope.closest('[itemscope]') !== scope &&
        scope.parentElement?.closest('[itemscope]')) {
      return;
    }

    const item = extractMicrodataItem(scope);
    if (item.type) {
      items.push(item);
    }
  });

  return items;
}

/**
 * Extract a single microdata item and its properties
 * @param {Element} scope - Element with itemscope
 * @returns {Object} Microdata item
 */
function extractMicrodataItem(scope) {
  const item = {
    type: scope.getAttribute('itemtype') || '',
    id: scope.getAttribute('itemid') || null,
    properties: {}
  };

  // Get all itemprop elements within this scope
  const props = scope.querySelectorAll('[itemprop]');

  props.forEach(prop => {
    // Skip if this prop belongs to a nested itemscope
    const propScope = prop.closest('[itemscope]');
    if (propScope !== scope && propScope !== prop) {
      return;
    }

    const name = prop.getAttribute('itemprop');
    let value;

    // Handle nested itemscope
    if (prop.hasAttribute('itemscope')) {
      value = extractMicrodataItem(prop);
    } else {
      // Extract value based on element type
      value = getMicrodataValue(prop);
    }

    // Handle multiple values for same property
    if (item.properties[name]) {
      if (Array.isArray(item.properties[name])) {
        item.properties[name].push(value);
      } else {
        item.properties[name] = [item.properties[name], value];
      }
    } else {
      item.properties[name] = value;
    }
  });

  return item;
}

/**
 * Get the value of a microdata property element
 * @param {Element} el - Element with itemprop
 * @returns {string} Property value
 */
function getMicrodataValue(el) {
  const tagName = el.tagName.toLowerCase();

  if (el.hasAttribute('content')) {
    return el.getAttribute('content');
  }

  switch (tagName) {
    case 'meta':
      return el.content || '';
    case 'a':
    case 'link':
      return el.href || '';
    case 'img':
    case 'source':
      return el.src || el.srcset || '';
    case 'audio':
    case 'video':
    case 'embed':
    case 'iframe':
      return el.src || '';
    case 'object':
      return el.data || '';
    case 'time':
      return el.dateTime || el.textContent.trim();
    case 'data':
    case 'meter':
      return el.value || el.textContent.trim();
    default:
      return el.textContent.trim();
  }
}

/**
 * Extract RDFa structured data
 * @returns {Array} Array of RDFa items
 */
function extractRdfa() {
  const items = [];

  // Look for elements with typeof (defines a new subject)
  const subjects = document.querySelectorAll('[typeof]');

  subjects.forEach(subject => {
    const item = {
      type: subject.getAttribute('typeof'),
      resource: subject.getAttribute('resource') || subject.getAttribute('about'),
      vocab: findVocab(subject),
      properties: {}
    };

    // Get properties within this subject
    const props = subject.querySelectorAll('[property]');
    props.forEach(prop => {
      const name = prop.getAttribute('property');
      const value = prop.getAttribute('content') ||
                    prop.href ||
                    prop.src ||
                    prop.textContent.trim();

      if (item.properties[name]) {
        if (Array.isArray(item.properties[name])) {
          item.properties[name].push(value);
        } else {
          item.properties[name] = [item.properties[name], value];
        }
      } else {
        item.properties[name] = value;
      }
    });

    items.push(item);
  });

  return items;
}

/**
 * Find the vocab for an RDFa element
 * @param {Element} el - Element to check
 * @returns {string|null} Vocabulary URL
 */
function findVocab(el) {
  let current = el;
  while (current) {
    if (current.hasAttribute && current.hasAttribute('vocab')) {
      return current.getAttribute('vocab');
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Categorize JSON-LD schemas into specific types
 * @param {Array} jsonLdItems - Array of JSON-LD items
 * @param {Object} schemas - Schemas object to populate
 */
function categorizeSchemas(jsonLdItems, schemas) {
  jsonLdItems.forEach(item => {
    if (!item.valid || !item.data) return;

    const data = item.data;

    // Handle @graph arrays
    const items = data['@graph'] || [data];

    items.forEach(schemaItem => {
      categorizeSchemaItem(schemaItem, schemas);
    });
  });
}

/**
 * Categorize a single schema item
 * @param {Object} item - Schema item
 * @param {Object} schemas - Schemas object to populate
 */
function categorizeSchemaItem(item, schemas) {
  if (!item || !item['@type']) return;

  const type = Array.isArray(item['@type']) ? item['@type'][0] : item['@type'];
  const typeLower = type.toLowerCase();

  // Product
  if (typeLower === 'product') {
    schemas.product = extractProductSchema(item);

    // Extract nested schemas from Product
    if (item.offers) {
      const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
      schemas.offer = offers.map(extractOfferSchema);
    }
    if (item.aggregateRating) {
      schemas.aggregateRating = extractRatingSchema(item.aggregateRating);
    }
    if (item.review) {
      const reviews = Array.isArray(item.review) ? item.review : [item.review];
      schemas.reviews = reviews.map(extractReviewSchema);
    }
    if (item.brand) {
      schemas.brand = extractBrandSchema(item.brand);
    }
    if (item.image) {
      const images = Array.isArray(item.image) ? item.image : [item.image];
      schemas.images = images.map(extractImageSchema);
    }
  }

  // Offer (standalone)
  if (typeLower === 'offer' && !schemas.offer) {
    schemas.offer = [extractOfferSchema(item)];
  }

  // AggregateRating (standalone)
  if (typeLower === 'aggregaterating' && !schemas.aggregateRating) {
    schemas.aggregateRating = extractRatingSchema(item);
  }

  // Review (standalone)
  if (typeLower === 'review') {
    schemas.reviews.push(extractReviewSchema(item));
  }

  // FAQPage
  if (typeLower === 'faqpage') {
    schemas.faq = extractFaqSchema(item);
  }

  // BreadcrumbList
  if (typeLower === 'breadcrumblist') {
    schemas.breadcrumb = extractBreadcrumbSchema(item);
  }

  // Organization
  if (typeLower === 'organization') {
    schemas.organization = extractOrganizationSchema(item);
  }

  // Brand (standalone)
  if (typeLower === 'brand' && !schemas.brand) {
    schemas.brand = extractBrandSchema(item);
  }

  // ImageObject (standalone)
  if (typeLower === 'imageobject') {
    schemas.images.push(extractImageSchema(item));
  }
}

/**
 * Extract Product schema properties
 */
function extractProductSchema(item) {
  return {
    name: item.name || null,
    description: item.description || null,
    image: extractImageValue(item.image),
    sku: item.sku || null,
    gtin: item.gtin || item.gtin13 || item.gtin14 || item.gtin8 || item.gtin12 || null,
    mpn: item.mpn || null,
    brand: item.brand?.name || (typeof item.brand === 'string' ? item.brand : null),
    category: item.category || null,
    color: item.color || null,
    material: item.material || null,
    weight: item.weight || null,
    width: item.width || null,
    height: item.height || null,
    depth: item.depth || null,
    hasOffer: !!item.offers,
    hasRating: !!item.aggregateRating,
    hasReviews: !!(item.review && (Array.isArray(item.review) ? item.review.length : true)),
    raw: item
  };
}

/**
 * Extract Offer schema properties
 */
function extractOfferSchema(item) {
  if (!item) return null;
  return {
    price: item.price || item.lowPrice || null,
    priceCurrency: item.priceCurrency || null,
    availability: item.availability || null,
    url: item.url || null,
    seller: item.seller?.name || null,
    priceValidUntil: item.priceValidUntil || null,
    itemCondition: item.itemCondition || null,
    raw: item
  };
}

/**
 * Extract AggregateRating schema properties
 */
function extractRatingSchema(item) {
  if (!item) return null;
  return {
    ratingValue: parseFloat(item.ratingValue) || null,
    bestRating: parseFloat(item.bestRating) || 5,
    worstRating: parseFloat(item.worstRating) || 1,
    ratingCount: parseInt(item.ratingCount, 10) || null,
    reviewCount: parseInt(item.reviewCount, 10) || null,
    raw: item
  };
}

/**
 * Extract Review schema properties
 */
function extractReviewSchema(item) {
  if (!item) return null;
  return {
    author: item.author?.name || (typeof item.author === 'string' ? item.author : null),
    datePublished: item.datePublished || null,
    reviewBody: item.reviewBody || item.description || null,
    reviewRating: item.reviewRating ? {
      ratingValue: parseFloat(item.reviewRating.ratingValue) || null,
      bestRating: parseFloat(item.reviewRating.bestRating) || 5
    } : null,
    raw: item
  };
}

/**
 * Extract FAQ schema properties
 */
function extractFaqSchema(item) {
  if (!item) return null;

  const questions = [];
  const mainEntity = item.mainEntity || [];
  const entities = Array.isArray(mainEntity) ? mainEntity : [mainEntity];

  entities.forEach(entity => {
    if (entity['@type'] === 'Question') {
      questions.push({
        question: entity.name || null,
        answer: entity.acceptedAnswer?.text || null,
        answerLength: (entity.acceptedAnswer?.text || '').length
      });
    }
  });

  return {
    questionCount: questions.length,
    questions,
    averageAnswerLength: questions.length > 0
      ? Math.round(questions.reduce((sum, q) => sum + q.answerLength, 0) / questions.length)
      : 0,
    raw: item
  };
}

/**
 * Extract Breadcrumb schema properties
 */
function extractBreadcrumbSchema(item) {
  if (!item) return null;

  const items = item.itemListElement || [];
  const elements = Array.isArray(items) ? items : [items];

  return {
    itemCount: elements.length,
    items: elements.map(el => ({
      position: el.position || null,
      name: el.name || el.item?.name || null,
      url: el.item?.['@id'] || el.item?.url || (typeof el.item === 'string' ? el.item : null)
    })),
    raw: item
  };
}

/**
 * Extract Organization schema properties
 */
function extractOrganizationSchema(item) {
  if (!item) return null;
  return {
    name: item.name || null,
    logo: extractImageValue(item.logo),
    url: item.url || null,
    sameAs: item.sameAs || [],
    raw: item
  };
}

/**
 * Extract Brand schema properties
 */
function extractBrandSchema(item) {
  if (!item) return null;
  if (typeof item === 'string') {
    return { name: item };
  }
  return {
    name: item.name || null,
    logo: extractImageValue(item.logo),
    url: item.url || null,
    raw: item
  };
}

/**
 * Extract ImageObject schema properties
 */
function extractImageSchema(item) {
  if (!item) return null;
  if (typeof item === 'string') {
    return { url: item };
  }
  return {
    url: item.url || item.contentUrl || item['@id'] || null,
    caption: item.caption || null,
    description: item.description || null,
    width: item.width || null,
    height: item.height || null,
    encodingFormat: item.encodingFormat || null,
    raw: item
  };
}

/**
 * Extract image URL from various formats
 */
function extractImageValue(image) {
  if (!image) return null;
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) {
    return image[0]?.url || image[0]?.contentUrl || image[0] || null;
  }
  return image.url || image.contentUrl || image['@id'] || null;
}

/**
 * Categorize microdata schemas
 */
function categorizeMicrodataSchemas(microdataItems, schemas) {
  microdataItems.forEach(item => {
    if (!item.type) return;

    // Normalize type (remove schema.org prefix)
    const type = item.type.replace(/^https?:\/\/schema\.org\//, '').toLowerCase();

    if (type === 'product' && !schemas.product) {
      schemas.product = {
        name: item.properties.name || null,
        description: item.properties.description || null,
        image: item.properties.image || null,
        sku: item.properties.sku || null,
        brand: item.properties.brand || null,
        source: 'microdata',
        raw: item
      };
    }

    if (type === 'aggregaterating' && !schemas.aggregateRating) {
      schemas.aggregateRating = {
        ratingValue: parseFloat(item.properties.ratingValue) || null,
        reviewCount: parseInt(item.properties.reviewCount, 10) || null,
        ratingCount: parseInt(item.properties.ratingCount, 10) || null,
        source: 'microdata',
        raw: item
      };
    }
  });
}
