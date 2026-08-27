import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Healthfolio — Your health history, clearly organized",
  description:
    "Agentic medical record intelligence and consultation preparation. Securely organize your reports, prescriptions and consultation records into a verified timeline.",
  keywords: [
    "medical records",
    "health timeline",
    "consultation preparation",
    "health organization",
  ],
  openGraph: {
    title: "Healthfolio",
    description: "Your health history, clearly organized.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0F5C5E",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
