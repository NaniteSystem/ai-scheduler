import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  // Normal web/Capacitor builds keep assets split so lazy AI modules stay lazy
  // and browsers can cache code efficiently. SINGLE_FILE=true remains available
  // for the occasional portable HTML artifact.
  plugins: [react(), tailwindcss(), ...(process.env.SINGLE_FILE === "true" ? [viteSingleFile()] : [])],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: process.env.SINGLE_FILE === "true" ? {} : {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/react/") ||
              id.includes("/node_modules/react-dom/") ||
              id.includes("/node_modules/scheduler/")) return "vendor-react";
          if (id.includes("/node_modules/date-fns/")) return "vendor-date";
          if (id.includes("/node_modules/framer-motion/") ||
              id.includes("/node_modules/motion-dom/") ||
              id.includes("/node_modules/motion-utils/")) return "vendor-motion";
          if (id.includes("/node_modules/lucide-react/")) return "vendor-icons";
          if (id.includes("/node_modules/@capacitor/") ||
              id.includes("/node_modules/@capacitor-community/")) return "vendor-capacitor";
        },
      },
    },
  },
});
