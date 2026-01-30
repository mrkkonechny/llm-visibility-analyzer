/**
 * Grading Utilities
 * Helper functions for grade calculation and display
 */

import { getGrade, getGradeDescription, GRADE_THRESHOLDS } from './weights.js';

/**
 * Get color for grade
 * @param {string} grade - Letter grade
 * @returns {string} CSS color
 */
export function getGradeColor(grade) {
  const colors = {
    A: '#22c55e',  // Green
    B: '#84cc16',  // Lime
    C: '#eab308',  // Yellow
    D: '#f97316',  // Orange
    F: '#ef4444'   // Red
  };
  return colors[grade] || colors.F;
}

/**
 * Get background color for grade
 * @param {string} grade - Letter grade
 * @returns {string} CSS background color
 */
export function getGradeBackgroundColor(grade) {
  const colors = {
    A: '#dcfce7',  // Light green
    B: '#ecfccb',  // Light lime
    C: '#fef9c3',  // Light yellow
    D: '#ffedd5',  // Light orange
    F: '#fee2e2'   // Light red
  };
  return colors[grade] || colors.F;
}

/**
 * Get icon for grade
 * @param {string} grade - Letter grade
 * @returns {string} Emoji icon
 */
export function getGradeIcon(grade) {
  const icons = {
    A: '🌟',
    B: '✅',
    C: '⚠️',
    D: '⚡',
    F: '🚨'
  };
  return icons[grade] || icons.F;
}

/**
 * Get improvement potential message
 * @param {number} score - Current score
 * @param {string} grade - Current grade
 * @returns {Object} Improvement potential info
 */
export function getImprovementPotential(score, grade) {
  const nextGrade = getNextGrade(grade);
  if (!nextGrade) {
    return {
      hasRoom: false,
      message: 'Excellent! You\'ve achieved the highest grade.',
      pointsToNext: 0
    };
  }

  const pointsToNext = GRADE_THRESHOLDS[nextGrade] - score;

  return {
    hasRoom: true,
    nextGrade,
    pointsToNext,
    message: `${pointsToNext} points to reach ${nextGrade} grade`
  };
}

/**
 * Get the next higher grade
 * @param {string} grade - Current grade
 * @returns {string|null} Next grade or null if A
 */
function getNextGrade(grade) {
  const order = ['F', 'D', 'C', 'B', 'A'];
  const index = order.indexOf(grade);
  if (index === -1 || index === order.length - 1) {
    return null;
  }
  return order[index + 1];
}

/**
 * Format score for display
 * @param {number} score - Score 0-100
 * @returns {string} Formatted score
 */
export function formatScore(score) {
  return Math.round(score).toString();
}

/**
 * Get category score summary
 * @param {Object} categoryScores - All category scores
 * @returns {Array} Sorted category summaries
 */
export function getCategoryScoreSummary(categoryScores) {
  return Object.entries(categoryScores)
    .map(([key, data]) => ({
      key,
      name: data.categoryName,
      score: data.score,
      weight: data.weight,
      weightedScore: data.score * data.weight,
      passCount: data.factors.filter(f => f.status === 'pass').length,
      failCount: data.factors.filter(f => f.status === 'fail').length,
      warningCount: data.factors.filter(f => f.status === 'warning').length,
      totalFactors: data.factors.length
    }))
    .sort((a, b) => a.score - b.score); // Lowest first (biggest opportunities)
}

/**
 * Get critical issues from scores
 * @param {Object} categoryScores - All category scores
 * @returns {Array} Critical issues
 */
export function getCriticalIssues(categoryScores) {
  const issues = [];

  Object.values(categoryScores).forEach(category => {
    category.factors.forEach(factor => {
      if (factor.critical && factor.status === 'fail') {
        issues.push({
          category: category.categoryName,
          factor: factor.name,
          details: factor.details,
          impact: 'high'
        });
      }
    });
  });

  return issues;
}

// Re-export for convenience
export { getGrade, getGradeDescription };
