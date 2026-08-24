"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  deleteLaboratoryRecord, LaboratoryManagementRecord, LaboratoryModule,
  loadLaboratoryModule, saveLaboratoryRecord,
} from "../lib/laboratory-management-data";
import { loadLaboratoryData } from "../lib/laboratory-data";

export type LaboratoryManagementSection = LaboratoryModule | "dashboard" | "protocols" | "veterinarians" | "profile" | "quality" | "history";
type Field = { key: string; label: string; type?: "date" | "number" | "select" | "textarea"; options?: string[]; required?: boolean };
type Definition = { title: string; eyebrow: string; description: string; singular: string; fields: Field[]; columns: string[] };

const DEFINITIONS: Record<LaboratoryModule, Definition> = {
  samples: { title: "Ingreso de muestras", eyebrow: "OPERACIÓN", description: "Registrá la recepción y generá el número interno del protocolo.", singular: "ingreso", columns: ["protocol", "date", "client", "veterinarian", "sampleType", "quantity", "status"], fields: [
    { key: "date", label: "Fecha de ingreso", type: "date", required: true }, { key: "client", label: "Cliente / productor", required: true },
    { key: "renspa", label: "RENSPA" }, { key: "veterinarian", label: "Veterinario", required: true }, { key: "sampleType", label: "Tipo de muestra", required: true },
    { key: "analysis", label: "Análisis solicitado", required: true }, { key: "quantity", label: "Cantidad", type: "number", required: true },
    { key: "condition", label: "Condición de recepción", type: "select", options: ["Aceptada", "Aceptada con observaciones", "Rechazada"] },
    { key: "observations", label: "Observaciones", type: "textarea" },
  ]},
  clients: { title: "Clientes / Productores", eyebrow: "GESTIÓN", description: "Padrón de productores y clientes del laboratorio.", singular: "cliente", columns: ["name", "cuit", "renspa", "phone", "email"], fields: [
    { key: "name", label: "Razón social / nombre", required: true }, { key: "cuit", label: "CUIT", required: true }, { key: "renspa", label: "RENSPA" },
    { key: "address", label: "Dirección" }, { key: "phone", label: "Teléfono / WhatsApp" }, { key: "email", label: "Correo electrónico" },
  ]},
  prices: { title: "Lista de precios", eyebrow: "GESTIÓN", description: "Análisis, técnicas y valores vigentes. Sin facturación.", singular: "análisis", columns: ["code", "name", "technique", "species", "price", "validFrom"], fields: [
    { key: "code", label: "Código" }, { key: "name", label: "Análisis", required: true }, { key: "technique", label: "Técnica" }, { key: "species", label: "Especie" },
    { key: "price", label: "Precio", type: "number", required: true }, { key: "validFrom", label: "Vigente desde", type: "date" },
  ]},
  qualityManual: { title: "Manual de calidad", eyebrow: "CALIDAD", description: "Controlá capítulos, versiones, responsables y vigencia del manual.", singular: "capítulo", columns: ["code", "name", "version", "responsible", "status"], fields: [
    { key: "code", label: "Código", required: true }, { key: "name", label: "Capítulo / documento", required: true }, { key: "version", label: "Versión" },
    { key: "responsible", label: "Responsable" }, { key: "status", label: "Estado", type: "select", options: ["Borrador", "Vigente", "Obsoleto"] }, { key: "content", label: "Contenido / alcance", type: "textarea" },
  ]},
  procedures: { title: "Procedimientos POE", eyebrow: "CALIDAD", description: "Procedimientos operativos estandarizados con revisión controlada.", singular: "procedimiento", columns: ["code", "name", "version", "reviewDate", "status"], fields: [
    { key: "code", label: "Código POE", required: true }, { key: "name", label: "Procedimiento", required: true }, { key: "version", label: "Versión" }, { key: "reviewDate", label: "Próxima revisión", type: "date" },
    { key: "status", label: "Estado", type: "select", options: ["Borrador", "Vigente", "En revisión", "Obsoleto"] }, { key: "description", label: "Descripción", type: "textarea" },
  ]},
  records: { title: "Registros", eyebrow: "CALIDAD", description: "Índice maestro de formularios y registros de calidad.", singular: "registro", columns: ["code", "name", "area", "retention", "status"], fields: [
    { key: "code", label: "Código", required: true }, { key: "name", label: "Registro", required: true }, { key: "area", label: "Área" }, { key: "retention", label: "Conservación" }, { key: "status", label: "Estado", type: "select", options: ["Vigente", "Obsoleto"] },
  ]},
  reagents: { title: "Reactivos", eyebrow: "CALIDAD", description: "Trazabilidad de kits, lotes, aperturas y vencimientos.", singular: "reactivo", columns: ["name", "brand", "lot", "openedAt", "expiresAt", "stock"], fields: [
    { key: "name", label: "Reactivo / kit", required: true }, { key: "brand", label: "Marca" }, { key: "lot", label: "Lote", required: true }, { key: "openedAt", label: "Apertura", type: "date" },
    { key: "expiresAt", label: "Vencimiento", type: "date", required: true }, { key: "stock", label: "Stock", type: "number" }, { key: "storage", label: "Conservación" },
  ]},
  equipment: { title: "Equipamiento", eyebrow: "CALIDAD", description: "Inventario, calibraciones y mantenimiento preventivo.", singular: "equipo", columns: ["code", "name", "location", "nextCalibration", "status"], fields: [
    { key: "code", label: "Código interno", required: true }, { key: "name", label: "Equipo", required: true }, { key: "brandModel", label: "Marca / modelo" }, { key: "serial", label: "Serie" },
    { key: "location", label: "Ubicación" }, { key: "nextCalibration", label: "Próxima calibración", type: "date" }, { key: "status", label: "Estado", type: "select", options: ["Operativo", "En mantenimiento", "Fuera de servicio"] },
  ]},
  audits: { title: "Auditorías", eyebrow: "CALIDAD", description: "Planificación y seguimiento de auditorías internas y externas.", singular: "auditoría", columns: ["date", "type", "auditor", "scope", "status"], fields: [
    { key: "date", label: "Fecha", type: "date", required: true }, { key: "type", label: "Tipo", type: "select", options: ["Interna", "Externa"] }, { key: "auditor", label: "Auditor" },
    { key: "scope", label: "Alcance", required: true }, { key: "status", label: "Estado", type: "select", options: ["Programada", "En curso", "Cerrada"] }, { key: "findings", label: "Hallazgos", type: "textarea" },
  ]},
  nonconformities: { title: "No conformidades", eyebrow: "CALIDAD", description: "Desvíos, análisis de causa, acciones y cierre.", singular: "no conformidad", columns: ["date", "code", "description", "responsible", "dueDate", "status"], fields: [
    { key: "date", label: "Fecha", type: "date", required: true }, { key: "code", label: "Código" }, { key: "description", label: "Descripción", type: "textarea", required: true },
    { key: "cause", label: "Causa raíz", type: "textarea" }, { key: "action", label: "Acción correctiva", type: "textarea" }, { key: "responsible", label: "Responsable" },
    { key: "dueDate", label: "Fecha objetivo", type: "date" }, { key: "status", label: "Estado", type: "select", options: ["Abierta", "En seguimiento", "Cerrada"] },
  ]},
};

