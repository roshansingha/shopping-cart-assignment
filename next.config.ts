import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E builds into its own folder so they never overwrite a normal build.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  /* config options here */
  images: {
    remotePatterns: [{ protocol: "https", hostname: "fakestoreapi.com", pathname: "/img/**" }],
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
