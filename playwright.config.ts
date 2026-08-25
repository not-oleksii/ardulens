import { defineConfig, devices } from "@playwright/test";

// E2E runs against the production PREVIEW build (`vite preview`, served at :4173), not a real
// Tauri window - a plain browser tab has no OS-level serial/UDP access, so ArduPilot Setup's
// live vehicle connection is unreachable there anyway. "Dev Mode" (ArduPilotSetupView.tsx's
// handleConnectMockAs) is a pure in-process JS mock with NO Tauri dependency at all ("lets the
// whole app be exercised without any real hardware, SITL, or even a Tauri backend" - its own
// code comment), so it's what these specs use to exercise the live-GCS half. Tauri-only
// behavior (native save dialogs, real serial port enumeration) stays covered by the existing
// Vitest suite's mocked @tauri-apps/api, not here.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
