import Link from "next/link";
import Brand from "../../components/Brand";
import "../account-flow.css";

export default async function RegistrationSentPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const email = (await searchParams).email || "tu correo";

  return (
    <main className="flow-page">
      <section className="flow-card flow-card-wide">
        <Brand />
        <div className="flow-icon">✉</div>
        <span className="flow-kicker">CUENTA CREADA</span>
        <h1>Revisá tu correo</h1>
        <p>
          Enviamos un enlace de verificación a <strong>{email}</strong>. Tu
          cuenta queda protegida hasta que confirmes que el correo es tuyo.
        </p>
        <div className="flow-notice">
          <b>¿No lo encontrás?</b>
          <span>
            Revisá Spam o Correo no deseado. El envío puede demorar unos
            minutos.
          </span>
        </div>
        <Link className="flow-primary" href="/">
          Ir a iniciar sesión <span>→</span>
        </Link>
        <small>Podés dejar esta pantalla abierta todo el tiempo que necesites.</small>
      </section>
    </main>
  );
}
