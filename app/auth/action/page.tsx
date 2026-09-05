"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  applyActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { auth } from "../../../lib/firebase";
import Brand from "../../../components/Brand";
import "../../account-flow.css";

type View = "loading" | "verified" | "reset" | "recovered" | "error";

export default function AuthActionPage() {
  return <Suspense fallback={<main className="flow-page" />}><AuthActionContent /></Suspense>;
}

function AuthActionContent() {
  const params = useSearchParams();
  const mode = params.get("mode");
  const code = params.get("oobCode") || "";
  const [view, setView] = useState<View>(() => code ? "loading" : "error");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) return;
    if (mode === "resetPassword") {
      verifyPasswordResetCode(auth, code)
        .then(() => setView("reset"))
        .catch(() => setView("error"));
      return;
    }
    applyActionCode(auth, code)
      .then(() => setView(mode === "recoverEmail" ? "recovered" : "verified"))
      .catch(() => setView("error"));
  }, [code, mode]);

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (password.length < 6 || password !== confirmation) {
      setMessage("Las contraseñas deben coincidir y tener al menos 6 caracteres.");
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(auth, code, password);
      setView("verified");
      setMessage("Tu contraseña se actualizó correctamente.");
    } catch {
      setView("error");
    } finally {
      setBusy(false);
    }
  }

  const content = {
    loading: ["VALIDANDO", "Estamos verificando el enlace…", "Esto demora solo unos segundos."],
    verified: ["TODO LISTO", "Tu correo quedó confirmado", message || "Ya podés ingresar a VetConver y elegir cómo activar tu plan."],
    recovered: ["TODO LISTO", "Tu correo fue recuperado", "La dirección anterior volvió a estar asociada a tu cuenta."],
    error: ["ENLACE NO VÁLIDO", "No pudimos completar la verificación", "El enlace puede haber vencido o ya haber sido utilizado. Iniciá sesión para solicitar uno nuevo."],
  } as const;

  return (
    <main className="flow-page">
      <section className="flow-card flow-card-wide">
        <Brand />
        {view === "reset" ? (
          <>
            <span className="flow-kicker">NUEVA CONTRASEÑA</span>
            <h1>Protegé tu cuenta</h1>
            <form className="flow-form" onSubmit={resetPassword}>
              <label>Nueva contraseña<input name="password" type="password" minLength={6} required /></label>
              <label>Repetir contraseña<input name="confirmation" type="password" minLength={6} required /></label>
              {message && <div className="flow-error">{message}</div>}
              <button className="flow-primary" disabled={busy}>{busy ? "Guardando…" : "Guardar contraseña"}</button>
            </form>
          </>
        ) : (
          <>
            <div className={`flow-icon ${view === "error" ? "flow-icon-error" : ""}`}>
              {view === "loading" ? "…" : view === "error" ? "!" : "✓"}
            </div>
            <span className="flow-kicker">{content[view][0]}</span>
            <h1>{content[view][1]}</h1>
            <p>{content[view][2]}</p>
            {view !== "loading" && <Link className="flow-primary" href="/">Ir a VetConver <span>→</span></Link>}
          </>
        )}
      </section>
    </main>
  );
}
