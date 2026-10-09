import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/ws-based Node library; keep it out of the bundle.
  serverExternalPackages: ["tiktok-live-connector"],
};

export default nextConfig;
