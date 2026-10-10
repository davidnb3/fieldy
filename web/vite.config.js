import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function supportRoutes() {
  return {
    name: "support-routes",
    apply: "build",
    generateBundle(_, bundle) {
      const html = bundle["index.html"];
      if (!html || html.type !== "asset") return;
      this.emitFile({ type: "asset", fileName: "support/index.html", source: html.source });
      this.emitFile({ type: "asset", fileName: "contact/index.html", source: html.source });
      this.emitFile({ type: "asset", fileName: "privacy/index.html", source: html.source });
      this.emitFile({ type: "asset", fileName: "terms/index.html", source: html.source });
    },
  };
}

export default defineConfig({
  plugins: [react(), supportRoutes()],
});
