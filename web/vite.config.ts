import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

/**
 * The report is one standalone file opened through a file URL, so the build
 * must produce exactly one classic IIFE and one stylesheet with no module
 * syntax, dynamic chunk, source map, or external resource reference.
 */
export default defineConfig({
  plugins: [svelte()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    cssMinify: true,
    sourcemap: false,
    minify: true,
    reportCompressedSize: false,
    // Any emitted asset would become a second file the Go embed layer cannot
    // inline, so nothing may be treated as an external asset.
    assetsInlineLimit: 0,
    modulePreload: false,
    lib: {
      entry: 'src/main.ts',
      formats: ['iife'],
      name: 'gitlogHtmlReport',
      fileName: () => 'app.js',
      cssFileName: 'app'
    }
  },
  server: { port: 5199, strictPort: false }
})
