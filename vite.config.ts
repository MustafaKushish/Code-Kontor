import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Auch ältere Tablets und Rechner (z. B. als Stempeluhr) sollen laufen
    target: ["es2020", "chrome87", "edge88", "firefox78", "safari14"],
  },
  server: {
    // Im Entwicklungsmodus gehen API-Aufrufe an `wrangler dev`
    proxy: { "/api": "http://localhost:8787" },
  },
});
