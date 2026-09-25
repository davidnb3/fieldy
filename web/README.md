# Fieldy marketing site

Home page only. Dark UI `#1a1b1e`, accent `#ff8a3d`, Fieldy lockup from the desktop app.

```bash
cd web
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Production build: `npm run build` then `npm run preview`.

Download buttons link to `public/downloads/Fieldy-mac-arm64.zip` (Apple Silicon `.app`) and `public/downloads/Fieldy-windows-x64.zip`. Those zips are gitignored. Copy or zip them into that folder before serving the site; do not import them from JavaScript.
