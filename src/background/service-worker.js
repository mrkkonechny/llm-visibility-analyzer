/**
 * Service Worker - Message routing hub and og:image format verification
 */

// Open side panel on extension icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

/**
 * AI Crawlers map - user-agent names to company/product
 */
const AI_CRAWLERS = {
  // OpenAI
  'gptbot': { company: 'OpenAI', product: 'GPT/ChatGPT training' },
  'chatgpt-user': { company: 'OpenAI', product: 'ChatGPT browsing' },
  'oai-searchbot': { company: 'OpenAI', product: 'OpenAI search' },
  // Anthropic
  'claudebot': { company: 'Anthropic', product: 'Claude training' },
  'claude-web': { company: 'Anthropic', product: 'Claude web access' },
  'anthropic-ai': { company: 'Anthropic', product: 'Anthropic AI' },
  // Perplexity
  'perplexitybot': { company: 'Perplexity', product: 'Perplexity AI search' },
  // Google
  'google-extended': { company: 'Google', product: 'Gemini/Bard training' },
  // Apple
  'applebot-extended': { company: 'Apple', product: 'Apple AI features' },
  // Training data
  'ccbot': { company: 'Common Crawl', product: 'Training data collection' }
};

/**
 * Major AI crawlers that should be checked
 */
const MAJOR_AI_CRAWLERS = [
  'gptbot',
  'chatgpt-user',
  'claudebot',
  'claude-web',
  'anthropic-ai',
  'perplexitybot',
  'google-extended'
];

// Message routing between content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'EXTRACT_DATA':
      // Forward extraction request to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_DATA' });
        }
      });
      break;

    case 'EXTRACTION_COMPLETE':
      // Forward extracted data to side panel
      chrome.runtime.sendMessage(message);
      break;

    case 'VERIFY_IMAGE_FORMAT':
      // Verify og:image format via HEAD request
      verifyImageFormat(message.url)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message, isValid: false }));
      return true; // Keep channel open for async response

    case 'VERIFY_MULTIPLE_IMAGES':
      // Verify multiple image formats in parallel
      Promise.all(message.urls.map(url => verifyImageFormat(url)))
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;

    case 'GET_PAGE_INFO':
      // Get current tab info
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          sendResponse({
            url: tabs[0].url,
            title: tabs[0].title
          });
        } else {
          sendResponse({ error: 'No active tab' });
        }
      });
      return true;

    case 'FETCH_ROBOTS_TXT':
      // Fetch and parse robots.txt for AI crawler rules
      fetchRobotsTxt(message.baseUrl)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message, crawlerRules: {} }));
      return true;

    case 'FETCH_LLMS_TXT':
      // Check for llms.txt and llms-full.txt
      fetchLlmsTxt(message.baseUrl)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message, found: false }));
      return true;

    case 'FETCH_LAST_MODIFIED':
      // Get Last-Modified header for a URL
      fetchLastModified(message.url)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message, lastModified: null }));
      return true;
  }
});

/**
 * Verify the actual format of an image via HTTP HEAD request
 * Critical for og:image - WebP images are invisible in LLM chats
 *
 * @param {string} url - Image URL to verify
 * @returns {Promise<Object>} Format verification result
 */
