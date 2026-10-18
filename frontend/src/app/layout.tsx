import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SupplyChainIQ | Operations Dashboard",
  description:
    "Supply chain, inventory, procurement, and order management dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
