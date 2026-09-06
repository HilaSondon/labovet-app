"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import "../app/subscription.css";

type SubscriptionProfile = {
  subscriptionStatus?: "pending" | "trial" | "active" | "expired" | "suspended";
  subscriptionEndsAt?: string;
  subscriptionEndsAtIso?: string | null;
  subscriptionCancelAtPeriodEnd?: boolean;
  paymentMethod?: "mercadopago" | "transfer";
  mercadoPagoPreapprovalId?: string;
};

function formatDate(value?: string) {
  if (!value) return "A confirmar";
  const date = /^\d{2}\/\d{2}\/\d{4}$/.test(value)
    ? new Date(value.split("/").reverse().join("-") + "T12:00:00")
    : new Date(value);
  return Number.isNaN(date.getTime())
    ? "A confirmar"
    : new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export default function SubscriptionPanel({
  user,
  profile,
  onCancelled,
}: {
  user: User;
  profile: SubscriptionProfile;
  onCancelled: (updates: Partial<SubscriptionProfile>) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const isTransfer = profile.paymentMethod === "transfer";
  const isMercadoPago = profile.paymentMethod === "mercadopago";
  const isTrial = profile.subscriptionStatus === "trial";
  const ending = profile.subscriptionCancelAtPeriodEnd;
  const date = profile.subscriptionEndsAtIso || profile.subscriptionEndsAt;

  async function cancelSubscription() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/subscriptions/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo cancelar");
      onCancelled({
        subscriptionStatus: result.status,
        subscriptionEndsAtIso: result.accessUntil,
        subscriptionCancelAtPeriodEnd: true,
      });
      setConfirming(false);
      setMessage("La renovación quedó cancelada correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos cancelar la suscripción.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="subscription-page">
      <div className="subscription-heading">
        <span>CUENTA VETCONVER</span>
        <h1>Mi suscripción</h1>
        <p>Consultá el estado del plan y administrá su renovación.</p>
      </div>
      <article className="subscription-card">
        <div className="subscription-plan">
          <div><span>PLAN ACTUAL</span><h2>Plan VetConver</h2></div>
          <strong>$25.000 <small>ARS / mes</small></strong>
        </div>
        <div className="subscription-details">
          <div><span>Estado</span><b>{ending ? "Cancelación programada" : isTrial ? "Prueba gratuita de 7 días" : "Activo"}</b></div>
          <div><span>Forma de pago</span><b>{isTransfer ? "Transferencia manual" : isMercadoPago ? "Mercado Pago" : "Aún no elegida"}</b></div>
          <div><span>{ending ? "Acceso disponible hasta" : isTrial ? "Fin de la prueba" : isTransfer ? "Vencimiento" : "Próximo cobro"}</span><b>{formatDate(date)}</b></div>
        </div>
        {ending ? (
          <div className="subscription-notice success">No volveremos a cobrarte. Podés seguir usando VetConver hasta el {formatDate(date)}.</div>
        ) : isTrial && !profile.paymentMethod ? (
          <div className="subscription-notice">Tenés acceso completo durante la prueba. Cuando finalicen los 7 días, deberás elegir Mercado Pago o transferencia para continuar.</div>
        ) : isTransfer ? (
          <div className="subscription-notice">La transferencia no tiene débito automático. Si no renovás, el acceso finaliza en la fecha indicada.</div>
        ) : isMercadoPago && profile.mercadoPagoPreapprovalId ? (
          <div className="subscription-actions">
            <p>Podés cancelar cuando quieras. No se generan nuevos cobros y conservás el acceso hasta que termine el período vigente.</p>
            <button onClick={() => setConfirming(true)}>Cancelar suscripción</button>
          </div>
        ) : (
          <div className="subscription-notice">La activación del medio de pago está pendiente de confirmación.</div>
        )}
        {message && <div className="subscription-message">{message}</div>}
      </article>
      {confirming && (
        <div className="cancel-backdrop" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
          <div className="cancel-dialog">
            <span>CONFIRMAR CANCELACIÓN</span>
            <h2 id="cancel-title">¿Querés cancelar la renovación?</h2>
            <p>No se realizarán nuevos cobros. Tu acceso continuará hasta el final de la prueba o del período ya abonado.</p>
            <div><button className="keep-plan" onClick={() => setConfirming(false)} disabled={busy}>Conservar mi plan</button><button className="confirm-cancel" onClick={cancelSubscription} disabled={busy}>{busy ? "Cancelando…" : "Sí, cancelar"}</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
