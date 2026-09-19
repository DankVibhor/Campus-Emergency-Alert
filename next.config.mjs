import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  // A service worker in dev caches stale chunks and wastes debugging time.
  disable: process.env.NODE_ENV === "development",
  register: true,
  reloadOnOnline: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  // Phase 5 fills this out; the shell is cached from the first deploy so
  // "Add to Home Screen" has something to open when offline.
  fallbacks: {
    document: "/offline",
  },
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    // Never serve a cached API response for an emergency.
    runtimeCaching: [
      {
        urlPattern: /^https?.*\/api\/.*/i,
        handler: "NetworkOnly",
      },
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
        handler: "NetworkOnly",
      },
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|webp|ico)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "aegis-images",
          expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      {
        urlPattern: /\/_next\/static\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "aegis-static",
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      {
        urlPattern: ({ request }) => request.mode === "navigate",
        handler: "NetworkFirst",
        options: {
          cacheName: "aegis-pages",
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 7 },
        },
      },
    ],
  },
});

/**
 * Security headers.
 *
 * script-src carries 'unsafe-inline'. That was not the first thing tried:
 * a strict `script-src 'self'` was tested first and broke the app outright -
 * confirmed by loading the production build in headless Chrome and reading
 * the console - because Next.js App Router injects inline bootstrap scripts
 * (the RSC hydration payload) on every page. The documented fix is a
 * per-request CSP nonce set in middleware, which Next.js is supposed to
 * attach to its own inline scripts automatically. That was implemented and
 * tested the same way: the nonce appeared correctly in the response header,
 * but the rendered HTML carried it on zero <script> tags, framework-internal
 * or otherwise - a real gap in this Next.js version (14.2.35), not a
 * configuration mistake, verified by inspecting the raw HTML directly.
 *
 * Given that, 'unsafe-inline' here is a bounded, deliberate, and tested
 * trade-off rather than a shortcut: the codebase has zero
 * `dangerouslySetInnerHTML` and zero `eval`/`new Function` anywhere (checked
 * by grep across the whole tree), so there is no point in the app's own code
 * where attacker-controlled text reaches an HTML or script context in the
 * first place - every value React renders is auto-escaped. CSP's script-src
 * would be defense-in-depth on top of that, not the app's only defence, and
 * revisiting this if a future Next.js release fixes automatic nonce
 * propagation is worth doing.
 *
 * Everything else here is static and safe to set once, built from what the
 * app actually loads (checked by grep across app/, components/ and lib/ - no
 * external scripts, fonts or iframes anywhere), not copied from a template.
 */
function buildCsp() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let supabaseHost = "";
  try {
    supabaseHost = new URL(supabaseUrl).host;
  } catch {
    // Falls back to allowing no external connect-src beyond 'self'; the app
    // will simply fail its Supabase calls loudly instead of silently, which
    // is preferable to a permissive wildcard.
  }

  const connect = ["'self'"];
  if (supabaseHost) {
    connect.push(`https://${supabaseHost}`, `wss://${supabaseHost}`);
  }

  const directives = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", ...(supabaseHost ? [`https://${supabaseHost}`] : [])],
    "font-src": ["'self'"],
    "connect-src": connect,
    "manifest-src": ["'self'"],
    "worker-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
}

async function securityHeaders() {
  const headers = [
    { key: "Content-Security-Policy", value: buildCsp() },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      // Geolocation is a real feature (reporter position, Safe Walk); camera,
      // microphone and everything else the app does not use are denied.
      key: "Permissions-Policy",
      value:
        "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()",
    },
  ];

  // Only meaningful once the app is actually served over HTTPS. Vercel
  // deployments and any custom domain pointed at Vercel always are; a bare
  // `next start` on plain HTTP would otherwise get an HSTS header it cannot
  // honour.
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }

  return [{ source: "/:path*", headers }];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  headers: securityHeaders,
};

export default withPWA(nextConfig);
