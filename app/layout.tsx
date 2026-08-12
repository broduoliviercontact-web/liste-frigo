import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Liste Frigo",
  description: "Liste de courses tactile synchronisée pour écran e-paper.",
  other: { "codex-preview": "development" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
