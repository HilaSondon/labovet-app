"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  deleteLaboratoryRecord, LaboratoryManagementRecord, loadLaboratoryModule,
  saveLaboratoryRecord, saveLaboratoryRecords,
} from "../lib/laboratory-management-data";

const now = () => new Date().toISOString();
const makeId = () => `price-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const money = (value: unknown) => `$ ${Number(value || 0).toLocaleString("es-AR")}`;
const cleanKey = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

export default function LaboratoryPricePanel({ uid }: { uid: string }) {
  const [items, setItems] = useState<LaboratoryManagementRecord[]>([]);
  const [samples, setSamples] = useState<LaboratoryManagementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [technique, setTechnique] = useState("");
  const [category, setCategory] = useState("Todas");
  const [status, setStatus] = useState("Todos");
  const [selected, setSelected] = useState<string[]>([]);
  const [editItem, setEditItem] = useState<LaboratoryManagementRecord | null>(null);
  const [formMode, setFormMode] = useState<"analysis" | "combo" | "bulk" | null>(null);
  const [comboParts, setComboParts] = useState<string[]>([]);
  const [comboDiscount, setComboDiscount] = useState(0);
  const [comboManual, setComboManual] = useState("");
  const [bulkPercent, setBulkPercent] = useState(0);
  const [bulkScope, setBulkScope] = useState<"filtered" | "selected">("filtered");
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);

  async function reload() {
    setLoading(true);
    const [prices, sampleRows] = await Promise.all([loadLaboratoryModule(uid, "prices"), loadLaboratoryModule(uid, "samples")]);
    setItems(prices); setSamples(sampleRows); setLoading(false);
  }
  useEffect(() => { reload(); }, [uid]);
  const categories = useMemo(() => ["Todas", ...Array.from(new Set(items.map((item) => String(item.category || "Sin categoría")))).sort()], [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const haystack = `${item.name || ""} ${item.code || ""} ${item.technique || ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && String(item.technique || "").toLowerCase().includes(technique.toLowerCase()) && (category === "Todas" || String(item.category || "Sin categoría") === category) && (status === "Todos" || String(item.status || "Activo") === status);
  }), [items, search, technique, category, status]);
  const base = items.filter((item) => item.kind !== "Combinación");
  const combos = items.filter((item) => item.kind === "Combinación");
  const currentMonth = new Date().toISOString().slice(0, 7);
  const usedThisMonth = new Set(samples.filter((item) => String(item.date || "").startsWith(currentMonth)).flatMap((item) => { try { return JSON.parse(String(item.analyses || "[]")).map((row: { name: string }) => row.name); } catch { return []; } })).size;
  const comboSum = comboParts.reduce((total, itemId) => total + Number(items.find((item) => item.id === itemId)?.price || 0), 0);
  const comboSuggested = Math.round(comboSum * (1 - comboDiscount / 100));
  const bulkTargets = bulkScope === "selected" ? items.filter((item) => selected.includes(item.id)) : filtered;

  async function importCatalog() {
    setImporting(true); setMessage("");
    try {
      const source = await fetch("/imports/dorronsoro-prices.json").then((response) => response.json()) as LaboratoryManagementRecord[];
      const valid = source.filter((item) => item.kind !== "Combinación");
      const oldImported = items.filter((item) => item.id.startsWith("dor-price-"));
      await Promise.all(oldImported.map((item) => deleteLaboratoryRecord(uid, "prices", item.id)));
      await saveLaboratoryRecords(uid, "prices", valid.map((item) => ({ ...item, status: "Activo", active: true, updatedAt: now(), createdAt: String(item.createdAt || now()) })));
      await reload(); setMessage(`${valid.length} análisis base importados. Todos los valores se pueden editar.`);
    } catch { setMessage("No pudimos importar el catálogo. Intentá nuevamente."); } finally { setImporting(false); }
  }

  async function saveAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries()); const timestamp = now();
    const item = { ...(editItem || {}), ...values, id: editItem?.id || makeId(), kind: editItem?.kind || "Análisis individual", status: values.status || "Activo", active: values.status !== "Inactivo", createdAt: editItem?.createdAt || timestamp, updatedAt: timestamp } as LaboratoryManagementRecord;
    await saveLaboratoryRecord(uid, "prices", item); setFormMode(null); setEditItem(null); await reload(); setMessage("Análisis guardado correctamente.");
  }

  async function saveCombo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!comboParts.length) { setMessage("Elegí al menos un análisis para crear la combinación."); return; }
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()); const timestamp = now();
    const parts = comboParts.map((itemId) => items.find((item) => item.id === itemId)).filter(Boolean) as LaboratoryManagementRecord[];
    const finalPrice = Number(comboManual || comboSuggested);
    const item = { ...(editItem || {}), ...values, id: editItem?.id || makeId(), kind: "Combinación", components: parts.map((item) => String(item.name)).join(" | "), componentIds: comboParts.join("|"), basePrice: comboSum, discount: comboDiscount, price: finalPrice, status: "Activo", active: true, createdAt: editItem?.createdAt || timestamp, updatedAt: timestamp } as LaboratoryManagementRecord;
    await saveLaboratoryRecord(uid, "prices", item); setFormMode(null); setComboParts([]); setComboDiscount(0); setComboManual(""); await reload(); setMessage("Combinación creada y disponible en Ingreso de muestras.");
  }

  async function applyBulk() {
    const timestamp = now(); const changed = bulkTargets.map((item) => ({ ...item, price: Math.max(0, Math.round(Number(item.price || 0) * (1 + bulkPercent / 100))), updatedAt: timestamp }));
    await saveLaboratoryRecords(uid, "prices", changed); setFormMode(null); setSelected([]); await reload(); setMessage(`${changed.length} precios actualizados.`);
  }

  async function duplicate(item: LaboratoryManagementRecord) {
    const timestamp = now(); await saveLaboratoryRecord(uid, "prices", { ...item, id: makeId(), code: `${item.code || "AN"}-COPIA`, name: `${item.name} (copia)`, createdAt: timestamp, updatedAt: timestamp }); await reload();
  }
  async function remove(item: LaboratoryManagementRecord) { await deleteLaboratoryRecord(uid, "prices", item.id); await reload(); }
  function exportPdf() {
    const doc = new jsPDF(); doc.setTextColor(18, 55, 70); doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("Lista de precios", 14, 18); doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.text(`Vigente al ${new Date().toLocaleDateString("es-AR")}`, 14, 25);
    let startY = 32;
    const grouped = Array.from(new Set(items.filter((item) => item.status === "Activo").map((item) => String(item.category || "Sin categoría")))).sort();
    grouped.forEach((group) => { const rows = items.filter((item) => item.status === "Activo" && String(item.category || "Sin categoría") === group).sort((a, b) => String(a.name).localeCompare(String(b.name))).map((item) => [String(item.name), String(item.technique || "—"), money(item.price)]); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(group, 14, startY); autoTable(doc, { startY: startY + 3, head: [["Análisis", "Técnica", "Precio"]], body: rows, theme: "grid", headStyles: { fillColor: [20, 141, 120] }, styles: { fontSize: 8 }, columnStyles: { 2: { halign: "right" } } }); startY = Number((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 12; if (startY > 270) { doc.addPage(); startY = 18; } });
    doc.save(`Lista-de-precios-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return <><header className="topbar module-topbar laboratory-management-header"><div><span className="eyebrow">GESTIÓN</span><h1>Lista de precios</h1><p>Diagnósticos, técnicas y valores utilizados en ingresos y protocolos.</p></div></header>
    {message && <div className="laboratory-message success">{message}<button onClick={() => setMessage("")}>×</button></div>}
    <section className="lab-price-actions"><h2>Análisis disponibles</h2><div><button onClick={exportPdf}>Exportar PDF</button><button onClick={() => { setEditItem(null); setComboParts([]); setFormMode("combo"); }}>Combinar análisis</button><button onClick={() => { setBulkScope(selected.length ? "selected" : "filtered"); setFormMode("bulk"); }}>Aumentar / descontar %</button><button className="primary" onClick={() => { setEditItem(null); setFormMode("analysis"); }}>＋ Agregar análisis</button></div></section>
    <section className="panel lab-price-filters"><label>Análisis<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar análisis" /></label><label>Técnica<input value={technique} onChange={(event) => setTechnique(event.target.value)} placeholder="Buscar técnica" /></label><label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)}><option>Todos</option><option>Activo</option><option>En revisión</option><option>Inactivo</option></select></label></section>
    <div className="lab-price-stats"><article className="panel"><span>Análisis activos</span><strong>{base.filter((item) => item.status === "Activo").length}</strong></article><article className="panel"><span>Combinaciones propias</span><strong>{combos.length}</strong></article><article className="panel"><span>Seleccionados</span><strong>{selected.length}</strong></article><article className="panel"><span>Usados este mes</span><strong>{usedThisMonth}</strong></article></div>
    {!items.length && <section className="panel lab-import-empty"><h2>Importá el catálogo inicial</h2><p>Se cargarán solamente análisis base normalizados, con valores iniciales editables.</p><button className="primary" onClick={importCatalog} disabled={importing}>{importing ? "Importando…" : "Importar análisis base Dorronsoro"}</button></section>}
    <section className="panel lab-price-table-panel"><div className="lab-price-table-heading"><div><h2>Diagnósticos y precios</h2><p>{filtered.length} resultados · {selected.length ? `${selected.length} seleccionados` : "seleccioná filas para una actualización parcial"}</p></div>{items.length > 0 && <button onClick={importCatalog} disabled={importing}>{importing ? "Actualizando…" : "Reimportar catálogo base"}</button>}</div><div className="lab-price-table"><div className="lab-price-row head"><span><input type="checkbox" checked={filtered.length > 0 && filtered.every((item) => selected.includes(item.id))} onChange={(event) => setSelected(event.target.checked ? Array.from(new Set([...selected, ...filtered.map((item) => item.id)])) : selected.filter((id) => !filtered.some((item) => item.id === id)))} /></span><span>Análisis</span><span>Técnica</span><span>Categoría</span><span>Descripción / componentes</span><span>Precio</span><span>Estado</span><span>Acciones</span></div>{loading ? <div className="laboratory-empty-filter">Cargando precios…</div> : filtered.slice(0, 300).map((item) => <article className="lab-price-row" key={item.id}><span><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /></span><b>{String(item.name)}{item.kind === "Combinación" && <small>Combinación</small>}</b><span>{String(item.technique || "—")}</span><span>{String(item.category || "Sin categoría")}</span><span>{String(item.components || item.description || item.originalName || "—")}</span><strong>{money(item.price)}</strong><span><em className={`lab-status ${String(item.status || "Activo").toLowerCase().replace(" ", "-")}`}>{String(item.status || "Activo")}</em></span><span className="lab-row-actions"><button title="Editar" onClick={() => { setEditItem(item); if (item.kind === "Combinación") { setComboParts(String(item.componentIds || "").split("|").filter(Boolean)); setComboDiscount(Number(item.discount || 0)); setComboManual(String(item.price || "")); setFormMode("combo"); } else setFormMode("analysis"); }}>✎</button><button title="Duplicar" onClick={() => duplicate(item)}>▣</button><button title="Eliminar" className="danger" onClick={() => remove(item)}>×</button></span></article>)}</div></section>
    {formMode === "analysis" && <div className="modal-backdrop"><form className="modal-card laboratory-record-modal" onSubmit={saveAnalysis}><div className="modal-heading"><div><span className="eyebrow">LISTA DE PRECIOS</span><h2>{editItem ? "Editar análisis" : "Nuevo análisis"}</h2></div><button type="button" onClick={() => setFormMode(null)}>×</button></div><div className="laboratory-record-grid"><label>Nombre<input name="name" defaultValue={String(editItem?.name || "")} required /></label><label>Código<input name="code" defaultValue={String(editItem?.code || "")} /></label><label>Técnica<input name="technique" defaultValue={String(editItem?.technique || "")} /></label><label>Categoría<input name="category" defaultValue={String(editItem?.category || "")} required /></label><label>Precio<input name="price" type="number" min="0" defaultValue={String(editItem?.price || "")} required /></label><label>Estado<select name="status" defaultValue={String(editItem?.status || "Activo")}><option>Activo</option><option>Inactivo</option></select></label><label className="wide">Descripción<textarea name="description" defaultValue={String(editItem?.description || editItem?.originalName || "")} /></label></div><footer><button type="button" onClick={() => setFormMode(null)}>Cancelar</button><button className="primary">Guardar análisis</button></footer></form></div>}
    {formMode === "combo" && <div className="modal-backdrop"><form className="modal-card laboratory-record-modal combo-modal" onSubmit={saveCombo}><div className="modal-heading"><div><span className="eyebrow">COMBINACIÓN</span><h2>Crear precio combinado</h2></div><button type="button" onClick={() => setFormMode(null)}>×</button></div><div className="laboratory-record-grid"><label>Nombre<input name="name" defaultValue={String(editItem?.name || "")} required /></label><label>Categoría<input name="category" defaultValue={String(editItem?.category || "")} required /></label><fieldset className="price-component-picker"><legend>Análisis incluidos</legend><div>{base.filter((item) => item.status === "Activo").map((item) => <label key={item.id}><input type="checkbox" checked={comboParts.includes(item.id)} onChange={() => setComboParts((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span>{String(item.name)}</span><b>{money(item.price)}</b></label>)}</div></fieldset><div className="combo-price-summary"><span>Suma automática<strong>{money(comboSum)}</strong></span><label>Descuento %<input type="number" min="0" max="100" value={comboDiscount} onChange={(event) => setComboDiscount(Number(event.target.value))} /></label><span>Con descuento<strong>{money(comboSuggested)}</strong></span><label>Precio final opcional<input type="number" min="0" value={comboManual} onChange={(event) => setComboManual(event.target.value)} placeholder={String(comboSuggested)} /></label></div></div><footer><button type="button" onClick={() => setFormMode(null)}>Cancelar</button><button className="primary">Guardar combinación</button></footer></form></div>}
    {formMode === "bulk" && <div className="modal-backdrop"><section className="modal-card laboratory-record-modal"><div className="modal-heading"><div><span className="eyebrow">ACTUALIZACIÓN MASIVA</span><h2>Aumentar o descontar precios</h2></div><button onClick={() => setFormMode(null)}>×</button></div><div className="bulk-price-form"><label>Aplicar a<select value={bulkScope} onChange={(event) => setBulkScope(event.target.value as "filtered" | "selected")}><option value="filtered">Resultados filtrados ({filtered.length})</option><option value="selected" disabled={!selected.length}>Productos seleccionados ({selected.length})</option></select></label><label>Porcentaje<input type="number" value={bulkPercent} onChange={(event) => setBulkPercent(Number(event.target.value))} /><small>Usá un número negativo para descontar.</small></label><div className="bulk-preview"><span>Registros<strong>{bulkTargets.length}</strong></span><span>Ejemplo actual<strong>{money(bulkTargets[0]?.price)}</strong></span><span>Ejemplo final<strong>{money(Math.max(0, Math.round(Number(bulkTargets[0]?.price || 0) * (1 + bulkPercent / 100))))}</strong></span></div></div><footer><button onClick={() => setFormMode(null)}>Cancelar</button><button className="primary" disabled={!bulkTargets.length || !bulkPercent} onClick={applyBulk}>Confirmar actualización</button></footer></section></div>}</>;
}
