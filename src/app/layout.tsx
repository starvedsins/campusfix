import "@fontsource-variable/manrope";
import "@fontsource-variable/public-sans";
import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "CampusFix | A better campus", template: "%s | CampusFix" },
  description:
    "Report campus faults, follow repairs, and keep our campus moving.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "CampusFix" },
};
export const viewport: Viewport = {
  themeColor: "#173d33",
  width: "device-width",
  initialScale: 1,
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
