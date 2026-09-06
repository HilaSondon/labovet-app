"use client";

import { useEffect } from "react";

export default function VisitTracker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const sessionKey = "vetconverVisitSent";
    if (sessionStorage.getItem(sessionKey)) return;
    const visitorKey = "vetconverVisitorId";
    const visitorId = localStorage.getItem(visitorKey) || crypto.randomUUID();
    localStorage.setItem(visitorKey, visitorId);
    sessionStorage.setItem(sessionKey, "1");
    fetch("/api/analytics/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId }),
      keepalive: true,
    }).catch(() => sessionStorage.removeItem(sessionKey));
  }, []);
  return null;
}
