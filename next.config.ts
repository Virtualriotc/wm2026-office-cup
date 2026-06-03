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
};

export default nextConfig;
