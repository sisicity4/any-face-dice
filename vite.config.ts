import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/😃🎲/",
  build: {
    outDir: process.env.VITE_OUT_DIR ?? "dist",
    emptyOutDir: true,
  },
  plugins: [react()],
});
