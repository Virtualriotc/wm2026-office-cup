import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the surface minimal: server-authoritative logic lives in Server Actions
  // and Route Handlers, so we don't need experimental flags for v1.
  reactStrictMode: true,
  // The e2e suite drives the dev server over http://127.0.0.1:<port>. Next 15
  // flags cross-origin /_next/* HMR requests from that host with a warning and,
  // left unconfigured, the churn around it can knock the dev server into a Fast
  // Refresh full reload mid-test (resetting controlled inputs under the long
  // proof tour). Allowlisting the loopback host quiets that path. Dev-only; it
  // has no effect on the production build.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Drop the framework fingerprint header (x-powered-by: Next.js).
  poweredByHeader: false,
  // Baseline STATIC security headers on EVERY route (incl. /api + assets that
  // middleware skips). The full Content-Security-Policy is NOT here — it needs a
  // per-request nonce, so it lives in middleware.ts. X-Frame-Options keeps
  // clickjacking covered everywhere (the CSP's frame-ancestors backs it up on
  // page routes). Two CSP headers would be enforced as an intersection and only
  // muddy things, so config owns the static headers and middleware owns the CSP.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
