/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves project sites from /<repo-name>/, not the domain root.
  base: process.env.GITHUB_PAGES ? '/dnd-online/' : '/',
  // TEMPORARY: sourcemaps so Chrome's file:line link on the
  // glCopySubTextureCHROMIUM console errors resolves to real source
  // instead of an unreadable minified single line. Remove once that bug
  // is diagnosed.
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'node',
  },
})
