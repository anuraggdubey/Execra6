import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  serverExternalPackages: ["pdfjs-dist", "pdf-parse", "@napi-rs/canvas"],
};

export default nextConfig;
