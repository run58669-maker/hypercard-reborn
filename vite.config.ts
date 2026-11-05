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
// `--mode chunks` builds without inlining and with an explicit chunk split,
// so the module graph is visible in the output: the interpreter and parser
// land in an `interpreter` chunk, the compile module with the Anthropic SDK
// and zod in a `compile` chunk that is reached only through a dynamic
// import(). The bundle check (task 13.3) and `npm run build:chunks` use it.
export default defineConfig(({ mode }) => {
  const chunks = mode === 'chunks'
  return {
    base: './',
    plugins: chunks ? [] : [viteSingleFile()],
    build: chunks
      ? {
          rollupOptions: {
            output: {
              manualChunks(id: string) {
                if (id.includes('/src/interpreter/') || id.includes('/src/parser/')) return 'interpreter'
                if (id.includes('/src/compile/') || id.includes('@anthropic-ai/') || id.includes('/node_modules/zod/')) return 'compile'
                return undefined
              },
            },
          },
        }
      : {},
  }
})