async function verifyImageFormat(url) {
  // Validate URL parameter
  if (!url || typeof url !== 'string') {
    return {
      url: url || '',
      accessible: false,
      isValid: false,
      error: 'Invalid or missing URL'
    };
  }

  try {
    // First try HEAD request for Content-Type
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'cors',
      credentials: 'omit'
    });

    if (!response.ok) {
      return {
        url,
        accessible: false,
        status: response.status,
        isValid: false,
        error: `HTTP ${response.status}`
      };
    }

    const contentType = response.headers.get('Content-Type') || '';
    const contentLength = response.headers.get('Content-Length');

    // Check file size (should be < 5MB for optimal LLM handling)
    const sizeInBytes = contentLength ? parseInt(contentLength, 10) : null;
    const sizeInMB = sizeInBytes ? sizeInBytes / (1024 * 1024) : null;
    const isSizeValid = sizeInMB === null || sizeInMB < 5;

    // Determine format from Content-Type
    let format = 'unknown';
    let isWebP = false;
    let isValidFormat = false;

    if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
      format = 'jpeg';
      isValidFormat = true;
    } else if (contentType.includes('image/png')) {
      format = 'png';
      isValidFormat = true;
    } else if (contentType.includes('image/gif')) {
      format = 'gif';
      isValidFormat = true;
    } else if (contentType.includes('image/webp')) {
      format = 'webp';
      isWebP = true;
      isValidFormat = false; // WebP is NOT valid for LLM visibility
    } else if (contentType.includes('image/avif')) {
      format = 'avif';
      isValidFormat = false; // AVIF also not widely supported
    } else if (contentType.includes('image/svg')) {
      format = 'svg';
      isValidFormat = false; // SVG not ideal for product images
    }

    // If Content-Type was not helpful, try to detect from magic bytes
    if (format === 'unknown') {
      const magicResult = await detectFormatFromMagicBytes(url);
      if (magicResult) {
        format = magicResult.format;
        isWebP = magicResult.isWebP;
        isValidFormat = magicResult.isValidFormat;
      }
    }

    return {
      url,
      accessible: true,
      contentType,
      format,
      isWebP,
      isValidFormat,
      sizeInMB,
      isSizeValid,
      // Overall validity for LLM visibility
      isValid: isValidFormat && isSizeValid
    };
  } catch (error) {
    // CORS or network error - try magic bytes approach
    try {
      const magicResult = await detectFormatFromMagicBytes(url);
      if (magicResult) {
        return {
          url,
          accessible: true,
          format: magicResult.format,
          isWebP: magicResult.isWebP,
          isValidFormat: magicResult.isValidFormat,
          isValid: magicResult.isValidFormat,
          note: 'Detected via magic bytes (CORS restricted HEAD)'
        };
      }
    } catch (magicError) {
      // Both methods failed
    }

    // Fall back to URL extension check
    const urlLower = url.toLowerCase();
    let format = 'unknown';
    let isWebP = false;
    let isValidFormat = false;

    if (urlLower.match(/\.jpe?g(\?|$)/)) {
      format = 'jpeg';
      isValidFormat = true;
    } else if (urlLower.match(/\.png(\?|$)/)) {
      format = 'png';
      isValidFormat = true;
    } else if (urlLower.match(/\.webp(\?|$)/)) {
      format = 'webp';
      isWebP = true;
    } else if (urlLower.match(/\.gif(\?|$)/)) {
      format = 'gif';
      isValidFormat = true;
    } else if (urlLower.match(/\.avif(\?|$)/)) {
      format = 'avif';
    }

    return {
      url,
      accessible: false,
      error: error.message,
      format,
      isWebP,
      isValidFormat,
      isValid: isValidFormat,
      note: 'Detected from URL extension (network request failed)'
    };
  }
}

/**
 * Detect image format from magic bytes (file signature)
 * Fallback when Content-Type header is unavailable
 *
 * @param {string} url - Image URL
 * @returns {Promise<Object|null>} Format detection result
 */
async function detectFormatFromMagicBytes(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Range': 'bytes=0-16' },
      mode: 'cors',
      credentials: 'omit'
    });

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // JPEG: FF D8 FF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return { format: 'jpeg', isWebP: false, isValidFormat: true };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return { format: 'png', isWebP: false, isValidFormat: true };
    }

    // WebP: RIFF....WEBP
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return { format: 'webp', isWebP: true, isValidFormat: false };
    }

    // GIF: GIF87a or GIF89a
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return { format: 'gif', isWebP: false, isValidFormat: true };
    }

    // AVIF: ....ftypavif
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      const ftypBrand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
      if (ftypBrand === 'avif') {
        return { format: 'avif', isWebP: false, isValidFormat: false };
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Fetch and parse robots.txt for AI crawler rules
 * @param {string} baseUrl - The base URL of the site (e.g., https://example.com)
 * @returns {Promise<Object>} Parsed robots.txt data with AI crawler rules
 */
async function fetchRobotsTxt(baseUrl) {
  // Validate URL parameter
  if (!baseUrl || typeof baseUrl !== 'string') {
    return {
      accessible: false,
      error: 'Invalid or missing baseUrl',
      crawlerRules: {},
      blockedCrawlers: [],
      allowedCrawlers: []
    };
  }

  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).href;
    const response = await fetch(robotsUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit'
    });

    if (!response.ok) {
      return {
        accessible: false,
        status: response.status,
        crawlerRules: {},
        blockedCrawlers: [],
        allowedCrawlers: MAJOR_AI_CRAWLERS // If no robots.txt, assume allowed
      };
    }

    const content = await response.text();
    return parseRobotsTxt(content);
  } catch (error) {
    // CORS or network error - can't determine rules
    return {
      accessible: false,
      error: error.message,
      crawlerRules: {},
      blockedCrawlers: [],
      allowedCrawlers: [] // Unknown status
    };
  }
}

/**
 * Parse robots.txt content and extract AI crawler rules
 * @param {string} content - The robots.txt content
 * @returns {Object} Parsed rules with blocked/allowed crawlers
 */
