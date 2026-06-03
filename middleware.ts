import { NextRequest, NextResponse } from "next/server";

// ============================================================================
// Strict, nonce-based Content-Security-Policy (defense-in-depth XSS backstop).
//
// WHY: React already escapes output, so there is no known injection point. This
// is the belt-and-suspenders layer: even if a stored/reflected XSS ever slipped
// through, the browser refuses to run any <script> — or any inline event
// handler like onerror=... — that lacks the per-request nonce. An injected
// "<script>steal()</script>" simply never executes.
//
// HOW (production): every request gets a fresh random nonce. We put it in the
// CSP `script-src` AND in an `x-nonce` request header. Next.js reads that header
// during SSR and stamps the nonce onto all of ITS scripts (framework runtime,
// page bundles, hydration data pushes). `'strict-dynamic'` then lets those
// nonced scripts pull in the rest of the chunk graph, so we never have to
// allowlist hashes or origins.
//
// DELIBERATE DEVIATIONS from the Next.js doc (each one would otherwise break
// this specific app):
//   - style-src keeps 'unsafe-inline' (NOT a nonce). Nonces apply to <style>
//     ELEMENTS, never to inline style ATTRIBUTES (style="..."). This app is
//     motion-heavy: Motion writes inline transforms onto every animated node,
//     and we use React style={{}} + CSS custom properties throughout. A
//     nonce-only style-src would silently kill every gradient, shadow, and
//     animation in production. CSS injection is far lower severity than script
//     injection; the backstop that matters is script-src, which stays strict.
//   - Development uses a permissive script-src ('unsafe-inline' 'unsafe-eval',
//     no nonce). The dev server needs eval for React Refresh/HMR, and per CSP3
//     a nonce present alongside 'unsafe-inline' makes the browser IGNORE
//     'unsafe-inline' — which would break HMR. Dev CSP has no security value
//     (it is never deployed); production is the policy that is locked down and
//     verified against a real `next build && next start`.
//
// Nonces force DYNAMIC rendering: a page baked statically at build time carries
// no nonce, so its scripts would be blocked. Every page in this app is already
// `export const dynamic = "force-dynamic"`, so there is no static page to blank.
// ============================================================================

export function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;
  // Dev HMR talks to the dev server over a WebSocket; allow it only in dev.
  const connectSrc = isDev ? "'self' ws: wss:" : "'self'";

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Prod only — on http://localhost this would force-upgrade dev to https.
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Run on page routes only. Skip API (JSON, no script context), Next static
  // assets, the favicon, and link prefetches (a prefetch shouldn't burn a nonce
  // or get a one-time CSP it won't render under).
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
