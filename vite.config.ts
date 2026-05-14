import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
// Use relative base for Capacitor builds (`BUILD_TARGET=capacitor npm run build`)
// so the WebView loads assets via `./assets/...` rather than `/assets/...`.
// Web build (Vercel) keeps absolute `/` — that's what production deployments
// expect.
const isCapacitorBuild = process.env.BUILD_TARGET === "capacitor";

export default defineConfig(({ mode }) => ({
  base: isCapacitorBuild ? "./" : "/",
  server: {
    host: "::",
    port: 8080,
    allowedHosts: true,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
