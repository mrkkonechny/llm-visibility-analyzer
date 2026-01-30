/**
 * Meta Tags Extractor
 * Extracts Open Graph, Twitter Cards, and standard meta tags
 */

/**
 * Extract all meta tag information from the page
 * @returns {Object} Extracted meta tags
 */
export function extractMetaTags() {
  return {
    openGraph: extractOpenGraph(),
    twitterCards: extractTwitterCards(),
    standard: extractStandardMeta(),
    canonical: extractCanonical(),
    robots: extractRobots(),
    technical: extractTechnical()
  };
}

/**
 * Extract Open Graph meta tags
 * @returns {Object} Open Graph properties
 */
function extractOpenGraph() {
  const og = {
    // Core properties
    title: null,
    type: null,
    url: null,
    description: null,
    siteName: null,
    locale: null,

    // Image properties (critical for LLM visibility)
    image: null,
    imageSecureUrl: null,
    imageType: null,
    imageWidth: null,
    imageHeight: null,
    imageAlt: null,

    // Product properties
    priceAmount: null,
    priceCurrency: null,
    availability: null,

    // All raw properties
    raw: {}
  };

  // Extract all og: meta tags
  document.querySelectorAll('meta[property^="og:"]').forEach(meta => {
    const property = meta.getAttribute('property');
    const content = meta.getAttribute('content');

    if (property && content) {
      og.raw[property] = content;

      // Map to structured properties
      switch (property) {
        case 'og:title':
          og.title = content;
          break;
        case 'og:type':
          og.type = content;
          break;
        case 'og:url':
          og.url = content;
          break;
        case 'og:description':
          og.description = content;
          break;
        case 'og:site_name':
          og.siteName = content;
          break;
        case 'og:locale':
          og.locale = content;
          break;
        case 'og:image':
          og.image = content;
          break;
        case 'og:image:secure_url':
          og.imageSecureUrl = content;
          break;
        case 'og:image:type':
          og.imageType = content;
          break;
        case 'og:image:width':
          og.imageWidth = parseInt(content, 10) || null;
          break;
        case 'og:image:height':
          og.imageHeight = parseInt(content, 10) || null;
          break;
        case 'og:image:alt':
          og.imageAlt = content;
          break;
        case 'og:price:amount':
        case 'product:price:amount':
          og.priceAmount = content;
          break;
        case 'og:price:currency':
        case 'product:price:currency':
          og.priceCurrency = content;
          break;
        case 'og:availability':
        case 'product:availability':
          og.availability = content;
          break;
      }
    }
  });

  // Also check for product: prefix tags
  document.querySelectorAll('meta[property^="product:"]').forEach(meta => {
    const property = meta.getAttribute('property');
    const content = meta.getAttribute('content');

    if (property && content) {
      og.raw[property] = content;

      switch (property) {
        case 'product:price:amount':
          if (!og.priceAmount) og.priceAmount = content;
          break;
        case 'product:price:currency':
          if (!og.priceCurrency) og.priceCurrency = content;
          break;
        case 'product:availability':
          if (!og.availability) og.availability = content;
          break;
      }
    }
  });

  // Calculate quality metrics
  og.metrics = {
    titleLength: og.title?.length || 0,
    titleOptimal: og.title && og.title.length > 0 && og.title.length <= 60,
    descriptionLength: og.description?.length || 0,
    descriptionOptimal: og.description && og.description.length >= 100 && og.description.length <= 200,
    hasImage: !!og.image,
    hasImageDimensions: !!(og.imageWidth && og.imageHeight),
    imageDimensionsOptimal: og.imageWidth >= 1200 && og.imageHeight >= 630,
    hasImageAlt: !!og.imageAlt,
    isProductType: og.type === 'product' || og.type === 'og:product',
    urlMatchesCanonical: null // Will be set after canonical is extracted
  };

  return og;
}

/**
 * Extract Twitter Card meta tags
 * @returns {Object} Twitter Card properties
 */
function extractTwitterCards() {
  const twitter = {
    card: null,
    site: null,
    creator: null,
    title: null,
    description: null,
    image: null,
    imageAlt: null,
    raw: {}
  };

  document.querySelectorAll('meta[name^="twitter:"]').forEach(meta => {
    const name = meta.getAttribute('name');
    const content = meta.getAttribute('content');

    if (name && content) {
      twitter.raw[name] = content;

      switch (name) {
        case 'twitter:card':
          twitter.card = content;
          break;
        case 'twitter:site':
          twitter.site = content;
          break;
        case 'twitter:creator':
          twitter.creator = content;
          break;
        case 'twitter:title':
          twitter.title = content;
          break;
        case 'twitter:description':
          twitter.description = content;
          break;
        case 'twitter:image':
          twitter.image = content;
          break;
        case 'twitter:image:alt':
          twitter.imageAlt = content;
          break;
      }
    }
  });

  // Calculate quality metrics
  twitter.metrics = {
    hasCard: !!twitter.card,
    isLargeImage: twitter.card === 'summary_large_image',
    hasImage: !!twitter.image,
    hasImageAlt: !!twitter.imageAlt
  };

  return twitter;
}

