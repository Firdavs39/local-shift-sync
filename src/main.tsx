import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register the service worker for installable PWA + offline shell on web.
// Skip inside a Capacitor WebView — the native container manages assets
// itself and double-caching breaks Live Updates.
if ('serviceWorker' in navigator) {
  const isNative = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.() === true;
  if (!isNative) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[sw] registration failed:', err);
      });
    });
  }
}
