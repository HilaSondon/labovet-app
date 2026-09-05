"use client";
import "../app/checkout.css";
import { useEffect, useState } from "react";
import { sendEmailVerification, type User } from "firebase/auth";
import Brand from "./Brand";
export function AccountAccess({
  user,
  status,
  onExit,
}: {
  user: User;
  status: string;
  onExit: () => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"mercadopago" | "transfer">("mercadopago");
  const [copied, setCopied] = useState(false);
  async function subscribe() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/subscriptions/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const result = await response.json();
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error);
      window.location.assign(result.checkoutUrl);
    } catch {
      setMessage("No pudimos abrir Mercado Pago. Intentá nuevamente.");
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      if (!response.ok) await sendEmailVerification(user);
      setMessage("Te enviamos un nuevo correo de verificación.");
    } catch {
      setMessage("Esperá unos minutos antes de volver a intentarlo.");
    }
    setBusy(false);
  }
  async function copyAlias() {
    await navigator.clipboard.writeText("NOAMS");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  if (!user.emailVerified)
    return (
      <main className="access-status">
        <Brand />
        <span>PRIMER PASO</span>
        <h1>Verificá tu correo</h1>
        <p>
          Enviamos un enlace a <b>{user.email}</b>. Abrilo y después volvé a
          iniciar sesión.
        </p>
        {message && <div className="status-message">{message}</div>}
        <button className="primary-status" onClick={resend} disabled={busy}>
          Reenviar correo
        </button>
        <button onClick={onExit}>Cerrar sesión</button>
      </main>
    );
  return (
    <main className="checkout-page">
      <header className="checkout-header">
        <Brand />
        <button onClick={onExit}>Cerrar sesión</button>
      </header>
      <section className="checkout-shell">
        <div className="checkout-intro">
          <span>ACTIVÁ TU CUENTA</span>
          <h1>Elegí cómo querés pagar</h1>
          <p>Un único plan, sin permanencia. Elegí la modalidad más cómoda.</p>
        </div>
        <div className="checkout-summary">
          <div><span>Plan VetConver</span><b>Generador de planillas SIGATM</b></div>
          <strong>$25.000 <small>ARS / mes</small></strong>
        </div>
        <div className="payment-tabs" role="tablist">
          <button className={paymentMethod === "mercadopago" ? "active" : ""} onClick={() => setPaymentMethod("mercadopago")}>Mercado Pago</button>
          <button className={paymentMethod === "transfer" ? "active" : ""} onClick={() => setPaymentMethod("transfer")}>Transferencia</button>
        </div>
        {paymentMethod === "mercadopago" ? (
          <section className="payment-card">
            <div className="payment-icon">MP</div>
            <div>
              <span className="payment-label">SUSCRIPCIÓN AUTOMÁTICA</span>
              <h2>7 días gratis</h2>
              <p>Vinculás un medio de pago de forma segura. Hoy pagás $0 y el primer cobro de $25.000 se realiza al finalizar la prueba.</p>
            </div>
            <ul><li>Renovación mensual automática</li><li>Cancelás antes del cobro si no querés continuar</li><li>Activación inmediata</li></ul>
            {message && <div className="auth-error">{message}</div>}
            <button className="checkout-primary" onClick={subscribe} disabled={busy}>{busy ? "Abriendo Mercado Pago…" : "Comenzar 7 días gratis"}<span>→</span></button>
          </section>
        ) : (
          <section className="payment-card">
            <div className="payment-icon transfer-icon">$</div>
            <div>
              <span className="payment-label">PAGO MANUAL</span>
              <h2>Transferencia bancaria</h2>
              <p>Transferí el abono mensual y envianos el comprobante. La cuenta se habilita cuando confirmamos el pago.</p>
            </div>
            <div className="alias-box"><span>ALIAS</span><strong>NOAMS</strong><button onClick={copyAlias}>{copied ? "Copiado ✓" : "Copiar alias"}</button></div>
            <div className="transfer-note"><b>Importe: $25.000 ARS</b><span>Esta modalidad se renueva manualmente cada mes y no incluye débito automático.</span></div>
            <a className="checkout-primary" href={`https://wa.me/5492244429316?text=${encodeURIComponent(`Hola, envío el comprobante de la suscripción VetConver. Mi usuario es ${user.email}.`)}`} target="_blank" rel="noreferrer">Enviar comprobante por WhatsApp<span>→</span></a>
          </section>
        )}
        <small className="checkout-status">Estado: {status === "pending" ? "pendiente de activación" : status}</small>
      </section>
    </main>
  );
}
export function useSingleSession(user: User | null, enabled: boolean) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user || !enabled) return;
    let stopped = false;
    const deviceId =
      localStorage.getItem("vetconverDeviceId") ||
      localStorage.getItem("labovetDeviceId") ||
      crypto.randomUUID();
    localStorage.setItem("vetconverDeviceId", deviceId);
    localStorage.removeItem("labovetDeviceId");
    const register = async () => {
      const response = await fetch("/api/session/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          deviceId,
          deviceName: navigator.platform || "Navegador",
        }),
      });
      const data = await response.json();
      if (stopped) return;
      if (!response.ok) {
        setAllowed(false);
        return;
      }
      sessionStorage.setItem("vetconverSessionId", data.sessionId);
      setAllowed(true);
    };
    register().catch(() => setAllowed(false));
    const timer = window.setInterval(async () => {
      const sessionId = sessionStorage.getItem("vetconverSessionId");
      if (!sessionId) return;
      const response = await fetch("/api/session/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ sessionId }),
      });
      if (!(await response.json()).active) setAllowed(false);
    }, 60000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [user, enabled]);
  return enabled ? allowed : true;
}
