"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as XLSX from "xlsx";
import {
  deleteLaboratoryRecord,
  LaboratoryManagementRecord,
  LaboratoryModule,
  loadLaboratoryModule,
  saveLaboratoryRecord,
  saveLaboratoryRecords,
} from "../lib/laboratory-management-data";
import { loadLaboratoryData } from "../lib/laboratory-data";

export type LaboratoryManagementSection =
  | LaboratoryModule
  | "dashboard"
  | "protocols"
  | "veterinarians"
  | "profile"
  | "quality"
  | "history";
type Field = {
  key: string;
  label: string;
  type?: "date" | "number" | "select" | "textarea";
  options?: string[];
  required?: boolean;
};
type Definition = {
  title: string;
  eyebrow: string;
  description: string;
  singular: string;
  fields: Field[];
  columns: string[];
};

const DEFINITIONS: Partial<Record<LaboratoryModule, Definition>> = {
  samples: {
    title: "Ingreso de muestras",
    eyebrow: "OPERACIÓN",
    description:
      "Registrá la recepción y generá el número interno del protocolo.",
    singular: "ingreso",
    columns: [
      "protocol",
      "date",
      "client",
      "veterinarian",
      "sampleType",
      "quantity",
      "status",
    ],
    fields: [
      { key: "date", label: "Fecha de ingreso", type: "date", required: true },
      { key: "client", label: "Cliente / productor", required: true },
      { key: "renspa", label: "RENSPA" },
      { key: "veterinarian", label: "Veterinario", required: true },
      { key: "sampleType", label: "Tipo de muestra", required: true },
      { key: "analysis", label: "Análisis solicitado", required: true },
      { key: "quantity", label: "Cantidad", type: "number", required: true },
      {
        key: "condition",
        label: "Condición de recepción",
        type: "select",
        options: ["Aceptada", "Aceptada con observaciones", "Rechazada"],
      },
      { key: "observations", label: "Observaciones", type: "textarea" },
    ],
  },
  veterinarians: {
    title: "Veterinarios",
    eyebrow: "GESTIÓN",
    description:
      "Padrón único de profesionales, sin nombres repetidos ni variantes.",
    singular: "veterinario",
    columns: ["name", "cuit", "phone", "email", "locality"],
    fields: [
      { key: "name", label: "Nombre y apellido", required: true },
      { key: "cuit", label: "CUIT" },
      { key: "phone", label: "Teléfono / WhatsApp" },
      { key: "email", label: "Correo electrónico" },
      { key: "locality", label: "Localidad" },
    ],
  },
  clients: {
    title: "Clientes / Productores",
    eyebrow: "GESTIÓN",
    description: "Padrón de productores y clientes del laboratorio.",
    singular: "cliente",
    columns: ["name", "cuit", "renspa", "establishment", "locality"],
    fields: [
      { key: "name", label: "Razón social / nombre", required: true },
      { key: "cuit", label: "CUIT", required: true },
      { key: "renspa", label: "RENSPA" },
      { key: "establishment", label: "Establecimiento" },
      { key: "phone", label: "Teléfono / WhatsApp" },
      { key: "email", label: "Correo electrónico" },
      { key: "locality", label: "Localidad" },
    ],
  },
  prices: {
    title: "Lista de precios",
    eyebrow: "GESTIÓN",
    description:
      "Análisis individuales y combinaciones creadas únicamente desde el catálogo maestro.",
    singular: "análisis",
    columns: ["code", "name", "kind", "category", "components", "price"],
    fields: [
      {
        key: "kind",
        label: "Tipo",
        type: "select",
        options: ["Análisis individual", "Combinación"],
        required: true,
      },
      { key: "code", label: "Código" },
      { key: "name", label: "Nombre estandarizado", required: true },
      { key: "category", label: "Categoría" },
      { key: "technique", label: "Técnica" },
      { key: "species", label: "Especie" },
      { key: "components", label: "Análisis incluidos" },
      { key: "price", label: "Precio", type: "number" },
      { key: "validFrom", label: "Vigente desde", type: "date" },
      {
        key: "status",
        label: "Estado",
        type: "select",
        options: ["Activo", "En revisión", "Inactivo"],
      },
    ],
  },
  qualityManual: {
    title: "Manual de calidad",
    eyebrow: "CALIDAD",
    description:
      "Controlá capítulos, versiones, responsables y vigencia del manual.",
    singular: "capítulo",
    columns: ["code", "name", "version", "responsible", "status"],
    fields: [
      { key: "code", label: "Código", required: true },
      { key: "name", label: "Capítulo / documento", required: true },
      { key: "version", label: "Versión" },
      { key: "responsible", label: "Responsable" },
      {
        key: "status",
        label: "Estado",
        type: "select",
        options: ["Borrador", "Vigente", "Obsoleto"],
      },
      { key: "content", label: "Contenido / alcance", type: "textarea" },
      { key: "notes", label: "Observaciones y cambios", type: "textarea" },
    ],
  },
  procedures: {
    title: "Procedimientos POE",
    eyebrow: "CALIDAD",
    description:
      "Procedimientos operativos estandarizados con revisión controlada.",
    singular: "procedimiento",
    columns: ["code", "name", "version", "reviewDate", "status"],
    fields: [
      { key: "code", label: "Código POE", required: true },
      { key: "name", label: "Procedimiento", required: true },
      { key: "version", label: "Versión" },
      { key: "reviewDate", label: "Próxima revisión", type: "date" },
      {
        key: "status",
        label: "Estado",
        type: "select",
        options: ["Borrador", "Vigente", "En revisión", "Obsoleto"],
      },
      { key: "description", label: "Descripción", type: "textarea" },
      { key: "sourceSheet", label: "Hoja de origen" },
    ],
  },
  records: {
    title: "Registros",
    eyebrow: "CALIDAD",
    description: "Índice maestro de formularios y registros de calidad.",
    singular: "registro",
    columns: ["code", "name", "area", "retention", "status"],
    fields: [
      { key: "code", label: "Código", required: true },
      { key: "name", label: "Registro", required: true },
      { key: "area", label: "Área" },
      { key: "retention", label: "Conservación" },
      {
        key: "status",
        label: "Estado",
        type: "select",
        options: ["Vigente", "Obsoleto"],
      },
    ],
  },
  reagents: {
    title: "Reactivos",
    eyebrow: "CALIDAD",
    description: "Trazabilidad de kits, lotes, aperturas y vencimientos.",
    singular: "reactivo",
    columns: ["name", "brand", "lot", "openedAt", "expiresAt", "stock"],
    fields: [
      { key: "name", label: "Reactivo / kit", required: true },
      { key: "brand", label: "Marca" },
      { key: "lot", label: "Lote", required: true },
      { key: "openedAt", label: "Apertura", type: "date" },
      { key: "expiresAt", label: "Vencimiento", type: "date", required: true },
      { key: "stock", label: "Stock", type: "number" },
      { key: "storage", label: "Conservación" },
    ],
  },
  equipment: {
    title: "Equipamiento",
    eyebrow: "CALIDAD",
    description: "Inventario, calibraciones y mantenimiento preventivo.",
    singular: "equipo",
    columns: ["code", "name", "location", "nextCalibration", "status"],
    fields: [
      { key: "code", label: "Código interno", required: true },
      { key: "name", label: "Equipo", required: true },
      { key: "brandModel", label: "Marca / modelo" },
      { key: "serial", label: "Serie" },
      { key: "location", label: "Ubicación" },
      { key: "nextCalibration", label: "Próxima calibración", type: "date" },
      {
        key: "status",
        label: "Estado",
        type: "select",
        options: ["Operativo", "En mantenimiento", "Fuera de servicio"],
      },
    ],
  },
  audits: {
    title: "Auditorías",
    eyebrow: "CALIDAD",
    description:
      "Planificación y seguimiento de auditorías internas y externas.",
    singular: "auditoría",
    columns: ["date", "type", "auditor", "scope", "status"],
    fields: [
      { key: "date", label: "Fecha", type: "date", required: true },
      {
        key: "type",
        label: "Tipo",
        type: "select",
        options: ["Interna", "Externa"],
      },
      { key: "auditor", label: "Auditor" },
      { key: "scope", label: "Alcance", required: true },
      {
        key: "status",
        label: "Estado",
        type: "select",
        options: ["Programada", "En curso", "Cerrada"],
      },
      { key: "findings", label: "Hallazgos", type: "textarea" },
    ],
  },
  nonconformities: {
    title: "No conformidades",
    eyebrow: "CALIDAD",
    description: "Desvíos, análisis de causa, acciones y cierre.",
    singular: "no conformidad",
    columns: [
      "date",
      "code",
      "description",
      "responsible",
      "dueDate",
      "status",
    ],
    fields: [
      { key: "date", label: "Fecha", type: "date", required: true },
      { key: "code", label: "Código" },
      {
        key: "description",
        label: "Descripción",
        type: "textarea",
        required: true,
      },
      { key: "cause", label: "Causa raíz", type: "textarea" },
      { key: "action", label: "Acción correctiva", type: "textarea" },
      { key: "responsible", label: "Responsable" },
      { key: "dueDate", label: "Fecha objetivo", type: "date" },
      {
        key: "status",
        label: "Estado",
        type: "select",
        options: ["Abierta", "En seguimiento", "Cerrada"],
      },
    ],
  },
};

