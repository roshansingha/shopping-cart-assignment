import type { NextConfig } from "next";
import { securityHeaders } from "./src/shared/security-headers";

const nextConfig: NextConfig = {
  // E2E builds into its own folder so they never overwrite a normal build.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  /* config options here */
  images: {
    // Exact host, path, no port and no query string: the optimizer is not an open proxy.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "fakestoreapi.com",
        port: "",
        pathname: "/img/**",
        search: "",
      },
    ],
  },
  poweredByHeader: false, // do not advertise the framework
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders({
          isDev: process.env.NODE_ENV === "development",
          inlineScripts: true,
        }),
      },
    ];
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
