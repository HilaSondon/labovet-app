import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    await getAdminDb().collection("users").limit(1).get();
    return NextResponse.json({ firebase: "connected", mercadoPago: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN), plan: Boolean(process.env.MERCADOPAGO_PLAN_ID) });
  } catch (error) {
    console.error("Health check failed", error);
    const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "";
    let credential = "missing";
    try {
      const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
      credential = parsed.project_id === "labovet-e70a2" && parsed.private_key ? "valid-format" : "wrong-project";
    } catch { credential = encoded ? "invalid-format" : "missing"; }
    return NextResponse.json({ firebase: "error", credential, mercadoPago: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN), plan: Boolean(process.env.MERCADOPAGO_PLAN_ID) }, { status: 503 });
  }
}
