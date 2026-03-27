import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CurrencyProvider } from "@/lib/CurrencyContext";

export const metadata: Metadata = {
  title: "Masunori — Dashboard",
  description: "Dashboard de gestión para Masunori Sushi",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <CurrencyProvider>{children}</CurrencyProvider>
      </body>
    </html>
  );
}
