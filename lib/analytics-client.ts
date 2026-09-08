const allowedEvents = new Set([
  "register_open",
  "registration_completed",
  "email_verified",
  "spreadsheet_prepared",
  "spreadsheet_downloaded",
  "payment_mercadopago",
  "payment_transfer",
  "whatsapp_managed",
]);

export function analyticsVisitorId() {
  const key = "vetconverVisitorId";
  const value = localStorage.getItem(key) || crypto.randomUUID();
  localStorage.setItem(key, value);
  return value;
}

export function visitSource() {
  const campaign = new URLSearchParams(location.search).get("utm_source")?.toLowerCase();
  const referrer = document.referrer.toLowerCase();
  const value = campaign || referrer;
  if (value.includes("instagram")) return "instagram";
  if (value.includes("facebook")) return "facebook";
  if (value.includes("google")) return "google";
  return referrer ? "other" : "direct";
}

export function trackEvent(event: string) {
  if (process.env.NODE_ENV !== "production" || !allowedEvents.has(event)) return;
  if (localStorage.getItem("vetconverAdminBrowser") === "1") return;
  fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, visitorId: analyticsVisitorId() }),
    keepalive: true,
  }).catch(() => undefined);
}
