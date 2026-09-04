import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { getAdminAuth, getAdminDb } = await import("../../../../lib/firebase-admin");
    await getAdminAuth().listUsers(1);
    await getAdminDb().collection("users").limit(1).get();
    const { mercadoPago } = await import("../../../../lib/mercadopago");
    const planId = process.env.MERCADOPAGO_PLAN_ID;
    if (!planId) throw new Error("Plan no configurado");
    const plan = await mercadoPago(`/preapproval_plan/${encodeURIComponent(planId)}`) as { status?: string };
    return NextResponse.json({ firebase: "connected", mercadoPago: "connected", plan: plan.status || "available" });
  } catch (error) {
    console.error("Health check failed", error);
    const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "";
    let credential = "missing";
    try {
      const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
      credential = parsed.project_id === "labovet-e70a2" && parsed.private_key ? "valid-format" : "wrong-project";
    } catch { credential = encoded ? "invalid-format" : "missing"; }
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "unknown";
    const message = error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 180) : "Error desconocido";
    return NextResponse.json({ firebase: "error", credential, code, message, mercadoPago: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN), plan: Boolean(process.env.MERCADOPAGO_PLAN_ID) }, { status: 503 });
  }
}
