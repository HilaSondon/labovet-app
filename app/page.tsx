"use client";

import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as XLSX from "xlsx";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore/lite";
import { auth, db } from "../lib/firebase";
import {
  resolveUserAccess,
  UserAccess,
} from "../lib/access-control";
import AdminUsersPanel from "../components/AdminUsersPanel";
import AdminSigatmCatalog from "../components/AdminSigatmCatalog";
import {
  activeCodeMap,
  DEFAULT_SIGATM_CATALOG,
  normalizeSigatmCatalog,
  SigatmCatalog,
} from "../lib/sigatm-catalog";
import {
  deleteEstablishmentData,
  deleteProducerData,
  deleteStockItem,
  deletePatientData,
  loadVeterinaryData,
  savePatientData,
  savePatientEvent,
  saveProducerData,
  saveStockCategory,
  saveStockItem,
  saveWorkData,
  saveWorkMetadata,
} from "../lib/firestore-data";

type AnimalRow = {
  tube: string;
  animal: string;
  idType: string;
  identifier: string;
  category: string;
  age: string;
  vaccination: string;
  notes: string;
};
type ErrorMap = Record<string, string>;

const SPECIES = DEFAULT_SIGATM_CATALOG.species;
const ANIMALS = DEFAULT_SIGATM_CATALOG.animals;
const ID_TYPES = DEFAULT_SIGATM_CATALOG.idTypes;
const CATEGORIES = DEFAULT_SIGATM_CATALOG.categories;
const AGES = DEFAULT_SIGATM_CATALOG.ages;

const norm = (v: unknown) =>
  String(v ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
const findCode = (map: Record<string, number>, value: string) =>
  Object.entries(map).find(([key]) => norm(key) === norm(value))?.[1];

const displayDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.split("-").reverse().join("/")
    : value;
const dateToIso = (value: string) =>
  /^\d{2}\/\d{2}\/\d{4}$/.test(value)
    ? value.split("/").reverse().join("-")
    : value;
const localIsoDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const argentinaWhatsAppNumber = (value: string) => {
  let phone = value.replace(/\D/g, "").replace(/^0/, "");
  if (!phone.startsWith("54")) phone = `549${phone}`;
  else if (!phone.startsWith("549")) phone = `549${phone.slice(2)}`;
  return phone;
};
const reminderMessage = (patient: Patient, event: PatientEvent) =>
  `Hola ${patient.owner}, te recordamos que ${patient.name} requiere ${event.detail || event.type}.`;
const openReminderWhatsApp = (patient: Patient, event: PatientEvent) => {
  const phone = argentinaWhatsAppNumber(patient.phone);
  window.open(
    `https://wa.me/${phone}?text=${encodeURIComponent(reminderMessage(patient, event))}`,
    "_blank",
    "noopener,noreferrer",
  );
};
const isValidDate = (value: string, optional = true) => {
  if (!value) return optional;
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false;
  const [day, month, year] = value.split("/").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};
function DateField({
  name,
  value,
  onChange,
  onBlur,
  required = false,
}: {
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  required?: boolean;
}) {
  const initial = displayDate(value || "").split("/");
  const [parts, setParts] = useState({
    day: initial.length === 3 ? String(Number(initial[0])) : "",
    month: initial.length === 3 ? String(Number(initial[1])) : "",
    year: initial.length === 3 ? initial[2] : "",
  });
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"day" | "month" | "year">("day");
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const next = displayDate(value || "").split("/");
    setParts({
      day: next.length === 3 ? String(Number(next[0])) : "",
      month: next.length === 3 ? String(Number(next[1])) : "",
      year: next.length === 3 ? next[2] : "",
    });
  }, [value]);
  const months = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const years = Array.from(
    { length: new Date().getFullYear() + 10 - 1950 + 1 },
    (_, index) => String(new Date().getFullYear() + 10 - index),
  );
  const complete = Boolean(parts.day && parts.month && parts.year);
  const current = complete
    ? `${parts.day.padStart(2, "0")}/${parts.month.padStart(2, "0")}/${parts.year}`
    : "";
  const invalid = complete && !isValidDate(current, !required);
  function showPicker() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const below = rect.bottom + 386 <= window.innerHeight;
      setPosition({
        top: below ? rect.bottom + 6 : Math.max(12, rect.top - 386),
        left: Math.max(12, Math.min(rect.left, window.innerWidth - 330)),
      });
    }
    setStage("day");
    setOpen(true);
  }
  function chooseDay(day: string) {
    setParts((currentParts) => ({ ...currentParts, day }));
    setStage("month");
  }
  function chooseMonth(month: string) {
    setParts((currentParts) => ({ ...currentParts, month }));
    setStage("year");
  }
  function chooseYear(year: string) {
    const updated = { ...parts, year };
    const next = `${updated.day.padStart(2, "0")}/${updated.month.padStart(2, "0")}/${year}`;
    setParts(updated);
    onChange?.(next);
    if (isValidDate(next, !required)) {
      setOpen(false);
      onBlur?.();
    } else {
      setStage("day");
    }
  }
  function clear() {
    setParts({ day: "", month: "", year: "" });
    onChange?.("");
    onBlur?.();
  }
  return (
    <span className={`date-field ${invalid ? "date-invalid" : ""}`}>
      <span className="date-trigger-wrap">
        <button
          ref={triggerRef}
          type="button"
          className="date-trigger"
          onClick={showPicker}
          aria-expanded={open}
        >
          <span>{current || "Elegir fecha"}</span>
          <i>⌄</i>
        </button>
        {!required && complete && (
          <button
            type="button"
            className="date-clear"
            onClick={clear}
            title="Borrar fecha"
          >
            ×
          </button>
        )}
      </span>
      <input
        className="date-value-proxy"
        name={name}
        value={current}
        required={required}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
      />
      {open && (
        <>
          <button
            type="button"
            className="date-picker-dismiss"
            aria-label="Cerrar selector de fecha"
            onClick={() => setOpen(false)}
          />
          <div
            className="date-picker-popover"
            style={{ top: position.top, left: position.left }}
          >
            <div className="date-picker-head">
              <div>
                <small>
                  PASO {stage === "day" ? "1" : stage === "month" ? "2" : "3"}{" "}
                  DE 3
                </small>
                <b>
                  {stage === "day"
                    ? "Elegí el día"
                    : stage === "month"
                      ? "Elegí el mes"
                      : "Elegí el año"}
                </b>
              </div>
              {stage !== "day" && (
                <button
                  type="button"
                  onClick={() => setStage(stage === "year" ? "month" : "day")}
                >
                  ← Volver
                </button>
              )}
            </div>
            <div className="date-selection-summary">
              <span className={parts.day ? "chosen" : ""}>
                {parts.day || "Día"}
              </span>
              <i>/</i>
              <span className={parts.month ? "chosen" : ""}>
                {parts.month ? months[Number(parts.month) - 1] : "Mes"}
              </span>
              <i>/</i>
              <span className={parts.year ? "chosen" : ""}>
                {parts.year || "Año"}
              </span>
            </div>
            {stage === "day" && (
              <div className="date-option-grid days">
                {Array.from({ length: 31 }, (_, index) =>
                  String(index + 1),
                ).map((day) => (
                  <button
                    type="button"
                    key={day}
                    className={parts.day === day ? "selected" : ""}
                    onClick={() => chooseDay(day)}
                  >
                    {day}
                  </button>
                ))}
              </div>
            )}
            {stage === "month" && (
              <div className="date-option-grid months">
                {months.map((month, index) => (
                  <button
                    type="button"
                    key={month}
                    className={
                      parts.month === String(index + 1) ? "selected" : ""
                    }
                    onClick={() => chooseMonth(String(index + 1))}
                  >
                    {month}
                  </button>
                ))}
              </div>
            )}
            {stage === "year" && (
              <div className="date-option-grid years">
                {years.map((year) => (
                  <button
                    type="button"
                    key={year}
                    className={parts.year === year ? "selected" : ""}
                    onClick={() => chooseYear(year)}
                  >
                    {year}
                  </button>
                ))}
              </div>
            )}
            {invalid && (
              <p className="date-picker-error">
                Esa fecha no existe. Elegí otra combinación.
              </p>
            )}
          </div>
        </>
      )}
      {invalid && <small>Esa fecha no existe. Revisá día, mes y año.</small>}
    </span>
  );
}