function parseRobotsTxt(content) {
  const lines = content.split('\n');
  const crawlerRules = {};
  let currentAgent = null;
  let hasWildcardDisallowAll = false;

  // Track rules per user-agent
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();

    // Skip comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') continue;

    // Parse user-agent line
    if (trimmed.startsWith('user-agent:')) {
      currentAgent = trimmed.replace('user-agent:', '').trim();
      if (!crawlerRules[currentAgent]) {
        crawlerRules[currentAgent] = { disallow: [], allow: [] };
      }
      continue;
    }

    // Parse disallow/allow rules
    if (currentAgent) {
      if (trimmed.startsWith('disallow:')) {
        const path = trimmed.replace('disallow:', '').trim();
        crawlerRules[currentAgent].disallow.push(path);

        // Check for wildcard disallow all
        if (currentAgent === '*' && (path === '/' || path === '/*')) {
          hasWildcardDisallowAll = true;
        }
      } else if (trimmed.startsWith('allow:')) {
        const path = trimmed.replace('allow:', '').trim();
        crawlerRules[currentAgent].allow.push(path);
      }
    }
  }

  // Determine which AI crawlers are blocked
  const blockedCrawlers = [];
  const allowedCrawlers = [];

  for (const crawler of MAJOR_AI_CRAWLERS) {
    const crawlerLower = crawler.toLowerCase();
    const rules = crawlerRules[crawlerLower];

    // Check if explicitly blocked
    if (rules && rules.disallow.some(path => path === '/' || path === '/*' || path === '')) {
      // Check if there's an allow rule that might override
      if (!rules.allow.some(path => path === '/' || path === '/*')) {
        blockedCrawlers.push(crawler);
        continue;
      }
    }

    // Check wildcard rules if no specific rules
    if (!rules && hasWildcardDisallowAll) {
      blockedCrawlers.push(crawler);
      continue;
    }

    allowedCrawlers.push(crawler);
  }

  return {
    accessible: true,
    crawlerRules,
    blockedCrawlers,
    allowedCrawlers,
    hasWildcardDisallowAll
  };
}

/**
 * Check for llms.txt and llms-full.txt files
 * @param {string} baseUrl - The base URL of the site
 * @returns {Promise<Object>} llms.txt presence and content info
 */
async function fetchLlmsTxt(baseUrl) {
  const results = {
    found: false,
    llmsTxt: { found: false, url: null, size: null },
    llmsFullTxt: { found: false, url: null, size: null }
  };

  // Validate URL parameter
  if (!baseUrl || typeof baseUrl !== 'string') {
    results.error = 'Invalid or missing baseUrl';
    return results;
  }

  // Check /llms.txt
  try {
    const llmsTxtUrl = new URL('/llms.txt', baseUrl).href;
    const response = await fetch(llmsTxtUrl, {
      method: 'HEAD',
      mode: 'cors',
      credentials: 'omit'
    });

    if (response.ok) {
      results.llmsTxt = {
        found: true,
        url: llmsTxtUrl,
        size: response.headers.get('Content-Length')
          ? parseInt(response.headers.get('Content-Length'), 10)
          : null
      };
      results.found = true;
    }
  } catch (e) {
    // Ignore errors - file doesn't exist or CORS blocked
  }

  // Check /llms-full.txt
  try {
    const llmsFullUrl = new URL('/llms-full.txt', baseUrl).href;
    const response = await fetch(llmsFullUrl, {
      method: 'HEAD',
      mode: 'cors',
      credentials: 'omit'
    });

    if (response.ok) {
      results.llmsFullTxt = {
        found: true,
        url: llmsFullUrl,
        size: response.headers.get('Content-Length')
          ? parseInt(response.headers.get('Content-Length'), 10)
          : null
      };
      results.found = true;
    }
  } catch (e) {
    // Ignore errors - file doesn't exist or CORS blocked
  }

  return results;
}

/**
 * Get Last-Modified header for a URL
 * @param {string} url - The URL to check
 * @returns {Promise<Object>} Last-Modified header info
 */
async function fetchLastModified(url) {
  // Validate URL parameter
  if (!url || typeof url !== 'string') {
    return {
      accessible: false,
      error: 'Invalid or missing URL',
      lastModified: null
    };
  }

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'cors',
      credentials: 'omit'
    });

    if (!response.ok) {
      return {
        accessible: false,
        status: response.status,
        lastModified: null
      };
    }

    const lastModified = response.headers.get('Last-Modified');
    const date = response.headers.get('Date');

    return {
      accessible: true,
      lastModified: lastModified ? new Date(lastModified).toISOString() : null,
      serverDate: date ? new Date(date).toISOString() : null
    };
  } catch (error) {
    return {
      accessible: false,
      error: error.message,
      lastModified: null
    };
  }
}

// Log when service worker starts
console.log('pdpIQ service worker started');
