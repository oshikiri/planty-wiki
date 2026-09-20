import { defineConfig, loadEnv } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    // ChatGPT Sites serves the deployed app from the site root. GitHub Pages
    // supplies VITE_BASE_PATH explicitly because it serves from a repository path.
    base: env.VITE_BASE_PATH || "/",
    plugins: [preact()],
    resolve: {
      alias: {
        react: "preact/compat",
        "react-dom": "preact/compat",
        "react/jsx-runtime": "preact/jsx-runtime",
      },
    },
  };
});
