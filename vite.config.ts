import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Im Entwicklungsmodus gehen API-Aufrufe an `wrangler dev`
    proxy: { "/api": "http://localhost:8787" },
  },
});
