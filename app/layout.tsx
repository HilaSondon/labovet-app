import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import "./account.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://vetconver.com.ar"),
  title: "VetConver | Planillas SIGATM",
  description: "De Excel a SIGATM en segundos. VetConver estandariza y valida planillas para veterinarios.",
  icons: { icon: "/vetconver-logo.png", apple: "/vetconver-logo.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={geist.variable}>{children}</body></html>;
}