/**
 * Extract standard meta tags
 * @returns {Object} Standard meta properties
 */
function extractStandardMeta() {
  const meta = {
    description: null,
    keywords: null,
    author: null,
    viewport: null,
    themeColor: null,
    raw: {}
  };

  // Meta name tags
  document.querySelectorAll('meta[name]').forEach(el => {
    const name = el.getAttribute('name').toLowerCase();
    const content = el.getAttribute('content');

    if (name && content) {
      meta.raw[name] = content;

      switch (name) {
        case 'description':
          meta.description = content;
          break;
        case 'keywords':
          meta.keywords = content;
          break;
        case 'author':
          meta.author = content;
          break;
        case 'viewport':
          meta.viewport = content;
          break;
        case 'theme-color':
          meta.themeColor = content;
          break;
      }
    }
  });

  // Calculate quality metrics
  meta.metrics = {
    hasDescription: !!meta.description,
    descriptionLength: meta.description?.length || 0,
    descriptionOptimal: meta.description && meta.description.length >= 120 && meta.description.length <= 160,
    hasKeywords: !!meta.keywords,
    hasViewport: !!meta.viewport
  };

  return meta;
}

/**
 * Extract canonical URL
 * @returns {Object} Canonical information
 */
function extractCanonical() {
  const link = document.querySelector('link[rel="canonical"]');
  const canonical = link?.href || null;
  const currentUrl = window.location.href.split('?')[0].split('#')[0];

  return {
    url: canonical,
    present: !!canonical,
    matchesCurrentUrl: canonical ? normalizeUrl(canonical) === normalizeUrl(currentUrl) : null,
    currentUrl
  };
}

/**
 * Normalize URL for comparison
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    // Remove trailing slash, lowercase, remove www
    return (parsed.origin + parsed.pathname)
      .toLowerCase()
      .replace(/\/$/, '')
      .replace('://www.', '://');
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

/**
 * Extract robots directives
 * @returns {Object} Robots directives
 */
function extractRobots() {
  const robotsMeta = document.querySelector('meta[name="robots"]');
  const googlebotMeta = document.querySelector('meta[name="googlebot"]');

  const content = robotsMeta?.content?.toLowerCase() || '';
  const googlebotContent = googlebotMeta?.content?.toLowerCase() || '';

  return {
    content: robotsMeta?.content || null,
    googlebotContent: googlebotMeta?.content || null,
    noindex: content.includes('noindex') || googlebotContent.includes('noindex'),
    nofollow: content.includes('nofollow') || googlebotContent.includes('nofollow'),
    noarchive: content.includes('noarchive'),
    nosnippet: content.includes('nosnippet'),
    noimageindex: content.includes('noimageindex'),
    // LLM visibility concern
    isBlocked: content.includes('noindex') || googlebotContent.includes('noindex')
  };
}

/**
 * Extract technical meta information
 * @returns {Object} Technical information
 */
function extractTechnical() {
  return {
    charset: document.characterSet || document.charset,
    lang: document.documentElement.lang || null,
    dir: document.documentElement.dir || null,
    isHttps: window.location.protocol === 'https:',
    responseHeaders: {
      // These can only be detected via actual HTTP headers
      // We'll note what we can detect client-side
      note: 'Full header inspection requires service worker'
    },
    doctype: document.doctype ? {
      name: document.doctype.name,
      publicId: document.doctype.publicId,
      systemId: document.doctype.systemId
    } : null,
    htmlVersion: detectHtmlVersion()
  };
}

/**
 * Detect HTML version from doctype
 * @returns {string} HTML version
 */
function detectHtmlVersion() {
  const doctype = document.doctype;
  if (!doctype) return 'unknown';

  if (doctype.publicId === '' && doctype.systemId === '') {
    return 'HTML5';
  }

  if (doctype.publicId.includes('XHTML')) {
    return 'XHTML';
  }

  if (doctype.publicId.includes('HTML 4')) {
    return 'HTML4';
  }

  return 'unknown';
}
