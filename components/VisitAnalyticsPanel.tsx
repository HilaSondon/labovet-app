"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import "../app/analytics.css";

type Day = { date: string; visits: number; uniqueVisitors: number };

export default function VisitAnalyticsPanel({ user }: { user: User }) {
  const [days, setDays] = useState<Day[]>([]);
  const [todayKey, setTodayKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/analytics/summary", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setDays(result.days || []);
      setTodayKey(result.today || "");
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
    <div className="analytics-table"><div className="analytics-row head"><span>Fecha</span><span>Visitas</span><span>Visitantes únicos</span></div>{loading ? <p>Cargando…</p> : days.length ? days.map((day) => <div className="analytics-row" key={day.date}><b>{new Date(`${day.date}T12:00:00`).toLocaleDateString("es-AR")}</b><span>{day.visits}</span><span>{day.uniqueVisitors}</span></div>) : <p>Todavía no hay visitas registradas desde la activación.</p>}</div>
  </section>;
}