const LABELS: Record<string, string> = { protocol: "Protocolo", date: "Fecha", client: "Cliente / productor", veterinarian: "Veterinario", sampleType: "Muestra", quantity: "Cantidad", status: "Estado", name: "Nombre", cuit: "CUIT", renspa: "RENSPA", phone: "Teléfono", email: "Email", code: "Código", technique: "Técnica", species: "Especie", price: "Precio", validFrom: "Vigencia", version: "Versión", responsible: "Responsable", reviewDate: "Revisión", area: "Área", retention: "Conservación", brand: "Marca", lot: "Lote", openedAt: "Apertura", expiresAt: "Vencimiento", stock: "Stock", location: "Ubicación", nextCalibration: "Calibración", type: "Tipo", auditor: "Auditor", scope: "Alcance", description: "Descripción", dueDate: "Fecha objetivo" };
const today = () => new Date().toISOString().slice(0, 10);
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export default function LaboratoryManagementPanel({ uid, section }: { uid: string; section: LaboratoryManagementSection }) {
  const module = section in DEFINITIONS ? section as LaboratoryModule : null;
  const [items, setItems] = useState<LaboratoryManagementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LaboratoryManagementRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { if (!module) return; setLoading(true); loadLaboratoryModule(uid, module).then(setItems).finally(() => setLoading(false)); }, [uid, module]);

  if (section === "dashboard") return <LaboratoryDashboard uid={uid} />;
  if (section === "quality") return <QualityDashboard uid={uid} />;
  if (section === "history") return <LaboratoryHistory uid={uid} />;
  if (!module) return null;
  const definition = DEFINITIONS[module];
  const visible = items.filter((item) => Object.values(item).some((value) => String(value).toLowerCase().includes(search.toLowerCase())));
  const openForm = (item?: LaboratoryManagementRecord) => { setEditing(item || null); setFormOpen(true); setMessage(""); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries()); const now = new Date().toISOString();
    const record = { ...(editing || {}), ...values, id: editing?.id || id(), createdAt: editing?.createdAt || now, updatedAt: now } as LaboratoryManagementRecord;
    if (module === "samples" && !record.protocol) record.protocol = `LAB-${new Date().getFullYear()}-${String(items.length + 1).padStart(5, "0")}`;
    if (module === "samples") record.status = record.condition === "Rechazada" ? "Rechazada" : "Recibida";
    await saveLaboratoryRecord(uid, module!, record); setItems((current) => [record, ...current.filter((item) => item.id !== record.id)]); setFormOpen(false); setMessage(`${definition.singular} guardado correctamente.`);
  }
  async function remove(item: LaboratoryManagementRecord) { await deleteLaboratoryRecord(uid, module!, item.id); setItems((current) => current.filter((row) => row.id !== item.id)); }
  return <><header className="topbar module-topbar laboratory-management-header"><div><span className="eyebrow">{definition.eyebrow}</span><h1>{definition.title}</h1><p>{definition.description}</p></div><button className="primary" onClick={() => openForm()}>＋ Nuevo {definition.singular}</button></header>
    {message && <div className="laboratory-message success">{message}<button onClick={() => setMessage("")}>×</button></div>}
    <section className="panel lab-management-list"><div className="lab-management-toolbar"><div><h2>{items.length} {items.length === 1 ? definition.singular : `${definition.singular}s`}</h2><p>La información queda guardada en la cuenta del laboratorio.</p></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en el listado…" /></div>
      <div className="lab-management-table"><div className="lab-management-row head">{definition.columns.map((column) => <span key={column}>{LABELS[column] || column}</span>)}<span>Acciones</span></div>{loading ? <div className="laboratory-empty-filter">Cargando…</div> : visible.map((item) => <article className="lab-management-row" key={item.id}>{definition.columns.map((column) => <span key={column}>{String(item[column] || "—")}</span>)}<span className="lab-row-actions"><button onClick={() => openForm(item)}>Editar</button><button className="danger" onClick={() => remove(item)}>Eliminar</button></span></article>)}{!loading && !visible.length && <div className="laboratory-empty-filter">Todavía no hay información cargada.</div>}</div>
    </section>{formOpen && <div className="modal-backdrop"><form className="modal-card laboratory-record-modal" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">{editing ? "EDITAR" : "NUEVO"}</span><h2>{definition.singular}</h2></div><button type="button" onClick={() => setFormOpen(false)}>×</button></div><div className="laboratory-record-grid">{definition.fields.map((field) => <label key={field.key} className={field.type === "textarea" ? "wide" : ""}>{field.label}{field.type === "select" ? <select name={field.key} defaultValue={String(editing?.[field.key] || field.options?.[0] || "")} required={field.required}>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : field.type === "textarea" ? <textarea name={field.key} defaultValue={String(editing?.[field.key] || "")} required={field.required} /> : <input name={field.key} type={field.type || "text"} defaultValue={String(editing?.[field.key] || (field.type === "date" && field.key === "date" ? today() : ""))} required={field.required} />}</label>)}</div><footer><button type="button" onClick={() => setFormOpen(false)}>Cancelar</button><button className="primary">Guardar</button></footer></form></div>}</>;
}

