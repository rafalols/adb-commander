import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
      },
      preload: {
        input: "electron/preload.ts",
        vite: {
          build: {
            rolldownOptions: {
              output: {
                format: "cjs",
                codeSplitting: false,
                entryFileNames: "preload.cjs",
              },
            },
          },
        },
      },
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
