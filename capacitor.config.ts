import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Zuka native wrapper config.
 *
 * Locked decisions (see tasks/derek-plan.md "Capacitor Android wrapper"):
 *   - appId: live.zuka.app — reverse-DNS of zuka.live; permanent once
 *     published, do NOT change after first store submission.
 *   - appName: Zuka.
 *   - backgroundColor: #1a0f08 — charcoal hero-mat color, seamless
 *     against the unauthenticated homepage's first paint.
 *   - scheme: Zuka — matches iOS Info.plist CFBundleURLSchemes for
 *     deep-link routing (zuka://npub1…, zuka://naddr1…, etc.).
 *   - SystemBars.insetsHandling: 'css' — Android Chromium <140 reports
 *     env(safe-area-inset-*) as 0; this injects --safe-area-inset-*
 *     CSS variables as a fallback.
 */
const config: CapacitorConfig = {
  appId: 'live.zuka.app',
  appName: 'Zuka',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#1a0f08',
  },
  ios: {
    backgroundColor: '#1a0f08',
    contentInset: 'never',
    scheme: 'Zuka',
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      style: 'LIGHT',
    },
  },
};

export default config;
