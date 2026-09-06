import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { authenticatedUid } from "../../../../lib/server-auth";

function argentinaDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin) {
      const hostname = new URL(origin).hostname;
      if (hostname !== "vetconver.com.ar" && hostname !== "www.vetconver.com.ar" && hostname !== "localhost") {
        return NextResponse.json({ error: "Origen inválido" }, { status: 403 });
      }
    }
    const { visitorId } = await request.json();
    if (typeof visitorId !== "string" || !/^[a-f0-9-]{20,50}$/i.test(visitorId)) {
      return NextResponse.json({ error: "Visita inválida" }, { status: 400 });
    }
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    const db = getAdminDb();
    if (request.headers.get("authorization")) {
      try {
        const uid = await authenticatedUid(request);
        const profile = (await db.collection("users").doc(uid).get()).data();
        if (profile?.role === "admin") {
          return NextResponse.json({ ok: true, ignored: "admin" });
        }
      } catch {
        return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
      }
    }
    const day = argentinaDay();
    const daily = db.collection("analyticsDaily").doc(day);
    const visitor = daily.collection("visitors").doc(visitorId);
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(visitor);
      transaction.set(daily, {
        date: day,
        visits: FieldValue.increment(1),
        uniqueVisitors: FieldValue.increment(existing.exists ? 0 : 1),
        updatedAt: new Date(),
      }, { merge: true });
      if (!existing.exists) transaction.set(visitor, { firstSeenAt: new Date() });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("No se pudo registrar la visita", error);
    return NextResponse.json({ error: "No se pudo registrar" }, { status: 500 });
  }
}
