import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { authenticatedUid } from "../../../../lib/server-auth";

const normalizeUsername = (value: unknown) => String(value || "").trim().toLowerCase();

export async function POST(request: Request) {
  try {
    const adminUid = await authenticatedUid(request);
    const { getAdminAuth, getAdminDb } = await import("../../../../lib/firebase-admin");
    const db = getAdminDb();
    const admin = (await db.collection("users").doc(adminUid).get()).data();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });

    const body = await request.json();
    const username = normalizeUsername(body.username);
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    const contactEmail = String(body.contactEmail || "").trim().toLowerCase();
    const role = body.role === "veterinarian" ? "veterinarian" : "laboratory";
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
      return NextResponse.json({ error: "El usuario debe tener entre 3 y 40 caracteres: letras minúsculas, números, punto, guion o guion bajo." }, { status: 400 });
    }
    if (!name) return NextResponse.json({ error: "Ingresá el nombre del usuario o laboratorio." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "La contraseña provisoria debe tener al menos 8 caracteres." }, { status: 400 });
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return NextResponse.json({ error: "El correo de contacto no es válido." }, { status: 400 });
    }

    const technicalEmail = `${username}@acceso.vetconver.com.ar`;
    const auth = getAdminAuth();
    const created = await auth.createUser({ email: technicalEmail, emailVerified: true, password, displayName: name, disabled: false });
    try {
      await db.collection("users").doc(created.uid).set({
        name,
        username,
        email: technicalEmail,
        contactEmail,
        adminCreated: true,
        role,
        plan: role === "laboratory" ? "laboratory" : "large_animals",
        subscriptionStatus: "active",
        paymentMethod: "transfer",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: adminUid,
        emailVerifiedByAdmin: true,
      });
    } catch (error) {
      await auth.deleteUser(created.uid).catch(() => undefined);
      throw error;
    }
    return NextResponse.json({ ok: true, uid: created.uid, username });
  } catch (error) {
    const code = String((error as { code?: string }).code || "");
    if (code.includes("email-already-exists")) return NextResponse.json({ error: "Ese nombre de usuario ya existe." }, { status: 409 });
    console.error("No se pudo crear el usuario administrado", error);
    return NextResponse.json({ error: "No se pudo crear el usuario." }, { status: 500 });
  }
}
