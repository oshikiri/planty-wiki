import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/planty-wiki/" : "/",
  plugins: [preact()],
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
      "react/jsx-runtime": "preact/jsx-runtime",
    },
  },
}));
