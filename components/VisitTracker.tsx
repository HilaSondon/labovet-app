"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { analyticsVisitorId, visitSource } from "../lib/analytics-client";

export default function VisitTracker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const sessionKey = "vetconverVisitSent";
    if (sessionStorage.getItem(sessionKey)) return;
    if (localStorage.getItem("vetconverAdminBrowser") === "1") return;
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      const visitorId = analyticsVisitorId();
      sessionStorage.setItem(sessionKey, "1");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
      fetch("/api/analytics/visit", {
        method: "POST",
        headers,
        body: JSON.stringify({ visitorId, source: visitSource() }),
        keepalive: true,
      }).catch(() => sessionStorage.removeItem(sessionKey));
    });
    return unsubscribe;
  }, []);
  return null;
}
