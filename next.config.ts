import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["xlsx"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default config;
