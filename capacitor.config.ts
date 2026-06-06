import type { CapacitorConfig } from '@capacitor/cli';

// =============================================================================
// Capacitor config for GeoTime native wrap (Android + iOS).
// =============================================================================
// appId is permanent once published to Google Play / App Store — see PR plan.
// `uz.geotime.app` is the chosen value (Uzbek TLD reversed, short, brand-safe).
// =============================================================================

const config: CapacitorConfig = {
  appId: 'uz.geotime.app',
  appName: 'GeoTime',
  webDir: 'dist',
  // Use https schemes so the WebView's origin matches what users see in a
  // browser. Avoids CORS surprises when Supabase / Vercel see the request.
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  android: {
    backgroundColor: '#7c3aed',
  },
  ios: {
    backgroundColor: '#7c3aed',
    contentInset: 'always',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1000,
      backgroundColor: '#7c3aed',
      androidSplashResourceName: 'splash',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
