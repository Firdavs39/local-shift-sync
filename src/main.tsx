import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { hydrateNativeStorage } from "@/lib/native-storage";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

// Hydrate Capacitor Preferences into the sync-style adapter before any
// Supabase call runs. No-op on web (returns immediately).
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
