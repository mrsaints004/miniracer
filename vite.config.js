import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@reown/appkit/core": path.resolve(
        __dirname,
        "src/shims/reownAppKitCore.ts"
      ),
    },
  },
});
