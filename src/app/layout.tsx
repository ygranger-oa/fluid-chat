import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration } from "@/client/components/service-worker-registration";
import "./styles.css";

export const metadata: Metadata = {
  title: "Fluid Chat",
  description: "Self-hosted team chat: channels, DMs, threads, search and files",
  applicationName: "Fluid Chat",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Fluid Chat",
    statusBarStyle: "default"
  },
  icons: {
    icon: [{ url: "/logo_fluid_32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/logo_fluid_192.png", sizes: "192x192", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1d21" }
  ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
