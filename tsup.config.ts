import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts", react: "src/react.tsx" },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ["react"],
  },
  // <script src=".../qr-upload.global.js"> → window.QrUpload
  { entry: { "qr-upload": "src/index.ts" }, format: ["iife"], globalName: "QrUpload", minify: true },
]);
