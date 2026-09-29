import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OrderFlow — Multi-Department Order Workflow",
  description: "Portfolio demonstration of an item-level workflow from order request to customer delivery.",
  icons: {
    icon: "/workflow-mark.svg",
    shortcut: "/workflow-mark.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <body className="antialiased">{children}</body>
    </html>
  );
}
