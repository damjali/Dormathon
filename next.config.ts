import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/ws-based Node libraries; keep them out of the bundle so their
  // platform-specific `require()`s resolve normally at runtime instead of
  // Turbopack trying (and failing) to statically include the right one.
  serverExternalPackages: ["tiktok-live-connector", "fastembed", "onnxruntime-node", "pdf-parse"],
};

export default nextConfig;
