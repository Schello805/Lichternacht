import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    fullyParallel: true,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['github'], ['list']] : [['list']],
    use: {
        baseURL: 'http://127.0.0.1:8000',
        trace: 'on-first-retry',
        viewport: { width: 390, height: 844 },
        serviceWorkers: 'block'
    },
    projects: [
        {
            name: 'chromium-mobile',
            use: {
                ...devices['Pixel 5'],
                browserName: 'chromium'
            }
        }
    ],
    webServer: {
        command: 'python3 server.py',
        url: 'http://127.0.0.1:8000',
        reuseExistingServer: !process.env.CI,
        timeout: 15_000
    }
});
