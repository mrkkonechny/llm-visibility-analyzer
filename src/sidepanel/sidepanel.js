/**
 * Side Panel Application
 * Main UI controller for the extension
 */

import { ScoringEngine } from '../scoring/scoring-engine.js';
import { RecommendationEngine } from '../recommendations/recommendation-engine.js';
import { getGradeDescription, CATEGORY_DESCRIPTIONS, FACTOR_RECOMMENDATIONS } from '../scoring/weights.js';
import { RECOMMENDATION_TEMPLATES } from '../recommendations/recommendation-rules.js';
import {
  saveAnalysis,
  getHistory,
  clearHistory
} from '../storage/storage-manager.js';

/**
 * Escape HTML to prevent XSS when inserting user-controlled data
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for innerHTML
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

class SidePanelApp {
  constructor() {
    this.currentData = null;
    this.selectedContext = null;
    this.scoreResult = null;
    this.recommendations = [];
    this.currentRequestId = null;
    this.analysisTimeoutId = null;

    this.init();
  }

  async init() {
    this.bindEvents();
    this.setupMessageListener();
    await this.updatePageInfo();
    await this.loadHistory();
  }

  bindEvents() {
    // Context selection buttons
    document.querySelectorAll('.context-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const context = e.currentTarget.dataset.context;
        this.startAnalysis(context);
      });
    });

    // Re-analyze button
    document.getElementById('reanalyzeBtn').addEventListener('click', () => {
      this.showContextSelector();
    });

    // Retry button (error state)
    document.getElementById('retryBtn').addEventListener('click', () => {
      this.showContextSelector();
    });

    // Tab navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchTab(e.currentTarget.dataset.tab);
      });
    });

    // Clear history button
    document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
      if (confirm('Clear all analysis history?')) {
        await clearHistory();
        await this.loadHistory();
      }
    });

    // Event delegation for category list (prevents memory leaks from re-rendering)
    document.getElementById('categoryList').addEventListener('click', (e) => {
      // Handle category header clicks (expand/collapse)
      const header = e.target.closest('.category-header');
      if (header && !e.target.closest('.factor-expand-btn')) {
        const card = header.closest('.category-card');
        const isExpanded = header.dataset.expanded === 'true';
        header.dataset.expanded = !isExpanded;
        header.querySelector('.expand-icon').textContent = isExpanded ? '+' : '−';
        card.querySelector('.category-details').classList.toggle('hidden');
        return;
      }

      // Handle factor expand button clicks
      const expandBtn = e.target.closest('.factor-expand-btn');
      if (expandBtn) {
        e.stopPropagation();
        const factor = expandBtn.closest('.factor');
        const rec = factor.querySelector('.factor-recommendation');
        const isExpanded = !rec.classList.contains('hidden');
        rec.classList.toggle('hidden');
        expandBtn.textContent = isExpanded ? '▶' : '▼';
      }
    });
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'EXTRACTION_COMPLETE') {
        // Verify this response matches the current request
        if (message.requestId && message.requestId !== this.currentRequestId) {
          console.log('Ignoring stale extraction response:', message.requestId);
          return;
        }
        console.log('Received extraction data:', message);
        // Clear the timeout since we received valid data
        if (this.analysisTimeoutId) {
          clearTimeout(this.analysisTimeoutId);
          this.analysisTimeoutId = null;
        }
        this.currentData = message.data;
        this.processResults();
      }
    });
  }

  async updatePageInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        const domain = new URL(tab.url).hostname;
        document.getElementById('pageDomain').textContent = domain;
      }
    } catch (e) {
      console.error('Error getting page info:', e);
    }
  }

  async startAnalysis(context) {
    this.selectedContext = context;
    this.showLoading();

    // Clear any previous timeout and reset state
    if (this.analysisTimeoutId) {
      clearTimeout(this.analysisTimeoutId);
      this.analysisTimeoutId = null;
    }
    this.currentData = null;

    // Generate unique request ID to prevent race conditions
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.currentRequestId = requestId;

    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) {
        this.showError('No active tab found');
        return;
      }

      // Request data extraction from content script
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_DATA', requestId }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError);
          // Content script might not be loaded, try injecting
          this.showError('Unable to analyze this page. Make sure you are on a product page.');
        }
      });

      // Set a timeout in case we don't get a response
      this.analysisTimeoutId = setTimeout(() => {
        // Only show error if this is still the current request and no data received
        if (this.currentRequestId === requestId && !this.currentData) {
          this.showError('Analysis timed out. Please try again.');
        }
      }, 10000);

    } catch (e) {
      console.error('Error starting analysis:', e);
      this.showError(e.message);
    }
  }

  async processResults() {
    try {
      // Get current page URL for network fetches
      const pageUrl = this.currentData.pageInfo?.url;
      const baseUrl = pageUrl ? new URL(pageUrl).origin : null;

      // Verify og:image format if present
      let imageVerification = null;
      const ogImage = this.currentData.metaTags?.openGraph?.image;

      if (ogImage) {
        imageVerification = await this.verifyImageFormat(ogImage);
      }

      // Fetch AI Discoverability network data
      let aiDiscoverabilityData = null;
      if (baseUrl) {
        aiDiscoverabilityData = await this.fetchAIDiscoverabilityData(baseUrl, pageUrl);
      }

      // Score the data
      const scoringEngine = new ScoringEngine(this.selectedContext);
      this.scoreResult = scoringEngine.calculateScore(this.currentData, imageVerification, aiDiscoverabilityData);

      // Generate recommendations
      const recEngine = new RecommendationEngine(
        this.scoreResult,
        this.currentData,
        imageVerification
      );
      this.recommendations = recEngine.generateRecommendations();

      // Display results
      this.displayResults();

      // Save to history
      await saveAnalysis({
        url: this.currentData.pageInfo?.url,
        pageInfo: this.currentData.pageInfo,
        scoreResult: this.scoreResult,
        recommendations: this.recommendations
      });

      // Refresh history
      await this.loadHistory();

    } catch (e) {
      console.error('Error processing results:', e);
      this.showError('Error processing analysis results: ' + e.message);
    }
  }

  async verifyImageFormat(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'VERIFY_IMAGE_FORMAT', url },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('Image verification error:', chrome.runtime.lastError);
            resolve(null);
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  /**
   * Fetch AI Discoverability network data
   * @param {string} baseUrl - Base URL of the site (origin)
   * @param {string} pageUrl - Full page URL
   * @returns {Promise<Object>} AI discoverability network data
   */
  async fetchAIDiscoverabilityData(baseUrl, pageUrl) {
    const [robots, llms, lastModified] = await Promise.all([
      this.fetchRobotsTxt(baseUrl),
      this.fetchLlmsTxt(baseUrl),
      this.fetchLastModified(pageUrl)
    ]);

    return { robots, llms, lastModified };
  }

  /**
   * Fetch and parse robots.txt for AI crawler rules
   * @param {string} baseUrl - Base URL of the site
   * @returns {Promise<Object>} Parsed robots.txt data
   */
  async fetchRobotsTxt(baseUrl) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'FETCH_ROBOTS_TXT', baseUrl },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('robots.txt fetch error:', chrome.runtime.lastError);
            resolve({ accessible: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  /**
   * Check for llms.txt files
   * @param {string} baseUrl - Base URL of the site
   * @returns {Promise<Object>} llms.txt presence data
   */
  async fetchLlmsTxt(baseUrl) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'FETCH_LLMS_TXT', baseUrl },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('llms.txt fetch error:', chrome.runtime.lastError);
            resolve({ found: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  /**
   * Fetch Last-Modified header for a URL
   * @param {string} url - URL to check
   * @returns {Promise<Object>} Last-Modified header data
   */
  async fetchLastModified(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'FETCH_LAST_MODIFIED', url },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('Last-Modified fetch error:', chrome.runtime.lastError);
            resolve({ accessible: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  displayResults() {
    this.hideLoading();
    this.hideContextSelector();
    this.showResults();

    // Update grade display
    const gradeEl = document.getElementById('gradeDisplay');
    gradeEl.textContent = this.scoreResult.grade;
    gradeEl.className = `grade grade-${this.scoreResult.grade}`;

    // Update score
    document.getElementById('scoreValue').textContent = this.scoreResult.totalScore;

    // Update context label
    document.getElementById('contextLabel').textContent =
      `${this.selectedContext.charAt(0).toUpperCase() + this.selectedContext.slice(1)} Context`;

    // Update grade description
    document.getElementById('gradeDescription').textContent =
      getGradeDescription(this.scoreResult.grade);

    // Render category cards
    this.renderCategories();

    // Render recommendations
    this.renderRecommendations();
  }

  renderCategories() {
    const container = document.getElementById('categoryList');
    container.innerHTML = '';

    const categoryOrder = [
      'structuredData',
      'protocolMeta',
      'contentQuality',
      'contentStructure',
      'authorityTrust',
      'aiDiscoverability'
    ];

    categoryOrder.forEach(key => {
      const data = this.scoreResult.categoryScores[key];
      if (!data) return;

      const card = document.createElement('div');
      card.className = 'category-card';

      // Determine score class
      const scoreClass = data.score >= 80 ? 'score-high' :
                         data.score >= 60 ? 'score-medium' : 'score-low';

      card.innerHTML = `
        <div class="category-header" data-expanded="false">
          <span class="category-name" title="${CATEGORY_DESCRIPTIONS[key]}">${data.categoryName}</span>
          <span class="category-score ${scoreClass}">${Math.round(data.score)}</span>
          <span class="expand-icon">+</span>
        </div>
        <div class="category-details hidden">
          ${this.renderFactors(data.factors)}
        </div>
      `;

      // Event handlers are delegated via categoryList click listener in bindEvents()
      container.appendChild(card);
    });
  }

  renderFactors(factors) {
    return factors.map(f => {
      const statusIcon = f.status === 'pass' ? '✓' :
                         f.status === 'fail' ? '✗' : '⚠';
      const contextualLabel = f.contextual ? '<span class="multiplier">CTX</span>' : '';

      // Get recommendation if factor has a mapping
      const recId = FACTOR_RECOMMENDATIONS[f.name];
      const rec = recId ? RECOMMENDATION_TEMPLATES[recId] : null;

      const expandBtn = rec ? '<button class="factor-expand-btn">▶</button>' : '';
      const recSection = rec ? `
        <div class="factor-recommendation hidden">
          <p class="factor-rec-text">${rec.description}</p>
          <p class="factor-rec-impl">${rec.implementation}</p>
        </div>
      ` : '';

      return `
        <div class="factor ${f.status}${rec ? ' has-recommendation' : ''}">
          <div class="factor-row">
            ${expandBtn}
            <span class="factor-name">${f.name}${contextualLabel}</span>
            <span class="factor-status">${statusIcon}</span>
            <span class="factor-points">${f.points}/${f.maxPoints}</span>
          </div>
          ${recSection}
        </div>
      `;
    }).join('');
  }

  renderRecommendations() {
    const container = document.getElementById('recommendationList');
    container.innerHTML = '';

    // Update count
    document.getElementById('recCount').textContent = this.recommendations.length;

    // Show top 10 recommendations
    this.recommendations.slice(0, 10).forEach(rec => {
      const item = document.createElement('div');
      item.className = `recommendation impact-${rec.impact}`;

      item.innerHTML = `
        <div class="rec-header">
          <span class="rec-title">${rec.title}</span>
          <span class="rec-badges">
            <span class="badge impact-badge ${rec.impact}">${rec.impact}</span>
            <span class="badge effort-badge">${rec.effort}</span>
          </span>
        </div>
        <p class="rec-description">${rec.description}</p>
        ${rec.implementation ? `<p class="rec-implementation">${rec.implementation}</p>` : ''}
      `;

      container.appendChild(item);
    });

    if (this.recommendations.length === 0) {
      container.innerHTML = '<p class="empty-state">No recommendations - great job!</p>';
    }
  }

  async loadHistory() {
    const history = await getHistory();
    const container = document.getElementById('historyList');
    const emptyState = document.getElementById('emptyHistory');

    container.innerHTML = '';

    if (history.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    history.slice(0, 20).forEach(entry => {
      const item = document.createElement('div');
      item.className = 'history-item';

      const gradeColor = this.getGradeColor(entry.grade);
      const timeAgo = this.formatTimeAgo(entry.timestamp);

      item.innerHTML = `
        <div class="history-grade" style="background: ${gradeColor}">${escapeHtml(entry.grade)}</div>
        <div class="history-info">
          <div class="history-title" title="${escapeHtml(entry.title)}">${escapeHtml(entry.title)}</div>
          <div class="history-meta">${escapeHtml(entry.domain)} · ${escapeHtml(timeAgo)}</div>
        </div>
        <div class="history-score">${escapeHtml(entry.score)}</div>
      `;

      container.appendChild(item);
    });
  }

  getGradeColor(grade) {
    const colors = {
      A: '#22c55e',
      B: '#84cc16',
      C: '#eab308',
      D: '#f97316',
      F: '#ef4444'
    };
    return colors[grade] || colors.F;
  }

  formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return new Date(timestamp).toLocaleDateString();
  }

  switchTab(tab) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Show/hide sections
    if (tab === 'results') {
      document.getElementById('historySection').classList.add('hidden');

      // Show appropriate results view
      if (this.scoreResult) {
        this.showResults();
      } else {
        this.showContextSelector();
      }
    } else if (tab === 'history') {
      document.getElementById('contextSelector').classList.add('hidden');
      document.getElementById('results').classList.add('hidden');
      document.getElementById('loadingState').classList.add('hidden');
      document.getElementById('errorState').classList.add('hidden');
      document.getElementById('historySection').classList.remove('hidden');
    }
  }

  showContextSelector() {
    document.getElementById('contextSelector').classList.remove('hidden');
    document.getElementById('results').classList.add('hidden');
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('historySection').classList.add('hidden');
  }

  hideContextSelector() {
    document.getElementById('contextSelector').classList.add('hidden');
  }

  showLoading() {
    document.getElementById('contextSelector').classList.add('hidden');
    document.getElementById('results').classList.add('hidden');
    document.getElementById('loadingState').classList.remove('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('historySection').classList.add('hidden');
  }

  hideLoading() {
    document.getElementById('loadingState').classList.add('hidden');
  }

  showResults() {
    document.getElementById('contextSelector').classList.add('hidden');
    document.getElementById('results').classList.remove('hidden');
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('historySection').classList.add('hidden');
  }

  showError(message) {
    document.getElementById('contextSelector').classList.add('hidden');
    document.getElementById('results').classList.add('hidden');
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('errorState').classList.remove('hidden');
    document.getElementById('historySection').classList.add('hidden');
    document.getElementById('errorMessage').textContent = message;
  }
}

// Initialize the app
new SidePanelApp();
