import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["mariadb"],
  typedRoutes: false,
};

export default nextConfig;
