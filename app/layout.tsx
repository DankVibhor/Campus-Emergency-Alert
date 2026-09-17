import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/bottom-nav";
import CallSecurity from "@/components/call-security";

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
  maximumScale: 1,
  userScalable: false,
  // Lets the page paint underneath the notch so our insets can do the work.
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
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-white">
          <main className="flex-1 pb-nav">{children}</main>
        </div>
        <CallSecurity />
        <BottomNav />
      </body>
    </html>
  );
}
