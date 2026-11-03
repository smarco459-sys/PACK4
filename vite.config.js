import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
});
