import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { hydrateNativeStorage } from "@/lib/native-storage";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

const isNativePlatform = (): boolean =>
  (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.() === true;

// Register the service worker for installable PWA + offline shell on web.
// Skip inside a Capacitor WebView — the native container manages assets
// itself and double-caching breaks Live Updates.
if ('serviceWorker' in navigator && !isNativePlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[sw] registration failed:', err);
    });
  });
}

// Hydrate Capacitor Preferences into the sync-style storage adapter before any
// Supabase call runs (so the persisted session is available immediately).
// No-op on web — resolves instantly.
hydrateNativeStorage()
  .catch((err) => {
    console.warn('[native-storage] hydration failed; will start with empty cache:', err);
  })
  .finally(() => {
    createRoot(rootElement).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
