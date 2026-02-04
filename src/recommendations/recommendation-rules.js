/**
 * Recommendation Rules
 * Defines impact/effort classifications and recommendation templates
 */

/**
 * Priority matrix: Impact x Effort = Priority
 * Lower priority number = higher priority
 */
export const PRIORITY_MATRIX = {
  high: {
    low: 1,
    medium: 2,
    high: 3
  },
  medium: {
    low: 2,
    medium: 3,
    high: 4
  },
  low: {
    low: 3,
    medium: 4,
    high: 5
  }
};

/**
 * Calculate priority from impact and effort
 * @param {string} impact - high/medium/low
 * @param {string} effort - high/medium/low
 * @returns {number} Priority 1-5 (1 is highest)
 */
export function calculatePriority(impact, effort) {
  return PRIORITY_MATRIX[impact]?.[effort] || 5;
}

/**
 * Effort classifications
 */
export const EFFORT_LEVELS = {
  low: {
    label: 'Low',
    description: '1-4 hours',
    examples: ['Schema markup', 'Meta tags', 'Image format change']
  },
  medium: {
    label: 'Medium',
    description: '4-8 hours',
    examples: ['FAQ section', 'Expanded descriptions', 'Specs table']
  },
  high: {
    label: 'High',
    description: '1+ weeks',
    examples: ['Page restructure', 'Review system', 'CMS changes']
  }
};

/**
 * Recommendation templates for common issues
 */
