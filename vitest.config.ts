import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    // Node 25 turned the Web Storage API on by default, which installs a
    // `localStorage` getter on globalThis. Without `--localstorage-file` that
    // getter returns a stub with no Storage prototype — no getItem/setItem/clear
    // — and vitest's jsdom environment does not replace a global that already
    // exists, so every localStorage test saw Node's stub instead of jsdom's real
    // Storage. Turning Node's copy off lets jsdom install the working one.
    execArgv: ['--no-webstorage'],
  },
})
