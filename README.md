# LLM Visibility Analyzer

Chrome extension that analyzes eCommerce Product Detail Pages (PDPs) for their visibility and representation within Large Language Model chat interfaces.

## Features

- **5 Scoring Categories** (~70 factors):
  - Structured Data (25%): JSON-LD, Microdata, RDFa schemas
  - Protocol & Meta (20%): Open Graph, Twitter Cards, canonical URLs
  - Content Quality (25%): Description, specs, features, FAQ
  - Content Structure (15%): Headings, semantic HTML, accessibility
  - Authority & Trust (15%): Reviews, ratings, certifications

- **Consumer Context Weighting**: Adjust scoring based on Want (emotional) vs Need (functional) purchase types

- **Critical Detection**: Identifies high-impact issues like WebP og:image format (invisible in LLM chats)

- **Prioritized Recommendations**: Sorted by impact and effort for actionable improvements

## Installation

### Development Setup

1. **Add Icons** (required before loading):
   - Create PNG icons at these sizes in the `icons/` folder:
     - `icon16.png` (16x16)
     - `icon48.png` (48x48)
     - `icon128.png` (128x128)
   - Use a tool like Figma or any image editor

2. **Load the Extension**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `llm-visibility-analyzer` folder

3. **Test**:
   - Navigate to any eCommerce product page
   - Click the extension icon in the toolbar
   - Select consumer context (Want/Need/Hybrid)
   - View analysis results in the side panel

## Usage

1. **Navigate** to a product page on any eCommerce site
2. **Click** the extension icon to open the side panel
3. **Select Context**:
   - **Want**: Emotional, lifestyle-driven purchases (emphasizes social proof, benefits)
   - **Need**: Functional, spec-driven purchases (emphasizes technical details, compatibility)
   - **Hybrid**: Balanced consideration
4. **Review Results**:
   - Overall score (0-100) with letter grade (A-F)
   - Category breakdown with expandable factor details
   - Prioritized recommendations with impact/effort ratings

## Key Insights

### Critical Issues (High Impact)
- **WebP og:image**: Images in WebP format don't render in LLM chat interfaces - convert to JPEG/PNG
- **Missing Product Schema**: Essential for LLMs to understand the page is a product
- **Robots noindex**: Blocks LLMs from accessing content entirely

### Context Weight Multipliers
| Factor | Want | Need |
|--------|------|------|
| Emotional copy | 1.5x | 0.5x |
| Technical specs | 0.6x | 1.5x |
| Compatibility | 0.4x | 2.0x |
| Social proof | 1.4x | 0.8x |
| Certifications | 0.5x | 1.6x |

## Project Structure

```
llm-visibility-analyzer/
├── manifest.json              # Extension configuration
├── icons/                     # Extension icons (add your own)
├── src/
│   ├── background/
│   │   └── service-worker.js  # Message routing, image verification
│   ├── content/
│   │   ├── content-script.js  # Page data extraction
│   │   └── extractors/        # Modular extractor source (reference)
│   ├── sidepanel/
│   │   ├── sidepanel.html     # UI structure
│   │   ├── sidepanel.css      # Styling
│   │   └── sidepanel.js       # UI controller
│   ├── scoring/
│   │   ├── scoring-engine.js  # Score calculation
│   │   ├── weights.js         # Category and context weights
│   │   └── grading.js         # Grade utilities
│   ├── recommendations/
│   │   ├── recommendation-engine.js
│   │   └── recommendation-rules.js
│   └── storage/
│       └── storage-manager.js # Local history storage
```

## Grading Scale

| Grade | Score | Interpretation |
|-------|-------|----------------|
| A | 90-100 | Excellent LLM visibility |
| B | 80-89 | Good foundation, specific gaps |
| C | 70-79 | Average, significant opportunities |
| D | 60-69 | Below average, critical issues |
| F | <60 | Poor visibility, fundamental changes needed |

## Technical Notes

- Built with Chrome Extension Manifest V3
- Uses Chrome Side Panel API for results display
- Local storage for analysis history (no backend required)
- Image format verification via HTTP HEAD requests
