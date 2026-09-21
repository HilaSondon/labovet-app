"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";

export default function FloatingWhatsApp() {
  const [visible, setVisible] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (user) => setVisible(!user), () => setVisible(false)), []);

  if (!visible) return null;
  return <a className="whatsapp-float" href="https://wa.me/5492244429316" target="_blank" rel="noreferrer" aria-label="Consultar por WhatsApp">WhatsApp ↗</a>;
}
