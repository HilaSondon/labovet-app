import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import "./account.css";
import "./landing.css";
import VisitTracker from "../components/VisitTracker";
import FloatingWhatsApp from "../components/FloatingWhatsApp";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://vetconver.com.ar"),
  title: "VetConver | Herramientas para veterinarios y laboratorios",
  description: "Herramientas para simplificar la carga en SIGATM y preparar resultados de laboratorio para GRECERT.",
  icons: { icon: "/vetconver-logo.png", apple: "/vetconver-logo.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={geist.variable}>{children}<VisitTracker /><FloatingWhatsApp /></body></html>;
}
