import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

// Content Security Policy for public routes (restrictive)
// Protects against XSS and injection attacks
const publicCspHeader = `
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://*.r2.dev;
  font-src 'self';
  connect-src 'self';
  media-src 'self' https://*.r2.dev;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`;

// Content Security Policy for admin routes (relaxed for Payload CMS)
// Payload CMS requires inline scripts and eval for the admin panel
const adminCspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://*.r2.dev;
  font-src 'self' data:;
  connect-src 'self' https://*.r2.dev;
  media-src 'self' https://*.r2.dev;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'self';
  upgrade-insecure-requests;
`;

const nextConfig: NextConfig = {
  output: "standalone",
  // Optimize package imports for better tree-shaking (reduces bundle size)
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "embla-carousel-react",
      "embla-carousel-autoplay",
      "date-fns",
    ],
  },
  images: {
    formats: ["image/webp", "image/avif"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.dev",
      },
    ],
  },
  // Security headers
  async headers() {
    return [
      // Common security headers for all routes
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      // HSTS only for production (not localhost)
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
        has: [
          {
            type: "host",
            value: "(?!localhost).*",
          },
        ],
      },
      // Restrictive CSP for public routes (excludes /admin and /api)
      {
        source: "/((?!admin|api).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: publicCspHeader
              .replace(/\n/g, "")
              .replace(/\s+/g, " ")
              .trim(),
          },
        ],
      },
      // Relaxed CSP for admin routes (Payload CMS needs inline scripts)
      {
        source: "/admin/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: adminCspHeader
              .replace(/\n/g, "")
              .replace(/\s+/g, " ")
              .trim(),
          },
        ],
      },
      // Relaxed CSP for API routes
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: adminCspHeader
              .replace(/\n/g, "")
              .replace(/\s+/g, " ")
              .trim(),
          },
        ],
      },
    ];
  },
};

export default withPayload(nextConfig);
