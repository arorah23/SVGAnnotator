# SVG Annotator

A lightweight React + Vite playground for uploading an SVG, selecting elements, and attaching labels/notes/comments. You can export annotated SVG/HTML/JSON bundles for sharing.

## Prerequisites
- Node.js 18+ and npm

## Install & run locally
```bash
npm install
npm run dev
```

The dev server prints a URL such as http://localhost:5173. Open it in your browser.

To preview a production build locally:
```bash
npm run build
npm run preview
```

## How to use the app
1) Upload an SVG: drag-and-drop or click the upload area. The app sanitizes the SVG and renders it on the left.
2) Pick a mode: use the **Mode** switch to toggle **Edit** (annotate) or **View** (read-only) states.
3) Select elements: click any visible SVG element to select it. The Details panel shows its `id` and tag name.
4) Add details: in **Edit** mode, fill **Label** and **Notes** for the selected element. Deselected elements keep their existing data.
5) Manage comments: open the **Comments** panel, add/edit notes for elements, and use **Save all** or **Save comments only** as needed.
6) Export: open **Export** to copy, download, or preview generated outputs (annotated HTML, raw SVG, or JSON metadata). Use the preview textarea for a quick read-only view.
7) Reset: use **Reset canvas** to clear selections and annotations and restart with a fresh upload.

## Where things live
- UI entry: `src/App.tsx` (handles uploads, selection, details/comments, export)
- UI primitives: `src/components/ui/`
- Styling: `src/index.css`
- Build tooling: Vite config in `vite.config.ts`

## Scripts
- `npm run dev` — start the dev server
- `npm run build` — build the static site
- `npm run preview` — preview the production build locally
