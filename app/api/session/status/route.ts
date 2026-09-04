import { NextResponse } from "next/server";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { authenticatedUid } from "../../../../lib/server-auth";
export async function POST(request: Request) {
  try { const uid = await authenticatedUid(request); const { sessionId } = await request.json(); const profile = (await getAdminDb().collection("users").doc(uid).get()).data(); return NextResponse.json({ active: Boolean(sessionId) && profile?.activeSessionId === sessionId }); }
  catch { return NextResponse.json({ active: false }, { status: 401 }); }
}
