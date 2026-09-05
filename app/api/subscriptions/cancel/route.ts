import { NextResponse } from "next/server";
import { authenticatedUid } from "../../../../lib/server-auth";
import { mercadoPago } from "../../../../lib/mercadopago";

type MercadoPagoSubscription = {
  id: string;
  status: string;
  next_payment_date?: string;
};

export async function POST(request: Request) {
  try {
    const uid = await authenticatedUid(request);
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    const reference = getAdminDb().collection("users").doc(uid);
    const snapshot = await reference.get();
    const profile = snapshot.data();
    if (!profile || profile.role !== "veterinarian") {
      return NextResponse.json({ error: "Cuenta no habilitada" }, { status: 403 });
    }
    if (profile.paymentMethod !== "mercadopago" || !profile.mercadoPagoPreapprovalId) {
      return NextResponse.json({ error: "No encontramos una suscripción automática para cancelar." }, { status: 409 });
    }
    if (profile.subscriptionCancelAtPeriodEnd) {
      return NextResponse.json({
        ok: true,
        status: profile.subscriptionStatus,
        accessUntil: profile.subscriptionEndsAtIso || null,
      });
    }

    const id = encodeURIComponent(String(profile.mercadoPagoPreapprovalId));
    const subscription = await mercadoPago(`/preapproval/${id}`) as MercadoPagoSubscription;
    const accessUntil = subscription.next_payment_date || profile.subscriptionEndsAtIso || null;
    if (!["canceled", "cancelled"].includes(subscription.status)) {
      await mercadoPago(`/preapproval/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status: "canceled" }),
      });
    }
    const keepAccess = Boolean(accessUntil && new Date(accessUntil).getTime() > Date.now());
    const status = keepAccess && ["trial", "active"].includes(profile.subscriptionStatus)
      ? profile.subscriptionStatus
      : "expired";
    await reference.set({
      subscriptionStatus: status,
      subscriptionCancelAtPeriodEnd: keepAccess,
      subscriptionEndsAtIso: accessUntil,
      subscriptionCanceledAt: new Date(),
      subscriptionUpdatedAt: new Date(),
    }, { merge: true });
    return NextResponse.json({ ok: true, status, accessUntil });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "No pudimos cancelar la suscripción. Intentá nuevamente." }, { status: 500 });
  }
}
