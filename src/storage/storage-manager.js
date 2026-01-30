/**
 * Storage Manager
 * Handles local storage for analysis history
 */

const HISTORY_KEY = 'analysisHistory';
const MAX_HISTORY = 100;

/**
 * Save an analysis to history
 * @param {Object} analysis - Analysis result to save
 * @returns {Promise<Object>} Saved analysis with ID
 */
export async function saveAnalysis(analysis) {
  const history = await getHistory();

  const entry = {
    id: Date.now().toString(),
    url: analysis.url || analysis.pageInfo?.url,
    title: analysis.pageInfo?.title || 'Unknown Page',
    domain: analysis.pageInfo?.domain || new URL(analysis.url || analysis.pageInfo?.url).hostname,
    score: analysis.scoreResult?.totalScore,
    grade: analysis.scoreResult?.grade,
    context: analysis.scoreResult?.context,
    timestamp: Date.now(),
    categoryScores: Object.fromEntries(
      Object.entries(analysis.scoreResult?.categoryScores || {}).map(([key, data]) => [
        key,
        { score: data.score, name: data.categoryName }
      ])
    ),
    recommendationCount: analysis.recommendations?.length || 0,
    criticalIssues: (analysis.recommendations || [])
      .filter(r => r.impact === 'high')
      .length
  };

  // Add to beginning of history
  history.unshift(entry);

  // Trim to max size
  if (history.length > MAX_HISTORY) {
    history.length = MAX_HISTORY;
  }

  await chrome.storage.local.set({ [HISTORY_KEY]: history });

  return entry;
}

/**
 * Get analysis history
 * @returns {Promise<Array>} History array
 */
export async function getHistory() {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  return result[HISTORY_KEY] || [];
}

/**
 * Get a single analysis by ID
 * @param {string} id - Analysis ID
 * @returns {Promise<Object|null>} Analysis or null
 */
export async function getAnalysis(id) {
  const history = await getHistory();
  return history.find(a => a.id === id) || null;
}

/**
 * Delete an analysis
 * @param {string} id - Analysis ID
 * @returns {Promise<boolean>} Success
 */
export async function deleteAnalysis(id) {
  const history = await getHistory();
  const index = history.findIndex(a => a.id === id);

  if (index === -1) return false;

  history.splice(index, 1);
  await chrome.storage.local.set({ [HISTORY_KEY]: history });

  return true;
}

/**
 * Clear all history
 * @returns {Promise<void>}
 */
export async function clearHistory() {
  await chrome.storage.local.remove(HISTORY_KEY);
}

/**
 * Get history grouped by domain
 * @returns {Promise<Object>} History grouped by domain
 */
export async function getHistoryByDomain() {
  const history = await getHistory();
  const grouped = {};

  history.forEach(entry => {
    if (!grouped[entry.domain]) {
      grouped[entry.domain] = [];
    }
    grouped[entry.domain].push(entry);
  });

  return grouped;
}

/**
 * Get recent analyses (last N)
 * @param {number} n - Number of recent analyses
 * @returns {Promise<Array>} Recent analyses
 */
export async function getRecentAnalyses(n = 10) {
  const history = await getHistory();
  return history.slice(0, n);
}

/**
 * Export history as JSON
 * @returns {Promise<string>} JSON string
 */
export async function exportHistory() {
  const history = await getHistory();
  return JSON.stringify(history, null, 2);
}

/**
 * Get storage usage stats
 * @returns {Promise<Object>} Storage stats
 */
export async function getStorageStats() {
  const history = await getHistory();
  const bytesUsed = await chrome.storage.local.getBytesInUse(HISTORY_KEY);

  return {
    analysisCount: history.length,
    bytesUsed,
    bytesFormatted: formatBytes(bytesUsed),
    oldestAnalysis: history.length > 0 ? history[history.length - 1].timestamp : null,
    newestAnalysis: history.length > 0 ? history[0].timestamp : null
  };
}

/**
 * Format bytes to human readable
 * @param {number} bytes - Bytes
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
