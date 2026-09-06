import { NextResponse } from "next/server";
import { authenticatedUid } from "../../../../lib/server-auth";
import { mercadoPago } from "../../../../lib/mercadopago";

type MpSubscription = { status: string; next_payment_date?: string };

export async function POST(request: Request) {
  try {
    const adminUid = await authenticatedUid(request);
    const { userId } = await request.json();
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    const db = getAdminDb();
    const admin = (await db.collection("users").doc(adminUid).get()).data();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });
    if (typeof userId !== "string" || userId === adminUid) return NextResponse.json({ error: "Usuario inválido" }, { status: 400 });

    const reference = db.collection("users").doc(userId);
    const profile = (await reference.get()).data();
    if (profile?.paymentMethod !== "mercadopago" || !profile.mercadoPagoPreapprovalId) {
      return NextResponse.json({ error: "El usuario no tiene una suscripción de Mercado Pago" }, { status: 409 });
    }
    const id = encodeURIComponent(String(profile.mercadoPagoPreapprovalId));
    const subscription = await mercadoPago(`/preapproval/${id}`) as MpSubscription;
    if (!['canceled', 'cancelled'].includes(subscription.status)) {
      await mercadoPago(`/preapproval/${id}`, { method: "PUT", body: JSON.stringify({ status: "canceled" }) });
    }
    const accessUntil = subscription.next_payment_date || profile.subscriptionEndsAtIso || null;
    const keepAccess = Boolean(accessUntil && new Date(accessUntil).getTime() > Date.now());
    await reference.set({
      subscriptionStatus: keepAccess ? "active" : "expired",
      subscriptionCancelAtPeriodEnd: keepAccess,
      subscriptionEndsAtIso: accessUntil,
      mercadoPagoStatus: "canceled",
      subscriptionCanceledAt: new Date(),
      subscriptionUpdatedAt: new Date(),
      subscriptionUpdatedBy: adminUid,
    }, { merge: true });
    return NextResponse.json({ ok: true, accessUntil });
  } catch (error) {
    console.error("No se pudo cancelar desde administración", error);
    return NextResponse.json({ error: "No se pudo cancelar la suscripción" }, { status: 500 });
  }
}
