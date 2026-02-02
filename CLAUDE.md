# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/claude-code) when working with code in this repository.

## Project Overview

pdpIQ (Product Description Page IQ) is a Chrome extension by **Tribbute** that analyzes eCommerce Product Detail Pages (PDPs) for AI citation readiness. It scores pages across ~70 factors in 5 categories and provides actionable recommendations.

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript (ES modules)
- Chrome Side Panel API for UI
- Chrome Storage API for history persistence
- No build tools or bundlers required

## Project Structure

```
pdpiq/
├── manifest.json                 # Extension configuration
├── icons/
│   ├── icon16.png               # Toolbar icon
│   ├── icon48.png               # Extensions page icon
│   ├── icon128.png              # Chrome Web Store icon
│   └── tribbute-logo.png        # Header branding
├── src/
│   ├── background/
│   │   └── service-worker.js    # Message routing, image format verification
│   ├── content/
│   │   ├── content-script.js    # Main extraction orchestrator
│   │   └── extractors/
│   │       ├── index.js         # Extractor exports
│   │       ├── structured-data.js   # JSON-LD, Microdata, RDFa
│   │       ├── meta-tags.js         # OG, Twitter Cards, canonical
│   │       ├── content-quality.js   # Description, specs, features
│   │       ├── content-structure.js # Headings, semantic HTML
│   │       └── trust-signals.js     # Reviews, ratings, certs
│   ├── scoring/
│   │   ├── scoring-engine.js    # Core scoring calculations
│   │   ├── weights.js           # Category/factor/context weights
│   │   └── grading.js           # Grade utilities (A-F)
│   ├── recommendations/
│   │   ├── recommendation-engine.js  # Prioritization logic
│   │   └── recommendation-rules.js   # Issue-to-fix mappings
│   ├── sidepanel/
│   │   ├── sidepanel.html       # UI markup
│   │   ├── sidepanel.css        # Styling
│   │   └── sidepanel.js         # UI controller
│   └── storage/
│       └── storage-manager.js   # Analysis history persistence
└── styles/                      # Additional stylesheets
```

## Development Workflow

### Loading the Extension
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the project root
4. Test on any eCommerce product page

### Testing Changes
- Reload the extension from `chrome://extensions/` after code changes
- For content script changes, also refresh the target page
- For service worker changes, click the "Update" button on the extension card

### Debugging
- Service worker: `chrome://extensions/` → "Inspect views: service worker"
- Content script: DevTools on target page → Console
- Side panel: Right-click side panel → Inspect

## Architecture

### Message Flow
1. User clicks extension icon → opens side panel
2. User selects context (Want/Need/Hybrid)
3. Side panel sends `ANALYZE_PAGE` message to service worker
4. Service worker injects/messages content script
5. Content script runs extractors, returns raw data
6. Service worker verifies image formats (HTTP HEAD requests)
7. Side panel receives data, runs scoring engine
8. Results displayed with recommendations

### Scoring System

**Category Weights** (total = 100%):
- Structured Data: 25% (JSON-LD Product/Offer schemas critical)
- Protocol & Meta: 20% (og:image format critical - WebP fails in LLM chats)
- Content Quality: 25% (descriptions, specs, features, FAQ)
- Content Structure: 15% (semantic HTML, headings, accessibility)
- Authority & Trust: 15% (reviews, ratings, certifications)

**Context Multipliers** adjust factor weights based on purchase type:
- **Want** (emotional): boosts social proof, benefits, reviews; reduces specs
- **Need** (functional): boosts specs, compatibility, certifications; reduces emotional content
- **Hybrid**: neutral (1.0x all factors)

### Critical Detection
These issues have outsized impact and are flagged prominently:
- `og:image` in WebP format (invisible in most LLM chat interfaces)
- Missing Product schema (LLMs can't identify page as product)
- `robots` meta with `noindex` (blocks LLM crawlers entirely)

## Key Files Quick Reference

| File | Purpose |
|------|---------|
| `manifest.json` | Extension permissions, content script config |
| `src/content/content-script.js` | Orchestrates all data extraction |
| `src/scoring/weights.js` | All scoring weights and multipliers |
| `src/scoring/scoring-engine.js` | Score calculation logic |
| `src/recommendations/recommendation-rules.js` | Fix suggestions per issue |
| `src/sidepanel/sidepanel.js` | UI state management and rendering |

## Common Tasks

### Adding a New Factor
1. Add extraction logic in appropriate `src/content/extractors/*.js`
2. Add factor weight in `src/scoring/weights.js` → `FACTOR_WEIGHTS`
3. If context-sensitive, add multipliers in `CONTEXT_MULTIPLIERS`
4. Add recommendation rule in `src/recommendations/recommendation-rules.js`

### Modifying Scoring Weights
Edit `src/scoring/weights.js`:
- `CATEGORY_WEIGHTS` - must sum to 1.0
- `FACTOR_WEIGHTS` - relative weights within each category
- `CONTEXT_MULTIPLIERS` - per-context adjustments

### Updating UI
- Markup: `src/sidepanel/sidepanel.html`
- Styles: `src/sidepanel/sidepanel.css`
- Logic: `src/sidepanel/sidepanel.js`
