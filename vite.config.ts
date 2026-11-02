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
//
// `--mode chunks` builds without inlining, so the chunk split is visible:
// the compile module (and with it the Anthropic SDK) is reached only through
// a dynamic import() and lands in its own chunk, separate from the runtime.
// The bundle check (task 13.3) and `npm run build:chunks` use this mode.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'chunks' ? [] : [viteSingleFile()],
}))
