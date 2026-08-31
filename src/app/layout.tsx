import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { Toaster } from "@/components/ui/Toaster";
import { ConfirmDialogHost } from "@/components/ui/ConfirmDialogHost";

export const metadata: Metadata = {
  title: "Télétravail",
  description: "Planification et validation du télétravail",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Télétravail",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3a4dc2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen font-sans antialiased">
        <PwaRegister />
        {children}
        <Toaster />
        <ConfirmDialogHost />
      </body>
    </html>
  );
}
