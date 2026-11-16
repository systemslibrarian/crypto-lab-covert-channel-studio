import { defineConfig } from '@playwright/test';

/**
 * The browser gate.
 *
 * This lab has no build step, so there is nothing for `vite preview` to serve
 * the way the rest of the fleet does it. The web server here is the same
 * `python3 -m http.server` that `npm run serve` runs, pointed at the repository
 * root — which is byte-for-byte what GitHub Pages publishes. That matters more
 * than usual: index.html allows its one inline script by sha256 hash, so the
 * bytes the browser hashes have to be the bytes in git, with no bundler in
 * between rewriting them.
 *
 * `retries: 0`, unlike the fleet's `retries: 1` in CI. The exhibit is a seeded,
 * fully offline simulation — nothing here is allowed to be flaky, and a retry
 * would convert the one failure mode this gate exists to catch (the page not
 * booting) into an intermittent green.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    // index.html pins dark as the only theme; scan what visitors actually get.
    colorScheme: 'dark',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
