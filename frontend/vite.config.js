import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  // Operators can supply exact direct-upload origins at build time without overriding an explicit VITE_ value.
  define: process.env.STORAGE_UPLOAD_ORIGINS && !process.env.VITE_STORAGE_UPLOAD_ORIGINS
    ? { "import.meta.env.VITE_STORAGE_UPLOAD_ORIGINS": JSON.stringify(process.env.STORAGE_UPLOAD_ORIGINS) }
    : {}
});
