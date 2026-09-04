import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    await getAdminDb().collection("users").limit(1).get();
    return NextResponse.json({ firebase: "connected", mercadoPago: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN), plan: Boolean(process.env.MERCADOPAGO_PLAN_ID) });
  } catch (error) {
    console.error("Health check failed", error);
    return NextResponse.json({ firebase: "error", mercadoPago: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN), plan: Boolean(process.env.MERCADOPAGO_PLAN_ID) }, { status: 503 });
  }
}
