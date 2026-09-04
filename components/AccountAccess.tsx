"use client";
import { useEffect, useState } from "react";
import { sendEmailVerification, type User } from "firebase/auth";
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
    await sendEmailVerification(user)
      .then(() => setMessage("Te enviamos un nuevo correo de verificación."))
      .catch(() =>
        setMessage("Esperá unos minutos antes de volver a intentarlo."),
      );
    setBusy(false);
  }
  if (!user.emailVerified)
    return (
      <main className="access-status">
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
    <main className="access-status">
      <span>7 DÍAS SIN CARGO</span>
      <h1>Activá tu prueba gratis</h1>
      <p>
        Vinculá un medio de pago en Mercado Pago. No se cobra hoy; luego son
        $25.000 ARS por mes. El primer cobro se realiza al terminar los 7 días y
        podés cancelar antes.
      </p>
      {message && <div className="auth-error">{message}</div>}
      <button className="primary-status" onClick={subscribe} disabled={busy}>
        {busy ? "Abriendo Mercado Pago…" : "Comenzar prueba gratis"}
      </button>
      <small>
        Estado actual:{" "}
        {status === "pending" ? "pendiente de activación" : status}
      </small>
      <button onClick={onExit}>Cerrar sesión</button>
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