export const RECOMMENDATION_TEMPLATES = {
  // Protocol & Meta
  'og-image-missing': {
    title: 'Add og:image meta tag',
    description: 'Missing og:image means no visual representation in LLM chats and social shares. Add a high-quality product image.',
    impact: 'high',
    effort: 'low',
    category: 'protocolMeta',
    implementation: 'Add &lt;meta property="og:image" content="https://your-site.com/product-image.jpg"&gt; to the page head. Use JPEG or PNG format (not WebP).'
  },

  'og-image-webp': {
    title: 'Convert og:image from WebP to JPEG/PNG',
    description: 'WebP images are not rendered in LLM chat interfaces, making your product invisible when shared. Convert to JPEG or PNG format.',
    impact: 'high',
    effort: 'low',
    category: 'protocolMeta',
    implementation: 'Update your og:image to use a JPEG or PNG version. Most CDNs can serve different formats based on Accept headers - ensure a JPEG/PNG fallback exists.'
  },

  'robots-blocking': {
    title: 'Remove noindex directive',
    description: 'Page is blocked from indexing by robots meta tag, preventing LLMs from accessing content.',
    impact: 'high',
    effort: 'low',
    category: 'protocolMeta',
    implementation: 'Remove the noindex value from the robots meta tag, or remove the tag entirely if not needed.'
  },

  'og-title-missing': {
    title: 'Add og:title meta tag',
    description: 'Missing og:title affects how the page appears in social shares and LLM references.',
    impact: 'medium',
    effort: 'low',
    category: 'protocolMeta',
    implementation: 'Add &lt;meta property="og:title" content="Product Name - Brand"&gt; to the page head. Keep under 60 characters.'
  },

  'og-description-missing': {
    title: 'Add og:description meta tag',
    description: 'Missing og:description limits how the product is described when shared.',
    impact: 'medium',
    effort: 'low',
    category: 'protocolMeta',
    implementation: 'Add &lt;meta property="og:description" content="..."&gt; with 100-200 characters describing the product benefits.'
  },

  'twitter-card-missing': {
    title: 'Add Twitter Card markup',
    description: 'Missing Twitter Card tags limit product visibility on Twitter/X when shared.',
    impact: 'low',
    effort: 'low',
    category: 'protocolMeta',
    implementation: 'Add twitter:card (summary_large_image), twitter:title, twitter:description, and twitter:image meta tags.'
  },

  // Structured Data
  'product-schema-missing': {
    title: 'Add Product schema markup',
    description: 'Product schema is essential for LLMs to understand this is a product page with purchasable items.',
    impact: 'high',
    effort: 'medium',
    category: 'structuredData',
    implementation: 'Add JSON-LD Product schema including: name, description, image, sku, brand, and offers (with price, currency, availability).'
  },

  'offer-schema-missing': {
    title: 'Add Offer schema for pricing',
    description: 'Offer schema tells LLMs about pricing and availability, enabling purchase-related responses.',
    impact: 'high',
    effort: 'low',
    category: 'structuredData',
    implementation: 'Add Offer schema nested in Product schema with: price, priceCurrency (e.g., "USD"), availability (e.g., "https://schema.org/InStock").'
  },

  'rating-schema-missing': {
    title: 'Add AggregateRating schema',
    description: 'Rating schema helps LLMs provide review information when recommending products.',
    impact: 'medium',
    effort: 'low',
    category: 'structuredData',
    implementation: 'Add AggregateRating schema with: ratingValue, bestRating, reviewCount.'
  },

  'faq-schema-missing': {
    title: 'Add FAQ schema markup',
    description: 'FAQ schema makes your product Q&A content more accessible to LLMs for answering user questions.',
    impact: 'medium',
    effort: 'medium',
    category: 'structuredData',
    implementation: 'Add FAQPage schema with mainEntity containing Question/Answer pairs. Include at least 5 relevant product questions.'
  },

  'breadcrumb-schema-missing': {
    title: 'Add BreadcrumbList schema',
    description: 'Breadcrumb schema helps LLMs understand product categorization and site structure.',
    impact: 'low',
    effort: 'low',
    category: 'structuredData',
    implementation: 'Add BreadcrumbList schema with itemListElement containing position, name, and item (URL) for each level.'
  },

  // Content Quality
  'description-short': {
    title: 'Expand product description',
    description: 'Short product descriptions provide insufficient context for LLMs to make quality recommendations.',
    impact: 'high',
    effort: 'medium',
    category: 'contentQuality',
    implementation: 'Expand the product description to at least 200 words. Include key features, benefits, use cases, and differentiators.'
  },

  'specs-missing': {
    title: 'Add detailed specifications',
    description: 'Technical specifications help LLMs answer detailed product comparison questions.',
    impact: 'medium',
    effort: 'medium',
    category: 'contentQuality',
    implementation: 'Add a specifications section with at least 10 key specs including dimensions, materials, compatibility, and technical details.'
  },

  'faq-content-missing': {
    title: 'Add FAQ section',
    description: 'FAQ content helps LLMs answer common customer questions about your product.',
    impact: 'medium',
    effort: 'medium',
    category: 'contentQuality',
    implementation: 'Add 5+ frequently asked questions with detailed answers (50+ characters each). Cover shipping, returns, compatibility, and product-specific questions.'
  },

  'features-missing': {
    title: 'Add feature bullet points',
    description: 'Clear feature lists help LLMs quickly identify product capabilities.',
    impact: 'medium',
    effort: 'low',
    category: 'contentQuality',
    implementation: 'Add a bulleted list of 5-10 key product features using &lt;ul&gt; or &lt;ol&gt; elements.'
  },

  'compatibility-missing': {
    title: 'Add compatibility information',
    description: 'Compatibility details help LLMs answer "will this work with..." questions.',
    impact: 'medium',
    effort: 'low',
    category: 'contentQuality',
    implementation: 'Add a section listing compatible devices, systems, or products. Be specific about versions and models.'
  },

  // Content Structure
  'h1-missing': {
    title: 'Add H1 heading',
    description: 'Missing H1 heading makes it harder for LLMs to identify the main topic of the page.',
    impact: 'medium',
    effort: 'low',
    category: 'contentStructure',
    implementation: 'Add a single &lt;h1&gt; tag containing the product name. This should match or closely align with the og:title.'
  },

  'multiple-h1': {
    title: 'Use single H1 heading',
    description: 'Multiple H1 headings confuse content hierarchy for LLMs.',
    impact: 'low',
    effort: 'low',
    category: 'contentStructure',
    implementation: 'Keep only one &lt;h1&gt; for the product name. Convert other H1s to H2 or lower.'
  },

  'semantic-html-missing': {
    title: 'Use semantic HTML elements',
    description: 'Semantic HTML helps LLMs understand content structure and importance.',
    impact: 'medium',
    effort: 'medium',
    category: 'contentStructure',
    implementation: 'Wrap main product content in &lt;main&gt; or &lt;article&gt;. Use &lt;section&gt; for distinct content areas. Use &lt;nav&gt; for navigation.'
  },

  'primary-image-alt-missing': {
    title: 'Add alt text to primary product image',
    description: 'Missing alt text limits product visibility when LLMs describe images.',
    impact: 'medium',
    effort: 'low',
    category: 'contentStructure',
    implementation: 'Add descriptive alt text to the main product image. Include product name, key features, and color/variant.'
  },

  'images-alt-low': {
    title: 'Improve image alt text coverage',
    description: 'Low alt text coverage limits accessibility and LLM understanding of product visuals.',
    impact: 'low',
    effort: 'medium',
    category: 'contentStructure',
    implementation: 'Add meaningful alt text to all product images. Describe what\'s shown, not just "product image".'
  },

  // Authority & Trust
  'reviews-missing': {
    title: 'Add customer reviews',
    description: 'Customer reviews provide social proof that LLMs use when making recommendations.',
    impact: 'high',
    effort: 'high',
    category: 'authorityTrust',
    implementation: 'Implement a review collection system. Display reviews with structured data markup.'
  },

  'reviews-low-count': {
    title: 'Increase review count',
    description: 'More reviews increase confidence when LLMs recommend products.',
    impact: 'medium',
    effort: 'high',
    category: 'authorityTrust',
    implementation: 'Encourage customers to leave reviews via follow-up emails, review incentives, or simplified review processes.'
  },

  'brand-unclear': {
    title: 'Clarify brand identity',
    description: 'Clear brand identification helps LLMs attribute products correctly.',
    impact: 'medium',
    effort: 'low',
    category: 'authorityTrust',
    implementation: 'Include brand name in H1, title tag, and Product schema. Add Organization/Brand schema.'
  },

  'certifications-missing': {
    title: 'Add certification information',
    description: 'Certifications build trust that LLMs factor into recommendations.',
    impact: 'low',
    effort: 'low',
    category: 'authorityTrust',
    implementation: 'List relevant certifications (safety, organic, eco-friendly) prominently on the page.'
  },

  // AI Discoverability
  'ai-crawler-blocked': {
    title: 'Allow AI crawlers in robots.txt',
    description: 'Major AI crawlers (GPTBot, ClaudeBot, PerplexityBot) are blocked in robots.txt, preventing AI systems from discovering and citing your product content.',
    impact: 'high',
    effort: 'low',
    category: 'aiDiscoverability',
    implementation: 'Update your robots.txt to allow AI crawlers. Remove or modify Disallow rules for User-agent: GPTBot, ChatGPT-User, ClaudeBot, Claude-Web, Anthropic-AI, PerplexityBot, Google-Extended. Consider allowing at least read-only access for product pages.'
  },

  'llms-txt-missing': {
    title: 'Add llms.txt file',
    description: 'No llms.txt file found. This emerging standard helps AI systems understand how to interact with your site and what content is available.',
    impact: 'medium',
    effort: 'low',
    category: 'aiDiscoverability',
    implementation: 'Create /llms.txt at your domain root with site description, key content areas, and AI-friendly guidelines. Optionally create /llms-full.txt with more detailed instructions. See llmstxt.org for the specification.'
  }
};

/**
 * Get recommendation template by ID
 * @param {string} id - Template ID
 * @returns {Object|null} Template or null
 */
export function getRecommendationTemplate(id) {
  return RECOMMENDATION_TEMPLATES[id] || null;
}

/**
 * Get all template IDs
 * @returns {string[]} Array of template IDs
 */
export function getAllTemplateIds() {
  return Object.keys(RECOMMENDATION_TEMPLATES);
}
