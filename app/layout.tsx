import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/bottom-nav";
import CallSecurity from "@/components/call-security";
import StaffAlerts from "@/components/staff-alerts";
import A11yBoot from "@/components/a11y-boot";

export const metadata: Metadata = {
  title: "ASMT Aegis — Campus Emergency Response",
  description:
    "Report and coordinate campus emergencies at Anangpuria School of Management and Technology.",
  manifest: "/manifest.webmanifest",
  applicationName: "Aegis",
  appleWebApp: {
    capable: true,
    title: "Aegis",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: {
    // Stop iOS auto-linking every number it finds inside incident descriptions.
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays enabled: blocking it fails WCAG 1.4.4 for low-vision
  // users, and iOS has ignored user-scalable=no since iOS 10 regardless.
  // Accidental zoom is prevented structurally instead - 48px touch targets
  // and 16px input text, so iOS never auto-zooms a focused field.
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-slate-900 antialiased">
        <A11yBoot />
        <StaffAlerts />

        <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-white">
          <main className="flex-1 pb-nav">{children}</main>
        </div>

        {/* One fixed stack: the call bar sits directly above the nav, so
            neither can ever overlap page content or each other. */}
        <div
          className="fixed inset-x-0 bottom-0 z-40 bg-white"
          style={{ paddingBottom: "var(--sab)" }}
        >
          <div className="mx-auto w-full max-w-md">
            <CallSecurity />
            <BottomNav />
          </div>
        </div>
      </body>
    </html>
  );
}
