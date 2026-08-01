import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/**
 * No SvelteKit, no SSR, no router: the report is a single mounted client
 * application inside a standalone file.
 */
export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true,
    css: 'external'
  }
}
