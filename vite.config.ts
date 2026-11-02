import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Relative base so the production bundle in dist/ runs from file:// or any
// static host. There is no server, no API route, no serverless function.
//
// `viteSingleFile` inlines the JS and CSS into a single self-contained
// dist/index.html. Stock Chrome blocks ES module scripts loaded from a
// file:// origin (CORS), so the built page must not reference an external
// ./assets/*.js chunk. Inlining keeps the dev experience unchanged while
// making the production build openable directly from the filesystem.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
})
