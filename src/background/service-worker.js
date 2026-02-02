/**
 * Service Worker - Message routing hub and og:image format verification
 */

// Open side panel on extension icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

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

// Log when service worker starts
console.log('pdpIQ service worker started');
