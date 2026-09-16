import { NextResponse } from "next/server";
import { authenticatedUser } from "../../../../lib/server-auth";

export async function POST(request: Request) {
  const host = request.headers.get("host") || "";
  if (process.env.NODE_ENV === "production" || !/^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/.test(host)) {
    return NextResponse.json({ error: "Disponible únicamente en el entorno local." }, { status: 404 });
  }
  try {
    const identity = await authenticatedUser(request);
    const { getAdminAuth } = await import("../../../../lib/firebase-admin");
    await getAdminAuth().updateUser(identity.uid, { emailVerified: true });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo verificar la cuenta local." }, { status: 401 });
  }
}