function LaboratoryDashboard({ uid }: { uid: string }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => { Promise.all((["samples", "clients", "prices", "reagents", "equipment", "nonconformities"] as LaboratoryModule[]).map(async (module) => [module, (await loadLaboratoryModule(uid, module)).length] as const)).then((rows) => setCounts(Object.fromEntries(rows))); }, [uid]);
  return <><header className="topbar module-topbar laboratory-management-header"><div><span className="eyebrow">LABORATORIO</span><h1>Panel general</h1><p>Actividad operativa, trazabilidad y calidad en un solo lugar.</p></div></header><div className="lab-dashboard-grid">{[["Muestras ingresadas", counts.samples], ["Clientes / productores", counts.clients], ["Análisis con precio", counts.prices], ["Reactivos controlados", counts.reagents]].map(([label, value]) => <article className="panel" key={String(label)}><span>{label}</span><strong>{value ?? "…"}</strong><small>registros actuales</small></article>)}</div><section className="panel lab-dashboard-welcome"><span className="eyebrow">CENTRO DE OPERACIONES</span><h2>Todo el laboratorio, ordenado</h2><p>Comenzá por ingresar una muestra. Los módulos de calidad permiten construir de forma gradual el sistema documental, la trazabilidad de reactivos y el seguimiento de equipos.</p><div><b>{counts.nonconformities || 0}</b><span>no conformidades registradas</span><b>{counts.equipment || 0}</b><span>equipos inventariados</span></div></section></>;
}

