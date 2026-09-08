import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

const events = new Set(["register_open", "registration_completed", "email_verified", "spreadsheet_prepared", "spreadsheet_downloaded", "payment_mercadopago", "payment_transfer", "whatsapp_managed"]);

function argentinaDay() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && !["vetconver.com.ar", "www.vetconver.com.ar", "localhost"].includes(new URL(origin).hostname)) return NextResponse.json({ error: "Origen inválido" }, { status: 403 });
    const { event, visitorId } = await request.json();
    if (!events.has(event) || typeof visitorId !== "string" || !/^[a-f0-9-]{20,50}$/i.test(visitorId)) return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    const day = argentinaDay();
    await getAdminDb().collection("analyticsEventsDaily").doc(`${day}_${event}`).set({
      date: day,
      event,
      count: FieldValue.increment(1),
      updatedAt: new Date(),
    }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo registrar" }, { status: 500 });
  }
}
