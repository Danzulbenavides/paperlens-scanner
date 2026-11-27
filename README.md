# PaperLens — Document Scanner

A browser-based document scanner built on the supplied React + Vite template structure.

## Features

- Upload JPG, PNG, and WEBP images or capture a photo with the device camera.
- Detect likely document edges and suggest a four-corner crop.
- Manually adjust the four corners before processing.
- Correct perspective with a projective transform.
- Apply Clean, Color, Grayscale, Black & White, or Original enhancement.
- Combine several scanned pages into a single PDF.
- Download a single page as JPEG.
- Keep a small recent-scan history in browser local storage.
- Process images in the browser; there is no application server or cloud upload.

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. For camera access on a phone or another device, serve the app over HTTPS; browsers generally restrict camera access on non-secure origins other than localhost.

## Production build

```bash
npm run build
npm run preview
```

## Project layout

```text
src/
├── components/
│   ├── layout/       # App navigation, top bar, icon component
│   └── scanner/      # Crop and scan preview components
├── utils/
│   ├── imageProcessing.js  # Edge detection, perspective warp, filters
│   └── pdf.js              # Client-side multi-page PDF writer
├── App.css
├── App.jsx
└── main.jsx
```

## Notes and limitations

Automatic edge detection is a best-effort browser-side detector. It works best when the paper has visible contrast against the background. Always review the four crop handles; manual adjustment is included for difficult photos. Filters improve contrast and readability but cannot recover text that is out of focus, obscured, or missing.

Recent history is saved to this browser's local storage. It is not synchronized between devices and may be cleared when browser data is cleared. The history preview is a reduced-size JPEG; export the original scan before relying on it as an archival copy.
