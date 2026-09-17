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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default withPWA(nextConfig);
