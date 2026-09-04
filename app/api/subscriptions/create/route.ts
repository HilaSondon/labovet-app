import { NextResponse } from "next/server";
import { mercadoPago } from "../../../../lib/mercadopago";
import { authenticatedUser } from "../../../../lib/server-auth";

export async function POST(request: Request) {
  try {
    const identity = await authenticatedUser(request);
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    const uid = identity.uid;
    if (!identity.email_verified) return NextResponse.json({ error: "Verificá tu correo antes de continuar" }, { status: 403 });
    const user = await getAdminDb().collection("users").doc(uid).get();
    const profile = user.data();
    if (!profile || profile.role !== "veterinarian") return NextResponse.json({ error: "Cuenta no habilitada" }, { status: 403 });
    if (profile.mercadoPagoPreapprovalId && ["pending", "trial", "active"].includes(profile.subscriptionStatus)) return NextResponse.json({ error: "Ya existe una suscripción para esta cuenta" }, { status: 409 });
    const planId = process.env.MERCADOPAGO_PLAN_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!planId || !appUrl) throw new Error("Plan o URL no configurados");
    const subscription = await mercadoPago("/preapproval", {
      method: "POST",
      body: JSON.stringify({
        preapproval_plan_id: planId,
        payer_email: profile.email,
        external_reference: uid,
        back_url: `${appUrl}/?suscripcion=regreso`,
        notification_url: `${appUrl}/api/mercadopago/webhook`,
        status: "pending",
      }),
    });
    await user.ref.set({ mercadoPagoPreapprovalId: subscription.id, subscriptionUpdatedAt: new Date() }, { merge: true });
    return NextResponse.json({ checkoutUrl: subscription.init_point });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "No pudimos iniciar la suscripción." }, { status: 500 });
  }
}
