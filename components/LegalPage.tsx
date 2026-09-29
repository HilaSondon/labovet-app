import Link from "next/link";
import Brand from "./Brand";
import "../app/legal.css";

export default function LegalPage({ eyebrow, title, updated, children }: { eyebrow: string; title: string; updated: string; children: React.ReactNode }) {
  return <main className="legal-site">
    <header className="legal-header"><Link href="/" aria-label="Volver al inicio"><Brand /></Link><Link href="/">Volver a VetConver</Link></header>
    <article className="legal-document">
      <header><span>{eyebrow}</span><h1>{title}</h1><p>Versión 1.0 · Última actualización: {updated}</p></header>
      <div className="legal-notice">Leé este documento antes de registrarte o utilizar VetConver. Está redactado específicamente para el funcionamiento actual del servicio.</div>
      {children}
    </article>
    <footer className="legal-footer"><span>© {new Date().getFullYear()} VetConver</span><Link href="/terminos">Términos y Condiciones</Link><Link href="/privacidad">Política de Privacidad</Link></footer>
  </main>;
}
