import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/ws-based Node libraries; keep them out of the bundle so Turbopack
  // doesn't try (and fail) to resolve their worker/native files itself —
  // e.g. pdf-parse's pdfjs-dist worker ("Cannot find module
  // '.../pdf.worker.mjs'") when it's bundled instead of required normally.
  serverExternalPackages: ["tiktok-live-connector", "pdf-parse"],
};

export default nextConfig;
