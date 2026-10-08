"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore/lite";
import { db } from "../lib/firebase";
import "./AdminSubscriptionsPanel.css";

type Billing = {
  contactName: string;
  phone: string;
  taxId: string;
  location: string;
  agreedAmount: string;
  billingFrequency: "monthly" | "quarterly" | "annual" | "custom";
  nextDueDate: string;
  lastPaymentDate: string;
  serviceDetails: string;
  notes: string;
};

type SubscriptionRow = {
  uid: string;
  name: string;
  username: string;
  contactEmail: string;
  accessStatus: string;
  billing: Billing;
};

type Payment = { id: string; date: string; amount: number; period: string; method: string; note: string };

const emptyBilling: Billing = {
  contactName: "", phone: "", taxId: "", location: "", agreedAmount: "",
  billingFrequency: "monthly", nextDueDate: "", lastPaymentDate: "", serviceDetails: "", notes: "",
};

const dateLabel = (value: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? value.split("-").reverse().join("/")
  : "—";

export default function AdminSubscriptionsPanel({ currentUid }: { currentUid: string }) {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [feedback, setFeedback] = useState("");
  const [expandedUid, setExpandedUid] = useState("");
  const [payments, setPayments] = useState<Record<string, Payment[]>>({});

  const loadRows = async () => {
    setLoading(true);
    try {
      const [usersSnapshot, recordsSnapshot] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "adminUserRecords")),
      ]);
      const records = new Map(recordsSnapshot.docs.map((item) => [item.id, item.data()]));
      setRows(usersSnapshot.docs.flatMap((item) => {
        const user = item.data();
        if (user.role !== "laboratory") return [];
        const stored = records.get(item.id)?.billing;
        return [{
          uid: item.id,
          name: String(user.name || "Laboratorio sin nombre"),
          username: String(user.username || user.email || ""),
          contactEmail: String(user.contactEmail || ""),
          accessStatus: String(user.subscriptionStatus || "pending"),
          billing: { ...emptyBilling, ...(stored && typeof stored === "object" ? stored : {}), agreedAmount: String(stored?.agreedAmount || "") },
        }];
      }).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error("No pudimos cargar las suscripciones", error);
      setFeedback("No pudimos cargar las suscripciones.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadRows(); }, []);

  const updateBilling = (uid: string, field: keyof Billing, value: string) => {
    setRows((current) => current.map((row) => row.uid === uid ? { ...row, billing: { ...row.billing, [field]: value } } : row));
  };

  const saveRow = async (row: SubscriptionRow) => {
    setSaving(row.uid);
    setFeedback("");
    try {
      await setDoc(doc(db, "adminUserRecords", row.uid), {
        userId: row.uid, billing: row.billing, updatedAt: serverTimestamp(), updatedBy: currentUid,
      }, { merge: true });
      setFeedback(`Suscripción actualizada para ${row.name}.`);
    } catch (error) {
      console.error("No pudimos guardar la suscripción", error);
      setFeedback("No pudimos guardar la suscripción.");
    } finally {
      setSaving("");
    }
  };

  const loadPayments = async (uid: string) => {
    setExpandedUid((current) => current === uid ? "" : uid);
    if (payments[uid]) return;
    const snapshot = await getDocs(collection(db, "adminUserRecords", uid, "payments"));
    setPayments((current) => ({
      ...current,
      [uid]: snapshot.docs.map((item) => ({
        id: item.id,
        date: String(item.data().date || ""), amount: Number(item.data().amount || 0),
        period: String(item.data().period || ""), method: String(item.data().method || ""), note: String(item.data().note || ""),
      })).sort((a, b) => b.date.localeCompare(a.date)),
    }));
  };

  const registerPayment = async (event: React.FormEvent<HTMLFormElement>, row: SubscriptionRow) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payment = {
      date: String(data.get("date") || ""), amount: Number(data.get("amount") || 0),
      period: String(data.get("period") || ""), method: String(data.get("method") || ""), note: String(data.get("note") || ""),
    };
    if (!payment.date || !Number.isFinite(payment.amount) || payment.amount <= 0) return setFeedback("Ingresá una fecha y un importe válido.");
    setSaving(row.uid);
    try {
      const reference = await addDoc(collection(db, "adminUserRecords", row.uid, "payments"), {
        ...payment, createdAt: serverTimestamp(), createdBy: currentUid,
      });
      const billing = { ...row.billing, lastPaymentDate: payment.date };
      await setDoc(doc(db, "adminUserRecords", row.uid), { userId: row.uid, billing, updatedAt: serverTimestamp(), updatedBy: currentUid }, { merge: true });
      setRows((current) => current.map((item) => item.uid === row.uid ? { ...item, billing } : item));
      setPayments((current) => ({ ...current, [row.uid]: [{ id: reference.id, ...payment }, ...(current[row.uid] || [])] }));
      form.reset();
      setFeedback(`Pago registrado para ${row.name}.`);
    } catch (error) {
      console.error("No pudimos registrar el pago", error);
      setFeedback("No pudimos registrar el pago.");
    } finally {
      setSaving("");
    }
  };

  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const paymentState = (row: SubscriptionRow) => !row.billing.nextDueDate ? "Sin fecha" : row.billing.nextDueDate < localToday ? "Vencido" : "Al día";
  const visibleRows = useMemo(() => rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matches = !query || [row.name, row.username, row.contactEmail, row.billing.contactName, row.billing.serviceDetails].some((value) => value.toLowerCase().includes(query));
    return matches && (!statusFilter || paymentState(row) === statusFilter);
  }), [rows, search, statusFilter]);
  const monthlyTotal = rows.reduce((total, row) => {
    const amount = Number(row.billing.agreedAmount || 0);
    if (!Number.isFinite(amount)) return total;
    if (row.billing.billingFrequency === "quarterly") return total + amount / 3;
    if (row.billing.billingFrequency === "annual") return total + amount / 12;
    return row.billing.billingFrequency === "monthly" ? total + amount : total;
  }, 0);

  return <>
    <header className="topbar module-topbar admin-header">
      <div><span className="eyebrow">ADMINISTRACIÓN</span><h1>Suscripciones de laboratorios</h1><p>Importes, pagos y vencimientos en una sola tabla.</p></div>
      <button className="outline-btn" type="button" onClick={loadRows}>Actualizar</button>
    </header>
    <section className="subscription-summary">
      <span><b>{rows.length}</b> laboratorios</span><span><b>{rows.filter((row) => paymentState(row) === "Vencido").length}</b> vencidos</span><span><b>$ {Math.round(monthlyTotal).toLocaleString("es-AR")}</b> mensual estimado</span>
    </section>
    {feedback && <div className="stock-notice"><span>{feedback}</span><button onClick={() => setFeedback("")}>×</button></div>}
    <section className="panel subscription-sheet">
      <div className="subscription-sheet-toolbar"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar laboratorio, contacto o servicio…" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos</option><option value="Al día">Al día</option><option value="Vencido">Vencidos</option><option value="Sin fecha">Sin vencimiento</option></select></div>
      <div className="subscription-table-wrap"><table><thead><tr><th>Laboratorio</th><th>Servicio / diagnósticos</th><th>Importe</th><th>Frecuencia</th><th>Último pago</th><th>Próximo vencimiento</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={8}>Cargando suscripciones…</td></tr> : visibleRows.length ? visibleRows.map((row) => <Fragment key={row.uid}>
          <tr>
            <td><b>{row.name}</b><small>{row.billing.contactName || row.contactEmail || row.username}</small></td>
            <td><input value={row.billing.serviceDetails} onChange={(event) => updateBilling(row.uid, "serviceDetails", event.target.value)} placeholder="Diagnósticos incluidos" /></td>
            <td><input className="money" type="number" min="0" step="0.01" value={row.billing.agreedAmount} onChange={(event) => updateBilling(row.uid, "agreedAmount", event.target.value)} placeholder="$" /></td>
            <td><select value={row.billing.billingFrequency} onChange={(event) => updateBilling(row.uid, "billingFrequency", event.target.value)}><option value="monthly">Mensual</option><option value="quarterly">Trimestral</option><option value="annual">Anual</option><option value="custom">Personalizada</option></select></td>
            <td><input type="date" value={row.billing.lastPaymentDate} onChange={(event) => updateBilling(row.uid, "lastPaymentDate", event.target.value)} /></td>
            <td><input type="date" value={row.billing.nextDueDate} onChange={(event) => updateBilling(row.uid, "nextDueDate", event.target.value)} /></td>
            <td><span className={`payment-state ${paymentState(row) === "Al día" ? "current" : paymentState(row) === "Vencido" ? "overdue" : "undated"}`}>{paymentState(row)}</span><small>Acceso: {row.accessStatus}</small></td>
            <td><div className="subscription-row-actions"><button disabled={saving === row.uid} onClick={() => saveRow(row)}>{saving === row.uid ? "Guardando…" : "Guardar"}</button><button className="secondary" onClick={() => loadPayments(row.uid)}>{expandedUid === row.uid ? "Cerrar pagos" : "Pagos"}</button></div></td>
          </tr>
          {expandedUid === row.uid && <tr className="payment-detail-row" key={`${row.uid}-payments`}><td colSpan={8}><div className="payment-detail"><form onSubmit={(event) => registerPayment(event, row)}><b>Registrar pago</b><input name="date" type="date" required /><input name="amount" type="number" min="0.01" step="0.01" placeholder="Importe" required /><input name="period" placeholder="Período" /><select name="method"><option>Transferencia</option><option>Mercado Pago</option><option>Efectivo</option><option>Otro</option></select><input name="note" placeholder="Observación" /><button disabled={saving === row.uid}>Registrar</button></form><div className="payment-list"><b>Historial</b>{(payments[row.uid] || []).length ? (payments[row.uid] || []).map((payment) => <span key={payment.id}><strong>{dateLabel(payment.date)}</strong><em>$ {payment.amount.toLocaleString("es-AR")}</em><small>{payment.period || "Sin período"} · {payment.method}{payment.note ? ` · ${payment.note}` : ""}</small></span>) : <small>Sin pagos registrados.</small>}</div></div></td></tr>}
        </Fragment>) : <tr><td colSpan={8}>No hay laboratorios con esos filtros.</td></tr>}
      </tbody></table></div>
    </section>
  </>;
}