function QualityDashboard({ uid }: { uid: string }) {
  const modules: LaboratoryModule[] = ["qualityManual", "procedures", "records", "reagents", "equipment", "audits", "nonconformities"];
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => { Promise.all(modules.map(async (module) => [module, (await loadLaboratoryModule(uid, module)).length] as const)).then((rows) => setCounts(Object.fromEntries(rows))); }, [uid]);
  return <><header className="topbar module-topbar"><div><span className="eyebrow">SISTEMA DE CALIDAD</span><h1>Dashboard de calidad</h1><p>Estado documental, recursos, auditorías y acciones correctivas.</p></div></header><div className="lab-quality-grid">{modules.map((module) => <article className="panel" key={module}><span>{DEFINITIONS[module].title}</span><strong>{counts[module] ?? "…"}</strong><small>registros controlados</small></article>)}</div></>;
}

function LaboratoryHistory({ uid }: { uid: string }) {
  const [events, setEvents] = useState<Array<{ module: string; item: LaboratoryManagementRecord }>>([]);
  useEffect(() => { const modules = Object.keys(DEFINITIONS) as LaboratoryModule[]; Promise.all(modules.map(async (module) => (await loadLaboratoryModule(uid, module)).map((item) => ({ module, item })))).then((all) => setEvents(all.flat().sort((a, b) => String(b.item.updatedAt).localeCompare(String(a.item.updatedAt))).slice(0, 100))); }, [uid]);
  return <><header className="topbar module-topbar"><div><span className="eyebrow">TRAZABILIDAD</span><h1>Historial de cambios</h1><p>Últimas altas y modificaciones realizadas en la gestión del laboratorio.</p></div></header><section className="panel lab-history-list">{events.map(({ module, item }) => <article key={`${module}-${item.id}`}><time>{new Date(String(item.updatedAt)).toLocaleString("es-AR")}</time><b>{DEFINITIONS[module as LaboratoryModule].title}</b><span>{String(item.name || item.protocol || item.code || item.description || "Registro actualizado")}</span></article>)}{!events.length && <div className="laboratory-empty-filter">Todavía no hay actividad registrada.</div>}</section></>;
}