const LABELS: Record<string, string> = {
  locality: "Localidad",
  establishment: "Establecimiento",
  protocol: "Protocolo",
  date: "Fecha",
  client: "Cliente / productor",
  veterinarian: "Veterinario",
  sampleType: "Muestra",
  quantity: "Cantidad",
  status: "Estado",
  name: "Nombre",
  cuit: "CUIT",
  registration: "Matrícula",
  renspa: "RENSPA",
  phone: "Teléfono",
  email: "Email",
  code: "Código",
  kind: "Tipo",
  category: "Categoría",
  components: "Componentes",
  technique: "Técnica",
  species: "Especie",
  price: "Precio",
  validFrom: "Vigencia",
  version: "Versión",
  responsible: "Responsable",
  reviewDate: "Revisión",
  area: "Área",
  retention: "Conservación",
  brand: "Marca",
  lot: "Lote",
  openedAt: "Apertura",
  expiresAt: "Vencimiento",
  stock: "Stock",
  location: "Ubicación",
  nextCalibration: "Calibración",
  type: "Tipo",
  auditor: "Auditor",
  scope: "Alcance",
  description: "Descripción",
  dueDate: "Fecha objetivo",
};
const today = () => new Date().toISOString().slice(0, 10);
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export default function LaboratoryManagementPanel({
  uid,
  section,
}: {
  uid: string;
  section: LaboratoryManagementSection;
}) {
  const module = section in DEFINITIONS ? (section as LaboratoryModule) : null;
  const [items, setItems] = useState<LaboratoryManagementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LaboratoryManagementRecord | null>(
    null,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [priceKind, setPriceKind] = useState("Análisis individual");
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const importRef = useRef<HTMLInputElement>(null);
  const [sampleCatalogs, setSampleCatalogs] = useState<{
    clients: LaboratoryManagementRecord[];
    veterinarians: LaboratoryManagementRecord[];
    prices: LaboratoryManagementRecord[];
  }>({ clients: [], veterinarians: [], prices: [] });
  useEffect(() => {
    if (!module) return;
    setLoading(true);
    loadLaboratoryModule(uid, module)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [uid, module]);
  useEffect(() => {
    if (module !== "samples") return;
    Promise.all([
      loadLaboratoryModule(uid, "clients"),
      loadLaboratoryModule(uid, "veterinarians"),
      loadLaboratoryModule(uid, "prices"),
    ]).then(([clients, veterinarians, prices]) =>
      setSampleCatalogs({ clients, veterinarians, prices }),
    );
  }, [uid, module]);

  if (section === "dashboard") return <LaboratoryDashboard uid={uid} />;
  if (section === "quality") return <QualityDashboard uid={uid} />;
  if (section === "history") return <LaboratoryHistory uid={uid} />;
  if (!module) return null;
  const definition = DEFINITIONS[module]!;
  const filtered = items.filter((item) =>
    Object.values(item).some((value) =>
      String(value).toLowerCase().includes(search.toLowerCase()),
    ),
  );
  const visible = filtered.slice(0, 200);
  const openForm = (item?: LaboratoryManagementRecord) => {
    setEditing(item || null);
    setPriceKind(String(item?.kind || "Análisis individual"));
    setSelectedComponents(
      String(item?.components || "")
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    setFormOpen(true);
    setMessage("");
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const now = new Date().toISOString();
    if (
      module === "prices" &&
      priceKind === "Combinación" &&
      selectedComponents.length < 2
    ) {
      setMessage(
        "Elegí al menos dos análisis individuales para crear una combinación.",
      );
      return;
    }
    const record = {
      ...(editing || {}),
      ...values,
      ...(module === "prices"
        ? {
            kind: priceKind,
            components:
              priceKind === "Combinación" ? selectedComponents.join(" | ") : "",
          }
        : {}),
      id: editing?.id || id(),
      createdAt: editing?.createdAt || now,
      updatedAt: now,
    } as LaboratoryManagementRecord;
    if (module === "samples" && !record.protocol)
      record.protocol = `LAB-${new Date().getFullYear()}-${String(items.length + 1).padStart(5, "0")}`;
    if (module === "samples")
      record.status =
        record.condition === "Rechazada" ? "Rechazada" : "Recibida";
    await saveLaboratoryRecord(uid, module!, record);
    setItems((current) => [
      record,
      ...current.filter((item) => item.id !== record.id),
    ]);
    setFormOpen(false);
    setMessage(`${definition.singular} guardado correctamente.`);
  }
  async function remove(item: LaboratoryManagementRecord) {
    await deleteLaboratoryRecord(uid, module!, item.id);
    setItems((current) => current.filter((row) => row.id !== item.id));
  }
  async function importExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !module || !["clients", "veterinarians"].includes(module))
      return;
    setImporting(true);
    setMessage("");
    try {
      const data = await file.arrayBuffer(),
        book = XLSX.read(data),
        rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          book.Sheets[book.SheetNames[0]],
          { defval: "" },
        );
      const stamp = new Date().toISOString();
      const get = (row: Record<string, unknown>, ...keys: string[]) => {
        const found = Object.keys(row).find((k) =>
          keys.includes(
            k
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase(),
          ),
        );
        return found ? String(row[found]).trim() : "";
      };
      const normalized = rows
        .map(
          (row, index) =>
            ({
              id: `excel-${Date.now()}-${index}`,
              name: get(row, "nombre y apellido", "nombre"),
              cuit: get(row, "cuit"),
              renspa: get(row, "renspa"),
              establishment: get(row, "establecimiento"),
              email: get(row, "mail", "email"),
              phone: get(row, "telefono"),
              locality: get(row, "localidad"),
              createdAt: stamp,
              updatedAt: stamp,
            }) as LaboratoryManagementRecord,
        )
        .filter((row) => row.name);
      await saveLaboratoryRecords(uid, module, normalized);
      setItems(await loadLaboratoryModule(uid, module));
      setMessage(`${normalized.length} registros importados desde Excel.`);
    } catch {
      setMessage("No pudimos leer el archivo. Usá la plantilla de LabOVet.");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  }
  const canImport = ["clients", "veterinarians"].includes(module);
  const canLoadQualityStructure = ["qualityManual", "procedures"].includes(module);
  async function loadQualityStructure() {
    if (!module || !canLoadQualityStructure) return;
    setImporting(true);
    setMessage("");
    try {
      const file = module === "qualityManual"
        ? "/imports/laboratory-quality-manual.json"
        : "/imports/laboratory-procedures.json";
      const source = await fetch(file).then((response) => response.json()) as LaboratoryManagementRecord[];
      await saveLaboratoryRecords(uid, module, source);
      setItems(source);
      setMessage(`${source.length} registros de la estructura real quedaron cargados.`);
    } catch {
      setMessage("No pudimos cargar la estructura inicial. Intentá nuevamente.");
    } finally { setImporting(false); }
  }
  const sampleOptions = (field: Field) =>
    field.key === "client"
      ? sampleCatalogs.clients.map((item) => String(item.name))
      : field.key === "veterinarian"
        ? sampleCatalogs.veterinarians.map((item) => String(item.name))
        : [];
  return (
    <>
      <header className="topbar module-topbar laboratory-management-header">
        <div>
          <span className="eyebrow">{definition.eyebrow}</span>
          <h1>{definition.title}</h1>
          <p>{definition.description}</p>
        </div>
        <div className="lab-header-actions">
          {canLoadQualityStructure && (
            <button onClick={loadQualityStructure} disabled={importing}>
              {importing ? "Cargando…" : items.length ? "Restablecer estructura real" : "Cargar estructura real"}
            </button>
          )}
          {canImport && (
            <>
              <a
                className="button"
                href={
                  module === "clients"
                    ? "/templates/Plantilla-productores-LabOVet.xlsx"
                    : "/templates/Plantilla-veterinarios-LabOVet.xlsx"
                }
                download
              >
                ⇩ Descargar plantilla
              </a>
              <button
                onClick={() => importRef.current?.click()}
                disabled={importing}
              >
                {importing ? "Importando…" : "↑ Importar Excel"}
              </button>
              <input
                ref={importRef}
                hidden
                type="file"
                accept=".xlsx,.xls"
                onChange={importExcel}
              />
            </>
          )}
          <button className="primary" onClick={() => openForm()}>
            ＋ Nuevo {definition.singular}
          </button>
        </div>
      </header>
      {message && (
        <div className="laboratory-message success">
          {message}
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}
      <section className="panel lab-management-list">
        <div className="lab-management-toolbar">
          <div>
            <h2>
              {items.length}{" "}
              {items.length === 1
                ? definition.singular
                : `${definition.singular}s`}
            </h2>
            <p>La información queda guardada en la cuenta del laboratorio.</p>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar en el listado…"
          />
        </div>
        <div className="lab-management-table">
          <div className="lab-management-row head">
            {definition.columns.map((column) => (
              <span key={column}>{LABELS[column] || column}</span>
            ))}
            <span>Acciones</span>
          </div>
          {loading ? (
            <div className="laboratory-empty-filter">Cargando…</div>
          ) : (
            visible.map((item) => (
              <article className="lab-management-row" key={item.id}>
                {definition.columns.map((column) => (
                  <span key={column}>
                    {column === "price"
                      ? item[column]
                        ? `$ ${Number(item[column]).toLocaleString("es-AR")}`
                        : "Precio pendiente"
                      : String(item[column] || "—")}
                  </span>
                ))}
                <span className="lab-row-actions">
                  <button onClick={() => openForm(item)}>Editar</button>
                  <button className="danger" onClick={() => remove(item)}>
                    Eliminar
                  </button>
                </span>
              </article>
            ))
          )}
          {!loading && !visible.length && (
            <div className="laboratory-empty-filter">
              Todavía no hay información cargada.
            </div>
          )}
          {filtered.length > visible.length && (
            <div className="laboratory-empty-filter">
              Mostrando los primeros {visible.length} de {filtered.length}. Usá
              el buscador para encontrar el registro exacto.
            </div>
          )}
        </div>
      </section>
      {formOpen && (
        <div className="modal-backdrop">
          <form
            className="modal-card laboratory-record-modal"
            onSubmit={submit}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{editing ? "EDITAR" : "NUEVO"}</span>
                <h2>{definition.singular}</h2>
              </div>
              <button type="button" onClick={() => setFormOpen(false)}>
                ×
              </button>
            </div>
            <div className="laboratory-record-grid">
              {definition.fields.map((field) =>
                field.key === "kind" ? (
                  <label key={field.key}>
                    {field.label}
                    <select
                      name={field.key}
                      value={priceKind}
                      onChange={(event) => {
                        setPriceKind(event.target.value);
                        if (event.target.value !== "Combinación")
                          setSelectedComponents([]);
                      }}
                    >
                      {field.options?.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                ) : field.key === "components" ? (
                  priceKind === "Combinación" && (
                    <fieldset
                      className="price-component-picker"
                      key={field.key}
                    >
                      <legend>Análisis individuales incluidos</legend>
                      <p>
                        La combinación conserva su precio propio, incluso si
                        tiene descuento.
                      </p>
                      <div>
                        {items
                          .filter(
                            (item) =>
                              item.kind !== "Combinación" &&
                              item.id !== editing?.id,
                          )
                          .map((item) => {
                            const name = String(item.name);
                            return (
                              <label key={item.id}>
                                <input
                                  type="checkbox"
                                  checked={selectedComponents.includes(name)}
                                  onChange={() =>
                                    setSelectedComponents((current) =>
                                      current.includes(name)
                                        ? current.filter(
                                            (value) => value !== name,
                                          )
                                        : [...current, name],
                                    )
                                  }
                                />
                                {name}
                              </label>
                            );
                          })}
                      </div>
                    </fieldset>
                  )
                ) : module === "samples" && field.key === "analysis" ? (
                  <label key={field.key}>
                    {field.label}
                    <select
                      name={field.key}
                      defaultValue={String(editing?.[field.key] || "")}
                      required
                    >
                      <option value="">Elegir…</option>
                      {sampleCatalogs.prices
                        .filter((item) => item.status === "Activo")
                        .map((item) => (
                          <option key={item.id} value={String(item.name)}>
                            {String(item.name)} ·{" "}
                            {item.price
                              ? `$ ${Number(item.price).toLocaleString("es-AR")}`
                              : "precio pendiente"}
                          </option>
                        ))}
                    </select>
                    <small>
                      {sampleCatalogs.prices.filter(
                        (item) => item.status === "Activo",
                      ).length
                        ? `${sampleCatalogs.prices.filter((item) => item.status === "Activo").length} opciones activas`
                        : "Primero importá y activá la lista de precios"}
                    </small>
                  </label>
                ) : module === "samples" &&
                  ["client", "veterinarian"].includes(field.key) ? (
                  <label key={field.key}>
                    {field.label}
                    <select
                      name={field.key}
                      defaultValue={String(editing?.[field.key] || "")}
                      required={field.required}
                    >
                      <option value="">Elegir…</option>
                      {sampleOptions(field).map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                    <small>
                      {sampleOptions(field).length
                        ? `${sampleOptions(field).length} opciones del catálogo`
                        : "Primero cargá este catálogo en Gestión"}
                    </small>
                  </label>
                ) : (
                  <label
                    key={field.key}
                    className={field.type === "textarea" ? "wide" : ""}
                  >
                    {field.label}
                    {field.type === "select" ? (
                      <select
                        name={field.key}
                        defaultValue={String(
                          editing?.[field.key] || field.options?.[0] || "",
                        )}
                        required={field.required}
                      >
                        {field.options?.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        name={field.key}
                        defaultValue={String(editing?.[field.key] || "")}
                        required={field.required}
                      />
                    ) : (
                      <input
                        name={field.key}
                        type={field.type || "text"}
                        defaultValue={String(
                          editing?.[field.key] ||
                            (field.type === "date" && field.key === "date"
                              ? today()
                              : ""),
                        )}
                        required={field.required}
                      />
                    )}
                  </label>
                ),
              )}
            </div>
            <footer>
              <button type="button" onClick={() => setFormOpen(false)}>
                Cancelar
              </button>
              <button className="primary">Guardar</button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}

function LaboratoryDashboard({ uid }: { uid: string }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    Promise.all(
      (
        [
          "samples",
          "clients",
          "prices",
          "reagents",
          "equipment",
          "nonconformities",
        ] as LaboratoryModule[]
      ).map(
        async (module) =>
          [module, (await loadLaboratoryModule(uid, module)).length] as const,
      ),
    ).then((rows) => setCounts(Object.fromEntries(rows)));
  }, [uid]);
  return (
    <>
      <header className="topbar module-topbar laboratory-management-header">
        <div>
          <span className="eyebrow">LABORATORIO</span>
          <h1>Panel general</h1>
          <p>Actividad operativa, trazabilidad y calidad en un solo lugar.</p>
        </div>
      </header>
      <div className="lab-dashboard-grid">
        {[
          ["Muestras ingresadas", counts.samples],
          ["Clientes / productores", counts.clients],
          ["Análisis con precio", counts.prices],
          ["Reactivos controlados", counts.reagents],
        ].map(([label, value]) => (
          <article className="panel" key={String(label)}>
            <span>{label}</span>
            <strong>{value ?? "…"}</strong>
            <small>registros actuales</small>
          </article>
        ))}
      </div>
      <section className="panel lab-dashboard-welcome">
        <span className="eyebrow">CENTRO DE OPERACIONES</span>
        <h2>Todo el laboratorio, ordenado</h2>
        <p>
          Comenzá por ingresar una muestra. Los módulos de calidad permiten
          construir de forma gradual el sistema documental, la trazabilidad de
          reactivos y el seguimiento de equipos.
        </p>
        <div>
          <b>{counts.nonconformities || 0}</b>
          <span>no conformidades registradas</span>
          <b>{counts.equipment || 0}</b>
          <span>equipos inventariados</span>
        </div>
      </section>
    </>
  );
}

function QualityDashboard({ uid }: { uid: string }) {
  const modules: LaboratoryModule[] = [
    "qualityManual",
    "procedures",
    "records",
    "reagents",
    "equipment",
    "audits",
    "nonconformities",
  ];
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    Promise.all(
      modules.map(
        async (module) =>
          [module, (await loadLaboratoryModule(uid, module)).length] as const,
      ),
    ).then((rows) => setCounts(Object.fromEntries(rows)));
  }, [uid]);
  return (
    <>
      <header className="topbar module-topbar">
        <div>
          <span className="eyebrow">SISTEMA DE CALIDAD</span>
          <h1>Dashboard de calidad</h1>
          <p>Estado documental, recursos, auditorías y acciones correctivas.</p>
        </div>
      </header>
      <div className="lab-quality-grid">
        {modules.map((module) => (
          <article className="panel" key={module}>
            <span>{DEFINITIONS[module]!.title}</span>
            <strong>{counts[module] ?? "…"}</strong>
            <small>registros controlados</small>
          </article>
        ))}
      </div>
    </>
  );
}

function LaboratoryHistory({ uid }: { uid: string }) {
  const [events, setEvents] = useState<
    Array<{ module: string; item: LaboratoryManagementRecord }>
  >([]);
  useEffect(() => {
    const modules = Object.keys(DEFINITIONS) as LaboratoryModule[];
    Promise.all(
      modules.map(async (module) =>
        (await loadLaboratoryModule(uid, module)).map((item) => ({
          module,
          item,
        })),
      ),
    ).then((all) =>
      setEvents(
        all
          .flat()
          .sort((a, b) =>
            String(b.item.updatedAt).localeCompare(String(a.item.updatedAt)),
          )
          .slice(0, 100),
      ),
    );
  }, [uid]);
  return (
    <>
      <header className="topbar module-topbar">
        <div>
          <span className="eyebrow">TRAZABILIDAD</span>
          <h1>Historial de cambios</h1>
          <p>
            Últimas altas y modificaciones realizadas en la gestión del
            laboratorio.
          </p>
        </div>
      </header>
      <section className="panel lab-history-list">
        {events.map(({ module, item }) => (
          <article key={`${module}-${item.id}`}>
            <time>
              {new Date(String(item.updatedAt)).toLocaleString("es-AR")}
            </time>
            <b>{DEFINITIONS[module as LaboratoryModule]!.title}</b>
            <span>
              {String(
                item.name ||
                  item.protocol ||
                  item.code ||
                  item.description ||
                  "Registro actualizado",
              )}
            </span>
          </article>
        ))}
        {!events.length && (
          <div className="laboratory-empty-filter">
            Todavía no hay actividad registrada.
          </div>
        )}
      </section>
    </>
  );
}
