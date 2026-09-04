import crypto from "node:crypto";

const apiBase = "https://api.mercadopago.com";

export async function mercadoPago(path: string, init?: RequestInit) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN no configurado");
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Mercado Pago ${response.status}: ${await response.text()}`);
  return response.json();
}

export function validWebhookSignature(request: Request, dataId: string) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  // En Suscripciones, Mercado Pago puede entregar la notificación mediante
  // notification_url sin exponer una clave en el panel. El recurso siempre se
  // vuelve a consultar con el Access Token antes de modificar ningún acceso.
  if (!secret) return true;
  const signature = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(signature.split(",").map((item) => item.trim().split("=")));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  if (expected.length !== parts.v1.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}
