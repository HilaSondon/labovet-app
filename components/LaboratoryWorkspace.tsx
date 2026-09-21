"use client";

import { useEffect, useRef, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore/lite";
import type { User } from "firebase/auth";
import { db } from "../lib/firebase";

type LaboratoryMessage = {
  type?: string;
  profile?: Record<string, unknown>;
  codeMappings?: unknown[];
  catalogOverrides?: Record<string, string>;
  accessToken?: string;
};

export default function LaboratoryWorkspace({ user, isAdmin, section }: { user: User; isAdmin: boolean; section: "protocol" | "profile" | "vets" | "merge" }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [payload, setPayload] = useState<LaboratoryMessage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      getDoc(doc(db, "users", user.uid, "laboratory", "settings")),
      getDoc(doc(db, "users", user.uid)),
      getDoc(doc(db, "systemConfig", "laboratoryCodes")),
      user.getIdToken(),
    ]).then(([settings, account, codes, accessToken]) => {
      if (!active) return;
      setPayload({
        type: "vetconver-laboratory-hydrate",
        profile: { ...(settings.exists() ? settings.data().profile || {} : {}), labLogoData: account.data()?.laboratoryLogoData || null },
        codeMappings: codes.exists() ? codes.data().codeMappings || [] : [],
        catalogOverrides: codes.exists() ? codes.data().catalogOverrides || {} : {},
        accessToken,
      });
    }).catch(() => active && setError("No se pudo cargar la configuración del laboratorio."));
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    const receive = async (event: MessageEvent<LaboratoryMessage>) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "vetconver-laboratory-ready" && payload) frame.current?.contentWindow?.postMessage(payload, window.location.origin);
      if (event.data?.type === "vetconver-laboratory-save-profile") {
        // The laboratory logo is assigned by an administrator and must not be
        // overwritten by a stale profile from an open laboratory session.
        const editableProfile = { ...event.data.profile };
        delete editableProfile.labLogoData;
        await setDoc(doc(db, "users", user.uid, "laboratory", "settings"), {
          profile: editableProfile, updatedAt: serverTimestamp(), updatedBy: user.uid,
        }, { merge: true });
      }
      if (event.data?.type === "vetconver-laboratory-save-codes" && isAdmin) {
        await setDoc(doc(db, "systemConfig", "laboratoryCodes"), {
          codeMappings: event.data.codeMappings || [], catalogOverrides: event.data.catalogOverrides || {},
          updatedAt: serverTimestamp(), updatedBy: user.uid,
        }, { merge: true });
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [isAdmin, payload, user.uid]);

  useEffect(() => {
    if (payload) frame.current?.contentWindow?.postMessage(payload, window.location.origin);
  }, [payload]);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: "vetconver-laboratory-navigate", section }, window.location.origin);
  }, [section]);

  return <section className="laboratory-workspace">
    {error && <div className="laboratory-load-error">{error}</div>}
    <iframe ref={frame} className="sigatm-frame" src={`/laboratory/index.html?embedded=1&role=${isAdmin ? "admin" : "laboratory"}`} title="VetConver para laboratorios" onLoad={() => frame.current?.contentWindow?.postMessage({ type: "vetconver-laboratory-navigate", section }, window.location.origin)} />
  </section>;
}
