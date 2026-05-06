import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react()],
  root: "src/renderer",
  test: {
    environment: "jsdom",
    globals: true,
    include: ["../../tests/unit/**/*.test.ts", "../../tests/renderer/**/*.test.tsx"],
  },
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
});