function BulkColumnHeader({
  label,
  options,
  onApply,
}: {
  label: string;
  options: string[];
  onApply: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  return (
    <div className="bulk-column-head">
      <button type="button" onClick={() => setOpen((current) => !current)}>
        {label} <span>⌄</span>
      </button>
      {open && (
        <div className="bulk-column-menu">
          <b>Cambiar toda la columna</b>
          <p>La opción elegida se aplicará a todos los animales.</p>
          <select value={value} onChange={(event) => setValue(event.target.value)}>
            <option value="">Seleccionar…</option>
            {options.map((option) => <option key={option}>{option}</option>)}
          </select>
          <div><button type="button" onClick={() => setOpen(false)}>Cancelar</button><button type="button" disabled={!value} onClick={() => { onApply(value); setOpen(false); setValue(""); }}>Aplicar a todos</button></div>
        </div>
      )}
    </div>
  );
}

type ViewKey =
  | "estadisticas"
  | "productores"
  | "establecimientos"
  | "campanas"
  | "sanidad"
  | "renspa"
  | "agenda-rural"
  | "pacientes"
  | "historia"
  | "vacunas"
  | "desparasitaciones"
  | "estudios"
  | "recordatorios"
  | "agenda-clinica"
  | "turnos"
  | "sigatm"
  | "stock"
  | "planes"
  | "admin"
  | "admin-sigatm";
const LARGE_MENU: [ViewKey, string][] = [
  ["productores", "Productores"],
  ["agenda-rural", "Agenda rural"],
];
const SMALL_MENU: [ViewKey, string][] = [
  ["pacientes", "Pacientes"],
  ["recordatorios", "Recordatorios"],
];
const WORK_CATALOG: Record<string, { label: string; scope: string }[]> = {
  Vacunación: [
    {
      label: "Fiebre aftosa",
      scope: "SENASA · obligatoria según zona y campaña",
    },
    {
      label: "Brucelosis bovina · Cepa 19",
      scope: "SENASA · obligatoria en terneras de 3 a 8 meses",
    },
    {
      label: "Brucelosis estratégica · RB51 / DELTAPGM",
      scope: "SENASA · voluntaria para establecimientos con casos",
    },
    { label: "Complejo clostridial", scope: "Plan sanitario recomendado" },
    {
      label: "Complejo respiratorio bovino",
      scope: "Plan sanitario recomendado",
    },
    {
      label: "Complejo reproductivo · IBR / DVB / Leptospirosis",
      scope: "Plan sanitario recomendado",
    },
    {
      label: "Carbunclo bacteridiano",
      scope: "Según riesgo y normativa provincial",
    },
    {
      label: "Rabia paresiante",
      scope: "Según zona de riesgo e indicación sanitaria",
    },
  ],
  Tacto: [
    {
      label: "Diagnóstico de gestación por tacto rectal",
      scope: "Práctica reproductiva",
    },
    {
      label: "Diagnóstico de gestación por ecografía",
      scope: "Práctica reproductiva",
    },
    {
      label: "Evaluación de ciclicidad ovárica",
      scope: "Práctica reproductiva",
    },
    {
      label: "Revisión preservicio de vaquillonas",
      scope: "Práctica reproductiva",
    },
  ],
  Revisión: [
    { label: "Examen clínico general", scope: "Práctica profesional" },
    { label: "Revisación preservicio de toros", scope: "Aptitud reproductiva" },
    { label: "Condición corporal", scope: "Manejo productivo" },
    { label: "Boqueo y dentición", scope: "Manejo productivo" },
    { label: "Revisión podal y locomoción", scope: "Bienestar y producción" },
    { label: "Revisión de ubre", scope: "Producción lechera" },
    { label: "Control posparto", scope: "Práctica reproductiva" },
    { label: "Control sanitario de ingreso", scope: "Bioseguridad" },
  ],
  Sangrado: [
    {
      label: "Brucelosis bovina · BPA / FPA / ELISA",
      scope: "Programa SENASA",
    },
    { label: "Leucosis bovina", scope: "Diagnóstico sanitario" },
    {
      label: "Tuberculosis bovina · prueba tuberculínica",
      scope: "Programa Nacional de Tuberculosis",
    },
    { label: "Diarrea viral bovina · DVB", scope: "Diagnóstico sanitario" },
    {
      label: "Rinotraqueítis infecciosa bovina · IBR",
      scope: "Diagnóstico sanitario",
    },
    { label: "Neosporosis", scope: "Diagnóstico sanitario" },
    { label: "Paratuberculosis", scope: "Diagnóstico sanitario" },
  ],
  "Muestreo equino": [
    {
      label: "Anemia Infecciosa Equina · AIE",
      scope: "Programa sanitario SENASA · diagnóstico serológico",
    },
  ],
  "Muestreo reproductivo": [
    {
      label: "Tricomoniasis · muestra prepucial",
      scope: "Enfermedad reportable / planes provinciales",
    },
    {
      label: "Campylobacteriosis genital bovina · muestra prepucial",
      scope: "Enfermedad reportable / planes provinciales",
    },
    {
      label: "Tricomoniasis + Campylobacteriosis",
      scope: "Control reproductivo de toros",
    },
  ],
  Otro: [
    { label: "Otro trabajo veterinario", scope: "Definido por el profesional" },
  ],
};
const WORK_TYPE_ORDER = [
  "Sangrado",
  "Muestreo equino",
  "Tacto",
  "Vacunación",
  "Revisión",
  "Muestreo reproductivo",
  "Otro",
];

export default function Home() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userAccess, setUserAccess] = useState<UserAccess | null>(null);
  const [sigatmCatalog, setSigatmCatalog] = useState<SigatmCatalog>(
    DEFAULT_SIGATM_CATALOG,
  );
  const [activeView, setActiveView] = useState<ViewKey>("estadisticas");
  const [largeOpen, setLargeOpen] = useState(false);
  const [smallOpen, setSmallOpen] = useState(false);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockCategories, setStockCategories] = useState<string[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [dataReload, setDataReload] = useState(0);
  const [species, setSpecies] = useState("BOVINO");
  const [defaultAnimal, setDefaultAnimal] = useState("Animal sano");
  const [defaultId, setDefaultId] = useState("Caravana");
  const [defaultAge, setDefaultAge] = useState("ADULTO");
  const [rows, setRows] = useState<AnimalRow[]>([]);
  const [previewFilter, setPreviewFilter] = useState<
    "Todos" | "Correctos" | "Errores"
  >("Todos");
  const [activeSigatmJob, setActiveSigatmJob] = useState<{
    producerId: number;
    workIndex: number;
  } | null>(null);
  const [sigatmFilter, setSigatmFilter] = useState<
    "Todos" | "Pendiente" | "Finalizado"
  >("Pendiente");
  const [sigatmProducer, setSigatmProducer] = useState("");
  const [sigatmEstablishment, setSigatmEstablishment] = useState("");
  const [sigatmDate, setSigatmDate] = useState("");
  const [filename, setFilename] = useState("");
  const [message, setMessage] = useState("Elegí una planilla para comenzar");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        setAuthUser(user);
        setAuthLoading(false);
      }),
    [],
  );
  useEffect(() => {
    if (!authUser) {
      setUserAccess(null);
      return;
    }
    let active = true;
    setDataLoading(true);
    Promise.all([
      loadVeterinaryData(authUser.uid),
      getDoc(doc(db, "users", authUser.uid)),
      getDoc(doc(db, "systemConfig", "sigatm")).catch(() => null),
    ])
      .then(([data, profile, catalogSnapshot]) => {
        if (!active) return;
        setUserAccess(
          resolveUserAccess(
            profile.exists()
              ? (profile.data() as Record<string, unknown>)
              : undefined,
          ),
        );
        setSigatmCatalog(
          catalogSnapshot?.exists()
            ? normalizeSigatmCatalog(catalogSnapshot.data())
            : DEFAULT_SIGATM_CATALOG,
        );
        setProducers(data.producers as Producer[]);
        setPatients(data.patients as Patient[]);
        setStockItems(data.stockItems as StockItem[]);
        setStockCategories(
          data.stockCategories.map((category) => category.name),
        );
        setDataError("");
      })
      .catch((error: unknown) => {
        console.error("Error al cargar los datos veterinarios", error);
        if (!active) return;
        const detail =
          error && typeof error === "object" && "code" in error
            ? ` (${String(error.code)})`
            : "";
        setDataError(
          `No pudimos cargar tus datos desde Firebase${detail}. Intentá nuevamente.`,
        );
      })
      .finally(() => active && setDataLoading(false));
    return () => {
      active = false;
    };
  }, [authUser, dataReload]);

  const canAccessView = (view: ViewKey) => {
    if (!userAccess) return false;
    if (view === "planes" || view === "estadisticas") return true;
    if (view === "admin" || view === "admin-sigatm")
      return userAccess.role === "admin";
    if (view === "stock") return userAccess.permissions.stock;
    if (view === "sigatm") return userAccess.permissions.sigatm;
    if (LARGE_MENU.some(([key]) => key === view))
      return userAccess.permissions.largeAnimals;
    if (SMALL_MENU.some(([key]) => key === view))
      return userAccess.permissions.smallAnimals;
    return false;
  };
  const navigateTo = (view: ViewKey) =>
    setActiveView(canAccessView(view) ? view : "planes");
  useEffect(() => {
    if (!userAccess) return;
    const hasAnyModule =
      userAccess.permissions.smallAnimals ||
      userAccess.permissions.largeAnimals ||
      userAccess.permissions.stock;
    if (!hasAnyModule) setActiveView("planes");
    else if (!canAccessView(activeView)) setActiveView("estadisticas");
  }, [userAccess, activeView]);

  const catalogAnimals = activeCodeMap(sigatmCatalog, "animals");
  const catalogIdTypes = activeCodeMap(sigatmCatalog, "idTypes");
  const catalogCategories = activeCodeMap(sigatmCatalog, "categories", species);
  const catalogAges = activeCodeMap(sigatmCatalog, "ages", species);
  const errors = useMemo(
    () => validateRows(rows, catalogCategories, catalogAges),
    [rows, catalogCategories, catalogAges],
  );
  const errorRowIndexes = new Set(
    Object.keys(errors).map((key) => Number(key.split(":")[0])),
  );
  const errorRows = errorRowIndexes.size;
  const visiblePreviewRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ index }) =>
      previewFilter === "Errores"
        ? errorRowIndexes.has(index)
        : previewFilter === "Correctos"
          ? !errorRowIndexes.has(index)
          : true,
    );
  useEffect(() => {
    if (previewFilter === "Errores" && errorRows === 0) {
      setPreviewFilter("Todos");
    }
  }, [errorRows, previewFilter]);
  const ready = rows.length > 0 && Object.keys(errors).length === 0;
  if (authLoading)
    return (
      <div className="auth-loading">
        <span className="brand-mark">L</span>
        <p>Preparando LabOVet…</p>
      </div>
    );
  if (!authUser) return <AuthScreen />;
  if (dataLoading || !userAccess)
    return (
      <div className="auth-loading">
        <span className="brand-mark">L</span>
        <p>Cargando tu información…</p>
      </div>
    );

  async function loadFile(file?: File) {
    if (!file) return;
    setActiveSigatmJob(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        raw: false,
      });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });
      if (!data.length) throw new Error("La planilla está vacía.");
      const headers = Object.keys(data[0]);
      const pick = (row: Record<string, unknown>, wanted: string[]) => {
        const key = headers.find((h) =>
          wanted.includes(norm(h).replace(/\s/g, "")),
        );
        return key ? row[key] : "";
      };
      const parsed = data
        .map((r) => ({
          tube: norm(pick(r, ["TUBO", "NUMEROTUBO", "NROMUESTRA"])).replace(
            /\s/g,
            "",
          ),
          animal: defaultAnimal,
          idType: defaultId,
          identifier: norm(
            pick(r, ["IDENTIFICACION", "IDENTIFICADOR", "CARAVANA"]),
          ).replace(/\s/g, ""),
          category: norm(pick(r, ["CATEGORIA", "CATEGORÍA"])),
          age: defaultAge,
          vaccination: "",
          notes: "",
        }))
        .filter((r) => r.tube || r.identifier || r.category);
      if (!parsed.length)
        throw new Error(
          "No pude encontrar datos. Necesito columnas TUBO, IDENTIFICACION y CATEGORIA.",
        );
      setRows(parsed);
      setPreviewFilter("Todos");
      setFilename(file.name);
      setMessage(`${parsed.length} animales detectados en ${file.name}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No pude leer el archivo.",
      );
      setRows([]);
    }
  }

  function updateRow(index: number, field: keyof AnimalRow, value: string) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }
  function applyToAllRows(field: keyof AnimalRow, value: string) {
    setRows((current) => current.map((row) => ({ ...row, [field]: value })));
  }

  function download() {
    if (!ready) return;
    const output = rows.map((r) => ({
      "Método recolección": 1,
      "Cantidad Recolección": 1,
      "Numero tubo / muestra": r.tube,
      "Código de Animal muestreado": catalogAnimals[r.animal],
      "Código de Tipo Identificación": catalogIdTypes[r.idType],
      Identificador: r.identifier,
      "Código de Categoría": findCode(catalogCategories, r.category),
      "Código de Edad": findCode(catalogAges, r.age),
      "Fecha Vacunación": r.vaccination,
      Observaciones: r.notes,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(output),
      "SIGATM",
    );
    XLSX.writeFile(
      wb,
      `SIGATM_${species}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
    if (activeSigatmJob && auth.currentUser) {
      const producer = producers.find(
        (p) => p.id === activeSigatmJob.producerId,
      );
      const original = producer?.works[activeSigatmJob.workIndex];
      if (producer && original) {
        const finalized: Work = { ...original, sigatmStatus: "Finalizado" };
        saveWorkMetadata(auth.currentUser.uid, producer.id, finalized).catch(
          () =>
            window.alert(
              "El Excel se descargó, pero no pudimos actualizar su estado en Firebase.",
            ),
        );
        setProducers((current) =>
          current.map((p) =>
            p.id !== producer.id
              ? p
              : {
                  ...p,
                  works: p.works.map((w, i) =>
                    i === activeSigatmJob.workIndex ? finalized : w,
                  ),
                },
          ),
        );
      }
    }
    setRows([]);
    setPreviewFilter("Todos");
    setFilename("");
    setMessage("Elegí una planilla para comenzar");
    if (activeSigatmJob) setSigatmFilter("Finalizado");
    setActiveSigatmJob(null);
  }

  function reset() {
    setRows([]);
    setPreviewFilter("Todos");
    setFilename("");
    setMessage("Elegí una planilla para comenzar");
    setActiveSigatmJob(null);
    if (inputRef.current) inputRef.current.value = "";
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    loadFile(e.dataTransfer.files[0]);
  }
  const sigatmWorks = producers
    .flatMap((producer) =>
      producer.works.map((work, index) => ({
        producer,
        work,
        index,
        establishment: workEstablishment(producer, work),
      })),
    )
    .filter(
      (item) =>
        isSigatmEligibleWork(item.work) &&
        item.work.records?.length,
    );
  const visibleSigatmWorks = sigatmWorks.filter(
    (item) =>
      (sigatmFilter === "Todos" ||
        (item.work.sigatmStatus || "Pendiente") === sigatmFilter) &&
      (!sigatmProducer || item.producer.name === sigatmProducer) &&
      (!sigatmEstablishment ||
        item.establishment.name === sigatmEstablishment) &&
      (!sigatmDate || displayDate(item.work.date) === sigatmDate),
  );
  function openSigatmWork(work: Work, producer: Producer, workIndex: number) {
    const targetSpecies = work.type === "Muestreo equino" ? "EQUINO" : "BOVINO";
    setSpecies(targetSpecies);
    setDefaultAge(
      "N/A" in activeCodeMap(sigatmCatalog, "ages", targetSpecies)
        ? "N/A"
        : Object.keys(activeCodeMap(sigatmCatalog, "ages", targetSpecies))[0],
    );
    setRows(
      (work.records || []).map((r, i) => ({
        tube: String(i + 1),
        animal: "Animal sano",
        idType: "Caravana",
        identifier: [r.cuig, r.identifier].filter(Boolean).join(" "),
        category: r.category,
        age:
          "N/A" in activeCodeMap(sigatmCatalog, "ages", targetSpecies)
            ? "N/A"
            : Object.keys(activeCodeMap(sigatmCatalog, "ages", targetSpecies))[0],
        vaccination: "",
        notes: `${producer.name} · ${work.detail}`,
      })),
    );
    setPreviewFilter("Todos");
    setFilename(`${producer.name} · ${work.type}`);
    setMessage(
      `${work.records?.length || 0} animales cargados desde el trabajo`,
    );
    setActiveSigatmJob({ producerId: producer.id, workIndex });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">L</span>
          <div>
            <b>LabOVet</b>
            <small>Gestión veterinaria</small>
          </div>
        </div>
        <nav className="main-nav">
          <p>PRINCIPAL</p>
          <button
            className={activeView === "estadisticas" ? "active" : ""}
            onClick={() => navigateTo("estadisticas")}
          >
            <span>⌂</span> Inicio
          </button>
          {userAccess.permissions.largeAnimals && <>
          <button
            className={
              LARGE_MENU.some(([key]) => key === activeView) ? "active" : ""
            }
            onClick={() => setLargeOpen((v) => !v)}
          >
            <span>♞</span> Grandes animales <i>{largeOpen ? "⌃" : "⌄"}</i>
          </button>
          {largeOpen && (
            <div className="submenu">
              {LARGE_MENU.map(([key, label]) => (
                <button
                  key={key}
                  className={activeView === key ? "selected" : ""}
                  onClick={() => setActiveView(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}</>}
          {userAccess.permissions.smallAnimals && <><button
            className={
              SMALL_MENU.some(([key]) => key === activeView) ? "active" : ""
            }
            onClick={() => setSmallOpen((v) => !v)}
          >
            <span>♧</span> Pequeños animales <i>{smallOpen ? "⌃" : "⌄"}</i>
          </button>
          {smallOpen && (
            <div className="submenu">
              {SMALL_MENU.map(([key, label]) => (
                <button
                  key={key}
                  className={activeView === key ? "selected" : ""}
                  onClick={() => setActiveView(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}</>}
          {userAccess.permissions.stock && <button
            className={activeView === "stock" ? "active" : ""}
            onClick={() => navigateTo("stock")}
          >
            <span>▦</span> Lista de precios / Stock
          </button>}
          {userAccess.permissions.sigatm && <p>HERRAMIENTAS</p>}
          {userAccess.permissions.sigatm && <button
            className={activeView === "sigatm" ? "active" : ""}
            onClick={() => navigateTo("sigatm")}
          >
            <span>⇄</span> Conversor SIGATM
          </button>}
          <p>SUSCRIPCIONES</p>
          <button
            className={activeView === "planes" ? "active" : ""}
            onClick={() => setActiveView("planes")}
          >
            <span>◇</span> Elegir plan
          </button>
          {userAccess.role === "admin" && <>
            <p>ADMINISTRACIÓN</p>
            <button
              className={activeView === "admin" ? "active" : ""}
              onClick={() => navigateTo("admin")}
            >
              <span>⚙</span> Usuarios y accesos
            </button>
            <button
              className={activeView === "admin-sigatm" ? "active" : ""}
              onClick={() => navigateTo("admin-sigatm")}
            >
              <span>⌘</span> Catálogo SIGATM
            </button>
          </>}
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-avatar">
            {(authUser.displayName || authUser.email || "V")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <b>{authUser.displayName || "Veterinario"}</b>
            <small>{authUser.email}</small>
          </div>
          <button title="Cerrar sesión" onClick={() => signOut(auth)}>
            ↪
          </button>
        </div>
      </aside>

      <section className="workspace">
        {dataError && (
          <div className="data-error">
            <span>{dataError}</span>
            <button
              type="button"
              onClick={() => setDataReload((value) => value + 1)}
            >
              Reintentar
            </button>
          </div>
        )}
        {activeView !== "sigatm" ? (
          <ModuleView
            view={activeView}
            producers={producers}
            setProducers={setProducers}
            patients={patients}
            setPatients={setPatients}
            stockItems={stockItems}
            setStockItems={setStockItems}
            stockCategories={stockCategories}
            setStockCategories={setStockCategories}
            uid={authUser.uid}
            onNavigate={navigateTo}
            access={userAccess}
            sigatmCatalog={sigatmCatalog}
            userName={authUser.displayName || "Veterinario"}
            userEmail={authUser.email || ""}
          />
        ) : (
          <>
            <header className="topbar">
              <div>
                <span className="eyebrow">GRANDES ANIMALES</span>
                <h1>Conversor SIGATM</h1>
                <p>
                  Convertí tu planilla de animales al formato oficial, sin
                  cargar datos del productor.
                </p>
              </div>
              <div className="status-pill">
                <i /> Procesamiento local y privado
              </div>
            </header>

            <div className="steps">
              <div className={rows.length ? "done" : "current"}>
                <b>1</b>
                <span>
                  <strong>Cargar planilla</strong>
                  <small>Excel del veterinario</small>
                </span>
              </div>
              <hr />
              <div className={rows.length ? "current" : ""}>
                <b>2</b>
                <span>
                  <strong>Revisar datos</strong>
                  <small>Validar y corregir</small>
                </span>
              </div>
              <hr />
              <div className={ready ? "current" : ""}>
                <b>3</b>
                <span>
                  <strong>Descargar</strong>
                  <small>Excel para SIGATM</small>
                </span>
              </div>
            </div>

            <div className="content-grid">
              <section className="panel setup-panel">
                <div className="panel-title">
                  <div>
                    <span className="icon-box">⚙</span>
                    <div>
                      <h2>Configuración general</h2>
                      <p>Estos datos se aplicarán a todos los animales.</p>
                    </div>
                  </div>
                  <span className="required">Campos obligatorios</span>
                </div>
                <div className="form-grid">
                  <label>
                    Especie
                    <select
                      value={species}
                      onChange={(e) => {
                        const s = e.target.value;
                        setSpecies(s);
                        setDefaultAge(Object.keys(activeCodeMap(sigatmCatalog, "ages", s))[0]);
                        setRows([]);
                      }}
                    >
                      {sigatmCatalog.species.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Animal muestreado
                    <select
                      value={defaultAnimal}
                      onChange={(e) => setDefaultAnimal(e.target.value)}
                    >
                      {Object.keys(catalogAnimals).map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tipo de identificación
                    <select
                      value={defaultId}
                      onChange={(e) => setDefaultId(e.target.value)}
                    >
                      {Object.keys(catalogIdTypes).map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Edad
                    <select
                      value={defaultAge}
                      onChange={(e) => setDefaultAge(e.target.value)}
                    >
                      {Object.keys(catalogAges).map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <section className="panel upload-panel">
                <div className="panel-title">
                  <div>
                    <span className="icon-box green">↥</span>
                    <div>
                      <h2>Cargar planilla</h2>
                      <p>
                        Columnas esperadas: TUBO, IDENTIFICACION y CATEGORIA.
                      </p>
                    </div>
                  </div>
                  <a
                    className="template-link"
                    href="/plantillas/Planilla_Modelo_SIGATM.xlsx"
                    download
                  >
                    ↓ Descargar modelo
                  </a>
                </div>
                <div
                  className={`dropzone ${dragging ? "dragging" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => inputRef.current?.click()}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      loadFile(e.target.files?.[0])
                    }
                  />
                  <div className="file-icon">X</div>
                  <strong>{filename || "Arrastrá tu archivo Excel acá"}</strong>
                  <span>
                    {filename
                      ? message
                      : "o hacé clic para buscarlo en tu computadora"}
                  </span>
                  <button type="button">Seleccionar archivo</button>
                  <small>Formatos admitidos: .xlsx y .xls</small>
                </div>
              </section>
            </div>

            <section className="panel sigatm-queue">
              <div>
                <span className="icon-box green">✓</span>
                <div>
                  <h2>Trabajos SIGATM</h2>
                  <p>
                    Prepará los pendientes o recuperá archivos de trabajos ya
                    finalizados.
                  </p>
                </div>
              </div>
              <div className="sigatm-filters">
                <div className="sigatm-status-tabs">
                  <button
                    className={sigatmFilter === "Pendiente" ? "selected" : ""}
                    onClick={() => setSigatmFilter("Pendiente")}
                  >
                    Pendientes{" "}
                    <b>
                      {
                        sigatmWorks.filter(
                          (x) =>
                            (x.work.sigatmStatus || "Pendiente") ===
                            "Pendiente",
                        ).length
                      }
                    </b>
                  </button>
                  <button
                    className={sigatmFilter === "Finalizado" ? "selected" : ""}
                    onClick={() => setSigatmFilter("Finalizado")}
                  >
                    Finalizados{" "}
                    <b>
                      {
                        sigatmWorks.filter(
                          (x) => x.work.sigatmStatus === "Finalizado",
                        ).length
                      }
                    </b>
                  </button>
                  <button
                    className={sigatmFilter === "Todos" ? "selected" : ""}
                    onClick={() => setSigatmFilter("Todos")}
                  >
                    Todos
                  </button>
                </div>
                <div className="sigatm-filter-fields">
                  <label>
                    <span>Fecha</span>
                    <DateField value={sigatmDate} onChange={setSigatmDate} />
                  </label>
                  <label>
                    <span>Productor</span>
                    <select
                      value={sigatmProducer}
                      onChange={(e) => setSigatmProducer(e.target.value)}
                    >
                      <option value="">Todos</option>
                      {[
                        ...new Set(sigatmWorks.map((x) => x.producer.name)),
                      ].map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Establecimiento</span>
                    <select
                      value={sigatmEstablishment}
                      onChange={(e) => setSigatmEstablishment(e.target.value)}
                    >
                      <option value="">Todos</option>
                      {[
                        ...new Set(
                          sigatmWorks.map((x) => x.establishment.name),
                        ),
                      ].map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              {visibleSigatmWorks.length ? (
                visibleSigatmWorks.map(
                  ({ producer, work, index, establishment }) => {
                    const status = work.sigatmStatus || "Pendiente";
                    return (
                      <article key={`${producer.id}-${index}`}>
                        <div>
                          <b>
                            {work.type} · {work.detail.split("·")[0].trim()} · {producer.name}
                          </b>
                          <span>
                            {establishment.name} · {work.date} · {work.animals}{" "}
                            · RENSPA {establishment.renspa}
                          </span>
                        </div>
                        <span
                          className={
                            status === "Finalizado"
                              ? "finished-badge"
                              : "pending-badge"
                          }
                        >
                          {status}
                        </span>
                        <button
                          className={
                            status === "Finalizado" ? "outline-btn" : "primary"
                          }
                          onClick={() => openSigatmWork(work, producer, index)}
                        >
                          {status === "Finalizado"
                            ? "Volver a generar"
                            : "Preparar Excel SIGATM"}
                        </button>
                      </article>
                    );
                  },
                )
              ) : (
                <div className="empty-agenda">
                  <b>No hay trabajos que coincidan</b>
                  <span>
                    Probá cambiando la fecha, el productor, el establecimiento o
                    el estado.
                  </span>
                </div>
              )}
            </section>

            {rows.length > 0 && (
              <section className="panel preview-panel">
                <div className="preview-header">
                  <div>
                    <span className="icon-box blue">✓</span>
                    <div>
                      <h2>Vista previa editable</h2>
                      <p>
                        {rows.length} registros ·{" "}
                        {errorRows
                          ? `${errorRows} filas necesitan revisión`
                          : "Todos los datos están listos"}
                      </p>
                    </div>
                  </div>
                  <div className="summary">
                    <button
                      type="button"
                      className={`ok ${previewFilter === "Correctos" ? "selected" : ""}`}
                      onClick={() =>
                        setPreviewFilter((current) =>
                          current === "Correctos" ? "Todos" : "Correctos",
                        )
                      }
                    >
                      {rows.length - errorRows} correctos
                    </button>
                    {errorRows > 0 && (
                      <button
                        type="button"
                        className={`bad ${previewFilter === "Errores" ? "selected" : ""}`}
                        onClick={() =>
                          setPreviewFilter((current) =>
                            current === "Errores" ? "Todos" : "Errores",
                          )
                        }
                      >
                        {errorRows} con error
                      </button>
                    )}
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th className="sigatm-col-index">#</th>
                        <th className="sigatm-col-tube">Tubo / muestra</th>
                        <th className="sigatm-col-animal"><BulkColumnHeader label="Animal" options={Object.keys(catalogAnimals)} onApply={(value) => applyToAllRows("animal", value)} /></th>
                        <th className="sigatm-col-idType"><BulkColumnHeader label="Tipo identificación" options={Object.keys(catalogIdTypes)} onApply={(value) => applyToAllRows("idType", value)} /></th>
                        <th className="sigatm-col-identifier">Identificador</th>
                        <th className="sigatm-col-category"><BulkColumnHeader label="Categoría" options={Object.keys(catalogCategories)} onApply={(value) => applyToAllRows("category", value)} /></th>
                        <th className="sigatm-col-age"><BulkColumnHeader label="Edad" options={Object.keys(catalogAges)} onApply={(value) => applyToAllRows("age", value)} /></th>
                        <th className="sigatm-col-vaccination">Fecha vacunación</th>
                        <th className="sigatm-col-notes">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePreviewRows.map(({ row: r, index: i }) => (
                        <tr
                          key={i}
                          className={
                            Object.keys(errors).some((k) =>
                              k.startsWith(`${i}:`),
                            )
                              ? "row-error"
                              : ""
                          }
                        >
                          <td className="sigatm-col-index">{i + 1}</td>
                          {(
                            [
                              "tube",
                              "animal",
                              "idType",
                              "identifier",
                              "category",
                              "age",
                              "vaccination",
                              "notes",
                            ] as (keyof AnimalRow)[]
                          ).map((field) => (
                            <td key={field} className={`sigatm-col-${field}`}>
                              {field === "animal" ||
                              field === "idType" ||
                              field === "category" ||
                              field === "age" ? (
                                <select
                                  className={
                                    errors[`${i}:${field}`] ? "invalid" : ""
                                  }
                                  value={r[field]}
                                  onChange={(e) =>
                                    updateRow(i, field, e.target.value)
                                  }
                                >
                                  {Object.keys(
                                    field === "animal"
                                      ? catalogAnimals
                                      : field === "idType"
                                        ? catalogIdTypes
                                        : field === "category"
                                          ? catalogCategories
                                          : catalogAges,
                                  ).map((v) => (
                                    <option key={v}>{v}</option>
                                  ))}
                                </select>
                              ) : field === "vaccination" ? (
                                <DateField
                                  value={r.vaccination}
                                  onChange={(value) =>
                                    updateRow(i, "vaccination", value)
                                  }
                                />
                              ) : (
                                <input
                                  className={
                                    errors[`${i}:${field}`] ? "invalid" : ""
                                  }
                                  value={r[field]}
                                  title={errors[`${i}:${field}`]}
                                  onChange={(e) =>
                                    updateRow(i, field, e.target.value)
                                  }
                                />
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="actions">
                  <button className="ghost" onClick={reset}>
                    Limpiar y cargar otro
                  </button>
                  <div>
                    <span>
                      {ready
                        ? "Archivo listo para exportar"
                        : "Corregí los campos marcados en rojo"}
                    </span>
                    <button
                      className="primary"
                      disabled={!ready}
                      onClick={download}
                    >
                      Descargar Excel SIGATM <b>→</b>
                    </button>
                  </div>
                </div>
              </section>
            )}
            {!rows.length && (
              <div className="privacy-note">
                <span>◉</span>
                <div>
                  <b>Tus datos no salen de tu computadora</b>
                  <p>
                    La planilla se procesa directamente en este navegador. En
                    esta primera versión no se almacena ni se envía ningún
                    archivo.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function AuthScreen() {
  const [register, setRegister] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")).trim();
    const password = String(f.get("password"));
    try {
      if (register) {
        const name = String(f.get("name")).trim();
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        await updateProfile(credential.user, { displayName: name });
        await setDoc(doc(db, "users", credential.user.uid), {
          name,
          email,
          role: "veterinarian",
          plan: "unassigned",
          subscriptionStatus: "pending",
          createdAt: serverTimestamp(),
        });
      } else await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const code = String((err as { code?: string }).code || "");
      setError(
        code.includes("email-already-in-use")
          ? "Ese correo ya está registrado."
          : code.includes("invalid-credential")
            ? "Correo o contraseña incorrectos."
            : code.includes("weak-password")
              ? "La contraseña debe tener al menos 6 caracteres."
              : code.includes("invalid-email")
                ? "Ingresá un correo electrónico válido."
                : "No pudimos completar el acceso. Intentá nuevamente.",
      );
    } finally {
      setLoading(false);
    }
  }
  function openAccess(createAccount = false) {
    setRegister(createAccount);
    setError("");
    setShowAccess(true);
  }
  return (
    <main className="public-site">
      <header className="public-nav">
        <a className="public-logo" href="#inicio"><span>L</span><b>LabOVet</b></a>
        <nav><a href="#soluciones">Soluciones</a><a href="#servicio">Servicio administrativo</a><a href="#planes">Planes</a></nav>
        <div><button className="public-login" onClick={() => openAccess(false)}>Ingresar</button><button className="public-primary" onClick={() => openAccess(true)}>Comenzar</button></div>
      </header>

      <section className="public-hero" id="inicio">
        <div className="hero-copy">
          <span className="public-kicker">GESTIÓN VETERINARIA, SIMPLE Y PROFESIONAL</span>
          <h1>Tu trabajo veterinario,<br /><em>ordenado de verdad.</em></h1>
          <p>Historias clínicas, productores, animales, recordatorios, stock y archivos SIGATM en una plataforma creada para la práctica veterinaria argentina.</p>
          <div className="hero-actions"><button className="public-primary large" onClick={() => openAccess(true)}>Empezar con LabOVet</button><a href="#soluciones">Conocer el sistema ↓</a></div>
          <div className="hero-trust"><span>✓ Información privada</span><span>✓ Acceso desde cualquier dispositivo</span><span>✓ Datos respaldados en la nube</span></div>
        </div>
        <div className="hero-product">
          <div className="product-window">
            <div className="product-bar"><i /><i /><i /><span>Panel de gestión</span></div>
            <div className="product-body">
              <aside><b>L</b><span>Inicio</span><span>Grandes animales</span><span>Pequeños animales</span><span>SIGATM</span></aside>
              <div className="product-content"><small>RESUMEN DE HOY</small><h3>Buen día, Veterinario</h3><div className="preview-alert"><b>2 recordatorios para hoy</b><span>Controles que requieren atención</span></div><div className="preview-grid"><article><small>PRODUCTORES</small><b>24</b><span>3 trabajos pendientes</span></article><article><small>PACIENTES</small><b>186</b><span>8 próximos controles</span></article><article><small>SIGATM</small><b>4</b><span>archivos pendientes</span></article></div></div>
            </div>
          </div>
          <div className="floating-proof"><span>✓</span><div><b>Todo actualizado</b><small>Información sincronizada</small></div></div>
        </div>
      </section>

      <section className="public-intro" id="soluciones"><span className="public-kicker">UNA PLATAFORMA, DOS FORMAS DE TRABAJAR</span><h2>Diseñada para el veterinario que está en el campo y para el que atiende en consultorio.</h2><p>LabOVet centraliza la información y transforma cada trabajo en un historial útil para tomar mejores decisiones.</p></section>

      <section className="solution-block large-animals">
        <div className="solution-copy"><span className="solution-number">01 · GRANDES ANIMALES</span><h2>Del productor al archivo SIGATM, sin perder información.</h2><p>Organizá cada establecimiento, registrá trabajos y construí un historial sanitario individual a partir de las planillas que ya utilizás.</p><ul><li><b>Productores y establecimientos</b><span>RENSPA, contactos, múltiples campos e historial por establecimiento.</span></li><li><b>Agenda rural automática</b><span>Cada nuevo trabajo alimenta tu agenda de pendientes y realizados.</span></li><li><b>Resultados por animal</b><span>Negativos, sospechosos y positivos con búsqueda por identificación.</span></li><li><b>Conversor SIGATM integrado</b><span>Carga manual o Excel y generación del archivo estandarizado.</span></li><li><b>Informes profesionales</b><span>Exportación en PDF del historial completo del productor.</span></li></ul></div>
        <div className="solution-visual rural"><div className="visual-card"><span>HISTORIAL SANITARIO</span><h3>Estancia La Esperanza</h3><div className="result-row"><b>Resultados del último muestreo</b><i>Ver detalle →</i></div><div className="result-bars"><span><i className="green" style={{ width: "82%" }} />Negativos <b>78</b></span><span><i className="yellow" style={{ width: "18%" }} />Sospechosos <b>2</b></span><span><i className="red" style={{ width: "8%" }} />Positivos <b>1</b></span></div><div className="visual-footer">Archivo SIGATM listo para generar <b>✓</b></div></div></div>
      </section>

      <section className="solution-block small-animals">
        <div className="solution-visual clinic"><div className="visual-card"><span>HISTORIA CLÍNICA</span><h3>Cleopatra</h3><p>Felino · 4 años · 4,8 kg</p><div className="clinic-alert">ALERGIAS <b>Penicilina</b></div><div className="mini-timeline"><article><i>＋</i><div><b>Consulta</b><span>Control gastrointestinal</span></div><time>17 JUL</time></article><article><i>V</i><div><b>Vacunación</b><span>Triple felina</span></div><time>02 JUN</time></article><article><i>D</i><div><b>Desparasitación</b><span>Control programado</span></div><time>15 MAY</time></article></div></div></div>
        <div className="solution-copy"><span className="solution-number">02 · PEQUEÑOS ANIMALES</span><h2>La historia clínica como centro de cada atención.</h2><p>Todo lo necesario para atender y hacer seguimiento sin buscar información en distintos lugares.</p><ul><li><b>Ficha clínica completa</b><span>Paciente, propietario, antecedentes, alergias y peso.</span></li><li><b>Línea de tiempo sanitaria</b><span>Consultas, diagnósticos, tratamientos, vacunas y estudios.</span></li><li><b>Signos vitales y evolución</b><span>Registro clínico claro en cada nueva atención.</span></li><li><b>Recordatorios automáticos</b><span>Vacunas, controles y desparasitaciones con aviso por WhatsApp.</span></li><li><b>Historia clínica en PDF</b><span>Exportá y compartí la información con el propietario.</span></li></ul></div>
      </section>

      <section className="admin-service" id="servicio"><div className="admin-heading"><span className="public-kicker">SERVICIO ADMINISTRATIVO · GRANDES ANIMALES</span><h2>Vos seguís trabajando como siempre.<br />Nosotros organizamos todo lo demás.</h2><p>Una solución para veterinarios que quieren los beneficios de LabOVet sin dedicar tiempo a cargar información.</p></div><div className="admin-steps"><article><span>1</span><b>Nos enviás tus protocolos</b><p>Recibimos tus planillas y datos por el canal acordado.</p></article><i>→</i><article><span>2</span><b>Cargamos y organizamos</b><p>Creamos tu usuario y mantenemos productores, trabajos y animales actualizados.</p></article><i>→</i><article><span>3</span><b>Recibís todo listo</b><p>Te entregamos los archivos estandarizados para cargar directamente en SIGATM.</p></article></div></section>

      <section className="pricing-section" id="planes"><div className="public-intro"><span className="public-kicker">PLANES SIMPLES Y TRANSPARENTES</span><h2>Elegí la modalidad que mejor acompaña tu trabajo.</h2></div><div className="public-pricing">
        <article><span className="plan-tag">PEQUEÑOS ANIMALES</span><h3>Consultorio</h3><div className="public-price"><b>$25.000</b><span>/ mes</span></div><p>Para veterinarios que atienden animales de compañía.</p><ul><li>Pacientes ilimitados</li><li>Historias clínicas completas</li><li>Consultas y evolución</li><li>Recordatorios por WhatsApp</li><li>Exportación de historias en PDF</li><li>Lista de precios y stock</li></ul><button onClick={() => openAccess(true)}>Elegir Pequeños animales</button></article>
        <article className="featured"><span className="popular">MÁS COMPLETO</span><span className="plan-tag">GRANDES ANIMALES</span><h3>Gestión rural</h3><div className="public-price"><b>$50.000</b><span>/ mes</span></div><p>Para organizar productores, trabajos y protocolos.</p><ul><li>Productores y establecimientos</li><li>Agenda rural automática</li><li>Historial sanitario por animal</li><li>Carga y análisis de resultados</li><li>Conversor Excel a SIGATM</li><li>Exportación de informes en PDF</li><li>Incluye pequeños animales</li></ul><button onClick={() => openAccess(true)}>Elegir Grandes animales</button></article>
        <article className="admin-plan"><span className="plan-tag">SERVICIO ADMINISTRATIVO</span><h3>Nosotros lo hacemos</h3><div className="public-price"><b>$150.000</b><span>/ mes</span></div><p>Servicio exclusivo para veterinarios de grandes animales.</p><ul><li>Creación y configuración del usuario</li><li>Carga de protocolos y animales</li><li>Organización de productores</li><li>Preparación de archivos SIGATM</li><li>Información siempre disponible</li><li>Acompañamiento personalizado</li></ul><button onClick={() => openAccess(true)}>Solicitar el servicio</button></article>
      </div></section>

      <section className="public-cta"><span className="brand-mark">L</span><h2>Menos tiempo ordenando.<br />Más tiempo ejerciendo.</h2><p>Empezá a construir hoy el historial de tu trabajo veterinario.</p><button onClick={() => openAccess(true)}>Crear mi cuenta en LabOVet</button></section>
      <footer className="public-footer"><a className="public-logo" href="#inicio"><span>L</span><b>LabOVet</b></a><p>Gestión veterinaria para profesionales argentinos.</p><small>© {new Date().getFullYear()} LabOVet</small></footer>

      {showAccess && <div className="access-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAccess(false); }}><section className="auth-card access-modal">
        <button className="access-close" onClick={() => setShowAccess(false)}>×</button>
        <div><span className="eyebrow">LABOVET</span><h2>{register ? "Crear una cuenta" : "Ingresar"}</h2><p>{register ? "Completá tus datos para comenzar." : "Accedé a tu panel veterinario."}</p></div>
        <form onSubmit={submit}>{register && <label>Nombre y apellido<input name="name" required autoComplete="name" /></label>}<label>Correo electrónico<input name="email" type="email" required autoComplete="email" /></label><label>Contraseña<input name="password" type="password" minLength={6} required autoComplete={register ? "new-password" : "current-password"} /></label>{error && <div className="auth-error">{error}</div>}<button className="primary" disabled={loading}>{loading ? "Procesando…" : register ? "Crear cuenta" : "Ingresar"}</button></form>
        <button className="auth-switch" onClick={() => { setRegister((value) => !value); setError(""); }}>{register ? "Ya tengo una cuenta" : "Crear una cuenta nueva"}</button>
      </section></div>}
    </main>
  );
}

const VIEW_CONTENT: Record<
  Exclude<ViewKey, "sigatm" | "planes" | "stock" | "admin" | "admin-sigatm">,
  {
    eyebrow: string;
    title: string;
    description: string;
    action: string;
    stats: [string, string, string][];
    columns: string[];
    rows: string[][];
  }
> = {
  estadisticas: {
    eyebrow: "RESUMEN GENERAL",
    title: "Estadísticas",
    description: "Una mirada rápida a la actividad de tu consultorio.",
    action: "Exportar estadísticas",
    stats: [
      ["Protocolos", "128", "+12% este año"],
      ["Muestras", "3.842", "420 este mes"],
      ["Pacientes", "86", "12 nuevos"],
      ["Archivos SIGATM", "37", "generados"],
    ],
    columns: ["Fecha", "Actividad", "Tipo", "Estado"],
    rows: [
      [
        "Hoy, 10:30",
        "Campaña de saneamiento · La Esperanza",
        "Grandes animales",
        "Completado",
      ],
      [
        "Ayer, 17:15",
        "Vacuna séxtuple · Mora",
        "Pequeños animales",
        "Registrado",
      ],
      ["11/07/2026", "Archivo SIGATM · 93 animales", "Conversión", "Generado"],
    ],
  },
  productores: {
    eyebrow: "GRANDES ANIMALES",
    title: "Productores",
    description: "Productores, datos de contacto y actividad sanitaria.",
    action: "Nuevo productor",
    stats: [
      ["Productores activos", "32", "5 nuevos este año"],
      ["Establecimientos", "41", "con RENSPA"],
      ["Campañas", "18", "últimos 90 días"],
      ["Muestras", "3.842", "acumuladas"],
    ],
    columns: [
      "Productor",
      "CUIT",
      "Establecimiento",
      "Localidad",
      "Último trabajo",
      "Estado",
    ],
    rows: [
      [
        "Est. La Esperanza",
        "30-71234567-8",
        "La Esperanza",
        "Azul",
        "09/07/2026",
        "Activo",
      ],
      [
        "Los Aromos S.A.",
        "30-69876543-2",
        "Los Aromos",
        "Tandil",
        "06/07/2026",
        "Activo",
      ],
      [
        "María González",
        "27-24567890-4",
        "El Ombú",
        "Rauch",
        "28/06/2026",
        "Activo",
      ],
    ],
  },
  establecimientos: {
    eyebrow: "GRANDES ANIMALES",
    title: "Establecimientos",
    description: "Campos y establecimientos vinculados a cada productor.",
    action: "Nuevo establecimiento",
    stats: [
      ["Establecimientos", "41", "activos"],
      ["Con RENSPA", "39", "95%"],
      ["Bovinos", "34", "principal especie"],
      ["Localidades", "8", "alcance regional"],
    ],
    columns: [
      "Establecimiento",
      "Productor",
      "RENSPA",
      "Localidad",
      "Especie",
      "Acciones",
    ],
    rows: [
      [
        "La Esperanza",
        "Est. La Esperanza",
        "01.023.0.12345/00",
        "Azul",
        "Bovino",
        "Ver ficha",
      ],
      [
        "Los Aromos",
        "Los Aromos S.A.",
        "01.017.0.55421/00",
        "Tandil",
        "Bovino",
        "Ver ficha",
      ],
      [
        "El Ombú",
        "María González",
        "01.041.0.98812/00",
        "Rauch",
        "Ovino",
        "Ver ficha",
      ],
    ],
  },
  campanas: {
    eyebrow: "GRANDES ANIMALES",
    title: "Campañas",
    description: "Organizá muestreos, saneamientos y campañas programadas.",
    action: "Nueva campaña",
    stats: [
      ["Campañas activas", "7", "este mes"],
      ["Muestras previstas", "620", "estimadas"],
      ["Pendientes SIGATM", "4", "archivos"],
      ["Finalizadas", "18", "últimos 90 días"],
    ],
    columns: [
      "Campaña",
      "Establecimiento",
      "Fecha",
      "Análisis",
      "Animales",
      "Estado",
    ],
    rows: [
      [
        "Saneamiento BPA",
        "La Esperanza",
        "18/07/2026",
        "Brucelosis",
        "120",
        "Programada",
      ],
      [
        "Tricho/Campy",
        "Los Aromos",
        "22/07/2026",
        "Tricomoniasis",
        "35",
        "Pendiente",
      ],
      [
        "Control anual",
        "El Ombú",
        "29/07/2026",
        "Brucelosis",
        "86",
        "Borrador",
      ],
    ],
  },
  sanidad: {
    eyebrow: "GRANDES ANIMALES",
    title: "Historial sanitario",
    description: "Consultá trabajos, diagnósticos y resultados históricos.",
    action: "Exportar historial",
    stats: [
      ["Trabajos", "128", "registrados"],
      ["Muestras", "3.842", "procesadas"],
      ["Positivos", "42", "1,1%"],
      ["Productores", "32", "vinculados"],
    ],
    columns: [
      "Fecha",
      "Productor",
      "Establecimiento",
      "Análisis",
      "Resultado",
      "Laboratorio",
    ],
    rows: [
      [
        "09/07/2026",
        "Est. La Esperanza",
        "La Esperanza",
        "Brucelosis",
        "93 negativos",
        "Regional Sur",
      ],
      [
        "06/07/2026",
        "Los Aromos S.A.",
        "Los Aromos",
        "Tricho/Campy",
        "En proceso",
        "Lab Azul",
      ],
    ],
  },
  renspa: {
    eyebrow: "GRANDES ANIMALES",
    title: "RENSPA",
    description: "Buscá y administrá los RENSPA utilizados con frecuencia.",
    action: "Agregar RENSPA",
    stats: [
      ["Registrados", "39", "activos"],
      ["Verificados", "36", "92%"],
      ["Pendientes", "3", "por revisar"],
      ["Usados este mes", "12", "establecimientos"],
    ],
    columns: [
      "RENSPA",
      "Establecimiento",
      "Productor",
      "Localidad",
      "Especie",
      "Último uso",
    ],
    rows: [
      [
        "01.023.0.12345/00",
        "La Esperanza",
        "Est. La Esperanza",
        "Azul",
        "Bovino",
        "09/07/2026",
      ],
      [
        "01.017.0.55421/00",
        "Los Aromos",
        "Los Aromos S.A.",
        "Tandil",
        "Bovino",
        "06/07/2026",
      ],
    ],
  },
  "agenda-rural": {
    eyebrow: "GRANDES ANIMALES",
    title: "Agenda rural",
    description: "Visitas a campo y trabajos programados.",
    action: "Nueva visita",
    stats: [
      ["Esta semana", "8", "visitas"],
      ["Hoy", "2", "trabajos"],
      ["Pendientes", "4", "confirmaciones"],
      ["Kilómetros", "286", "estimados"],
    ],
    columns: [
      "Fecha y hora",
      "Productor",
      "Establecimiento",
      "Trabajo",
      "Localidad",
      "Estado",
    ],
    rows: [
      [
        "15/07 · 08:30",
        "Est. La Esperanza",
        "La Esperanza",
        "Sangrado BPA",
        "Azul",
        "Confirmado",
      ],
      [
        "15/07 · 15:00",
        "Los Aromos S.A.",
        "Los Aromos",
        "Revisación toros",
        "Tandil",
        "Confirmado",
      ],
    ],
  },
  pacientes: {
    eyebrow: "PEQUEÑOS ANIMALES",
    title: "Pacientes",
    description: "Fichas de pacientes y datos de sus propietarios.",
    action: "Nuevo paciente",
    stats: [
      ["Pacientes activos", "86", "12 nuevos"],
      ["Caninos", "62", "72%"],
      ["Felinos", "24", "28%"],
      ["Consultas", "143", "últimos 90 días"],
    ],
    columns: [
      "Paciente",
      "Especie",
      "Raza",
      "Edad",
      "Propietario",
      "Teléfono",
      "Última consulta",
    ],
    rows: [
      [
        "Mora",
        "Canino",
        "Labrador",
        "6 años",
        "Lucía Pérez",
        "2494 555-120",
        "13/07/2026",
      ],
      [
        "Simón",
        "Felino",
        "Europeo",
        "3 años",
        "Martín López",
        "2494 555-843",
        "12/07/2026",
      ],
      [
        "Frida",
        "Canino",
        "Mestiza",
        "9 años",
        "Ana Silva",
        "2494 555-311",
        "10/07/2026",
      ],
    ],
  },
  historia: {
    eyebrow: "PEQUEÑOS ANIMALES",
    title: "Historia clínica",
    description: "Evoluciones, diagnósticos y tratamientos por paciente.",
    action: "Nueva entrada",
    stats: [
      ["Entradas", "412", "históricas"],
      ["Este mes", "34", "consultas"],
      ["Tratamientos", "11", "activos"],
      ["Controles", "8", "pendientes"],
    ],
    columns: [
      "Fecha",
      "Paciente",
      "Motivo",
      "Diagnóstico",
      "Tratamiento",
      "Profesional",
    ],
    rows: [
      [
        "13/07/2026",
        "Mora",
        "Control anual",
        "Paciente sana",
        "Plan sanitario",
        "Dr. Sondon",
      ],
      [
        "12/07/2026",
        "Simón",
        "Dermatitis",
        "Alergia alimentaria",
        "Dieta y control",
        "Dr. Sondon",
      ],
    ],
  },
  vacunas: {
    eyebrow: "PEQUEÑOS ANIMALES",
    title: "Vacunas",
    description: "Aplicaciones realizadas y próximos vencimientos.",
    action: "Registrar vacuna",
    stats: [
      ["Aplicadas", "124", "este año"],
      ["Vencen este mes", "9", "recordatorios"],
      ["Caninos", "82", "66%"],
      ["Felinos", "42", "34%"],
    ],
    columns: [
      "Paciente",
      "Vacuna",
      "Aplicación",
      "Próxima dosis",
      "Propietario",
      "Estado",
    ],
    rows: [
      ["Mora", "Séxtuple", "13/07/2026", "13/07/2027", "Lucía Pérez", "Al día"],
      [
        "Simón",
        "Triple felina",
        "02/02/2026",
        "02/02/2027",
        "Martín López",
        "Al día",
      ],
    ],
  },
  desparasitaciones: {
    eyebrow: "PEQUEÑOS ANIMALES",
    title: "Desparasitaciones",
    description: "Control interno y externo de cada paciente.",
    action: "Registrar aplicación",
    stats: [
      ["Aplicadas", "98", "este año"],
      ["Próximas", "7", "este mes"],
      ["Internas", "64", "registros"],
      ["Externas", "34", "registros"],
    ],
    columns: [
      "Paciente",
      "Producto",
      "Tipo",
      "Última aplicación",
      "Próxima",
      "Estado",
    ],
    rows: [
      ["Mora", "Total Full", "Interna", "15/04/2026", "15/07/2026", "Próxima"],
      ["Frida", "Bravecto", "Externa", "10/05/2026", "10/08/2026", "Al día"],
    ],
  },
  estudios: {
    eyebrow: "PEQUEÑOS ANIMALES",
    title: "Estudios",
    description: "Solicitudes, archivos y resultados diagnósticos.",
    action: "Nuevo estudio",
    stats: [
      ["Estudios", "76", "este año"],
      ["Pendientes", "5", "resultados"],
      ["Laboratorio", "48", "análisis"],
      ["Imágenes", "28", "estudios"],
    ],
    columns: [
      "Fecha",
      "Paciente",
      "Estudio",
      "Laboratorio",
      "Resultado",
      "Archivo",
    ],
    rows: [
      [
        "12/07/2026",
        "Simón",
        "Hemograma",
        "Regional Sur",
        "Recibido",
        "Ver PDF",
      ],
      [
        "10/07/2026",
        "Frida",
        "Ecografía abdominal",
        "Vet Imagen",
        "Pendiente",
        "—",
      ],
    ],
  },
  recordatorios: {
    eyebrow: "PEQUEÑOS ANIMALES",
    title: "Recordatorios",
    description: "Seguimientos, vacunas y controles próximos.",
    action: "Nuevo recordatorio",
    stats: [
      ["Pendientes", "14", "tareas"],
      ["Hoy", "3", "avisos"],
      ["WhatsApp", "5", "por enviar"],
      ["Completados", "28", "este mes"],
    ],
    columns: ["Fecha", "Paciente", "Propietario", "Motivo", "Canal", "Estado"],
    rows: [
      [
        "15/07/2026",
        "Mora",
        "Lucía Pérez",
        "Control anual",
        "WhatsApp",
        "Pendiente",
      ],
      [
        "18/07/2026",
        "Simón",
        "Martín López",
        "Control dermatológico",
        "Teléfono",
        "Programado",
      ],
    ],
  },
  "agenda-clinica": {
    eyebrow: "PEQUEÑOS ANIMALES",
    title: "Agenda clínica",
    description: "Consultas y procedimientos de pequeños animales.",
    action: "Nuevo turno",
    stats: [
      ["Turnos hoy", "6", "consultas"],
      ["Disponibles", "3", "horarios"],
      ["Confirmados", "5", "pacientes"],
      ["Urgencias", "1", "atendida"],
    ],
    columns: [
      "Hora",
      "Paciente",
      "Propietario",
      "Motivo",
      "Duración",
      "Estado",
    ],
    rows: [
      ["09:00", "Mora", "Lucía Pérez", "Control anual", "30 min", "Confirmado"],
      [
        "10:00",
        "Simón",
        "Martín López",
        "Control piel",
        "30 min",
        "Confirmado",
      ],
      ["11:30", "Frida", "Ana Silva", "Ecografía", "45 min", "Pendiente"],
    ],
  },
  turnos: {
    eyebrow: "AGENDA",
    title: "Turnos",
    description: "Todos los compromisos del consultorio en una sola agenda.",
    action: "Nuevo turno",
    stats: [
      ["Hoy", "8", "actividades"],
      ["Grandes animales", "2", "visitas"],
      ["Pequeños animales", "6", "consultas"],
      ["Pendientes", "2", "confirmaciones"],
    ],
    columns: [
      "Fecha",
      "Hora",
      "Tipo",
      "Cliente / paciente",
      "Actividad",
      "Estado",
    ],
    rows: [
      [
        "15/07/2026",
        "08:30",
        "Grandes animales",
        "Est. La Esperanza",
        "Sangrado BPA",
        "Confirmado",
      ],
      [
        "15/07/2026",
        "09:00",
        "Pequeños animales",
        "Mora · Lucía Pérez",
        "Control anual",
        "Confirmado",
      ],
      [
        "15/07/2026",
        "15:00",
        "Grandes animales",
        "Los Aromos",
        "Revisación toros",
        "Confirmado",
      ],
    ],
  },
};

type StockItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
  lot?: string;
  expiration?: string;
};

const STOCK_CATEGORIES = [
  "Vacuna",
  "Medicamento",
  "Antiparasitario",
  "Insumo",
  "Alimentos",
  "Descartables",
  "Pet Shop",
  "Otro",
];

function stockExpiration(item: StockItem) {
  if (!item.expiration) return { label: "Sin vencimiento", kind: "neutral" };
  if (!item.lot) return { label: "Falta lote", kind: "invalid" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const shown = displayDate(item.expiration);
  if (!isValidDate(shown)) return { label: "Fecha inválida", kind: "invalid" };
  const expiration = new Date(`${dateToIso(shown)}T12:00:00`);
  const days = Math.ceil(
    (expiration.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0) return { label: "Vencido", kind: "expired" };
  if (days === 0) return { label: "Vence hoy", kind: "expired" };
  if (days <= 30) return { label: `Vence en ${days} días`, kind: "warning" };
  return { label: "Vigente", kind: "ok" };
}

function StockPanel({
  items,
  setItems,
  stockCategories,
  setStockCategories,
  uid,
}: {
  items: StockItem[];
  setItems: React.Dispatch<React.SetStateAction<StockItem[]>>;
  stockCategories: string[];
  setStockCategories: React.Dispatch<React.SetStateAction<string[]>>;
  uid: string;
}) {
  const [showNew, setShowNew] = useState(false);
  const [showCategory, setShowCategory] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [percentage, setPercentage] = useState("");
  const [roundMultiple, setRoundMultiple] = useState("100");
  const [confirmIncrease, setConfirmIncrease] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [newItemError, setNewItemError] = useState("");
  const [increaseScope, setIncreaseScope] = useState<"all" | "filtered">("all");
  const categories = [
    ...new Set([
      ...STOCK_CATEGORIES,
      ...stockCategories,
      ...items.map((item) => item.category),
    ]),
  ];
  const expiring = items.filter(
    (item) => stockExpiration(item).kind === "warning",
  );
  const expired = items.filter(
    (item) => stockExpiration(item).kind === "expired",
  );
  const lowStock = items.filter(
    (item) => item.quantity === 1 || item.quantity === 2,
  );
  const stockPanelRef = useRef<HTMLElement>(null);
  const visible = items.filter((item) => {
    const expiration = stockExpiration(item).kind;
    const matchesStatus =
      !status ||
      (status === "low" && (item.quantity === 1 || item.quantity === 2)) ||
      (status === "expiring" && expiration === "warning") ||
      (status === "expired" && expiration === "expired") ||
      (status === "available" && item.quantity > 0);
    return (
      (!search || item.name.toLowerCase().includes(search.toLowerCase())) &&
      (!category || item.category === category) &&
      matchesStatus
    );
  });

  function changeLocal(id: string, patch: Partial<StockItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }
  function filterFromAlert(nextStatus: "low" | "expiring" | "expired") {
    setSearch("");
    setCategory("");
    setStatus(nextStatus);
    requestAnimationFrame(() =>
      stockPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }
  async function persist(id: string) {
    const item = items.find((current) => current.id === id);
    if (!item) return;
    try {
      await saveStockItem(uid, item);
    } catch {
      setNotice("No pudimos guardar el cambio. Intentá nuevamente.");
    }
  }
  async function changeQuantity(item: StockItem, amount: number) {
    const updated = { ...item, quantity: Math.max(0, item.quantity + amount) };
    changeLocal(item.id, { quantity: updated.quantity });
    try {
      await saveStockItem(uid, updated);
    } catch {
      setNotice("No pudimos actualizar el stock.");
    }
  }
  async function addItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const item: StockItem = {
      id: crypto.randomUUID(),
      name: String(form.get("name")),
      category: String(form.get("category")),
      price: Number(form.get("price")) || 0,
      quantity: Number(form.get("quantity")) || 0,
      lot: String(form.get("lot") || "").trim() || undefined,
      expiration: String(form.get("expiration")) || undefined,
    };
    if (item.expiration && !item.lot) {
      setNewItemError(
        "Para cargar un vencimiento también tenés que indicar el lote.",
      );
      return;
    }
    try {
      await saveStockItem(uid, item);
      setItems((current) => [item, ...current]);
      setShowNew(false);
      setNewItemError("");
      setNotice("Producto agregado correctamente.");
    } catch {
      setNotice("No pudimos guardar el producto.");
    }
  }
  async function applyIncrease() {
    const value = Number(percentage);
    if (!value || value <= 0) return;
    const filteredIds = new Set(visible.map((item) => item.id));
    const multiple = Number(roundMultiple) || 0;
    const updated = items.map((item) =>
      increaseScope === "all" || filteredIds.has(item.id)
        ? {
            ...item,
            price: multiple
              ? Math.ceil((item.price * (1 + value / 100)) / multiple) *
                multiple
              : Math.round(item.price * (1 + value / 100) * 100) / 100,
          }
        : item,
    );
    const changed = updated.filter(
      (item) => increaseScope === "all" || filteredIds.has(item.id),
    );
    try {
      await Promise.all(changed.map((item) => saveStockItem(uid, item)));
      setItems(updated);
      setPercentage("");
      setConfirmIncrease(false);
      setNotice(
        `Precios actualizados un ${value}% en ${changed.length} productos.`,
      );
    } catch {
      setNotice("No pudimos actualizar todos los precios.");
    }
  }
  async function duplicateItem(item: StockItem) {
    const copy: StockItem = {
      ...item,
      id: crypto.randomUUID(),
      name: `${item.name} - copia`,
      quantity: 0,
      lot: undefined,
      expiration: undefined,
    };
    try {
      await saveStockItem(uid, copy);
      setItems((current) => [copy, ...current]);
      setNotice(
        "Producto duplicado. Ya podés cambiar la presentación o el lote.",
      );
    } catch {
      setNotice("No pudimos duplicar el producto.");
    }
  }
  function exportExcel() {
    const rows = visible.map((item) => ({
      Producto: item.name,
      Categoría: item.category,
      Lote: item.lot || "",
      Precio: item.price,
      Stock: item.quantity,
      Vencimiento: displayDate(item.expiration || ""),
      Estado: item.quantity === 0 ? "Sin stock" : stockExpiration(item).label,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(rows),
      "Stock",
    );
    XLSX.writeFile(
      workbook,
      `LabOVet_stock_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }
  async function exportPdf() {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const document = new jsPDF({ orientation: "landscape" });
    document.setTextColor(18, 62, 77);
    document.setFontSize(18);
    document.text("LabOVet - Lista de precios y stock", 14, 16);
    document.setFontSize(9);
    document.setTextColor(95, 115, 123);
    document.text(
      `Generado el ${new Date().toLocaleDateString("es-AR")}`,
      14,
      23,
    );
    autoTable(document, {
      startY: 29,
      head: [
        [
          "Producto",
          "Categoria",
          "Lote",
          "Precio",
          "Stock",
          "Vencimiento",
          "Estado",
        ],
      ],
      body: visible.map((item) => [
        item.name,
        item.category,
        item.lot || "-",
        `$ ${item.price.toLocaleString("es-AR")}`,
        String(item.quantity),
        displayDate(item.expiration || "-") || "-",
        item.quantity === 0 ? "Sin stock" : stockExpiration(item).label,
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [20, 112, 92], textColor: 255 },
      alternateRowStyles: { fillColor: [244, 249, 247] },
    });
    document.save(`LabOVet_stock_${new Date().toISOString().slice(0, 10)}.pdf`);
  }
  async function addCategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("categoryName") || "").trim();
    if (!name || categories.some((item) => norm(item) === norm(name))) {
      setNotice("Esa categoría ya existe o no es válida.");
      return;
    }
    try {
      await saveStockCategory(uid, { id: crypto.randomUUID(), name });
      setStockCategories((current) => [...current, name]);
      setShowCategory(false);
      setNotice("Categoría agregada correctamente.");
    } catch {
      setNotice("No pudimos guardar la categoría.");
    }
  }
  async function removeItem() {
    if (!deleteId) return;
    try {
      await deleteStockItem(uid, deleteId);
      setItems((current) => current.filter((item) => item.id !== deleteId));
      setDeleteId(null);
      setNotice("Producto eliminado.");
    } catch {
      setNotice("No pudimos eliminar el producto.");
    }
  }

  return (
    <>
      <header className="topbar module-topbar">
        <div>
          <span className="eyebrow">GESTIÓN COMERCIAL</span>
          <h1>Lista de precios / Stock</h1>
          <p>Precios, existencias y vencimientos en un solo lugar.</p>
        </div>
        <button className="primary" onClick={() => setShowNew(true)}>
          ＋ Nuevo producto
        </button>
      </header>
      <div className="module-stats stock-stats">
        <button
          type="button"
          className={`panel stat-card stock-alert ${lowStock.length ? "has-alert" : ""} ${status === "low" ? "selected" : ""}`}
          onClick={() => filterFromAlert("low")}
        >
          <span>Alerta de stock bajo</span>
          <strong>{lowStock.length}</strong>
          <small>productos con 1 o 2 unidades</small>
        </button>
        <button
          type="button"
          className={`panel stat-card stock-alert ${expiring.length ? "has-alert" : ""} ${status === "expiring" ? "selected" : ""}`}
          onClick={() => filterFromAlert("expiring")}
        >
          <span>Vencimientos próximos</span>
          <strong>{expiring.length}</strong>
          <small>lotes vencen en los próximos 30 días</small>
        </button>
        <button
          type="button"
          className={`panel stat-card stock-alert ${expired.length ? "has-alert" : ""} ${status === "expired" ? "selected" : ""}`}
          onClick={() => filterFromAlert("expired")}
        >
          <span>Productos vencidos</span>
          <strong>{expired.length}</strong>
          <small>requieren revisión inmediata</small>
        </button>
      </div>
      {notice && (
        <div className="stock-notice">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      <section ref={stockPanelRef} className="panel stock-panel">
        <div className="stock-toolbar">
          <div>
            <h2>Productos y medicamentos</h2>
            <p>
              Editá cualquier celda y el cambio se guardará automáticamente.
            </p>
          </div>
          <div className="price-increase">
            <label>
              Aumento general
              <span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="10"
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value)}
                />
                <i>%</i>
              </span>
            </label>
            <select
              className="increase-scope"
              value={increaseScope}
              onChange={(event) =>
                setIncreaseScope(event.target.value as "all" | "filtered")
              }
            >
              <option value="all">Todos los productos</option>
              <option value="filtered">
                Solo los filtrados ({visible.length})
              </option>
            </select>
            <select
              className="increase-scope rounding-select"
              value={roundMultiple}
              onChange={(event) => setRoundMultiple(event.target.value)}
              title="Redondeo de precios"
            >
              <option value="0">Sin redondeo</option>
              <option value="10">Redondear a $10</option>
              <option value="50">Redondear a $50</option>
              <option value="100">Redondear a $100</option>
              <option value="500">Redondear a $500</option>
            </select>
            <button
              className="outline-btn"
              disabled={!Number(percentage)}
              onClick={() => setConfirmIncrease(true)}
            >
              {increaseScope === "all"
                ? "Aplicar a todos"
                : "Aplicar al filtro"}
            </button>
          </div>
        </div>
        <div className="stock-actions-bar">
          <span />
          <button
            className="outline-btn"
            onClick={exportExcel}
            disabled={!visible.length}
          >
            ↓ Exportar Excel
          </button>
          <button
            className="outline-btn"
            onClick={exportPdf}
            disabled={!visible.length}
          >
            ↓ Exportar PDF
          </button>
        </div>
        <div className="stock-filters">
          <label>
            <span>Buscar</span>
            <input
              placeholder="Producto o medicamento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            <span>Categoría</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Todas</option>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Estado</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="available">Con stock</option>
              <option value="low">Stock bajo</option>
              <option value="expiring">Próximos a vencer</option>
              <option value="expired">Vencidos</option>
            </select>
          </label>
        </div>
        <div className="stock-table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Lote</th>
                <th>Vencimiento</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const expiration = stockExpiration(item);
                return (
                  <tr key={item.id}>
                    <td>
                      <input
                        value={item.name}
                        onChange={(e) =>
                          changeLocal(item.id, { name: e.target.value })
                        }
                        onBlur={() => persist(item.id)}
                      />
                    </td>
                    <td>
                      <select
                        value={item.category}
                        onChange={(e) => {
                          const updated = { ...item, category: e.target.value };
                          changeLocal(item.id, { category: e.target.value });
                          saveStockItem(uid, updated).catch(() =>
                            setNotice("No pudimos actualizar la categoría."),
                          );
                        }}
                      >
                        {categories.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </td>
                    <td className="stock-price">
                      <span>$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.price}
                        onChange={(e) =>
                          changeLocal(item.id, {
                            price: Number(e.target.value),
                          })
                        }
                        onBlur={() => persist(item.id)}
                      />
                    </td>
                    <td>
                      <div className="stock-stepper">
                        <button onClick={() => changeQuantity(item, -1)}>
                          −
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={item.quantity}
                          onChange={(e) =>
                            changeLocal(item.id, {
                              quantity: Math.max(0, Number(e.target.value)),
                            })
                          }
                          onBlur={() => persist(item.id)}
                        />
                        <button onClick={() => changeQuantity(item, 1)}>
                          ＋
                        </button>
                      </div>
                    </td>
                    <td>
                      <input
                        value={item.lot || ""}
                        placeholder="Opcional"
                        onChange={(event) =>
                          changeLocal(item.id, {
                            lot: event.target.value || undefined,
                          })
                        }
                        onBlur={() => persist(item.id)}
                      />
                    </td>
                    <td>
                      <DateField
                        value={item.expiration || ""}
                        onChange={(value) => {
                          changeLocal(item.id, {
                            expiration: value || undefined,
                          });
                        }}
                        onBlur={() => persist(item.id)}
                      />
                    </td>
                    <td>
                      <span className={`stock-status ${expiration.kind}`}>
                        {item.quantity === 0 ? "Sin stock" : expiration.label}
                      </span>
                    </td>
                    <td>
                      <div className="stock-row-actions">
                        <button
                          title="Duplicar producto"
                          onClick={() => duplicateItem(item)}
                        >
                          ⧉
                        </button>
                        <button
                          className="stock-delete"
                          title="Eliminar producto"
                          onClick={() => setDeleteId(item.id)}
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visible.length && (
            <div className="empty-agenda">
              <b>
                {items.length
                  ? "No hay coincidencias"
                  : "Todavía no hay productos"}
              </b>
              <span>
                {items.length
                  ? "Probá quitando alguno de los filtros."
                  : "Agregá el primer producto para comenzar a controlar el stock."}
              </span>
            </div>
          )}
        </div>
      </section>
      {showNew && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={addItem}>
            <div>
              <h2>Nuevo producto</h2>
              <button type="button" onClick={() => setShowNew(false)}>
                ×
              </button>
            </div>
            <p>
              Ingresá los datos iniciales. Después podrás editarlos en la tabla.
            </p>
            <label>
              Producto o medicamento
              <input name="name" required autoFocus />
            </label>
            <div className="form-grid">
              <label>
                <span className="field-label-actions">
                  <span>Categoría</span>
                  <button type="button" onClick={() => setShowCategory(true)}>
                    ＋ Agregar
                  </button>
                </span>
                <select name="category" required defaultValue="Medicamento">
                  {categories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Precio
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Cantidad inicial
                <input name="quantity" type="number" min="0" required />
              </label>
              <label>
                Lote (opcional)
                <input name="lot" />
              </label>
              <label>
                Vencimiento (opcional)
                <DateField name="expiration" />
              </label>
            </div>
            {newItemError && <p className="form-error">{newItemError}</p>}
            <footer>
              <button
                type="button"
                className="ghost"
                onClick={() => setShowNew(false)}
              >
                Cancelar
              </button>
              <button className="primary">Guardar producto</button>
            </footer>
          </form>
        </div>
      )}
      {showCategory && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={addCategory}>
            <div>
              <h2>Nueva categoría</h2>
              <button type="button" onClick={() => setShowCategory(false)}>
                ×
              </button>
            </div>
            <p>La categoría quedará disponible para todos tus productos.</p>
            <label>
              Nombre de la categoría
              <input name="categoryName" required autoFocus />
            </label>
            <footer>
              <button
                type="button"
                className="ghost"
                onClick={() => setShowCategory(false)}
              >
                Cancelar
              </button>
              <button className="primary">Guardar categoría</button>
            </footer>
          </form>
        </div>
      )}
      {confirmIncrease && (
        <div className="modal-backdrop">
          <section className="modal-card feedback-modal">
            <div>
              <h2>Actualizar precios</h2>
              <button onClick={() => setConfirmIncrease(false)}>×</button>
            </div>
            <span className="feedback-icon">%</span>
            <h3>
              ¿Aumentar{" "}
              {increaseScope === "all"
                ? "todos los precios"
                : "los precios filtrados"}{" "}
              un {percentage}%?
            </h3>
            <p>
              Se actualizarán{" "}
              {increaseScope === "all" ? items.length : visible.length}{" "}
              productos. Luego podrás corregir cualquier precio desde la tabla.
            </p>
            <footer>
              <button
                className="ghost"
                onClick={() => setConfirmIncrease(false)}
              >
                Cancelar
              </button>
              <button className="primary" onClick={applyIncrease}>
                Aplicar aumento
              </button>
            </footer>
          </section>
        </div>
      )}
      {deleteId && (
        <div className="modal-backdrop">
          <section className="modal-card feedback-modal">
            <div>
              <h2>Eliminar producto</h2>
              <button onClick={() => setDeleteId(null)}>×</button>
            </div>
            <span className="feedback-icon danger">!</span>
            <h3>¿Eliminar este producto de la lista?</h3>
            <p>Esta acción no se puede deshacer.</p>
            <footer>
              <button className="ghost" onClick={() => setDeleteId(null)}>
                Cancelar
              </button>
              <button className="danger-button" onClick={removeItem}>
                Eliminar
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

function HomeDashboard({
  producers,
  patients,
  onNavigate,
  access,
}: {
  producers: Producer[];
  patients: Patient[];
  onNavigate: (view: ViewKey) => void;
  access: UserAccess;
}) {
  const today = localIsoDate();
  const todayReminders = patients.flatMap((patient) =>
    patient.events
      .filter((event) => event.nextDate && dateToIso(displayDate(event.nextDate)) === today)
      .map((event) => ({ patient, event })),
  );
  const pendingRural = producers.flatMap((producer) => producer.works).filter(
    (work) => dateToIso(displayDate(work.date)) > today,
  ).length;
  const allReminders = patients.flatMap((patient) => patient.events).filter((event) => event.nextDate).length;
  const sigatmWorks = producers.flatMap((producer) => producer.works).filter(
    (work) =>
      isSigatmEligibleWork(work) && work.records?.length,
  );
  const pendingSigatm = sigatmWorks.filter((work) => (work.sigatmStatus || "Pendiente") === "Pendiente").length;
  return (
    <>
      <header className="topbar dashboard-header">
        <div><span className="eyebrow">RESUMEN DE HOY</span><h1>Inicio</h1><p>Todo lo importante de tu actividad veterinaria en un solo lugar.</p></div>
      </header>
      <section className={`panel dashboard-alerts ${todayReminders.length ? "has-alerts" : ""}`}>
        <div className="dashboard-section-head">
          <div><span>AVISOS</span><h2>Recordatorios para hoy</h2><p>{todayReminders.length ? `${todayReminders.length} actividades requieren atención.` : "No tenés recordatorios pendientes para hoy."}</p></div>
          <button onClick={() => onNavigate("recordatorios")}>Ver recordatorios →</button>
        </div>
        {todayReminders.slice(0, 4).map(({ patient, event }) => (
          <article key={`${patient.id}-${event.id || event.detail}`}>
            <span className="patient-avatar">{patient.name.slice(0, 2).toUpperCase()}</span>
            <div><b>{patient.name}</b><small>{patient.owner}</small></div>
            <div><b>{event.detail}</b><small>{event.type}</small></div>
            <button onClick={() => openReminderWhatsApp(patient, event)}>Enviar WhatsApp</button>
          </article>
        ))}
      </section>
      <div className="dashboard-sections">
        {access.permissions.largeAnimals && <button className="panel dashboard-module large" onClick={() => onNavigate("productores")}>
          <span>GRANDES ANIMALES</span><h2>{producers.length} productores</h2><p>{pendingRural} trabajos próximos o pendientes</p><i>Ir al panel →</i>
        </button>}
        {access.permissions.smallAnimals && <button className="panel dashboard-module small" onClick={() => onNavigate("pacientes")}>
          <span>PEQUEÑOS ANIMALES</span><h2>{patients.length} pacientes</h2><p>{allReminders} recordatorios programados</p><i>Ir al panel →</i>
        </button>}
        {access.permissions.sigatm && <button className="panel dashboard-module sigatm" onClick={() => onNavigate("sigatm")}>
          <span>SIGATM</span><h2>{pendingSigatm} pendientes</h2><p>{sigatmWorks.length} trabajos disponibles</p><i>Abrir conversor →</i>
        </button>}
      </div>
    </>
  );
}

function ModuleView({
  view,
  producers,
  setProducers,
  patients,
  setPatients,
  stockItems,
  setStockItems,
  stockCategories,
  setStockCategories,
  uid,
  onNavigate,
  access,
  sigatmCatalog,
  userName,
  userEmail,
}: {
  view: Exclude<ViewKey, "sigatm">;
  producers: Producer[];
  setProducers: React.Dispatch<React.SetStateAction<Producer[]>>;
  patients: Patient[];
  setPatients: React.Dispatch<React.SetStateAction<Patient[]>>;
  stockItems: StockItem[];
  setStockItems: React.Dispatch<React.SetStateAction<StockItem[]>>;
  stockCategories: string[];
  setStockCategories: React.Dispatch<React.SetStateAction<string[]>>;
  uid: string;
  onNavigate: (view: ViewKey) => void;
  access: UserAccess;
  sigatmCatalog: SigatmCatalog;
  userName: string;
  userEmail: string;
}) {
  if (view === "estadisticas")
    return (
      <HomeDashboard
        producers={producers}
        patients={patients}
        onNavigate={onNavigate}
        access={access}
      />
    );
  if (view === "planes")
    return (
      <SubscriptionPlans
        access={access}
        uid={uid}
        userName={userName}
        userEmail={userEmail}
      />
    );
  if (view === "admin") return <AdminUsersPanel currentUid={uid} />;
  if (view === "admin-sigatm")
    return <AdminSigatmCatalog currentUid={uid} />;
  if (view === "stock")
    return (
      <StockPanel
        items={stockItems}
        setItems={setStockItems}
        stockCategories={stockCategories}
        setStockCategories={setStockCategories}
        uid={uid}
      />
    );
  if (view === "productores")
    return (
      <ProducersPanel
        producers={producers}
        setProducers={setProducers}
        uid={uid}
        sigatmCatalog={sigatmCatalog}
      />
    );
  if (view === "agenda-rural") return <RuralAgenda producers={producers} />;
  if (view === "pacientes")
    return (
      <ClinicalPatientsPanel
        patients={patients}
        setPatients={setPatients}
        uid={uid}
      />
    );
  if (view === "recordatorios") return <ClinicalAgenda patients={patients} />;
  const data = VIEW_CONTENT[view];
  return (
    <>
      <header className="topbar module-topbar">
        <div>
          <span className="eyebrow">{data.eyebrow}</span>
          <h1>{data.title}</h1>
          <p>{data.description}</p>
        </div>
        <button className="primary">＋ {data.action}</button>
      </header>
      <div className="module-stats">
        {data.stats.map(([label, value, note]) => (
          <article className="panel stat-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <section className="panel module-table">
        <div className="module-toolbar">
          <div>
            <h2>
              {data.title}
            </h2>
            <p>Información de muestra para diseñar y validar esta sección.</p>
          </div>
          <label>
            ⌕ <input placeholder="Buscar..." />
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {data.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>
                      {j === row.length - 1 ? (
                        <span className="table-status">{cell}</span>
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="draft-note">
        <b>Primera maqueta navegable</b>
        <span>
          Estos datos son demostrativos. En los próximos pasos definiremos
          juntos formularios, acciones y qué información guardar en Firebase.
        </span>
      </div>
    </>
  );
}

function SubscriptionPlans({
  access,
  uid,
  userName,
  userEmail,
}: {
  access: UserAccess;
  uid: string;
  userName: string;
  userEmail: string;
}) {
  const [requestedPlan, setRequestedPlan] = useState("");
  const [requestStatus, setRequestStatus] = useState("");
  const [requesting, setRequesting] = useState("");
  const [requestFeedback, setRequestFeedback] = useState("");
  const [planToRequest, setPlanToRequest] = useState("");

  useEffect(() => {
    getDoc(doc(db, "subscriptionRequests", uid))
      .then((snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        setRequestedPlan(String(data.plan || ""));
        setRequestStatus(String(data.status || ""));
      })
      .catch(() => undefined);
  }, [uid]);

  const requestPlan = async (plan: string) => {
    setRequesting(plan);
    setRequestFeedback("");
    try {
      await setDoc(doc(db, "subscriptionRequests", uid), {
        userId: uid,
        name: userName,
        email: userEmail,
        plan,
        status: "pending",
        requestedAt: serverTimestamp(),
      });
      setRequestedPlan(plan);
      setRequestStatus("pending");
      setRequestFeedback("Solicitud enviada correctamente. Ya figura pendiente de aprobación.");
    } catch (error) {
      console.error("No pudimos solicitar el plan", error);
      const code = typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code || "")
        : "";
      setRequestFeedback(
        code.includes("permission-denied")
          ? "Firebase rechazó la solicitud por permisos. Publicá las reglas actualizadas de Firestore e intentá nuevamente."
          : "No pudimos enviar la solicitud. Revisá tu conexión e intentá nuevamente.",
      );
    } finally {
      setRequesting("");
    }
  };

  const planDetails: Record<string, { name: string; price: string }> = {
    small_animals: { name: "Pequeños animales", price: "$25.000 mensuales" },
    large_animals: { name: "Grandes animales", price: "$50.000 mensuales" },
    administrative_service: { name: "Servicio administrativo", price: "$150.000 mensuales" },
  };

  const confirmPlanRequest = async () => {
    if (!planToRequest) return;
    await requestPlan(planToRequest);
  };

  const planButtonLabel = (plan: string, label: string) =>
    requestedPlan === plan && requestStatus === "pending"
      ? "Solicitud enviada"
      : requesting === plan
        ? "Enviando…"
        : label;

  return (
    <>
      <header className="topbar module-topbar">
        <div>
          <span className="eyebrow">SUSCRIPCIONES</span>
          <h1>Elegí cómo usar LabOVet</h1>
          <p>
            Tres modalidades según el tipo de práctica y el nivel de
            acompañamiento.
          </p>
        </div>
      </header>
      <section className="panel current-plan-summary">
        <div>
          <span>PLAN ACTUAL</span>
          <strong>{access.planName}</strong>
          <small>Estado: {access.status === "active" ? "Activo" : access.status === "trial" ? "Período de prueba" : access.status === "pending" ? "Pendiente de activación" : access.status === "expired" ? "Vencido" : "Suspendido"}</small>
          {access.endsAt && <small>Vigente hasta: {access.endsAt}</small>}
        </div>
        {access.permissions.managedService && <b>Gestionado por LabOVet</b>}
      </section>
      <section className="plan-grid">
        <article className="panel plan-card">
          <span className="plan-tag">CLÍNICA</span>
          <h2>Pequeños animales</h2>
          <p>
            Para consultorios que trabajan con pacientes y no necesitan
            herramientas rurales.
          </p>
          <div className="plan-price">
            <strong>$25.000</strong>
            <small>Suscripción mensual</small>
          </div>
          <ul>
            <li>Pacientes y propietarios</li>
            <li>Historial sanitario y clínico</li>
            <li>Vacunas, desparasitaciones y estudios</li>
            <li>Agenda y recordatorios automáticos</li>
            <li>Lista de precios y stock</li>
            <li className="plan-locked">
              Grandes animales y SIGATM bloqueados
            </li>
          </ul>
          <button className="primary plan-action" onClick={() => { setRequestFeedback(""); setPlanToRequest("small_animals"); }} disabled={access.plan === "small_animals" || requesting !== "" || (requestedPlan === "small_animals" && requestStatus === "pending")}>
            {access.plan === "small_animals" ? "Plan actual" : planButtonLabel("small_animals", "Solicitar Pequeños animales")}
          </button>
        </article>
        <article className="panel plan-card recommended">
          <span className="plan-tag">AUTOGESTIÓN COMPLETA</span>
          <h2>Grandes animales</h2>
          <p>
            Para veterinarios que administran personalmente toda su actividad
            desde LabOVet.
          </p>
          <div className="plan-price">
            <strong>$50.000</strong>
            <small>Suscripción mensual</small>
          </div>
          <ul>
            <li>Productores y agenda rural</li>
            <li>Carga manual y mediante Excel</li>
            <li>Historial sanitario por animal</li>
            <li>Conversión y archivos SIGATM</li>
            <li>También incluye Pequeños animales</li>
          </ul>
          <button className="primary plan-action" onClick={() => { setRequestFeedback(""); setPlanToRequest("large_animals"); }} disabled={access.plan === "large_animals" || requesting !== "" || (requestedPlan === "large_animals" && requestStatus === "pending")}>
            {access.plan === "large_animals" ? "Plan actual" : planButtonLabel("large_animals", "Solicitar Grandes animales")}
          </button>
        </article>
        <article className="panel plan-card premium">
          <span className="plan-tag">SERVICIO ADMINISTRADO</span>
          <h2>Servicio administrativo</h2>
          <p>
            Para veterinarios que prefieren delegarnos la administración y carga
            del sistema.
          </p>
          <div className="plan-price">
            <strong>$150.000</strong>
            <small>Suscripción mensual</small>
          </div>
          <ul>
            <li>Acceso completo a LabOVet</li>
            <li>Carga de planillas y protocolos</li>
            <li>Organización de productores y pacientes</li>
            <li>Preparación de archivos para SIGATM</li>
            <li>Acompañamiento personalizado</li>
          </ul>
          <button className="primary plan-action" onClick={() => { setRequestFeedback(""); setPlanToRequest("administrative_service"); }} disabled={access.plan === "administrative_service" || requesting !== "" || (requestedPlan === "administrative_service" && requestStatus === "pending")}>
            {access.plan === "administrative_service" ? "Plan actual" : planButtonLabel("administrative_service", "Solicitar servicio administrativo")}
          </button>
        </article>
      </section>
      <section className="panel plan-note">
        <span>i</span>
        <div>
          <b>Modalidades iniciales de LabOVet</b>
          <p>
            La solicitud queda pendiente hasta que LabOVet revise y active el
            acceso desde el panel de administración.
          </p>
        </div>
      </section>
      {planToRequest && (
        <div className="modal-backdrop">
          <section className="modal-card feedback-modal subscription-request-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-request-title">
            <div>
              <h2 id="subscription-request-title">Solicitar plan</h2>
              <button type="button" aria-label="Cerrar" onClick={() => { if (!requesting) { setPlanToRequest(""); setRequestFeedback(""); } }}>×</button>
            </div>
            {requestFeedback ? (
              <>
                <span className={`feedback-icon ${requestStatus === "pending" && requestedPlan === planToRequest ? "success" : "danger"}`}>
                  {requestStatus === "pending" && requestedPlan === planToRequest ? "✓" : "!"}
                </span>
                <h3>{requestStatus === "pending" && requestedPlan === planToRequest ? "Solicitud enviada" : "No se pudo enviar"}</h3>
                <p>{requestFeedback}</p>
                <footer>
                  <button type="button" className="primary" onClick={() => { setPlanToRequest(""); setRequestFeedback(""); }}>Entendido</button>
                </footer>
              </>
            ) : (
              <>
                <span className="feedback-icon">i</span>
                <h3>{planDetails[planToRequest]?.name}</h3>
                <p>Vas a solicitar el plan <b>{planDetails[planToRequest]?.name}</b> por <b>{planDetails[planToRequest]?.price}</b>. La activación se realizará cuando LabOVet apruebe la solicitud.</p>
                <footer>
                  <button type="button" className="ghost" disabled={Boolean(requesting)} onClick={() => setPlanToRequest("")}>Cancelar</button>
                  <button type="button" className="primary" disabled={Boolean(requesting)} onClick={confirmPlanRequest}>{requesting ? "Enviando…" : "Confirmar solicitud"}</button>
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

type PatientEvent = {
  id?: string;
  date: string;
  type: string;
  detail: string;
  result: string;
  nextDate?: string;
  motive?: string;
  anamnesis?: string;
  clinicalExam?: string;
  presumptiveDiagnosis?: string;
  definitiveDiagnosis?: string;
  treatment?: string;
  observations?: string;
  weight?: string;
  temperature?: string;
  heartRate?: string;
  respiratoryRate?: string;
  bodyCondition?: string;
  hydration?: string;
  product?: string;
  dose?: string;
  studyType?: string;
  fileName?: string;
  procedureType?: string;
  procedure?: string;
  anesthesia?: string;
  hospitalizationReason?: string;
  dischargeDate?: string;
  dailyEvolution?: string;
  hospitalTreatments?: string;
  necropsyReason?: string;
  necropsyFindings?: string;
  causeOfDeath?: string;
};
type Patient = {
  id: number;
  name: string;
  species: string;
  breed: string;
  birth?: string;
  sex?: string;
  neutered?: string;
  approximateAge?: string;
  weight?: string;
  owner: string;
  phone: string;
  ownerAddress?: string;
  allergies?: string;
  previousConditions?: string;
  events: PatientEvent[];
};
const INITIAL_PATIENTS: Patient[] = [
  {
    id: 1,
    name: "Mora",
    species: "Canino",
    breed: "Labrador",
    birth: "2020-04-12",
    owner: "Lucía Pérez",
    phone: "2494 555-120",
    events: [
      {
        date: "13/07/2026",
        type: "Vacunación",
        detail: "Séxtuple",
        result: "Aplicada",
        nextDate: "2027-07-13",
      },
      {
        date: "15/04/2026",
        type: "Desparasitación",
        detail: "Antiparasitario interno",
        result: "Aplicado",
        nextDate: "2026-07-15",
      },
    ],
  },
  {
    id: 2,
    name: "Simón",
    species: "Felino",
    breed: "Europeo",
    birth: "2023-02-08",
    owner: "Martín López",
    phone: "2494 555-843",
    events: [
      {
        date: "12/07/2026",
        type: "Estudio",
        detail: "Hemograma",
        result: "Recibido",
      },
    ],
  },
];

function PatientsPanel({
  patients,
  setPatients,
  uid,
}: {
  patients: Patient[];
  setPatients: React.Dispatch<React.SetStateAction<Patient[]>>;
  uid: string;
}) {
  const [selected, setSelected] = useState<Patient | null>(null);
  const [newPatient, setNewPatient] = useState(false);
  const [newEvent, setNewEvent] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const addPatient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const patient: Patient = {
      id: Date.now(),
      name: String(f.get("name")),
      species: String(f.get("species")),
      breed: String(f.get("breed")),
      birth: String(f.get("birth")),
      owner: String(f.get("owner")),
      phone: String(f.get("phone")),
      events: [],
    };
    try {
      await savePatientData(uid, patient);
      setPatients((v) => [...v, patient]);
      setNewPatient(false);
      setSelected(null);
    } catch {
      window.alert("No pudimos guardar el paciente en Firebase.");
    }
  };
  const addEvent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    const event: PatientEvent = {
      date: String(f.get("date")).split("-").reverse().join("/"),
      type: String(f.get("type")),
      detail: String(f.get("detail")),
      result: String(f.get("result")),
      nextDate: String(f.get("nextDate") || "") || undefined,
    };
    try {
      await savePatientEvent(uid, selected.id, event);
      const updated = { ...selected, events: [event, ...selected.events] };
      setPatients((v) => v.map((p) => (p.id === updated.id ? updated : p)));
      setSelected(updated);
      setNewEvent(false);
    } catch {
      window.alert("No pudimos guardar el registro sanitario en Firebase.");
    }
  };
  const removePatient = async () => {
    if (!selected) return;
    try {
      await deletePatientData(uid, selected.id);
      setPatients((v) => v.filter((p) => p.id !== selected.id));
      setDeleteConfirm(false);
      setSelected(null);
    } catch {
      window.alert("No pudimos eliminar el paciente de Firebase.");
    }
  };
  return (
    <>
      {!selected ? (
        <>
          <header className="topbar module-topbar patient-list-header">
            <div>
              <span className="eyebrow">PEQUEÑOS ANIMALES</span>
              <h1>Pacientes</h1>
              <p>
                Fichas clínicas, propietarios e historial sanitario en un solo
                lugar.
              </p>
            </div>
            <button className="primary" onClick={() => setNewPatient(true)}>
              ＋ Nuevo paciente
            </button>
          </header>
          <div className="module-stats">
            <article className="panel stat-card">
              <span>Pacientes</span>
              <strong>{patients.length}</strong>
              <small>registrados</small>
            </article>
            <article className="panel stat-card">
              <span>Caninos</span>
              <strong>
                {patients.filter((p) => p.species === "Canino").length}
              </strong>
              <small>pacientes</small>
            </article>
            <article className="panel stat-card">
              <span>Felinos</span>
              <strong>
                {patients.filter((p) => p.species === "Felino").length}
              </strong>
              <small>pacientes</small>
            </article>
            <article className="panel stat-card">
              <span>Recordatorios</span>
              <strong>
                {
                  patients.flatMap((p) => p.events).filter((e) => e.nextDate)
                    .length
                }
              </strong>
              <small>generados automáticamente</small>
            </article>
          </div>
          <section className="panel patient-list">
            {patients.map((p) => (
              <button
                key={p.id}
                className="patient-row"
                onClick={() => setSelected(p)}
              >
                <span className="patient-avatar">
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <b>{p.name}</b>
                  <small>
                    {p.species} · {p.breed}
                  </small>
                </span>
                <span>
                  <b>{p.owner}</b>
                  <small>{p.phone}</small>
                </span>
                <span>
                  <b>{p.events.length}</b>
                  <small>eventos sanitarios</small>
                </span>
                <i>›</i>
              </button>
            ))}
          </section>
        </>
      ) : (
        <>
          <header className="topbar">
            <div>
              <button className="back-link" onClick={() => setSelected(null)}>
                ← Pacientes
              </button>
              <span className="eyebrow">{selected.species}</span>
              <h1>{selected.name}</h1>
              <p>
                {selected.breed} · Propietario: {selected.owner}
              </p>
            </div>
            <div className="header-actions">
              <button
                className="danger-outline"
                onClick={() => setDeleteConfirm(true)}
              >
                Eliminar paciente
              </button>
              <button className="primary" onClick={() => setNewEvent(true)}>
                ＋ Nuevo registro
              </button>
            </div>
          </header>
          <div className="producer-kpis">
            <article className="panel">
              <span>Eventos sanitarios</span>
              <strong>{selected.events.length}</strong>
              <small>historial completo</small>
            </article>
            <article className="panel">
              <span>Vacunas</span>
              <strong>
                {selected.events.filter((e) => e.type === "Vacunación").length}
              </strong>
              <small>aplicaciones</small>
            </article>
            <article className="panel">
              <span>Desparasitaciones</span>
              <strong>
                {
                  selected.events.filter((e) => e.type === "Desparasitación")
                    .length
                }
              </strong>
              <small>aplicaciones</small>
            </article>
            <article className="panel">
              <span>Recordatorios</span>
              <strong>
                {selected.events.filter((e) => e.nextDate).length}
              </strong>
              <small>próximas actividades</small>
            </article>
          </div>
          <section className="panel patient-history">
            <div className="module-toolbar">
              <div>
                <h2>Historial sanitario</h2>
                <p>Vacunas, desparasitaciones, estudios y consultas.</p>
              </div>
            </div>
            {selected.events.map((e, i) => (
              <article key={i}>
                <time>{e.date}</time>
                <div>
                  <b>{e.type}</b>
                  <span>{e.detail}</span>
                </div>
                <span>{e.result}</span>
                <small>
                  {e.nextDate
                    ? `Próximo: ${displayDate(e.nextDate)}`
                    : "Sin recordatorio"}
                </small>
              </article>
            ))}
          </section>
        </>
      )}
      {newPatient && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={addPatient}>
            <div>
              <h2>Nuevo paciente</h2>
              <button type="button" onClick={() => setNewPatient(false)}>
                ×
              </button>
            </div>
            <div className="form-grid">
              <label>
                Nombre
                <input name="name" required />
              </label>
              <label>
                Especie
                <select name="species">
                  <option>Canino</option>
                  <option>Felino</option>
                  <option>Otro</option>
                </select>
              </label>
              <label>
                Raza
                <input name="breed" />
              </label>
              <label>
                Fecha de nacimiento
                <DateField name="birth" />
              </label>
              <label>
                Propietario
                <input name="owner" required />
              </label>
              <label>
                Teléfono
                <input name="phone" />
              </label>
            </div>
            <footer>
              <button
                type="button"
                className="ghost"
                onClick={() => setNewPatient(false)}
              >
                Cancelar
              </button>
              <button className="primary">Guardar paciente</button>
            </footer>
          </form>
        </div>
      )}
      {newEvent && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={addEvent}>
            <div>
              <h2>Nuevo registro sanitario</h2>
              <button type="button" onClick={() => setNewEvent(false)}>
                ×
              </button>
            </div>
            <div className="form-grid">
              <label>
                Fecha
                <input name="date" type="date" required />
              </label>
              <label>
                Tipo
                <select name="type">
                  <option>Vacunación</option>
                  <option>Desparasitación</option>
                  <option>Estudio</option>
                  <option>Consulta</option>
                  <option>Cirugía</option>
                  <option>Otro</option>
                </select>
              </label>
              <label>
                Detalle
                <input name="detail" required />
              </label>
              <label>
                Resultado / estado
                <input name="result" required />
              </label>
              <label>
                Próximo recordatorio
                <DateField name="nextDate" />
              </label>
            </div>
            <footer>
              <button
                type="button"
                className="ghost"
                onClick={() => setNewEvent(false)}
              >
                Cancelar
              </button>
              <button className="primary">Guardar registro</button>
            </footer>
          </form>
        </div>
      )}
      {deleteConfirm && selected && (
        <div className="modal-backdrop">
          <section className="modal-card feedback-modal">
            <div>
              <h2>Eliminar paciente</h2>
              <button type="button" onClick={() => setDeleteConfirm(false)}>
                ×
              </button>
            </div>
            <span className="feedback-icon danger">!</span>
            <h3>¿Eliminar a {selected.name}?</h3>
            <p>
              También se eliminarán definitivamente todos sus registros
              sanitarios y recordatorios.
            </p>
            <footer>
              <button className="ghost" onClick={() => setDeleteConfirm(false)}>
                Cancelar
              </button>
              <button className="danger-button" onClick={removePatient}>
                Eliminar definitivamente
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

const CONSULTATION_MOTIVES = [
  "Control general",
  "Problema dermatológico",
  "Gastrointestinal",
  "Respiratorio",
  "Traumatismo / dolor",
  "Otología",
  "Oftalmología",
  "Seguimiento de tratamiento",
  "Otro",
];
const CLINICAL_RECORD_TYPES = [
  "Consulta",
  "Vacunación",
  "Desparasitación",
  "Estudio",
  "Cirugía",
  "Internación",
  "Autopsia / necropsia",
];
const CLINICAL_EVENT_MARKS: Record<string, string> = {
  Consulta: "+",
  Vacunación: "V",
  Desparasitación: "D",
  Estudio: "E",
  Cirugía: "C",
  Internación: "I",
  "Autopsia / necropsia": "N",
};
const clinicalEventMark = (type: string) => CLINICAL_EVENT_MARKS[type] || "+";
const clinicalEventClass = (type: string) =>
  norm(type).toLowerCase().replace(/[^a-z0-9]+/g, "-");

function ClinicalPatientsPanel({
  patients,
  setPatients,
  uid,
}: {
  patients: Patient[];
  setPatients: React.Dispatch<React.SetStateAction<Patient[]>>;
  uid: string;
}) {
  const [selected, setSelected] = useState<Patient | null>(null);
  const [newPatient, setNewPatient] = useState(false);
  const [newRecord, setNewRecord] = useState(false);
  const [editPatient, setEditPatient] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PatientEvent | null>(null);
  const [recordType, setRecordType] = useState("Consulta");
  const today = displayDate(localIsoDate());
  const [recordDate, setRecordDate] = useState(today);
  const [reminderDate, setReminderDate] = useState("");
  const [dischargeDate, setDischargeDate] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string | number>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const filteredPatients = patients.filter((patient) => {
    const query = norm(patientSearch);
    return !query || norm(patient.name).includes(query) || norm(patient.owner).includes(query);
  });

  async function addPatient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const patient: Patient = {
      id: Date.now(),
      name: String(form.get("name")),
      species: String(form.get("species")),
      breed: String(form.get("breed")),
      sex: String(form.get("sex")),
      neutered: String(form.get("neutered")),
      approximateAge: String(form.get("approximateAge")),
      weight: String(form.get("weight")),
      owner: String(form.get("owner")),
      phone: String(form.get("phone")),
      ownerAddress: String(form.get("ownerAddress")),
      allergies: String(form.get("allergies")),
      previousConditions: String(form.get("previousConditions")),
      events: [],
    };
    try {
      await savePatientData(uid, patient);
      setPatients((current) => [patient, ...current]);
      setSelected(patient);
      setNewPatient(false);
      setRecordDate(today);
      setReminderDate("");
      setDischargeDate("");
      setRecordType("Consulta");
      setNewRecord(true);
      setFeedback("Paciente creado. Completá ahora su primera consulta.");
    } catch {
      setFeedback("No pudimos guardar el paciente en Firebase.");
    }
  }

  async function addClinicalRecord(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const form = new FormData(e.currentTarget);
    const motive = String(form.get("motive") || "");
    const product = String(form.get("product") || "");
    const studyType = String(form.get("studyType") || "");
    const procedureType = String(form.get("procedureType") || "");
    const hospitalizationReason = String(
      form.get("hospitalizationReason") || "",
    );
    const necropsyReason = String(form.get("necropsyReason") || "");
    const detail =
      recordType === "Consulta"
        ? motive
        : recordType === "Estudio"
          ? studyType
          : recordType === "Cirugía"
            ? procedureType
            : recordType === "Internación"
              ? hospitalizationReason
              : recordType === "Autopsia / necropsia"
                ? necropsyReason
                : product;
    const defaultResult =
      recordType === "Consulta"
        ? "En seguimiento"
        : recordType === "Internación"
          ? dischargeDate
            ? "Alta registrada"
            : "En internación"
          : recordType === "Cirugía"
            ? "Procedimiento realizado"
            : recordType === "Autopsia / necropsia"
              ? "Informe registrado"
              : "Registrado";
    const event: PatientEvent = {
      id: editingEvent?.id,
      date: displayDate(String(form.get("date"))),
      type: recordType,
      detail: detail || recordType,
      result:
        String(form.get("result") || "") ||
        editingEvent?.result ||
        defaultResult,
      nextDate:
        recordType === "Autopsia / necropsia"
          ? undefined
          : String(form.get("nextDate") || "") || undefined,
      motive: motive || undefined,
      anamnesis: String(form.get("anamnesis") || "") || undefined,
      clinicalExam: String(form.get("clinicalExam") || "") || undefined,
      presumptiveDiagnosis:
        String(form.get("presumptiveDiagnosis") || "") || undefined,
      definitiveDiagnosis:
        String(form.get("definitiveDiagnosis") || "") || undefined,
      treatment: String(form.get("treatment") || "") || undefined,
      observations: String(form.get("observations") || "") || undefined,
      weight: String(form.get("weight") || "") || undefined,
      temperature: String(form.get("temperature") || "") || undefined,
      heartRate: String(form.get("heartRate") || "") || undefined,
      respiratoryRate:
        String(form.get("respiratoryRate") || "") || undefined,
      bodyCondition: String(form.get("bodyCondition") || "") || undefined,
      hydration: String(form.get("hydration") || "") || undefined,
      product: product || undefined,
      dose: String(form.get("dose") || "") || undefined,
      studyType: studyType || undefined,
      procedureType: procedureType || undefined,
      procedure: String(form.get("procedure") || "") || undefined,
      anesthesia: String(form.get("anesthesia") || "") || undefined,
      hospitalizationReason: hospitalizationReason || undefined,
      dischargeDate: dischargeDate || undefined,
      dailyEvolution: String(form.get("dailyEvolution") || "") || undefined,
      hospitalTreatments:
        String(form.get("hospitalTreatments") || "") || undefined,
      necropsyReason: necropsyReason || undefined,
      necropsyFindings:
        String(form.get("necropsyFindings") || "") || undefined,
      causeOfDeath: String(form.get("causeOfDeath") || "") || undefined,
    };
    try {
      await savePatientEvent(uid, selected.id, event);
      const nextEvents = editingEvent
        ? selected.events.map((current) =>
            current === editingEvent || (editingEvent.id && current.id === editingEvent.id)
              ? event
              : current,
          )
        : [event, ...selected.events];
      const updated = {
        ...selected,
        weight: event.weight || selected.weight,
        events: nextEvents,
      };
      if (event.weight) await savePatientData(uid, updated);
      setPatients((current) =>
        current.map((patient) =>
          patient.id === updated.id ? updated : patient,
        ),
      );
      setSelected(updated);
      setNewRecord(false);
      setEditingEvent(null);
      setRecordType("Consulta");
      setRecordDate(today);
      setReminderDate("");
      setDischargeDate("");
      setFeedback(editingEvent ? `${recordType} actualizada correctamente.` : `${recordType} registrada correctamente.`);
    } catch {
      setFeedback("No pudimos guardar el registro clínico.");
    }
  }

  function openNewRecord() {
    setEditingEvent(null);
    setRecordDate(today);
    setReminderDate("");
    setDischargeDate("");
    setRecordType("Consulta");
    setNewRecord(true);
  }

  function openEditRecord(event: PatientEvent) {
    setEditingEvent(event);
    setRecordType(event.type);
    setRecordDate(displayDate(event.date));
    setReminderDate(event.nextDate ? displayDate(event.nextDate) : "");
    setDischargeDate(
      event.dischargeDate ? displayDate(event.dischargeDate) : "",
    );
    setNewRecord(true);
  }

  function toggleEvent(key: string | number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setQuickReminder(days: number) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);
    setReminderDate(displayDate(localIsoDate(date)));
  }

  async function updatePatient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const form = new FormData(e.currentTarget);
    const updated: Patient = {
      ...selected,
      name: String(form.get("name")),
      species: String(form.get("species")),
      breed: String(form.get("breed")),
      sex: String(form.get("sex")),
      neutered: String(form.get("neutered")),
      approximateAge: String(form.get("approximateAge")),
      weight: String(form.get("weight")),
      owner: String(form.get("owner")),
      phone: String(form.get("phone")),
      ownerAddress: String(form.get("ownerAddress")),
      allergies: String(form.get("allergies")),
      previousConditions: String(form.get("previousConditions")),
    };
    try {
      await savePatientData(uid, updated);
      setPatients((current) =>
        current.map((patient) => patient.id === updated.id ? updated : patient),
      );
      setSelected(updated);
      setEditPatient(false);
      setFeedback("Ficha médica actualizada correctamente.");
    } catch {
      setFeedback("No pudimos actualizar la ficha médica.");
    }
  }

  async function createClinicalPdf(patient: Patient) {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF();
    const margin = 17;
    const width = pdf.internal.pageSize.getWidth() - margin * 2;
    let y = 18;
    const pageBreak = (needed = 15) => {
      if (y + needed > pdf.internal.pageSize.getHeight() - 16) {
        pdf.addPage();
        y = 18;
      }
    };
    const heading = (title: string) => {
      pageBreak(16);
      pdf.setTextColor(15, 116, 94);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(title, margin, y);
      y += 7;
    };
    const line = (label: string, value?: string) => {
      if (!value) return;
      pdf.setTextColor(38, 63, 72);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      const rows = pdf.splitTextToSize(`${label}: ${value}`, width);
      pageBreak(rows.length * 4.5 + 2);
      pdf.text(rows, margin, y);
      y += rows.length * 4.5 + 2;
    };
    pdf.setFillColor(18, 58, 74);
    pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), 35, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text("LabOVet - Historia clínica", margin, 17);
    pdf.setFontSize(10);
    pdf.text(`${patient.name} - Emitida ${today}`, margin, 26);
    y = 45;
    heading("Paciente y propietario");
    line("Paciente", patient.name);
    line("Especie / raza", `${patient.species} / ${patient.breed || "No informada"}`);
    line("Sexo", patient.sex);
    line("Castrado", patient.neutered);
    line("Edad aproximada", patient.approximateAge);
    line("Peso actual", patient.weight ? `${patient.weight} kg` : undefined);
    line("Propietario", patient.owner);
    line("WhatsApp", patient.phone);
    line("Dirección", patient.ownerAddress);
    heading("Alertas y antecedentes");
    line("Alergias", patient.allergies || "No informadas");
    line("Enfermedades previas", patient.previousConditions || "No informadas");
    heading("Línea de tiempo clínica");
    [...patient.events]
      .sort((a, b) => dateToIso(a.date).localeCompare(dateToIso(b.date)))
      .forEach((event) => {
        pageBreak(24);
        pdf.setDrawColor(210, 224, 224);
        pdf.line(margin, y, margin + width, y);
        y += 6;
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(17, 56, 70);
        pdf.setFontSize(10);
        pdf.text(`${displayDate(event.date)} - ${event.type} - ${event.detail}`, margin, y);
        y += 6;
        detailFields(event).forEach(([label, value]) => line(label, value));
        y += 3;
      });
    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page);
      pdf.setTextColor(120, 135, 140);
      pdf.setFontSize(8);
      pdf.text(`Página ${page} de ${pages}`, pdf.internal.pageSize.getWidth() - margin, pdf.internal.pageSize.getHeight() - 8, { align: "right" });
    }
    const filename = `Historia_clinica_${patient.name.replace(/\s+/g, "_")}.pdf`;
    return { pdf, filename, blob: pdf.output("blob") };
  }

  async function exportClinicalPdf() {
    if (!selected) return;
    const { pdf, filename } = await createClinicalPdf(selected);
    pdf.save(filename);
  }

  async function shareClinicalHistory() {
    if (!selected) return;
    const { pdf, filename, blob } = await createClinicalPdf(selected);
    const file = new File([blob], filename, { type: "application/pdf" });
    const message = `Hola ${selected.owner}, te envío la historia clínica de ${selected.name}.`;
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: filename, text: message, files: [file] });
      return;
    }
    pdf.save(filename);
    let phone = selected.phone.replace(/\D/g, "").replace(/^0/, "");
    if (!phone.startsWith("54")) phone = `549${phone}`;
    else if (!phone.startsWith("549")) phone = `549${phone.slice(2)}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(`${message} El PDF se descargó para que puedas adjuntarlo en este chat.`)}`, "_blank", "noopener,noreferrer");
  }

  async function removePatient() {
    if (!selected) return;
    try {
      await deletePatientData(uid, selected.id);
      setPatients((current) =>
        current.filter((patient) => patient.id !== selected.id),
      );
      setSelected(null);
      setDeleteConfirm(false);
    } catch {
      setFeedback("No pudimos eliminar el paciente.");
    }
  }

  const visibleEvents = selected
    ? [...selected.events]
        .filter((event) => !eventFilter || event.type === eventFilter)
        .sort((a, b) => dateToIso(a.date).localeCompare(dateToIso(b.date)))
    : [];
  const latestWeight = selected?.events.find((event) => event.weight)?.weight || selected?.weight;
  const detailFields = (event: PatientEvent) =>
    ([
      ["Motivo", event.motive],
      ["Anamnesis", event.anamnesis],
      ["Examen clínico", event.clinicalExam],
      ["Diagnóstico presuntivo", event.presumptiveDiagnosis],
      ["Diagnóstico definitivo", event.definitiveDiagnosis],
      ["Tratamiento", event.treatment],
      ["Producto", event.product],
      ["Dosis", event.dose],
      ["Tipo de procedimiento", event.procedureType],
      ["Detalle quirúrgico", event.procedure],
      ["Anestesia", event.anesthesia],
      ["Motivo de internación", event.hospitalizationReason],
      [
        "Fecha de alta",
        event.dischargeDate ? displayDate(event.dischargeDate) : "",
      ],
      ["Evolución durante la internación", event.dailyEvolution],
      ["Tratamientos realizados", event.hospitalTreatments],
      ["Motivo de la necropsia", event.necropsyReason],
      ["Hallazgos", event.necropsyFindings],
      ["Causa de muerte / conclusión", event.causeOfDeath],
      ["Peso", event.weight ? `${event.weight} kg` : ""],
      ["Temperatura", event.temperature ? `${event.temperature} °C` : ""],
      ["Frecuencia cardíaca", event.heartRate],
      ["Frecuencia respiratoria", event.respiratoryRate],
      ["Condición corporal", event.bodyCondition],
      ["Hidratación", event.hydration],
      ["Resultado", event.result],
      ["Observaciones", event.observations],
      ["Próximo recordatorio", event.nextDate ? displayDate(event.nextDate) : ""],
    ] as [string, string | undefined][]).filter(
      (field): field is [string, string] => Boolean(field[1]),
    );

  return (
    <>
      {!selected ? (
        <>
          <header className="topbar module-topbar patient-list-header">
            <div>
              <span className="eyebrow">PEQUEÑOS ANIMALES</span>
              <h1>Pacientes</h1>
              <p>Historias clínicas, tratamientos y seguimiento continuo.</p>
            </div>
            <button className="primary" onClick={() => setNewPatient(true)}>
              ＋ Nuevo paciente
            </button>
          </header>
          <div className="module-stats">
            <article className="panel stat-card">
              <span>Pacientes activos</span><strong>{patients.length}</strong><small>historias clínicas</small>
            </article>
            <article className="panel stat-card">
              <span>Consultas registradas</span><strong>{patients.flatMap((p) => p.events).filter((e) => e.type === "Consulta").length}</strong><small>atenciones</small>
            </article>
            <article className="panel stat-card">
              <span>Recordatorios</span><strong>{patients.flatMap((p) => p.events).filter((e) => e.nextDate).length}</strong><small>seguimientos programados</small>
            </article>
          </div>
          {feedback && <div className="stock-notice"><span>{feedback}</span><button onClick={() => setFeedback("")}>×</button></div>}
          <section className="panel patient-list clinical-patient-list patient-list-panel">
            <div className="module-toolbar"><div><h2>Base de pacientes</h2><p>Seleccioná un paciente para abrir su historia clínica.</p></div><label>⌕ <input value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Buscar paciente o propietario..." /></label></div>
            {filteredPatients.map((patient) => (
              <button key={patient.id} className="patient-row" onClick={() => setSelected(patient)}>
                <span className="patient-avatar">{patient.name.slice(0, 2).toUpperCase()}</span>
                <span><b>{patient.name}</b><small>{patient.species} · {patient.breed || "Sin raza informada"}</small></span>
                <span><b>{patient.owner}</b><small>{patient.phone || "Sin WhatsApp"}</small></span>
                <span><b>{patient.events.length}</b><small>eventos clínicos</small></span>
                <i>›</i>
              </button>
            ))}
            {!filteredPatients.length && <div className="empty-agenda"><b>{patients.length ? "No encontramos coincidencias" : "Todavía no hay pacientes"}</b><span>{patients.length ? "Probá buscando por otro nombre o propietario." : "Creá el primero para comenzar su historia clínica."}</span></div>}
          </section>
        </>
      ) : (
        <>
          <header className="topbar module-topbar clinical-header patient-selected-header">
            <div>
              <span className="eyebrow">{selected.species}</span>
              <h1>{selected.name}</h1>
              <p>{selected.breed || "Sin raza"} · {selected.sex || "Sexo sin informar"} · {selected.approximateAge || "Edad sin informar"}</p>
            </div>
            <div className="header-actions clinical-actions">
              <button className="clinical-action" onClick={() => setSelected(null)}>← Volver</button>
              <button className="clinical-action danger" onClick={() => setDeleteConfirm(true)}>Eliminar</button>
              <button className="clinical-action" onClick={exportClinicalPdf}>Exportar PDF</button>
              <button className="clinical-action whatsapp" onClick={shareClinicalHistory}>Enviar WhatsApp</button>
              <button className="primary" onClick={openNewRecord}>＋ Nueva atención</button>
            </div>
          </header>
          <div className="patient-detail-view">
          {selected.allergies && (
            <div className="clinical-alert"><b>ALERGIAS</b><span>{selected.allergies}</span></div>
          )}
          {feedback && <div className="stock-notice"><span>{feedback}</span><button onClick={() => setFeedback("")}>×</button></div>}
          <div className="clinical-summary">
            <section className="panel patient-identity">
              <div className="patient-identity-head">
                <div className="patient-identity-person"><span className="patient-avatar large">{selected.name.slice(0, 2).toUpperCase()}</span><span><b>{selected.name}</b><small>{selected.species} · {selected.breed}</small></span></div>
                <button className="edit-patient-data" type="button" onClick={() => setEditPatient(true)} title="Editar datos del paciente y propietario">✎ Editar datos</button>
              </div>
              <dl>
                <div><dt>Sexo</dt><dd>{selected.sex || "—"}</dd></div>
                <div><dt>Castrado</dt><dd>{selected.neutered || "—"}</dd></div>
                <div><dt>Edad aprox.</dt><dd>{selected.approximateAge || "—"}</dd></div>
                <div><dt>Peso actual</dt><dd>{latestWeight ? `${latestWeight} kg` : "—"}</dd></div>
              </dl>
            </section>
            <section className="panel owner-card">
              <span>PROPIETARIO</span><h3>{selected.owner}</h3><p>{selected.phone || "Sin WhatsApp"}</p><p>{selected.ownerAddress || "Sin dirección"}</p>
            </section>
            <section className="panel background-card">
              <span>ANTECEDENTES</span><p><b>Enfermedades previas:</b> {selected.previousConditions || "No informadas"}</p><p><b>Alergias:</b> {selected.allergies || "No informadas"}</p>
            </section>
          </div>
          <section className="panel clinical-timeline">
            <div className="timeline-toolbar">
              <div><h2>Línea de tiempo clínica</h2><p>Cada atención, tratamiento y control en orden cronológico.</p></div>
              <div className="timeline-filters">
                {["", ...CLINICAL_RECORD_TYPES].map((type) => (
                  <button key={type || "Todos"} className={eventFilter === type ? "selected" : ""} onClick={() => setEventFilter(type)}>{type || "Todos"}</button>
                ))}
              </div>
            </div>
            <div className="timeline-list">
              {visibleEvents.map((event, index) => {
                const key = event.id || index;
                const isOpen = expanded.has(key);
                return (
                  <article className={`timeline-event ${isOpen ? "open" : ""}`} key={key}>
                    <button onClick={() => toggleEvent(key)}>
                      <span className={`timeline-dot ${clinicalEventClass(event.type)}`}>{clinicalEventMark(event.type)}</span>
                      <time>{displayDate(event.date)}</time>
                      <span><b>{event.type}</b><small>{event.detail}</small></span>
                      <span className="timeline-result">{event.result}</span><i>{isOpen ? "⌃" : "⌄"}</i>
                    </button>
                    {isOpen && <div className="timeline-detail">{detailFields(event).map(([label, value]) => <div key={label}><small>{label}</small><p>{value}</p></div>)}<div className="timeline-edit-cell"><button type="button" onClick={() => openEditRecord(event)}>✎ Editar este registro</button></div></div>}
                  </article>
                );
              })}
              {!visibleEvents.length && <div className="empty-agenda"><b>Sin eventos clínicos</b><span>Registrá la primera consulta para iniciar el seguimiento.</span></div>}
            </div>
          </section>
          </div>
        </>
      )}

      {newPatient && (
        <div className="modal-backdrop"><form className="modal-card clinical-modal" onSubmit={addPatient}>
          <div><h2>Nuevo paciente</h2><button type="button" onClick={() => setNewPatient(false)}>×</button></div>
          <p>Creá una ficha clínica completa para el seguimiento del paciente.</p>
          <fieldset><legend>1. Datos del paciente</legend><div className="form-grid">
            <label>Nombre<input name="name" required autoFocus /></label>
            <label>Especie<select name="species" required><option>Canino</option><option>Felino</option></select></label>
            <label>Raza<input name="breed" /></label>
            <label>Sexo<select name="sex" required><option value="">Seleccionar</option><option>Macho</option><option>Hembra</option></select></label>
            <label>Castrado<select name="neutered"><option>No informado</option><option>Sí</option><option>No</option></select></label>
            <label>Edad aproximada<input name="approximateAge" placeholder="Ej. 4 años" /></label>
            <label>Peso actual (kg)<input name="weight" type="number" min="0" step="0.01" /></label>
          </div></fieldset>
          <fieldset><legend>2. Datos del propietario</legend><div className="form-grid">
            <label>Nombre y apellido<input name="owner" required /></label>
            <label>WhatsApp<input name="phone" /></label>
            <label className="full-field">Dirección<input name="ownerAddress" /></label>
          </div></fieldset>
          <fieldset><legend>3. Antecedentes importantes</legend><div className="form-grid">
            <label>Alergias<textarea name="allergies" placeholder="Medicamentos, alimentos u otras" /></label>
            <label>Enfermedades previas<textarea name="previousConditions" placeholder="Diabetes, insuficiencia renal, epilepsia..." /></label>
          </div></fieldset>
          <footer><button type="button" className="ghost" onClick={() => setNewPatient(false)}>Cancelar</button><button className="primary">Crear historia clínica</button></footer>
        </form></div>
      )}

      {newRecord && selected && (
        <div className="modal-backdrop"><form key={editingEvent?.id || `new-${recordType}`} className="modal-card clinical-modal record-modal" onSubmit={addClinicalRecord}>
          <div><h2>{editingEvent ? "Editar registro" : "Nueva atención"} · {selected.name}</h2><button type="button" onClick={() => { setNewRecord(false); setEditingEvent(null); }}>×</button></div>
          <div className="record-type-tabs">{CLINICAL_RECORD_TYPES.map((type) => <button type="button" key={type} className={recordType === type ? "selected" : ""} onClick={() => setRecordType(type)}>{type}</button>)}</div>
          <div className="form-grid record-date-grid">
            <label>Fecha<DateField name="date" value={recordDate} onChange={setRecordDate} required /></label>
            {recordType !== "Autopsia / necropsia" && (
              <label>
                <span className="reminder-label"><span>Próximo recordatorio</span><span>{[7, 15, 30, 60, 90].map((days) => <button type="button" key={days} onClick={() => setQuickReminder(days)}>+{days}</button>)}</span></span>
                <DateField name="nextDate" value={reminderDate} onChange={setReminderDate} />
              </label>
            )}
          </div>
          {recordType === "Consulta" && <>
            <fieldset><legend>Motivo y evaluación</legend><label>Motivo de consulta<select name="motive" defaultValue={editingEvent?.motive} required>{CONSULTATION_MOTIVES.map((motive) => <option key={motive}>{motive}</option>)}</select></label><label>Anamnesis<textarea name="anamnesis" defaultValue={editingEvent?.anamnesis} /></label><label>Examen clínico<textarea name="clinicalExam" defaultValue={editingEvent?.clinicalExam} /></label><div className="form-grid"><label>Diagnóstico presuntivo<textarea name="presumptiveDiagnosis" defaultValue={editingEvent?.presumptiveDiagnosis} /></label><label>Diagnóstico definitivo<textarea name="definitiveDiagnosis" defaultValue={editingEvent?.definitiveDiagnosis} /></label></div><label>Tratamiento indicado<textarea name="treatment" defaultValue={editingEvent?.treatment} /></label></fieldset>
            <fieldset><legend>Signos vitales</legend><div className="clinical-vitals"><label>Peso (kg)<input name="weight" type="number" min="0" step="0.01" defaultValue={editingEvent?.weight} /></label><label>Temperatura °C<input name="temperature" type="number" step="0.1" defaultValue={editingEvent?.temperature} /></label><label>Frec. cardíaca<input name="heartRate" defaultValue={editingEvent?.heartRate} /></label><label>Frec. respiratoria<input name="respiratoryRate" defaultValue={editingEvent?.respiratoryRate} /></label><label>Condición corporal<select name="bodyCondition" defaultValue={editingEvent?.bodyCondition}><option value="">Sin registrar</option>{Array.from({ length: 9 }, (_, i) => <option key={i + 1}>{i + 1}/9</option>)}</select></label><label>Hidratación<select name="hydration" defaultValue={editingEvent?.hydration}><option value="">Sin registrar</option><option>Normal</option><option>Leve deshidratación</option><option>Moderada</option><option>Severa</option></select></label></div></fieldset>
          </>}
          {recordType === "Vacunación" && <fieldset><legend>Vacuna aplicada</legend><div className="form-grid"><label>Vacuna<input name="product" defaultValue={editingEvent?.product} required /></label><label>Dosis<input name="dose" defaultValue={editingEvent?.dose} /></label></div></fieldset>}
          {recordType === "Desparasitación" && <fieldset><legend>Desparasitación</legend><div className="form-grid"><label>Producto<input name="product" defaultValue={editingEvent?.product} required /></label><label>Dosis<input name="dose" defaultValue={editingEvent?.dose} required /></label></div></fieldset>}
          {recordType === "Estudio" && <fieldset><legend>Estudio</legend><label>Tipo<select name="studyType" defaultValue={editingEvent?.studyType}><option>Laboratorio</option><option>Radiografía</option><option>Ecografía</option><option>Tomografía</option><option>Fotografía clínica</option></select></label><label>Resultado / informe<textarea name="result" defaultValue={editingEvent?.result} placeholder="Ingresá una síntesis del resultado o las conclusiones del estudio" /></label></fieldset>}
          {recordType === "Cirugía" && <fieldset><legend>Cirugía</legend><div className="form-grid"><label>Tipo de procedimiento<select name="procedureType" defaultValue={editingEvent?.procedureType || "Castración"}><option>Castración</option><option>Ovariohisterectomía</option><option>Cirugía de tejidos blandos</option><option>Cirugía traumatológica</option><option>Cirugía odontológica</option><option>Otra cirugía</option></select></label><label>Anestesia<input name="anesthesia" defaultValue={editingEvent?.anesthesia} placeholder="Protocolo anestésico utilizado" /></label></div><label>Descripción del procedimiento<textarea name="procedure" defaultValue={editingEvent?.procedure} placeholder="Técnica, hallazgos y desarrollo de la cirugía" required /></label><label>Tratamiento posoperatorio<textarea name="treatment" defaultValue={editingEvent?.treatment} placeholder="Medicación, curaciones e indicaciones" /></label></fieldset>}
          {recordType === "Internación" && <fieldset><legend>Internación</legend><div className="form-grid"><label>Motivo de internación<input name="hospitalizationReason" defaultValue={editingEvent?.hospitalizationReason} required /></label><label>Fecha de alta <span className="optional-label">Opcional</span><DateField name="dischargeDate" value={dischargeDate} onChange={setDischargeDate} /></label></div><label>Evolución durante la internación<textarea name="dailyEvolution" defaultValue={editingEvent?.dailyEvolution} placeholder="Evolución clínica, controles y cambios observados" /></label><label>Tratamientos realizados<textarea name="hospitalTreatments" defaultValue={editingEvent?.hospitalTreatments} placeholder="Medicación, fluidoterapia, alimentación y procedimientos" /></label></fieldset>}
          {recordType === "Autopsia / necropsia" && <fieldset><legend>Autopsia / necropsia</legend><label>Motivo del estudio<input name="necropsyReason" defaultValue={editingEvent?.necropsyReason} placeholder="Motivo, antecedentes o circunstancias" required /></label><label>Hallazgos<textarea name="necropsyFindings" defaultValue={editingEvent?.necropsyFindings} placeholder="Hallazgos macroscópicos relevantes" required /></label><label>Causa de muerte / conclusión<textarea name="causeOfDeath" defaultValue={editingEvent?.causeOfDeath} placeholder="Conclusión presuntiva o definitiva" /></label></fieldset>}
          {recordType !== "Estudio" && <label>Observaciones generales<textarea name="observations" defaultValue={editingEvent?.observations} /></label>}
          <footer><button type="button" className="ghost" onClick={() => { setNewRecord(false); setEditingEvent(null); }}>Cancelar</button><button className="primary">{editingEvent ? "Guardar cambios" : "Guardar en historia clínica"}</button></footer>
        </form></div>
      )}
      {editPatient && selected && (
        <div className="modal-backdrop"><form className="modal-card clinical-modal" onSubmit={updatePatient}>
          <div><h2>Editar ficha médica · {selected.name}</h2><button type="button" onClick={() => setEditPatient(false)}>×</button></div>
          <fieldset><legend>Datos del paciente</legend><div className="form-grid">
            <label>Nombre<input name="name" defaultValue={selected.name} required /></label>
            <label>Especie<select name="species" defaultValue={selected.species} required><option>Canino</option><option>Felino</option></select></label>
            <label>Raza<input name="breed" defaultValue={selected.breed} /></label>
            <label>Sexo<select name="sex" defaultValue={selected.sex || ""} required><option value="">Seleccionar</option><option>Macho</option><option>Hembra</option></select></label>
            <label>Castrado<select name="neutered" defaultValue={selected.neutered || "No informado"}><option>No informado</option><option>Sí</option><option>No</option></select></label>
            <label>Edad aproximada<input name="approximateAge" defaultValue={selected.approximateAge} /></label>
            <label>Peso actual (kg)<input name="weight" type="number" min="0" step="0.01" defaultValue={selected.weight} /></label>
          </div></fieldset>
          <fieldset><legend>Propietario</legend><div className="form-grid">
            <label>Nombre y apellido<input name="owner" defaultValue={selected.owner} required /></label>
            <label>WhatsApp<input name="phone" defaultValue={selected.phone} /></label>
            <label className="full-field">Dirección<input name="ownerAddress" defaultValue={selected.ownerAddress} /></label>
          </div></fieldset>
          <fieldset><legend>Antecedentes importantes</legend><div className="form-grid">
            <label>Alergias<textarea name="allergies" defaultValue={selected.allergies} /></label>
            <label>Enfermedades previas<textarea name="previousConditions" defaultValue={selected.previousConditions} /></label>
          </div></fieldset>
          <footer><button type="button" className="ghost" onClick={() => setEditPatient(false)}>Cancelar</button><button className="primary">Guardar cambios</button></footer>
        </form></div>
      )}
      {deleteConfirm && selected && <div className="modal-backdrop"><section className="modal-card feedback-modal"><div><h2>Eliminar paciente</h2><button onClick={() => setDeleteConfirm(false)}>×</button></div><span className="feedback-icon danger">!</span><h3>¿Eliminar a {selected.name}?</h3><p>También se eliminarán definitivamente todas sus consultas y registros clínicos.</p><footer><button className="ghost" onClick={() => setDeleteConfirm(false)}>Cancelar</button><button className="danger-button" onClick={removePatient}>Eliminar definitivamente</button></footer></section></div>}
    </>
  );
}

function ClinicalAgenda({ patients }: { patients: Patient[] }) {
  const reminders = patients
    .flatMap((p) =>
      p.events.filter((e) => e.nextDate).map((e) => ({ patient: p, event: e })),
    )
    .sort((a, b) =>
      dateToIso(displayDate(String(a.event.nextDate))).localeCompare(
        dateToIso(displayDate(String(b.event.nextDate))),
      ),
    );
  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">PEQUEÑOS ANIMALES</span>
          <h1>Recordatorios</h1>
          <p>
            Se completa automáticamente al indicar una próxima fecha en el
            historial del paciente.
          </p>
        </div>
        <div className="status-pill">
          <i /> Agenda sincronizada
        </div>
      </header>
      <div className="module-stats">
        <article className="panel stat-card">
          <span>Recordatorios</span>
          <strong>{reminders.length}</strong>
          <small>programados</small>
        </article>
        <article className="panel stat-card">
          <span>Pacientes</span>
          <strong>{new Set(reminders.map((r) => r.patient.id)).size}</strong>
          <small>con seguimiento</small>
        </article>
      </div>
      <section className="panel clinical-agenda">
        <div className="agenda-head">
          <span>Fecha</span>
          <span>Paciente</span>
          <span>Propietario</span>
          <span>Actividad</span>
          <span>Estado</span>
          <span>Contacto</span>
        </div>
        {reminders.map((r, i) => (
          <article key={i}>
            <time>{displayDate(r.event.nextDate || "")}</time>
            <div>
              <b>{r.patient.name}</b>
              <span>
                {r.patient.species} · {r.patient.breed}
              </span>
            </div>
            <div>
              <b>{r.patient.owner}</b>
              <span>{r.patient.phone}</span>
            </div>
            <div>
              <b>{r.event.type}</b>
              <span>{r.event.detail}</span>
            </div>
            <span className="table-status">{dateToIso(displayDate(r.event.nextDate || "")) < localIsoDate() ? "Vencido" : dateToIso(displayDate(r.event.nextDate || "")) === localIsoDate() ? "Para hoy" : "Próximo"}</span>
            <button className="reminder-whatsapp" onClick={() => openReminderWhatsApp(r.patient, r.event)}>Enviar WhatsApp</button>
          </article>
        ))}
      </section>
    </>
  );
}

type WorkAnimal = {
  cuig: string;
  identifier: string;
  category: string;
  result?: "Negativo" | "Sospechoso" | "Positivo";
};
type Work = {
  id?: string;
  establishmentId?: string;
  date: string;
  type: string;
  detail: string;
  animals: string;
  status: string;
  records?: WorkAnimal[];
  source?: "manual" | "excel";
  sigatmStatus?: "Pendiente" | "Finalizado";
};
type Establishment = {
  id: string;
  name: string;
  renspa: string;
  address: string;
};
type Producer = {
  id: number;
  name: string;
  renspa: string;
  establishment: string;
  address: string;
  phone: string;
  email: string;
  animals: number;
  establishments?: Establishment[];
  works: Work[];
};

const producerEstablishments = (producer: Producer): Establishment[] =>
  producer.establishments?.length
    ? producer.establishments
    : [
        {
          id: `${producer.id}-principal`,
          name: producer.establishment,
          renspa: producer.renspa,
          address: producer.address,
        },
      ];

const workEstablishment = (producer: Producer, work: Work) => {
  const establishments = producerEstablishments(producer);
  return (
    establishments.find((item) => item.id === work.establishmentId) ||
    establishments[0]
  );
};
const sampledAnimalsInWork = (work: Work) =>
  work.records?.length || Number.parseInt(work.animals, 10) || 0;
const workDisplayStatus = (work: Work) => {
  if (dateToIso(displayDate(work.date)) > localIsoDate()) return "Pendiente";
  return "Realizado";
};
const isSigatmEligibleWork = (work: Work) => {
  const practice = norm(work.detail);
  return (
    (work.type === "Sangrado" &&
      (practice.includes("BRUCELOSIS") || practice.includes("LEUCOSIS"))) ||
    (work.type === "Muestreo equino" &&
      practice.includes("ANEMIA INFECCIOSA EQUINA"))
  );
};
const sampledAnimalsForProducer = (producer: Producer) =>
  producer.works.reduce(
    (total, work) =>
      dateToIso(displayDate(work.date)) <= localIsoDate()
        ? total + sampledAnimalsInWork(work)
        : total,
    0,
  );
const INITIAL_PRODUCERS: Producer[] = [
  {
    id: 1,
    name: "Est. La Esperanza",
    renspa: "01.023.0.12345/00",
    establishment: "La Esperanza",
    address: "Ruta 51 km 248, Azul",
    phone: "2281 55-0142",
    email: "administracion@laesperanza.com",
    animals: 486,
    works: [
      {
        date: "09/07/2026",
        type: "Sangrado",
        detail: "Saneamiento BPA · Brucelosis",
        animals: "93 animales",
        status: "Listo para SIGATM",
      },
      {
        date: "18/03/2026",
        type: "Vacunación",
        detail: "Campaña antiaftosa",
        animals: "486 animales",
        status: "Realizado",
      },
      {
        date: "22/01/2026",
        type: "Tacto",
        detail: "Diagnóstico de gestación",
        animals: "184 animales",
        status: "Realizado",
      },
    ],
  },
  {
    id: 2,
    name: "Los Aromos S.A.",
    renspa: "01.017.0.55421/00",
    establishment: "Los Aromos",
    address: "Paraje El Gallo, Tandil",
    phone: "2494 55-8831",
    email: "campo@losaromos.com.ar",
    animals: 312,
    works: [
      {
        date: "22/07/2026",
        type: "Revisión",
        detail: "Revisación de toros",
        animals: "35 animales",
        status: "Pendiente",
      },
      {
        date: "06/07/2026",
        type: "Sangrado",
        detail: "Tricomoniasis y Campylobacteriosis",
        animals: "35 animales",
        status: "Realizado",
      },
    ],
  },
  {
    id: 3,
    name: "María González",
    renspa: "01.041.0.98812/00",
    establishment: "El Ombú",
    address: "Cuartel III, Rauch",
    phone: "2494 55-0311",
    email: "maria@elombu.com.ar",
    animals: 196,
    works: [
      {
        date: "29/07/2026",
        type: "Sangrado",
        detail: "Control anual",
        animals: "86 animales",
        status: "Pendiente",
      },
    ],
  },
];

function ProducersPanel({
  producers,
  setProducers,
  uid,
  sigatmCatalog,
}: {
  producers: Producer[];
  setProducers: React.Dispatch<React.SetStateAction<Producer[]>>;
  uid: string;
  sigatmCatalog: SigatmCatalog;
}) {
  const [selected, setSelected] = useState<Producer | null>(null);
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState("");
  const [choosingEstablishments, setChoosingEstablishments] =
    useState<Producer | null>(null);
  const [showProducer, setShowProducer] = useState(false);
  const [showEstablishment, setShowEstablishment] = useState(false);
  const [showWork, setShowWork] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [workType, setWorkType] = useState("Sangrado");
  const activeEstablishment = selected
    ? producerEstablishments(selected).find(
        (item) => item.id === selectedEstablishmentId,
      ) || producerEstablishments(selected)[0]
    : null;
  function openProducer(producer: Producer, establishmentId?: string) {
    const establishments = producerEstablishments(producer);
    if (!establishmentId && establishments.length > 1) {
      setChoosingEstablishments(producer);
      return;
    }
    setSelected(producer);
    setSelectedEstablishmentId(establishmentId || establishments[0].id);
    setChoosingEstablishments(null);
  }
  async function addProducer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const p: Producer = {
      id: Date.now(),
      name: String(f.get("name")),
      renspa: String(f.get("renspa")),
      establishment: String(f.get("establishment")),
      address: String(f.get("address")),
      phone: String(f.get("phone")),
      email: String(f.get("email")),
      animals: 0,
      establishments: [],
      works: [],
    };
    p.establishments = [
      {
        id: crypto.randomUUID(),
        name: p.establishment,
        renspa: p.renspa,
        address: p.address,
      },
    ];
    try {
      await saveProducerData(uid, p);
      setProducers((v) => [p, ...v]);
      setShowProducer(false);
    } catch {
      window.alert("No pudimos guardar el productor en Firebase.");
    }
  }
  async function addEstablishment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    const establishment: Establishment = {
      id: crypto.randomUUID(),
      name: String(f.get("establishment")),
      renspa: String(f.get("renspa")),
      address: String(f.get("address")),
    };
    const updated = {
      ...selected,
      establishments: [...producerEstablishments(selected), establishment],
    };
    try {
      await saveProducerData(uid, updated);
      setProducers((items) =>
        items.map((producer) =>
          producer.id === updated.id ? updated : producer,
        ),
      );
      setSelected(updated);
      setSelectedEstablishmentId(establishment.id);
      setShowEstablishment(false);
    } catch {
      window.alert("No pudimos guardar el establecimiento en Firebase.");
    }
  }
  async function addWork(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    const dateValue = String(f.get("date"));
    const iso = dateToIso(dateValue);
    const status = iso > localIsoDate() ? "Pendiente" : "Realizado";
    const detail = String(f.get("detail"));
    const notes = String(f.get("notes") || "").trim();
    const work: Work = {
      id: crypto.randomUUID(),
      establishmentId: activeEstablishment?.id,
      date: displayDate(dateValue),
      type: workType,
      detail: notes ? `${detail} · ${notes}` : detail,
      animals: `${String(f.get("animals") || 0)} animales`,
      status,
    };
    try {
      await saveWorkData(uid, selected.id, work);
      const updated = { ...selected, works: [work, ...selected.works] };
      setProducers((v) => v.map((p) => (p.id === updated.id ? updated : p)));
      setSelected(updated);
      setShowWork(false);
    } catch {
      window.alert("No pudimos guardar el trabajo en Firebase.");
    }
  }
  async function removeProducer() {
    if (!selected || deleting) return;
    setDeleting(true);
    try {
      await deleteProducerData(uid, selected.id);
      setProducers((items) => items.filter((item) => item.id !== selected.id));
      setShowDelete(false);
      setSelected(null);
      setSelectedEstablishmentId("");
    } catch {
      window.alert("No pudimos eliminar el productor de Firebase.");
    } finally {
      setDeleting(false);
    }
  }
  async function removeEstablishment() {
    if (!selected || !activeEstablishment || deleting) return;
    const establishments = producerEstablishments(selected);
    if (establishments.length <= 1) return;
    setDeleting(true);
    try {
      await deleteEstablishmentData(uid, selected, activeEstablishment.id);
      const remaining = establishments.filter(
        (item) => item.id !== activeEstablishment.id,
      );
      const updated = {
        ...selected,
        establishment: remaining[0].name,
        renspa: remaining[0].renspa,
        address: remaining[0].address,
        establishments: remaining,
        works: selected.works.filter(
          (work) => workEstablishment(selected, work).id !== activeEstablishment.id,
        ),
      };
      setProducers((items) =>
        items.map((item) => item.id === updated.id ? updated : item),
      );
      setSelected(updated);
      setSelectedEstablishmentId(remaining[0].id);
      setShowDelete(false);
    } catch {
      window.alert("No pudimos eliminar el establecimiento de Firebase.");
    } finally {
      setDeleting(false);
    }
  }
  async function exportProducerPdf() {
    if (!selected || !activeEstablishment) return;
    const establishmentWorks = selected.works.filter(
      (work) => workEstablishment(selected, work).id === activeEstablishment.id,
    );
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF();
    const margin = 17;
    const width = pdf.internal.pageSize.getWidth() - margin * 2;
    let y = 18;
    const pageBreak = (needed = 15) => {
      if (y + needed > pdf.internal.pageSize.getHeight() - 16) {
        pdf.addPage();
        y = 18;
      }
    };
    const heading = (title: string) => {
      pageBreak(16);
      pdf.setTextColor(15, 116, 94);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(title, margin, y);
      y += 7;
    };
    const line = (label: string, value?: string) => {
      if (!value) return;
      pdf.setTextColor(38, 63, 72);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      const rows = pdf.splitTextToSize(`${label}: ${value}`, width);
      pageBreak(rows.length * 4.5 + 2);
      pdf.text(rows, margin, y);
      y += rows.length * 4.5 + 2;
    };
    pdf.setFillColor(18, 58, 74);
    pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), 35, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text("LabOVet - Historial de trabajos", margin, 17);
    pdf.setFontSize(10);
    pdf.text(
      `${selected.name} - ${activeEstablishment.name} - Emitido ${displayDate(localIsoDate())}`,
      margin,
      26,
    );
    y = 45;
    heading("Datos del productor");
    line("Razón social", selected.name);
    line("Teléfono", selected.phone);
    line("Correo electrónico", selected.email);
    heading("Datos del establecimiento");
    line("Establecimiento", activeEstablishment.name);
    line("RENSPA", activeEstablishment.renspa || "No informado");
    line("Dirección", activeEstablishment.address || "No informada");
    heading("Historial de trabajos");
    [...establishmentWorks]
      .sort((a, b) => dateToIso(a.date).localeCompare(dateToIso(b.date)))
      .forEach((work) => {
        pageBreak(27);
        const establishment = workEstablishment(selected, work);
        pdf.setDrawColor(210, 224, 224);
        pdf.line(margin, y, margin + width, y);
        y += 6;
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(17, 56, 70);
        pdf.setFontSize(10);
        pdf.text(`${displayDate(work.date)} - ${work.type}`, margin, y);
        y += 6;
        line("Establecimiento", `${establishment.name} - RENSPA ${establishment.renspa || "No informado"}`);
        line("Práctica", work.detail);
        line("Cantidad", work.animals);
        line("Estado", workDisplayStatus(work));
        if (isSigatmEligibleWork(work)) {
          line("SIGATM", work.sigatmStatus || "Pendiente");
        }
        if (work.type === "Sangrado") {
          const positives = (work.records || []).filter((record) => record.result === "Positivo");
          const suspicious = (work.records || []).filter((record) => record.result === "Sospechoso");
          const negatives = (work.records || []).filter((record) => record.result === "Negativo");
          if (positives.length || suspicious.length || negatives.length) {
            line("Resumen de resultados", `${negatives.length} negativos - ${suspicious.length} sospechosos - ${positives.length} positivos`);
            if (positives.length) line("Animales positivos", positives.map((record) => [record.cuig, record.identifier].filter(Boolean).join(" ")).join(", "));
            if (suspicious.length) line("Animales sospechosos", suspicious.map((record) => [record.cuig, record.identifier].filter(Boolean).join(" ")).join(", "));
          }
        }
        y += 3;
      });
    if (!establishmentWorks.length) {
      line("Trabajos", "Todavía no hay trabajos registrados en este establecimiento");
    }
    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page);
      pdf.setTextColor(120, 135, 140);
      pdf.setFontSize(8);
      pdf.text(`Página ${page} de ${pages}`, pdf.internal.pageSize.getWidth() - margin, pdf.internal.pageSize.getHeight() - 8, { align: "right" });
    }
    pdf.save(
      `Historial_${selected.name.replace(/\s+/g, "_")}_${activeEstablishment.name.replace(/\s+/g, "_")}.pdf`,
    );
  }
  return (
    <>
      <header className={`topbar module-topbar ${selected ? "producer-selected-header" : "producer-list-header"}`}>
        <div>
          <span className="eyebrow">GRANDES ANIMALES</span>
          <h1>{selected ? selected.name : "Productores"}</h1>
          <p>
            {selected
              ? `${activeEstablishment?.name} · RENSPA ${activeEstablishment?.renspa}`
              : "El centro administrativo de tus trabajos con grandes animales."}
          </p>
        </div>
        {selected ? (
          <div className="header-actions clinical-actions producer-actions">
            <button className="clinical-action" onClick={() => setSelected(null)}>
              ← Volver
            </button>
            {producerEstablishments(selected).length > 1 && (
              <button
                className="clinical-action"
                onClick={() => setChoosingEstablishments(selected)}
              >
                Cambiar establecimiento
              </button>
            )}
            <button
              className="clinical-action"
              onClick={() => setShowEstablishment(true)}
            >
              ＋ Establecimiento
            </button>
            <button className="clinical-action" onClick={exportProducerPdf}>
              {producerEstablishments(selected).length > 1
                ? "Exportar establecimiento"
                : "Exportar PDF"}
            </button>
            <button
              className="clinical-action danger"
              onClick={() => setShowDelete(true)}
            >
              Eliminar
            </button>
            <button className="primary" onClick={() => setShowWork(true)}>
              ＋ Nuevo trabajo
            </button>
          </div>
        ) : (
          <button className="primary" onClick={() => setShowProducer(true)}>
            ＋ Nuevo productor
          </button>
        )}
      </header>
      {!selected ? (
        <>
          <div className="module-stats producer-summary">
            <article className="panel stat-card">
              <span>Productores activos</span>
              <strong>{producers.length}</strong>
              <small>cartera actual</small>
            </article>
            <article className="panel stat-card">
              <span>Establecimientos</span>
              <strong>
                {producers.reduce(
                  (total, producer) =>
                    total + producerEstablishments(producer).length,
                  0,
                )}
              </strong>
              <small>establecimientos activos</small>
            </article>
            <article className="panel stat-card">
              <span>Animales muestreados</span>
              <strong>
                {producers.reduce(
                  (total, producer) =>
                    total + sampledAnimalsForProducer(producer),
                  0,
                )}
              </strong>
              <small>incluidos en trabajos registrados</small>
            </article>
            <article className="panel stat-card">
              <span>Archivos SIGATM</span>
              <strong>
                {
                  producers
                    .flatMap((p) => p.works)
                    .filter(
                      (work) =>
                        isSigatmEligibleWork(work) &&
                        work.sigatmStatus === "Finalizado",
                    ).length
                }
              </strong>
              <small>archivos generados</small>
            </article>
          </div>
          <section className="panel producer-list">
            <div className="module-toolbar">
              <div>
                <h2>Listado de productores</h2>
                <p>Seleccioná un productor para ver su ficha e historial.</p>
              </div>
              <label>
                ⌕ <input placeholder="Buscar productor..." />
              </label>
            </div>
            {producers.map((p) => (
              <button
                className="producer-row"
                key={p.id}
                onClick={() => openProducer(p)}
              >
                <span className="producer-avatar">
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <b>{p.name}</b>
                  <small>
                    {producerEstablishments(p).length === 1
                      ? `${producerEstablishments(p)[0].name} · ${producerEstablishments(p)[0].address}`
                      : `${producerEstablishments(p).length} establecimientos · ${producerEstablishments(
                          p,
                        )
                          .map((item) => item.name)
                          .join(" · ")}`}
                  </small>
                </span>
                <span>
                  <small>
                    {producerEstablishments(p).length === 1
                      ? "RENSPA"
                      : "Establecimientos"}
                  </small>
                  <b>
                    {producerEstablishments(p).length === 1
                      ? producerEstablishments(p)[0].renspa
                      : producerEstablishments(p).length}
                  </b>
                </span>
                <span>
                  <small>Animales muestreados</small>
                  <b>{sampledAnimalsForProducer(p)}</b>
                </span>
                <span>
                  <small>Último trabajo</small>
                  <b>{p.works[0]?.date || "Sin trabajos"}</b>
                </span>
                <i>→</i>
              </button>
            ))}
          </section>
        </>
      ) : (
        <div className="producer-detail-view">
          <ProducerDetail
            producer={selected}
            establishment={activeEstablishment!}
            setSelected={setSelected}
            setProducers={setProducers}
            onNewWork={() => setShowWork(true)}
            uid={uid}
            sigatmCatalog={sigatmCatalog}
          />
        </div>
      )}
      {choosingEstablishments && (
        <div className="modal-backdrop">
          <section className="modal-card establishment-picker">
            <div>
              <h2>Elegir establecimiento</h2>
              <button
                type="button"
                onClick={() => setChoosingEstablishments(null)}
              >
                ×
              </button>
            </div>
            <p>
              {choosingEstablishments.name} tiene varios establecimientos. Elegí
              cuál querés consultar.
            </p>
            <div className="establishment-options">
              {producerEstablishments(choosingEstablishments).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => openProducer(choosingEstablishments, item.id)}
                >
                  <span>
                    <b>{item.name}</b>
                    <small>{item.address || "Sin dirección informada"}</small>
                  </span>
                  <span>
                    <small>RENSPA</small>
                    <b>{item.renspa || "Sin informar"}</b>
                  </span>
                  <i>→</i>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {showDelete && selected && activeEstablishment && (
        <div className="modal-backdrop">
          <section className="modal-card delete-producer-modal">
            <div>
              <h2>Eliminar datos</h2>
              <button type="button" onClick={() => setShowDelete(false)}>×</button>
            </div>
            <p>Elegí con cuidado qué información querés eliminar.</p>
            <div className="delete-scope-options">
              <article>
                <div>
                  <b>Establecimiento: {activeEstablishment.name}</b>
                  <small>
                    Elimina este establecimiento y todos sus trabajos, animales y resultados asociados.
                  </small>
                </div>
                <button
                  type="button"
                  className="danger-button"
                  disabled={deleting || producerEstablishments(selected).length <= 1}
                  onClick={removeEstablishment}
                >
                  {deleting ? "Eliminando…" : "Eliminar establecimiento"}
                </button>
                {producerEstablishments(selected).length <= 1 && (
                  <small className="delete-help">
                    Es el único establecimiento. Para eliminarlo debés eliminar el productor completo.
                  </small>
                )}
              </article>
              <article className="delete-producer-option">
                <div>
                  <b>Productor completo: {selected.name}</b>
                  <small>
                    Elimina todos sus establecimientos, trabajos, animales e historial sanitario.
                  </small>
                </div>
                <button
                  type="button"
                  className="danger-button"
                  disabled={deleting}
                  onClick={removeProducer}
                >
                  {deleting ? "Eliminando…" : "Eliminar productor"}
                </button>
              </article>
            </div>
            <footer>
              <button className="ghost" type="button" onClick={() => setShowDelete(false)}>
                Cancelar
              </button>
            </footer>
          </section>
        </div>
      )}
      {showEstablishment && selected && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={addEstablishment}>
            <div>
              <h2>Nuevo establecimiento</h2>
              <button type="button" onClick={() => setShowEstablishment(false)}>
                ×
              </button>
            </div>
            <p>Se agregará a {selected.name}.</p>
            <label>
              Nombre del establecimiento
              <input name="establishment" required />
            </label>
            <div className="form-grid">
              <label>
                RENSPA
                <input name="renspa" required placeholder="00.000.0.00000/00" />
              </label>
              <label>
                Dirección
                <input name="address" />
              </label>
            </div>
            <footer>
              <button
                type="button"
                className="ghost"
                onClick={() => setShowEstablishment(false)}
              >
                Cancelar
              </button>
              <button className="primary">Guardar establecimiento</button>
            </footer>
          </form>
        </div>
      )}
      {showProducer && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={addProducer}>
            <div>
              <h2>Nuevo productor</h2>
              <button type="button" onClick={() => setShowProducer(false)}>
                ×
              </button>
            </div>
            <p>
              Cargá los datos básicos. Más adelante podrá tener varios
              establecimientos.
            </p>
            <label>
              Razón social o nombre
              <input name="name" required />
            </label>
            <div className="form-grid">
              <label>
                Establecimiento
                <input name="establishment" required />
              </label>
              <label>
                RENSPA
                <input name="renspa" required placeholder="00.000.0.00000/00" />
              </label>
              <label>
                Dirección
                <input name="address" />
              </label>
              <label>
                Teléfono
                <input name="phone" />
              </label>
              <label>
                Correo electrónico
                <input name="email" type="email" />
              </label>
            </div>
            <footer>
              <button
                type="button"
                className="ghost"
                onClick={() => setShowProducer(false)}
              >
                Cancelar
              </button>
              <button className="primary">Guardar productor</button>
            </footer>
          </form>
        </div>
      )}
      {showWork && selected && (
        <div className="modal-backdrop">
          <form className="modal-card work-modal" onSubmit={addWork}>
            <div>
              <h2>Nuevo trabajo</h2>
              <button type="button" onClick={() => setShowWork(false)}>
                ×
              </button>
            </div>
            <p>
              {selected.name} · {activeEstablishment?.name}
            </p>
            <div className="work-types">
              {WORK_TYPE_ORDER.map((t) => (
                <button
                  type="button"
                  className={workType === t ? "chosen" : ""}
                  key={t}
                  onClick={() => setWorkType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Fecha
                <input
                  name="date"
                  type="date"
                  defaultValue={localIsoDate()}
                  required
                />
              </label>
              <label>
                Cantidad estimada
                <input name="animals" type="number" min="0" />
              </label>
            </div>
            <label>
              Práctica o plan sanitario
              <select name="detail" className="catalog-select" required>
                {WORK_CATALOG[workType].map((option) => (
                  <option key={option.label} value={option.label}>
                    {option.label} — {option.scope}
                  </option>
                ))}
              </select>
            </label>
            <div className="catalog-note">
              <b>{WORK_CATALOG[workType][0].scope}</b>
              <span>
                La obligatoriedad puede variar según zona, categoría, tipo de
                establecimiento y normativa provincial.
              </span>
            </div>
            <label>
              Observaciones
              <textarea
                name="notes"
                placeholder="Lote, resultado general, producto aplicado u otra información..."
              />
            </label>
            <footer>
              <button
                type="button"
                className="ghost"
                onClick={() => setShowWork(false)}
              >
                Cancelar
              </button>
              <button className="primary">Guardar trabajo</button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}

type HealthEvent = {
  animal: string;
  category: string;
  date: string;
  work: string;
  practice: string;
  result: string;
};
const HEALTH_EVENTS: Record<number, HealthEvent[]> = {
  1: [
    {
      animal: "AR-8745",
      category: "VACA",
      date: "09/07/2026",
      work: "Sangrado",
      practice: "Brucelosis bovina · BPA",
      result: "Negativo",
    },
    {
      animal: "AR-9012",
      category: "VAQUILLONA",
      date: "09/07/2026",
      work: "Sangrado",
      practice: "Brucelosis bovina · BPA",
      result: "Negativo",
    },
    {
      animal: "AR-7741",
      category: "VACA",
      date: "18/03/2026",
      work: "Vacunación",
      practice: "Fiebre aftosa",
      result: "Aplicada",
    },
    {
      animal: "AR-6638",
      category: "VACA",
      date: "22/01/2026",
      work: "Tacto",
      practice: "Diagnóstico de gestación",
      result: "Preñada · 90 días",
    },
    {
      animal: "AR-5529",
      category: "VACA",
      date: "22/01/2026",
      work: "Tacto",
      practice: "Diagnóstico de gestación",
      result: "Vacía",
    },
  ],
  2: [
    {
      animal: "LA-2041",
      category: "TORO",
      date: "06/07/2026",
      work: "Muestreo reproductivo",
      practice: "Tricomoniasis + Campylobacteriosis",
      result: "Negativo",
    },
    {
      animal: "LA-2048",
      category: "TORO",
      date: "06/07/2026",
      work: "Muestreo reproductivo",
      practice: "Tricomoniasis + Campylobacteriosis",
      result: "Negativo",
    },
  ],
};

function ProducerDetail({
  producer,
  establishment,
  setSelected,
  setProducers,
  onNewWork,
  uid,
  sigatmCatalog,
}: {
  producer: Producer;
  establishment: Establishment;
  setSelected: React.Dispatch<React.SetStateAction<Producer | null>>;
  setProducers: React.Dispatch<React.SetStateAction<Producer[]>>;
  onNewWork: () => void;
  uid: string;
  sigatmCatalog: SigatmCatalog;
}) {
  const [open, setOpen] = useState({ data: false, health: false, works: true });
  const [editing, setEditing] = useState(false);
  const [manualWork, setManualWork] = useState<number | null>(null);
  const [expandedHealthAnimals, setExpandedHealthAnimals] = useState<Set<string>>(new Set());
  const [uploadFeedback, setUploadFeedback] = useState<{
    count: number;
    file: string;
  } | null>(null);
  const [healthFilters, setHealthFilters] = useState({
    animal: "",
    work: "",
    category: "",
    result: "",
  });
  const scopedWorks = producer.works
    .map((work, index) => ({ work, index }))
    .filter(
      ({ work }) => workEstablishment(producer, work).id === establishment.id,
    );
  const loadedEvents: HealthEvent[] = scopedWorks.flatMap(({ work: w }) =>
    (w.records || []).map((r) => ({
      animal: [r.cuig, r.identifier].filter(Boolean).join(" "),
      category: r.category,
      date: w.date,
      work: w.type,
      practice: w.detail,
      result: r.result || "Sin resultado",
    })),
  );
  const events = [...loadedEvents, ...(HEALTH_EVENTS[producer.id] || [])];
  const filtered = events.filter(
    (e) =>
      (!healthFilters.animal ||
        e.animal.toLowerCase().includes(healthFilters.animal.toLowerCase())) &&
      (!healthFilters.work || e.work === healthFilters.work) &&
      (!healthFilters.category || e.category === healthFilters.category) &&
      (!healthFilters.result ||
        e.result.toLowerCase().includes(healthFilters.result.toLowerCase())),
  );
  const resultCounts = {
    negative: events.filter((event) => norm(event.result) === "NEGATIVO").length,
    suspicious: events.filter((event) => norm(event.result) === "SOSPECHOSO").length,
    positive: events.filter((event) => norm(event.result) === "POSITIVO").length,
  };
  const pendingResults = events.filter(
    (event) =>
      event.work === "Sangrado" && norm(event.result) === "SIN RESULTADO",
  ).length;
  const groupedAnimals = Object.values(
    filtered.reduce<Record<string, { animal: string; category: string; events: HealthEvent[] }>>(
      (groups, event) => {
        const key = norm(event.animal);
        if (!groups[key]) groups[key] = { animal: event.animal, category: event.category, events: [] };
        groups[key].events.push(event);
        return groups;
      },
      {},
    ),
  ).map((group) => {
    const ordered = [...group.events].sort((a, b) => dateToIso(b.date).localeCompare(dateToIso(a.date)));
    const status = ordered.some((event) => norm(event.result) === "POSITIVO")
      ? "Positivo"
      : ordered.some((event) => norm(event.result) === "SOSPECHOSO")
        ? "Sospechoso"
        : ordered.every((event) => norm(event.result) === "NEGATIVO")
          ? "Negativo"
          : "Sin resultado";
    return { ...group, events: ordered, latest: ordered[0], status };
  }).sort((a, b) => a.animal.localeCompare(b.animal, "es", { numeric: true }));
  function toggleHealthAnimal(animal: string) {
    setExpandedHealthAnimals((current) => {
      const next = new Set(current);
      if (next.has(animal)) next.delete(animal);
      else next.add(animal);
      return next;
    });
  }
  const toggle = (key: keyof typeof open) =>
    setOpen((v) => ({ ...v, [key]: !v[key] }));
  async function saveData(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const establishments = producerEstablishments(producer).map((item) =>
      item.id === establishment.id
        ? {
            ...item,
            name: String(f.get("establishment")),
            renspa: String(f.get("renspa")),
            address: String(f.get("address")),
          }
        : item,
    );
    const primary = establishments[0];
    const updated = {
      ...producer,
      name: String(f.get("name")),
      establishment: primary.name,
      renspa: primary.renspa,
      address: primary.address,
      phone: String(f.get("phone")),
      email: String(f.get("email")),
      establishments,
    };
    try {
      await saveProducerData(uid, updated);
      setProducers((v) => v.map((p) => (p.id === updated.id ? updated : p)));
      setSelected(updated);
      setEditing(false);
    } catch {
      window.alert("No pudimos actualizar el productor en Firebase.");
    }
  }
  async function attachExcel(file: File | undefined, workIndex: number) {
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        raw: false,
      });
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[wb.SheetNames[0]],
        { defval: "", raw: false },
      );
      if (!data.length) throw new Error("La planilla está vacía");
      const headers = Object.keys(data[0]);
      const get = (row: Record<string, unknown>, names: string[]) => {
        const key = headers.find((h) =>
          names.includes(norm(h).replace(/\s/g, "")),
        );
        return key ? String(row[key] || "").trim() : "";
      };
      const records = data
        .map((row) => ({
          cuig: get(row, ["CUIG", "CUIGPREFIJO"]),
          identifier: get(row, ["IDENTIFICACION", "IDENTIFICADOR", "CARAVANA"]),
          category: norm(get(row, ["CATEGORIA", "CATEGORÍA"])),
        }))
        .filter((r) => r.identifier || r.category);
      if (!records.length)
        throw new Error("No encontré las columnas IDENTIFICACION y CATEGORIA");
      const duplicate = new Set(
        records
          .map((r) => `${norm(r.cuig)}-${norm(r.identifier)}`)
          .filter((v, i, a) => a.indexOf(v) !== i),
      );
      if (
        duplicate.size &&
        !window.confirm(
          `Encontré ${duplicate.size} identificaciones repetidas. ¿Querés cargar la planilla igualmente?`,
        )
      )
        return;
      const work = producer.works[workIndex];
      if (
        parseInt(work.animals) !== records.length &&
        !window.confirm(
          `El trabajo indica ${parseInt(work.animals)} animales y la planilla contiene ${records.length}. ¿Querés actualizar la cantidad?`,
        )
      )
        return;
      const sigatm = isSigatmEligibleWork(work);
      const updated = {
        ...producer,
        works: producer.works.map((w, i) =>
          i === workIndex
            ? {
                ...w,
                records,
                source: "excel" as const,
                animals: `${records.length} animales`,
                status: sigatm ? "Listo para SIGATM" : w.status,
                sigatmStatus: sigatm ? ("Pendiente" as const) : w.sigatmStatus,
              }
            : w,
        ),
      };
      await saveWorkData(uid, updated.id, updated.works[workIndex]);
      setProducers((v) => v.map((p) => (p.id === updated.id ? updated : p)));
      setSelected(updated);
      setUploadFeedback({ count: records.length, file: file.name });
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "No pude leer la planilla",
      );
    }
  }
  return (
    <>
      <div className="producer-kpis">
        <article className="panel">
          <span>Animales identificados</span>
          <strong>{new Set(events.map((e) => e.animal)).size}</strong>
          <small>
            {new Set(events.map((e) => e.animal)).size} con historial individual
          </small>
        </article>
        <article className={`panel ${pendingResults ? "attention" : ""}`}><span>Resultados pendientes</span><strong>{pendingResults}</strong><small>animales sin resultado informado</small></article>
        <article className={`panel ${resultCounts.positive ? "danger" : ""}`}><span>Resultados positivos</span><strong>{resultCounts.positive}</strong><small>requieren seguimiento sanitario</small></article>
        <article className={`panel ${resultCounts.suspicious ? "warning" : ""}`}><span>Resultados sospechosos</span><strong>{resultCounts.suspicious}</strong><small>pendientes de confirmación</small></article>
      </div>
      <section className="panel accordion">
        <button className="accordion-head" onClick={() => toggle("data")}>
          <div>
            <span className="accordion-icon">⌂</span>
            <span>
              <b>Datos del productor</b>
              <small>Contacto y datos de {establishment.name}</small>
            </span>
          </div>
          <i>{open.data ? "⌃" : "⌄"}</i>
        </button>
        {open.data && (
          <div className="accordion-body">
            {editing ? (
              <form className="producer-edit" onSubmit={saveData}>
                <div className="form-grid">
                  <label>
                    Razón social
                    <input name="name" defaultValue={producer.name} />
                  </label>
                  <label>
                    Establecimiento
                    <input
                      name="establishment"
                      defaultValue={establishment.name}
                    />
                  </label>
                  <label>
                    RENSPA
                    <input name="renspa" defaultValue={establishment.renspa} />
                  </label>
                  <label>
                    Dirección
                    <input
                      name="address"
                      defaultValue={establishment.address}
                    />
                  </label>
                  <label>
                    Teléfono
                    <input name="phone" defaultValue={producer.phone} />
                  </label>
                  <label>
                    Correo
                    <input
                      name="email"
                      type="email"
                      defaultValue={producer.email}
                    />
                  </label>
                </div>
                <footer>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setEditing(false)}
                  >
                    Cancelar
                  </button>
                  <button className="primary">Guardar cambios</button>
                </footer>
              </form>
            ) : (
              <>
                <dl className="producer-data">
                  <div>
                    <dt>Razón social</dt>
                    <dd>{producer.name}</dd>
                  </div>
                  <div>
                    <dt>Establecimiento</dt>
                    <dd>{establishment.name}</dd>
                  </div>
                  <div>
                    <dt>RENSPA</dt>
                    <dd>{establishment.renspa}</dd>
                  </div>
                  <div>
                    <dt>Dirección</dt>
                    <dd>{establishment.address}</dd>
                  </div>
                  <div>
                    <dt>Teléfono</dt>
                    <dd>{producer.phone}</dd>
                  </div>
                  <div>
                    <dt>Correo</dt>
                    <dd>{producer.email}</dd>
                  </div>
                </dl>
                <button
                  className="outline-btn edit-data"
                  onClick={() => setEditing(true)}
                >
                  ✎ Editar datos
                </button>
              </>
            )}
          </div>
        )}
      </section>
      <section className="panel accordion">
        <button className="accordion-head" onClick={() => toggle("health")}>
          <div>
            <span className="accordion-icon health">♡</span>
            <span>
              <b>Historial sanitario</b>
              <small>Seguimiento individual de cada animal</small>
            </span>
          </div>
          <div className="accordion-count">{events.length} eventos</div>
          <i>{open.health ? "⌃" : "⌄"}</i>
        </button>
        {open.health && (
          <div className="accordion-body no-pad">
            <div className="health-intro">
              <div>
                <h3>Registro sanitario individual</h3>
                <p>
                  Cada planilla adjunta agrega eventos al historial del animal
                  identificado.
                </p>
              </div>
              <span>
                {new Set(events.map((e) => e.animal)).size} animales
                identificados
              </span>
            </div>
            <div className="health-filters">
              <label>
                <span>Animal</span>
                <input
                  placeholder="Caravana o identificación"
                  value={healthFilters.animal}
                  onChange={(e) =>
                    setHealthFilters((v) => ({ ...v, animal: e.target.value }))
                  }
                />
              </label>
              <label>
                <span>Tipo de trabajo</span>
                <select
                  value={healthFilters.work}
                  onChange={(e) =>
                    setHealthFilters((v) => ({ ...v, work: e.target.value }))
                  }
                >
                  <option value="">Todos</option>
                  {[...new Set(events.map((e) => e.work))].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Categoría</span>
                <select
                  value={healthFilters.category}
                  onChange={(e) =>
                    setHealthFilters((v) => ({
                      ...v,
                      category: e.target.value,
                    }))
                  }
                >
                  <option value="">Todas</option>
                  {[...new Set(events.map((e) => e.category))].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Resultado</span>
                <select
                  value={healthFilters.result}
                  onChange={(e) =>
                    setHealthFilters((v) => ({ ...v, result: e.target.value }))
                  }
                >
                  <option value="">Todos</option>
                  <option>Negativo</option>
                  <option>Sospechoso</option>
                  <option>Positivo</option>
                  <option>Sin resultado</option>
                </select>
              </label>
            </div>
            <div className="health-result-summary">
              <button className={`negative ${healthFilters.result === "Negativo" ? "selected" : ""}`} onClick={() => setHealthFilters((current) => ({ ...current, result: current.result === "Negativo" ? "" : "Negativo" }))}><span>Negativos</span><b>{resultCounts.negative}</b></button>
              <button className={`suspicious ${healthFilters.result === "Sospechoso" ? "selected" : ""}`} onClick={() => setHealthFilters((current) => ({ ...current, result: current.result === "Sospechoso" ? "" : "Sospechoso" }))}><span>Sospechosos</span><b>{resultCounts.suspicious}</b></button>
              <button className={`positive ${healthFilters.result === "Positivo" ? "selected" : ""}`} onClick={() => setHealthFilters((current) => ({ ...current, result: current.result === "Positivo" ? "" : "Positivo" }))}><span>Positivos</span><b>{resultCounts.positive}</b></button>
            </div>
            <div className="health-table health-animal-groups">
              <div className="health-head">
                <span>Animal</span>
                <span>Categoría</span>
                <span>Último control</span>
                <span>Registros</span>
                <span>Estado sanitario</span>
              </div>
              {groupedAnimals.map((group) => {
                const expanded = expandedHealthAnimals.has(group.animal);
                return <section className={`health-animal-group ${expanded ? "expanded" : ""}`} key={group.animal}>
                  <button className="health-animal-row" onClick={() => toggleHealthAnimal(group.animal)}>
                    <b>{group.animal}</b><span>{group.category}</span><time>{group.latest.date}<small>{group.latest.work}</small></time><span>{group.events.length} {group.events.length === 1 ? "registro" : "registros"}</span><span className={`health-result ${norm(group.status).toLowerCase()}`}>{group.status}</span><i>{expanded ? "⌃" : "⌄"}</i>
                  </button>
                  {expanded && <div className="animal-health-timeline">{group.events.map((event, index) => <article key={`${event.date}-${event.work}-${index}`}><time>{event.date}</time><div><b>{event.work}</b><small>{event.practice}</small></div><span className={`health-result ${norm(event.result).toLowerCase()}`}>{event.result}</span></article>)}</div>}
                </section>;
              })}
              {!groupedAnimals.length && (
                <div className="empty-health">
                  No hay eventos que coincidan con los filtros.
                </div>
              )}
            </div>
          </div>
        )}
      </section>
      <section className="panel accordion">
        <button className="accordion-head" onClick={() => toggle("works")}>
          <div>
            <span className="accordion-icon">✓</span>
            <span>
              <b>Historial de trabajos</b>
              <small>Actividades generales realizadas y pendientes</small>
            </span>
          </div>
          <div className="accordion-count">{scopedWorks.length} trabajos</div>
          <i>{open.works ? "⌃" : "⌄"}</i>
        </button>
        {open.works && (
          <div className="accordion-body no-pad">
            <div className="work-head">
              <span>Fecha</span>
              <span>Trabajo</span>
              <span>Cantidad</span>
              <span>Estado</span>
              <span>Carga de animales</span>
            </div>
            {scopedWorks.map(({ work: w, index: i }) => {
              const sigatmWork = isSigatmEligibleWork(w);
              const samplingWork =
                w.type === "Sangrado" || w.type === "Muestreo equino";
              return (
                <article className="work-row" key={i}>
                  <time className="work-date">{w.date}</time>
                  <div className={`work-icon ${samplingWork ? "blood" : ""}`}>
                    {samplingWork ? "◉" : "✓"}
                  </div>
                  <div className="work-detail">
                    <b>{w.type}</b>
                    <span>
                      {w.detail}
                      {w.records?.length
                        ? ` · ${w.source === "excel" ? "Excel" : "Carga manual"}`
                        : ""}
                    </span>
                  </div>
                  <div>
                    <b>{w.animals}</b>
                  </div>
                  <span
                    className="table-status"
                  >
                    {workDisplayStatus(w)}
                  </span>
                  <div className="excel-actions">
                    <a
                      className="template-mini"
                      href="/plantillas/Planilla_Modelo_SIGATM.xlsx"
                      download
                    >
                      ↓ Modelo
                    </a>
                    <label className="attach-excel">
                      ⌕{" "}
                      <span>
                        {sigatmWork
                          ? "Adjuntar Excel para SIGATM"
                          : "Adjuntar Excel"}
                      </span>
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(e) => attachExcel(e.target.files?.[0], i)}
                      />
                    </label>
                    <button
                      className="manual-entry-btn"
                      onClick={() => setManualWork(i)}
                    >
                      {w.records?.length ? "⌕ Ver carga" : "＋ Carga manual"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {manualWork !== null && (
        <ManualAnimalEntry
          producer={producer}
          workIndex={manualWork}
          sigatmCatalog={sigatmCatalog}
          onClose={() => setManualWork(null)}
          onSave={async (updated) => {
            try {
              await saveWorkData(uid, updated.id, updated.works[manualWork]);
              setProducers((v) =>
                v.map((p) => (p.id === updated.id ? updated : p)),
              );
              setSelected(updated);
              setManualWork(null);
            } catch {
              window.alert("No pudimos guardar los animales en Firebase.");
            }
          }}
        />
      )}
      {uploadFeedback && (
        <div className="modal-backdrop">
          <section className="modal-card feedback-modal">
            <div>
              <h2>Planilla cargada</h2>
              <button type="button" onClick={() => setUploadFeedback(null)}>
                ×
              </button>
            </div>
            <span className="feedback-icon">✓</span>
            <h3>Carga completada correctamente</h3>
            <p>
              <b>{uploadFeedback.count} animales</b> fueron incorporados desde{" "}
              {uploadFeedback.file} y ya forman parte del historial sanitario.
            </p>
            <footer>
              <button
                className="primary"
                onClick={() => setUploadFeedback(null)}
              >
                Continuar
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

function AnimalResultsEntry({
  producer,
  workIndex,
  onClose,
  onSave,
}: {
  producer: Producer;
  workIndex: number;
  onClose: () => void;
  onSave: (producer: Producer) => void;
}) {
  const work = producer.works[workIndex];
  const hasSavedResults = Boolean(work.records?.some((record) => record.result));
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState<WorkAnimal["result"] | "">("");
  const [rows, setRows] = useState<WorkAnimal[]>(() =>
    (work.records || []).map((record) => ({
      ...record,
      result: record.result || "Negativo",
    })),
  );
  const visible = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      [row.cuig, row.identifier, `${row.cuig} ${row.identifier}`]
        .some((value) => norm(value).includes(norm(search))),
    )
    .filter(({ row }) => !resultFilter || row.result === resultFilter);
  const counts = {
    negative: rows.filter((row) => row.result === "Negativo").length,
    suspicious: rows.filter((row) => row.result === "Sospechoso").length,
    positive: rows.filter((row) => row.result === "Positivo").length,
  };
  function updateResult(index: number, result: WorkAnimal["result"]) {
    setRows((current) =>
      current.map((row, position) =>
        position === index ? { ...row, result } : row,
      ),
    );
  }
  function save() {
    const works = producer.works.map((current, index) =>
      index === workIndex ? { ...current, records: rows } : current,
    );
    onSave({ ...producer, works });
  }
  return (
    <div className="modal-backdrop">
      <div className="modal-card manual-entry-modal results-entry-modal">
        <div>
          <div><span className="eyebrow">{work.type}</span><h2>{hasSavedResults ? "Ver resultados" : "Cargar resultados"}</h2></div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <p>{hasSavedResults ? "Revisá o corregí los resultados guardados para cada animal." : "Todos los animales aparecen como negativos de manera predeterminada. Cambiá únicamente las excepciones."}</p>
        <div className="results-toolbar">
          <label><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por identificación..." autoFocus /></label>
          <div className="results-counts">
            <button type="button" className={`negative ${resultFilter === "Negativo" ? "selected" : ""}`} onClick={() => setResultFilter((current) => current === "Negativo" ? "" : "Negativo")}>{counts.negative} negativos</button>
            <button type="button" className={`suspicious ${resultFilter === "Sospechoso" ? "selected" : ""}`} onClick={() => setResultFilter((current) => current === "Sospechoso" ? "" : "Sospechoso")}>{counts.suspicious} sospechosos</button>
            <button type="button" className={`positive ${resultFilter === "Positivo" ? "selected" : ""}`} onClick={() => setResultFilter((current) => current === "Positivo" ? "" : "Positivo")}>{counts.positive} positivos</button>
          </div>
        </div>
        <div className="results-grid">
          <div className="results-grid-head"><span>#</span><span>CUIg</span><span>Caravana / identificación</span><span>Categoría</span><span>Resultado</span></div>
          {visible.map(({ row, index }) => (
            <div className="results-grid-row" key={`${row.cuig}-${row.identifier}-${index}`}>
              <span>{index + 1}</span><span>{row.cuig || "—"}</span><b>{row.identifier}</b><span>{row.category}</span>
              <select className={`result-select ${row.result?.toLowerCase()}`} value={row.result} onChange={(event) => updateResult(index, event.target.value as WorkAnimal["result"])}>
                <option>Negativo</option><option>Sospechoso</option><option>Positivo</option>
              </select>
            </div>
          ))}
          {!visible.length && <div className="empty-health">No encontramos animales con esa identificación.</div>}
        </div>
        <footer><button type="button" className="ghost" onClick={onClose}>Cancelar</button><button type="button" className="primary" onClick={save}>Guardar resultados</button></footer>
      </div>
    </div>
  );
}

type ManualAnimal = {
  cuig: string;
  identifier: string;
  category: string;
  result?: WorkAnimal["result"];
};
function ManualAnimalEntry({
  producer,
  workIndex,
  sigatmCatalog,
  onClose,
  onSave,
}: {
  producer: Producer;
  workIndex: number;
  sigatmCatalog: SigatmCatalog;
  onClose: () => void;
  onSave: (producer: Producer) => void;
}) {
  const work = producer.works[workIndex];
  const equine = work.type === "Muestreo equino";
  const canAddResults = work.type === "Sangrado";
  const categories = Object.keys(
    activeCodeMap(
      sigatmCatalog,
      "categories",
      equine ? "EQUINO" : "BOVINO",
    ),
  );
  const expected = parseInt(work.animals) || 0;
  const empty = (result?: WorkAnimal["result"]): ManualAnimal => ({
    cuig: "",
    identifier: "",
    category: "",
    result,
  });
  const existing = work.records || [];
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState<
    "" | "Positivo" | "Sospechoso"
  >("");
  const [quantityConfirmation, setQuantityConfirmation] = useState(false);
  const [resultsEnabled, setResultsEnabled] = useState(() =>
    canAddResults && existing.some((record) => Boolean(record.result)),
  );
  const [rows, setRows] = useState<ManualAnimal[]>(() =>
    existing.length
      ? existing.map((record) =>
          canAddResults
            ? { ...record }
            : {
                cuig: record.cuig,
                identifier: record.identifier,
                category: record.category,
              },
        )
      : Array.from({ length: expected || 1 }, empty),
  );
  const [globalCuig, setGlobalCuig] = useState(() =>
    existing.length && existing.every((r) => r.cuig === existing[0].cuig)
      ? existing[0].cuig
      : "",
  );
  const [globalCategory, setGlobalCategory] = useState(() =>
    existing.length &&
    existing.every((r) => r.category === existing[0].category)
      ? existing[0].category
      : "",
  );
  const valid = rows.filter((r) => r.identifier.trim() && r.category);
  const visibleRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => norm(row.identifier).includes(norm(search)))
    .filter(({ row }) => !resultFilter || row.result === resultFilter);
  const resultCounts = {
    positive: rows.filter((row) => row.result === "Positivo").length,
    suspicious: rows.filter((row) => row.result === "Sospechoso").length,
  };
  const update = (i: number, key: keyof ManualAnimal, value: string) =>
    setRows((v) => v.map((r, n) => (n === i ? { ...r, [key]: value } : r)));
  const focus = (i: number, key: keyof ManualAnimal) =>
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLInputElement | HTMLSelectElement>(
          `[data-manual="${i}-${key}"]`,
        )
        ?.focus(),
    );
  const next = (e: React.KeyboardEvent, i: number, key: keyof ManualAnimal) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (key === "cuig") focus(i, "identifier");
    else if (key === "category" && resultsEnabled) focus(i, "result");
    else {
      if (i === rows.length - 1) {
        setRows((v) => [...v, empty(resultsEnabled ? "Negativo" : undefined)]);
      }
      focus(i + 1, "identifier");
    }
  };
  const paste = (e: React.ClipboardEvent<HTMLInputElement>, start: number) => {
    const lines = e.clipboardData
      .getData("text")
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split("\t"));
    if (!lines.length) return;
    e.preventDefault();
    setRows((v) => {
      const copy = [...v];
      lines.forEach((cells, n) => {
        const i = start + n;
        while (copy.length <= i) copy.push(empty());
        const three = cells.length >= 3;
        const category =
          categories.find(
            (c) => norm(c) === norm(cells[three ? 2 : 1] || ""),
          ) || globalCategory;
        copy[i] = {
          cuig: three ? (cells[0] || "").trim() : globalCuig,
          identifier: (cells[three ? 1 : 0] || "").trim(),
          category,
          result: resultsEnabled ? copy[i]?.result || "Negativo" : undefined,
        };
      });
      return copy;
    });
    focus(start + lines.length - 1, "category");
  };
  const applyCuig = (value: string) => {
    setGlobalCuig(value);
    setRows((v) => v.map((r) => ({ ...r, cuig: value })));
  };
  const applyCategory = (value: string) => {
    setGlobalCategory(value);
    setRows((v) => v.map((r) => ({ ...r, category: value })));
  };
  const enableResults = () => {
    setResultsEnabled(true);
    setRows((current) =>
      current.map((row) => ({ ...row, result: row.result || "Negativo" })),
    );
  };
  const removeResults = () => {
    setResultsEnabled(false);
    setResultFilter("");
    setRows((current) =>
      current.map(({ result: _, ...row }) => row),
    );
  };
  const fillSequence = () => {
    const start = rows.findIndex((r) => r.identifier.trim());
    if (start < 0) {
      window.alert(
        "Primero escribí una caravana o identificación, por ejemplo A236.",
      );
      focus(0, "identifier");
      return;
    }
    const value = rows[start].identifier.trim();
    const match = value.match(/^(.*?)(\d+)$/);
    if (!match) {
      window.alert(
        "La identificación debe terminar en un número para completar la secuencia, por ejemplo A236.",
      );
      focus(start, "identifier");
      return;
    }
    const prefix = match[1],
      first = Number(match[2]),
      digits = match[2].length;
    setRows((v) =>
      v.map((r, i) =>
        i < start
          ? r
          : {
              ...r,
              identifier: `${prefix}${String(first + i - start).padStart(digits, "0")}`,
            },
      ),
    );
    focus(start, "identifier");
  };
  const commitSave = () => {
    const sigatmWork = isSigatmEligibleWork(work);
    const works = producer.works.map((w, i) =>
      i === workIndex
        ? {
            ...w,
            records: valid,
            source: "manual" as const,
            animals: `${valid.length} animales`,
            status: sigatmWork ? "Listo para SIGATM" : w.status,
            sigatmStatus: sigatmWork ? ("Pendiente" as const) : w.sigatmStatus,
          }
        : w,
    );
    onSave({ ...producer, works });
  };
  const save = () => {
    if (!valid.length) return;
    const keys = valid.map((r) => `${norm(r.cuig)}-${norm(r.identifier)}`);
    const duplicates = new Set(keys.filter((v, i) => keys.indexOf(v) !== i));
    if (
      duplicates.size &&
      !window.confirm(
        `Hay ${duplicates.size} identificaciones repetidas. ¿Querés guardarlas igualmente?`,
      )
    )
      return;
    if (expected && valid.length !== expected) {
      setQuantityConfirmation(true);
      return;
    }
    commitSave();
  };
  return (
    <>
    <div className="modal-backdrop">
      <div className="modal-card manual-entry-modal">
        <div>
          <div>
            <span className="eyebrow">{work.type}</span>
            <h2>Carga manual de animales</h2>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <p>
          La grilla preparó {expected || 1} filas según la cantidad del trabajo.
          Enter baja por la columna de caravanas; también podés pegar datos
          desde Excel.
        </p>
        <div className="manual-defaults">
          <label>
            CUIg para todas las muestras <span>Opcional</span>
            <input
              value={globalCuig}
              placeholder="Ej. LU692"
              onChange={(e) => applyCuig(e.target.value.toUpperCase())}
            />
          </label>
          <label>
            Categoría para todas las muestras
            <select
              value={globalCategory}
              onChange={(e) => applyCategory(e.target.value)}
            >
              <option value="">Sin categoría general</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <div
          className={`manual-toolbar ${expected && valid.length !== expected ? "has-difference" : ""}`}
        >
          <b>
            {valid.length} de {expected || rows.length} animales cargados
          </b>
          <span>
            {expected && valid.length !== expected
              ? `Diferencia: ${valid.length - expected > 0 ? "+" : ""}${valid.length - expected}`
              : equine
                ? "Categorías equinas"
                : "Categorías bovinas"}
          </span>
        </div>
        <div className="manual-search-tools">
          <label>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por identificación..."
              autoFocus
            />
          </label>
          {canAddResults && (
            <button
              type="button"
              className={resultsEnabled ? "enabled" : ""}
              onClick={resultsEnabled ? removeResults : enableResults}
            >
              {resultsEnabled ? "− Quitar resultados" : "+ Agregar resultados"}
            </button>
          )}
          {resultsEnabled &&
            (resultCounts.positive > 0 || resultFilter === "Positivo") && (
            <button
              type="button"
              className={`result-quick-filter positive ${resultFilter === "Positivo" ? "selected" : ""}`}
              onClick={() =>
                setResultFilter((current) =>
                  current === "Positivo" ? "" : "Positivo",
                )
              }
            >
              Positivos {resultCounts.positive}
            </button>
          )}
          {resultsEnabled &&
            (resultCounts.suspicious > 0 || resultFilter === "Sospechoso") && (
            <button
              type="button"
              className={`result-quick-filter suspicious ${resultFilter === "Sospechoso" ? "selected" : ""}`}
              onClick={() =>
                setResultFilter((current) =>
                  current === "Sospechoso" ? "" : "Sospechoso",
                )
              }
            >
              Sospechosos {resultCounts.suspicious}
            </button>
          )}
        </div>
        <div className={`manual-grid ${resultsEnabled ? "with-results" : ""}`}>
          <div className="manual-grid-head">
            <span>#</span>
            <span>CUIg · opcional</span>
            <span className="manual-identifier-head">
              Caravana / identificación{" "}
              <button
                type="button"
                title="Completar numeración correlativa"
                aria-label="Completar caravanas correlativas"
                onClick={fillSequence}
              >
                ↓
              </button>
            </span>
            <span>Categoría</span>
            {resultsEnabled && <span>Resultado</span>}
            <span />
          </div>
          {visibleRows.map(({ row, index: i }) => (
            <div
              className={`manual-grid-row ${resultsEnabled && row.result ? `result-${row.result.toLowerCase()}` : ""}`}
              key={i}
            >
              <span>{i + 1}</span>
              <input
                data-manual={`${i}-cuig`}
                value={row.cuig}
                placeholder="LU692"
                onChange={(e) =>
                  update(i, "cuig", e.target.value.toUpperCase())
                }
                onKeyDown={(e) => next(e, i, "cuig")}
              />
              <input
                data-manual={`${i}-identifier`}
                value={row.identifier}
                placeholder="Ej. A236"
                onChange={(e) => update(i, "identifier", e.target.value)}
                onKeyDown={(e) => next(e, i, "identifier")}
                onPaste={(e) => paste(e, i)}
              />
              <select
                data-manual={`${i}-category`}
                value={row.category}
                onChange={(e) => update(i, "category", e.target.value)}
                onKeyDown={(e) => next(e, i, "category")}
              >
                <option value="">Seleccionar…</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              {resultsEnabled && (
                <select
                  className={`manual-result-select ${row.result?.toLowerCase()}`}
                  data-manual={`${i}-result`}
                  value={row.result || "Negativo"}
                  onChange={(e) =>
                    update(
                      i,
                      "result",
                      e.target.value as NonNullable<WorkAnimal["result"]>,
                    )
                  }
                  onKeyDown={(e) => next(e, i, "result")}
                >
                  <option>Negativo</option>
                  <option>Sospechoso</option>
                  <option>Positivo</option>
                </select>
              )}
              <button
                type="button"
                aria-label={`Eliminar fila ${i + 1}`}
                onClick={() =>
                  setRows((v) =>
                    v.length === 1 ? [empty()] : v.filter((_, n) => n !== i),
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
          {!visibleRows.length && (
            <div className="manual-empty-search">
              No encontramos animales con esa identificación.
            </div>
          )}
        </div>
        <button
          type="button"
          className="add-manual-row"
          onClick={() => {
            setRows((v) => [
              ...v,
              {
                cuig: globalCuig,
                identifier: "",
                category: globalCategory,
                result: resultsEnabled ? "Negativo" : undefined,
              },
            ]);
            focus(rows.length, "identifier");
          }}
        >
          ＋ Agregar fila
        </button>
        <footer>
          <button type="button" className="ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary"
            disabled={!valid.length}
            onClick={save}
          >
            Guardar {valid.length || ""} animales
          </button>
        </footer>
      </div>
    </div>
    {quantityConfirmation && (
      <div className="modal-backdrop quantity-confirmation-backdrop">
        <section className="modal-card feedback-modal quantity-confirmation-modal">
          <div>
            <h2>Actualizar cantidad de animales</h2>
            <button type="button" onClick={() => setQuantityConfirmation(false)}>×</button>
          </div>
          <span className="feedback-icon warning">!</span>
          <h3>La cantidad cargada es diferente</h3>
          <p>
            El trabajo indica <b>{expected} animales</b>, pero la carga contiene{" "}
            <b>{valid.length} animales</b>.
          </p>
          <p>Si continuás, LabOVet actualizará automáticamente la cantidad del trabajo.</p>
          <footer>
            <button type="button" className="ghost" onClick={() => setQuantityConfirmation(false)}>
              Volver a revisar
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setQuantityConfirmation(false);
                commitSave();
              }}
            >
              Guardar y actualizar a {valid.length}
            </button>
          </footer>
        </section>
      </div>
    )}
    </>
  );
}

function RuralAgenda({ producers }: { producers: Producer[] }) {
  const [filter, setFilter] = useState<
    "todos" | "pendientes" | "realizados"
  >("todos");
  const [columnFilters, setColumnFilters] = useState({
    date: "",
    producer: "",
    establishment: "",
    work: "",
    quantity: "",
    status: "",
  });
  const setColumn = (key: keyof typeof columnFilters, value: string) =>
    setColumnFilters((current) => ({ ...current, [key]: value }));
  const all = producers.flatMap((producer) =>
    producer.works.map((work) => ({
      producer,
      work,
      establishment: workEstablishment(producer, work),
      date: new Date(dateToIso(displayDate(work.date)) + "T12:00:00"),
    })),
  );
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const pending = all
    .filter((item) => item.date > now)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const completed = all
    .filter((item) => item.date <= now)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  const base =
    filter === "pendientes"
      ? pending
      : filter === "realizados"
        ? completed
        : [...pending, ...completed];
  const visible = base.filter(({ producer, work, establishment, date }) => {
    const status = date > now ? "Pendiente" : "Realizado";
    const quantity = work.animals.replace(/\D/g, "");
    return (
      (!columnFilters.date || displayDate(work.date) === columnFilters.date) &&
      (!columnFilters.producer || producer.name === columnFilters.producer) &&
      (!columnFilters.establishment ||
        establishment.name === columnFilters.establishment) &&
      (!columnFilters.work || work.type === columnFilters.work) &&
      (!columnFilters.quantity || quantity.includes(columnFilters.quantity)) &&
      (!columnFilters.status || status === columnFilters.status)
    );
  });
  const producerOptions = [...new Set(base.map((item) => item.producer.name))];
  const establishmentOptions = [
    ...new Set(base.map((item) => item.establishment.name)),
  ];
  const workOptions = [...new Set(base.map((item) => item.work.type))];
  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">GRANDES ANIMALES</span>
          <h1>Agenda rural</h1>
          <p>
            Se genera automáticamente con los trabajos cargados desde cada
            productor.
          </p>
        </div>
        <div className="status-pill">
          <i /> Agenda sincronizada
        </div>
      </header>
      <div className="agenda-stats">
        <article className="panel">
          <span>Próximos trabajos</span>
          <strong>{pending.length}</strong>
          <small>actividades pendientes</small>
        </article>
        <article className="panel">
          <span>Trabajos realizados</span>
          <strong>{completed.length}</strong>
          <small>registrados en el historial</small>
        </article>
        <article className="panel">
          <span>Próxima visita</span>
          <strong>{pending[0]?.work.date || "—"}</strong>
          <small>{pending[0]?.producer.name || "Sin actividades"}</small>
        </article>
      </div>
      <section className="panel agenda-panel">
        <div className="agenda-toolbar">
          <div>
            <h2>Trabajos rurales</h2>
            <p>
              La fecha define automáticamente en qué listado aparece cada
              trabajo.
            </p>
          </div>
          <div className="agenda-filters">
            <button
              className={filter === "todos" ? "selected" : ""}
              onClick={() => setFilter("todos")}
            >
              Todos <b>{all.length}</b>
            </button>
            <button
              className={filter === "pendientes" ? "selected" : ""}
              onClick={() => setFilter("pendientes")}
            >
              Pendientes <b>{pending.length}</b>
            </button>
            <button
              className={filter === "realizados" ? "selected" : ""}
              onClick={() => setFilter("realizados")}
            >
              Realizados <b>{completed.length}</b>
            </button>
          </div>
        </div>
        <div className="agenda-head filter-head">
          <label>
            <span>Fecha</span>
            <DateField
              value={columnFilters.date}
              onChange={(value) => setColumn("date", value)}
            />
          </label>
          <label>
            <span>Productor</span>
            <select
              value={columnFilters.producer}
              onChange={(e) => setColumn("producer", e.target.value)}
            >
              <option value="">Todos</option>
              {producerOptions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Establecimiento</span>
            <select
              value={columnFilters.establishment}
              onChange={(e) => setColumn("establishment", e.target.value)}
            >
              <option value="">Todos</option>
              {establishmentOptions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Trabajo</span>
            <select
              value={columnFilters.work}
              onChange={(e) => setColumn("work", e.target.value)}
            >
              <option value="">Todos</option>
              {workOptions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Cantidad</span>
            <input
              type="number"
              min="0"
              placeholder="Todas"
              value={columnFilters.quantity}
              onChange={(e) => setColumn("quantity", e.target.value)}
            />
          </label>
          <label>
            <span>Estado</span>
            <select
              value={columnFilters.status}
              onChange={(e) => setColumn("status", e.target.value)}
            >
              <option value="">Todos</option>
              <option>Pendiente</option>
              <option>Realizado</option>
            </select>
          </label>
        </div>
        {visible.length ? (
          visible.map(({ producer, work, establishment, date }, i) => {
            const pendingWork = date > now;
            return (
            <article
              className="agenda-row"
              key={`${producer.id}-${i}-${work.date}`}
            >
              <time>
                <b>{work.date}</b>
                <small>
                  {pendingWork ? "Programado" : "Registrado"}
                </small>
              </time>
              <div>
                <b>{producer.name}</b>
                <span>{establishment.renspa}</span>
              </div>
              <div>
                <b>{establishment.name}</b>
                <span>{establishment.address}</span>
              </div>
              <div>
                <b>{work.type}</b>
                <span>{work.detail}</span>
              </div>
              <b>{work.animals}</b>
              <span className="table-status">
                {pendingWork ? "Pendiente" : "Realizado"}
              </span>
            </article>
            );
          })
        ) : (
          <div className="empty-agenda">
            <b>No hay trabajos que coincidan</b>
            <span>Probá quitando alguno de los filtros.</span>
          </div>
        )}
      </section>
      <div className="draft-note">
        <b>Agenda automática</b>
        <span>
          No se cargan turnos desde esta pantalla: todo nace en Productores y se
          organiza según su fecha.
        </span>
      </div>
    </>
  );
}

function validateRows(
  rows: AnimalRow[],
  categories: Record<string, number>,
  ages: Record<string, number>,
): ErrorMap {
  const errors: ErrorMap = {};
  const tubes = new Map<string, number>();
  const ids = new Map<string, number>();
  rows.forEach((r, i) => {
    if (!r.tube) errors[`${i}:tube`] = "Tubo vacío";
    else if (tubes.has(r.tube)) {
      errors[`${i}:tube`] = "Tubo repetido";
      errors[`${tubes.get(r.tube)}:tube`] = "Tubo repetido";
    } else tubes.set(r.tube, i);
    if (!r.identifier) errors[`${i}:identifier`] = "Identificador vacío";
    else if (ids.has(r.identifier)) {
      errors[`${i}:identifier`] = "Identificador repetido";
      errors[`${ids.get(r.identifier)}:identifier`] = "Identificador repetido";
    } else ids.set(r.identifier, i);
    if (!findCode(categories, r.category))
      errors[`${i}:category`] = "Categoría inválida";
    if (!findCode(ages, r.age)) errors[`${i}:age`] = "Edad inválida";
    if (r.vaccination && !isValidDate(r.vaccination))
      errors[`${i}:vaccination`] = "Ingresar una fecha válida: DD/MM/AAAA";
  });
  return errors;
}
