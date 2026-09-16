import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF.js loads its worker module at runtime. Keeping the package external on
  // the server preserves that module next to the main PDF.js build.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
