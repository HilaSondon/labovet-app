import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { authenticatedUser } from "../../../../lib/server-auth";

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] || character);

export async function POST(request: Request) {
  try {
    const identity = await authenticatedUser(request);
    const email = identity.email;
    if (!email) return NextResponse.json({ error: "La cuenta no tiene correo" }, { status: 400 });
    if (identity.email_verified) return NextResponse.json({ ok: true });

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM_EMAIL || user;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!host || !user || !pass || !from || !appUrl) {
      return NextResponse.json({ error: "Correo propio no configurado" }, { status: 503 });
    }

    const { getAdminAuth } = await import("../../../../lib/firebase-admin");
    const generated = await getAdminAuth().generateEmailVerificationLink(email, { url: appUrl });
    const firebaseUrl = new URL(generated);
    const verificationUrl = `${appUrl}/auth/action?${firebaseUrl.searchParams.toString()}`;
    const profile = await getAdminAuth().getUser(identity.uid);
    const name = escapeHtml(profile.displayName || "");

    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `VetConver <${from}>`,
      to: email,
      subject: "Verificá tu correo para ingresar a VetConver",
      text: `${name ? `Hola, ${name}.\n\n` : ""}Confirmá tu correo para activar tu cuenta de VetConver: ${verificationUrl}`,
      html: `
        <div style="background:#f1f8f5;padding:32px 12px;font-family:Arial,sans-serif;color:#102923">
          <div style="max-width:560px;margin:auto;background:white;border:1px solid #d7e4df;border-radius:20px;padding:34px;text-align:center">
            <img src="${appUrl}/vetconver-logo.png" alt="VetConver" width="180" style="max-width:100%;height:auto">
            <p style="margin:28px 0 8px;color:#0d806a;font-size:11px;font-weight:800;letter-spacing:.12em">PROTEGÉ TU CUENTA</p>
            <h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:31px">Verificá tu correo</h1>
            <p style="margin:0;color:#637972;line-height:1.6">${name ? `Hola, ${name}. ` : ""}Confirmá que esta dirección es tuya para continuar con VetConver.</p>
            <a href="${verificationUrl}" style="display:block;margin:26px 0 18px;padding:14px 18px;border-radius:10px;background:#0d806a;color:white;font-weight:800;text-decoration:none">Confirmar mi correo</a>
            <p style="margin:0;color:#83938e;font-size:12px;line-height:1.5">Si no creaste esta cuenta, podés ignorar este mensaje.</p>
          </div>
        </div>`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("No pudimos enviar la verificación", error);
    return NextResponse.json({ error: "No pudimos enviar el correo" }, { status: 500 });
  }
}
