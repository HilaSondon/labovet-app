"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import "../app/analytics.css";

type Day = { date: string; visits: number; uniqueVisitors: number };
const eventLabels: Record<string, string> = { register_open: "Abrieron el registro", registration_completed: "Completaron el registro", email_verified: "Verificaron el correo", spreadsheet_prepared: "Prepararon una planilla", spreadsheet_downloaded: "Descargaron un Excel", payment_mercadopago: "Eligieron Mercado Pago", payment_transfer: "Eligieron transferencia", whatsapp_managed: "Consultaron administración completa" };
const sourceLabels: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", google: "Google", direct: "Acceso directo", other: "Otros sitios" };

export default function VisitAnalyticsPanel({ user }: { user: User }) {
  const [days, setDays] = useState<Day[]>([]);
  const [todayKey, setTodayKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<Record<string, number>>({});
  const [sources, setSources] = useState<Record<string, number>>({});
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/analytics/summary", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setDays(result.days || []);
      setTodayKey(result.today || "");
      setEvents(result.events || {});
      setSources(result.sources || {});
    } catch {
      setError("No pudimos cargar las visitas.");
    } finally {
      setLoading(false);
    }
  }, [user]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const totals = useMemo(() => ({
    visits7: days.slice(0, 7).reduce((sum, day) => sum + day.visits, 0),
    unique7: days.slice(0, 7).reduce((sum, day) => sum + day.uniqueVisitors, 0),
    visits30: days.reduce((sum, day) => sum + day.visits, 0),
  }), [days]);
  const today = days.find((day) => day.date === todayKey);
  return <section className="analytics-page">
    <header><div><span>ADMINISTRACIÓN</span><h1>Visitas a VetConver</h1><p>Medición anónima propia, sin nombres, correos, direcciones IP ni información veterinaria.</p></div><button onClick={load} disabled={loading}>Actualizar</button></header>
    {error && <div className="analytics-error">{error}</div>}
    <div className="analytics-cards">
      <article><span>Visitas de hoy</span><strong>{today?.visits || 0}</strong><small>sesiones registradas</small></article>
      <article><span>Visitantes únicos hoy</span><strong>{today?.uniqueVisitors || 0}</strong><small>navegadores distintos</small></article>
      <article><span>Últimos 7 días</span><strong>{totals.visits7}</strong><small>{totals.unique7} visitantes diarios únicos</small></article>
      <article><span>Últimos 30 días</span><strong>{totals.visits30}</strong><small>visitas registradas</small></article>
    </div>
    <div className="analytics-breakdown">
      <section><h2>Qué hacen los visitantes</h2><p>Acciones acumuladas desde que activaste esta medición.</p><div>{Object.entries(eventLabels).map(([key, label]) => <article key={key}><span>{label}</span><strong>{events[key] || 0}</strong></article>)}</div></section>
      <section><h2>De dónde llegan</h2><p>Origen aproximado según el enlace o sitio anterior.</p><div>{Object.entries(sourceLabels).map(([key, label]) => <article key={key}><span>{label}</span><strong>{sources[key] || 0}</strong></article>)}</div></section>
    </div>
    <div className="analytics-table"><div className="analytics-row head"><span>Fecha</span><span>Visitas</span><span>Visitantes únicos</span></div>{loading ? <p>Cargando…</p> : days.length ? days.map((day) => <div className="analytics-row" key={day.date}><b>{new Date(`${day.date}T12:00:00`).toLocaleDateString("es-AR")}</b><span>{day.visits}</span><span>{day.uniqueVisitors}</span></div>) : <p>Todavía no hay visitas registradas desde la activación.</p>}</div>
  </section>;
}
