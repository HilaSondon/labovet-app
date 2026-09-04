import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { authenticatedUid } from "../../../../lib/server-auth";
export async function POST(request: Request) {
  try {
    const uid = await authenticatedUid(request); const { deviceId, deviceName } = await request.json();
    if (!deviceId || typeof deviceId !== "string") return NextResponse.json({ error: "Dispositivo inválido" }, { status: 400 });
    const ref = getAdminDb().collection("users").doc(uid); const devices = await ref.collection("devices").get();
    if (!devices.docs.some((item) => item.id === deviceId) && devices.size >= 2) return NextResponse.json({ error: "DEVICE_LIMIT" }, { status: 403 });
    const sessionId = crypto.randomUUID();
    await Promise.all([ref.collection("devices").doc(deviceId).set({ name: String(deviceName || "Dispositivo"), lastSeenAt: new Date() }, { merge: true }), ref.set({ activeSessionId: sessionId, activeDeviceId: deviceId, activeSessionAt: new Date() }, { merge: true })]);
    return NextResponse.json({ sessionId });
  } catch { return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }); }
}
