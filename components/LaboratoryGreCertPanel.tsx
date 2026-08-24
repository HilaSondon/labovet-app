"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  LaboratoryProtocol,
  LaboratoryProfile,
  LaboratoryVeterinarian,
  EMPTY_LABORATORY_PROFILE,
  loadLaboratoryData,
  saveLaboratoryProtocol,
  saveLaboratoryProfile,
  saveLaboratoryVeterinarians,
} from "../lib/laboratory-data";
import {
  deleteLaboratoryRecord,
  LaboratoryManagementRecord,
  loadLaboratoryModule,
  saveLaboratoryRecord,
} from "../lib/laboratory-management-data";
import LaboratoryProtocolWorkspace, { exportIntakeProtocolPdf, ProtocolWorkspaceMode } from "./LaboratoryProtocolWorkspace";

export type LaboratorySection = "load" | "protocols" | "veterinarians" | "statistics" | "settings";
type GrecertSubsample = { identificacion?: unknown; identificacionInternaDeLaboratorio?: unknown; codigoTipoIdentificacion?: unknown; codigoDeEdad?: unknown; codigoDeCategoria?: unknown };
type GrecertAnalysis = { codigoEnsayo?: unknown; codigoAnalito?: unknown; codigoMatriz?: unknown; codigoTecnica?: unknown; subMuestras?: unknown };
type GrecertReport = { numeroInforme?: unknown; codigoLaboratorio?: unknown; renspaUnidadProductiva?: unknown; codigotipoDocumentoUno?: unknown; numeroDocumentoUno?: unknown; cuitDeFuncionario?: unknown; muestra?: { fechaDeToma?: unknown; fechaDeRecepcion?: unknown; analisis?: unknown } };
type ResultRow = { number: number; identification: string; internalNumber: string; identificationType: string; category: string; age: string; analysisCode: string; resultCode: string; screeningValue: string; antigen: string; brand: string; batch: string; expiration: string; stamp: string; confirmatoryMethod: "" | "FPA" | "SAT"; confirmatoryValue: string; confirmatoryResultCode: string; confirmatoryAntigen: string; confirmatoryBrand: string; confirmatoryBatch: string; confirmatoryExpiration: string; confirmatoryStamp: string };

const RESULTS = [{ code: "1", label: "Negativo" }, { code: "21", label: "Positivo" }, { code: "62", label: "Sospechoso" }];
const CATEGORIES: Record<string, string> = { "22": "Padrillo" };
const text = (value: unknown) => value == null ? "" : String(value);
const digits = (value: string) => value.replace(/\D/g, "");
const safeId = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]/g, "-") || String(Date.now());
const assayLabel = (code: string) => code === "1056" ? "Anemia Infecciosa Equina" : `Brucelosis bovina${code ? ` · ensayo ${code}` : ""}`;

function parseReports(raw: string): GrecertReport[] {
  const parsed: unknown = JSON.parse(raw.replace(/^\uFEFF/, "").trim());
  if (!Array.isArray(parsed) || !parsed.length) throw new Error("El TXT no contiene informes de GRECERT.");
  parsed.forEach((item) => {
    const report = item as GrecertReport;
    if (!report?.numeroInforme || !Array.isArray(report.muestra?.analisis)) throw new Error("El TXT no tiene la estructura esperada.");
  });
  return parsed as GrecertReport[];
}

function rowsFromReport(report: GrecertReport): ResultRow[] {
  let number = 0;
  return ((report.muestra?.analisis || []) as GrecertAnalysis[]).flatMap((analysis) =>
    (Array.isArray(analysis.subMuestras) ? analysis.subMuestras as GrecertSubsample[] : []).map((sample) => ({
      number: ++number, identification: text(sample.identificacion), internalNumber: text(sample.identificacionInternaDeLaboratorio),
      identificationType: text(sample.codigoTipoIdentificacion), category: text(sample.codigoDeCategoria), age: text(sample.codigoDeEdad),
      analysisCode: text(analysis.codigoEnsayo), resultCode: "", screeningValue: "", antigen: "", brand: "", batch: "", expiration: "", stamp: "", confirmatoryMethod: "", confirmatoryValue: "", confirmatoryResultCode: "", confirmatoryAntigen: "", confirmatoryBrand: "", confirmatoryBatch: "", confirmatoryExpiration: "", confirmatoryStamp: "",
    })),
  );
}

export default function LaboratoryGreCertPanel({ uid, section = "load" }: { uid: string; section?: LaboratorySection }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const vetInputRef = useRef<HTMLInputElement>(null);
  const [reports, setReports] = useState<GrecertReport[]>([]);
  const [selectedReport, setSelectedReport] = useState(0);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [firstStamp, setFirstStamp] = useState("");
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState<"all" | "21" | "62">("all");
  const [protocols, setProtocols] = useState<LaboratoryProtocol[]>([]);
  const [sampleIntakes, setSampleIntakes] = useState<LaboratoryManagementRecord[]>([]);
  const [veterinarians, setVeterinarians] = useState<LaboratoryVeterinarian[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [protocolSearch, setProtocolSearch] = useState("");
  const [excelGenerated, setExcelGenerated] = useState(false);
  const [profile, setProfile] = useState<LaboratoryProfile>(EMPTY_LABORATORY_PROFILE);

  useEffect(() => {
    let active = true;
    Promise.all([loadLaboratoryData(uid), loadLaboratoryModule(uid, "samples")]).then(([data, intakes]) => { if (active) { setProtocols(data.protocols); setVeterinarians(data.veterinarians); setProfile(data.profile); setSampleIntakes(intakes); } })
      .catch((caught) => { console.error(caught); if (active) setError("No pudimos cargar los datos del laboratorio."); })
      .finally(() => active && setLoadingData(false));
    return () => { active = false; };
  }, [uid]);

  const report = reports[selectedReport];
  const analyses = (report?.muestra?.analisis || []) as GrecertAnalysis[];
  const mainAnalysis = analyses[0];
  const assayName = assayLabel(text(mainAnalysis?.codigoEnsayo));
  const isAie = text(mainAnalysis?.codigoEnsayo) === "1056";
  const isBrucellosis = Boolean(report) && !isAie;
  const veterinarian = veterinarians.find((item) => digits(item.cuit) === digits(text(report?.cuitDeFuncionario)));
  const completed = rows.filter((row) => row.resultCode).length;
  const requiredComplete = rows.filter((row) => row.resultCode && row.antigen && row.brand && row.batch && row.expiration).length;
  const ready = rows.length > 0 && requiredComplete === rows.length;
  const positive = rows.filter((row) => row.resultCode === "21").length;
  const suspicious = rows.filter((row) => row.resultCode === "62").length;
  const confirmatoryRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => isBrucellosis && row.resultCode === "21");
  const confirmatoryReady = confirmatoryRows.length > 0 && confirmatoryRows.every(({ row }) => row.confirmatoryMethod && row.confirmatoryResultCode && row.confirmatoryAntigen && row.confirmatoryBrand && row.confirmatoryBatch && row.confirmatoryExpiration);
  const visibleRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => {
    const query = search.trim().toLowerCase();
    return (!query || row.identification.toLowerCase().includes(query) || row.internalNumber.toLowerCase().includes(query)) && (resultFilter === "all" || row.resultCode === resultFilter);
  });

  const openReport = (index: number, source = reports) => { setSelectedReport(index); setRows(rowsFromReport(source[index])); setResultFilter("all"); setSearch(""); setFeedback(""); };
  const readFile = async (file?: File) => {
    if (!file) return;
    setError("");
    if (!file.name.toLowerCase().endsWith(".txt")) return setError("Seleccioná el archivo .txt descargado desde GRECERT.");
    try {
      const parsed = parseReports(await file.text()); setReports(parsed); setFileName(file.name); openReport(0, parsed);
      setFeedback(`${parsed.length} informe${parsed.length === 1 ? "" : "s"} detectado${parsed.length === 1 ? "" : "s"} correctamente.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos leer el TXT."); }
  };
  const updateRow = (index: number, changes: Partial<ResultRow>) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row));
  const applyColumn = (field: "antigen" | "brand" | "batch" | "expiration" | "stamp") => {
    const source = rows.find((row) => row[field].trim())?.[field].trim();
    if (!source) return setError("Primero completá un valor en esa columna.");
    setRows((current) => current.map((row) => ({ ...row, [field]: source }))); setFeedback("El dato se aplicó a todas las muestras.");
  };
  const applyConfirmatoryColumn = (field: "confirmatoryMethod" | "confirmatoryAntigen" | "confirmatoryBrand" | "confirmatoryBatch" | "confirmatoryExpiration" | "confirmatoryStamp") => {
    const source = confirmatoryRows.find(({ row }) => String(row[field]).trim())?.row[field];
    if (!source) return setError("Primero completá un valor confirmatorio en esa columna.");
    setRows((current) => current.map((row) => row.resultCode === "21" ? { ...row, [field]: source } : row));
    setFeedback("El dato confirmatorio se aplicó a todas las muestras reactivas.");
  };
  const assignConfirmatoryStamps = () => {
    const source = confirmatoryRows.find(({ row }) => /^\d+$/.test(row.confirmatoryStamp.trim()))?.row.confirmatoryStamp.trim();
    if (!source) return setError("Primero completá la primera estampilla confirmatoria.");
    const start = BigInt(source); let position = 0;
    setRows((current) => current.map((row) => row.resultCode === "21" ? { ...row, confirmatoryStamp: String(start + BigInt(position++)) } : row));
  };
  const nextCell = (event: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, column: string) => {
    if (event.key !== "Enter") return; event.preventDefault();
    const next = document.querySelector<HTMLInputElement>(`[data-lab-row="${rowIndex + 1}"][data-lab-column="${column}"]`); next?.focus(); next?.select();
  };
  const assignStamps = () => {
    const source = firstStamp.trim() || rows.find((row) => row.stamp.trim())?.stamp.trim() || "";
    if (!/^\d+$/.test(source)) return setError("Ingresá la primera estampilla numérica en la tabla o arriba.");
    const start = BigInt(source); setRows((current) => current.map((row, index) => ({ ...row, stamp: String(start + BigInt(index)) })));
    setFeedback("Estampillas correlativas completadas.");
  };

  const exportGreCert = () => {
    if (!ready || !report) return;
    const headers = ["numero", "identificacion", "idTipoIdentificacion", "nroInternoLab", "idCategoria", "idEdad", "sexo", "fechaVacunacion", "antigenoKit", "marca", "lote", "vtoAntigeno", "estampilla", "idResultadoLetra", "resultadoNumero", "idUnidadDeMedida", "observacion"];
    const output = rows.map((row) => [String(row.number), "", "", "", "", "", "", "", row.antigen, row.brand, row.batch, row.expiration, row.stamp, row.resultCode, isBrucellosis ? row.screeningValue : "", "", ""]);
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...output]); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");
    XLSX.writeFile(workbook, `Resultados_GRECERT_Acta_${text(report.numeroDocumentoUno) || "sin-numero"}.xls`, { bookType: "biff8" });
    setExcelGenerated(true);
  };
  const exportConfirmatoryGreCert = () => {
    if (!confirmatoryReady || !report) return;
    const headers = ["numero", "identificacion", "idTipoIdentificacion", "nroInternoLab", "idCategoria", "idEdad", "sexo", "fechaVacunacion", "antigenoKit", "marca", "lote", "vtoAntigeno", "estampilla", "idResultadoLetra", "resultadoNumero", "idUnidadDeMedida", "observacion"];
    const output = confirmatoryRows.map(({ row }, index) => [String(index + 1), row.identification, row.identificationType, row.internalNumber, row.category, row.age, "", "", row.confirmatoryAntigen, row.confirmatoryBrand, row.confirmatoryBatch, row.confirmatoryExpiration, row.confirmatoryStamp, row.confirmatoryResultCode, row.confirmatoryValue, "", `Técnica confirmatoria ${row.confirmatoryMethod}`]);
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...output]); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Confirmatorias");
    XLSX.writeFile(workbook, `Resultados_GRECERT_Confirmatorias_Acta_${text(report.numeroDocumentoUno) || "sin-numero"}.xls`, { bookType: "biff8" });
    setExcelGenerated(true);
  };
  const currentProtocol = (): LaboratoryProtocol | null => report ? {
    id: safeId(text(report.numeroInforme) || text(report.numeroDocumentoUno)), reportNumber: text(report.numeroInforme), actNumber: text(report.numeroDocumentoUno),
    date: text(report.muestra?.fechaDeToma), receptionDate: text(report.muestra?.fechaDeRecepcion), renspa: text(report.renspaUnidadProductiva),
    veterinarianCuit: text(report.cuitDeFuncionario), veterinarianName: veterinarian?.name || "Veterinario no identificado", assayName,
    sampleCount: rows.length, positiveCount: positive, suspiciousCount: suspicious, report: report as Record<string, unknown>,
    rows: rows as unknown as Array<Record<string, unknown>>, savedAt: new Date().toISOString(),
  } : null;
  const saveProtocol = async () => {
    const protocol = currentProtocol(); if (!protocol) return; setSaving(true); setError("");
    try { await saveLaboratoryProtocol(uid, protocol); setProtocols((current) => [protocol, ...current.filter((item) => item.id !== protocol.id)]); setFeedback("Protocolo guardado. Ya está disponible en Protocolos."); }
    catch (caught) { console.error(caught); setError("No pudimos guardar el protocolo en Firebase."); }
    finally { setSaving(false); }
  };
  const exportPdf = async () => {
    if (!report) return;
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const label = (name: string, value: string, x: number, y: number, width = 62) => { if (!value) return; pdf.setTextColor(91, 111, 119); pdf.setFontSize(6.5); pdf.setFont("helvetica", "bold"); pdf.text(name.toUpperCase(), x, y); pdf.setTextColor(24, 58, 70); pdf.setFontSize(8.5); pdf.setFont("helvetica", "normal"); pdf.text(pdf.splitTextToSize(value, width), x, y + 4); };
    pdf.setFillColor(18, 63, 82); pdf.rect(0, 0, 297, 29, "F"); pdf.setTextColor(255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(17); pdf.text(profile.laboratoryName || "Informe de laboratorio", 12, 10);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); const headerDetails = [profile.laboratoryCode && `Código ${profile.laboratoryCode}`, profile.technicalDirector && `Director técnico: ${profile.technicalDirector}`, profile.address, profile.phone && `Tel. ${profile.phone}`].filter(Boolean).join("  |  "); pdf.text(headerDetails || "Documento generado desde LabOVet", 12, 18, { maxWidth: 270 });
    pdf.setTextColor(18, 63, 82); pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.text(`INFORME DE ENSAYO N.º ${text(report.numeroInforme)}`, 12, 40); pdf.setFontSize(8); pdf.setFont("helvetica", "normal"); pdf.setTextColor(90); pdf.text(`Fecha de emisión: ${new Date().toLocaleDateString("es-AR")}`, 224, 40);
    pdf.setDrawColor(190, 207, 211); pdf.line(12, 45, 285, 45);
    label("Motivo", `Código ${text((report as Record<string, unknown>).codigoMotivo)}`, 12, 52); label("Submotivo", `Código ${text((report as Record<string, unknown>).codigoSubMotivo)}`, 77, 52); label("Director técnico", profile.technicalDirector, 142, 52); label("Laboratorio", [profile.laboratoryCode || text(report.codigoLaboratorio), profile.laboratoryName].filter(Boolean).join(" - "), 207, 52, 76);
    pdf.setFillColor(239, 245, 245); pdf.roundedRect(12, 65, 273, 22, 2, 2, "F"); pdf.setTextColor(18, 63, 82); pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.text("LUGAR DE TOMA DE MUESTRA", 16, 72);
    label("N.º oficial / RENSPA", text(report.renspaUnidadProductiva), 16, 78); label("Funcionario actuante", `${veterinarian?.name || "No identificado"} (${text(report.cuitDeFuncionario)})`, 91, 78, 96);
    pdf.setTextColor(18, 63, 82); pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.text("DETALLE DE LA MUESTRA RECIBIDA", 12, 96); label("Tamaño", `${rows.length} muestras`, 12, 102); label("Fecha de toma", text(report.muestra?.fechaDeToma), 77, 102); label("Ingreso al laboratorio", text(report.muestra?.fechaDeRecepcion), 142, 102); label("Documento", `ACTA N.º ${text(report.numeroDocumentoUno)}`, 221, 102);
    pdf.setFillColor(225, 242, 238); pdf.roundedRect(12, 116, 273, 18, 2, 2, "F"); pdf.setTextColor(5, 112, 91); pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.text(`ENSAYO: ${assayName.toUpperCase()}`, 16, 124); pdf.setFontSize(7.5); pdf.text(`Matriz: ${text(mainAnalysis?.codigoMatriz) === "2" ? "SUERO" : text(mainAnalysis?.codigoMatriz)}   |   Técnica: ${text(mainAnalysis?.codigoTecnica) === "37" ? "IDGA (INMUNODIFUSIÓN EN GEL DE AGAR)" : text(mainAnalysis?.codigoTecnica)}   |   Analito: ${text(mainAnalysis?.codigoAnalito)}`, 16, 130);
    autoTable(pdf, { startY: 139, margin: { left: 12, right: 12, bottom: 17 }, head: [["#", "Identificación", "Categoría", "Edad", "Resultado", ...(isBrucellosis ? ["Valor BPA"] : []), "Antígeno / Kit", "Marca", "Lote", "Vencimiento", "Estampilla"]], body: rows.map((row) => [row.number, row.identification, CATEGORIES[row.category] || row.category, row.age === "10" ? "N/A" : row.age, RESULTS.find((option) => option.code === row.resultCode)?.label || "Pendiente", ...(isBrucellosis ? [row.screeningValue] : []), row.antigen, row.brand, row.batch, row.expiration, row.stamp]), styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [18, 63, 82] }, alternateRowStyles: { fillColor: [247, 250, 250] } });
    const exceptions = rows.filter((row) => row.resultCode === "21" || row.resultCode === "62");
    if (exceptions.length) { pdf.addPage("a4", "landscape"); pdf.setFillColor(18, 63, 82); pdf.rect(0, 0, 297, 25, "F"); pdf.setTextColor(255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.text("RESUMEN DE POSITIVOS Y SOSPECHOSOS", 12, 15); pdf.setTextColor(40); pdf.setFontSize(10); pdf.text(`${positive} positivos - ${suspicious} sospechosos`, 12, 35); autoTable(pdf, { startY: 42, head: [["#", "Identificación", "Categoría", "Resultado", "Antígeno / Kit", "Marca", "Lote", "Vencimiento", "Estampilla"]], body: exceptions.map((row) => [row.number, row.identification, CATEGORIES[row.category] || row.category, RESULTS.find((option) => option.code === row.resultCode)?.label || "", row.antigen, row.brand, row.batch, row.expiration, row.stamp]), headStyles: { fillColor: [163, 55, 55] } }); }
    const pageCount = pdf.getNumberOfPages(); for (let page = 1; page <= pageCount; page += 1) { pdf.setPage(page); pdf.setDrawColor(205, 215, 218); pdf.line(12, 198, 285, 198); pdf.setTextColor(100); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.text("Informe generado por LabOVet a partir de la información oficial importada desde GRECERT.", 12, 203); pdf.text(`Página ${page} de ${pageCount}`, 266, 203); }
    pdf.save(`Informe_LabOVet_${text(report.numeroInforme)}.pdf`);
  };
  const importVeterinarians = async (file?: File) => {
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" }); const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
      const imported = data.map((item) => { const nameKey = Object.keys(item).find((key) => key.trim().toLowerCase().startsWith("veterin")); const cuitKey = Object.keys(item).find((key) => key.trim().toLowerCase() === "cuit"); const name = text(nameKey ? item[nameKey] : "").trim(); const cuit = digits(text(cuitKey ? item[cuitKey] : "")); return { id: safeId(cuit), name, cuit }; }).filter((item) => item.name && item.cuit.length >= 10);
      if (!imported.length) throw new Error("No encontramos las columnas Veterinarios y CUIT.");
      await saveLaboratoryVeterinarians(uid, imported); setVeterinarians((current) => [...imported, ...current.filter((old) => !imported.some((item) => item.id === old.id))].sort((a, b) => a.name.localeCompare(b.name))); setFeedback(`${imported.length} veterinarios importados correctamente.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos importar el Excel."); }
  };
  const addVeterinarian = async (name: string, cuitValue: string) => {
    const cuit = digits(cuitValue);
    if (!name.trim() || cuit.length < 10) throw new Error("Completá el nombre y un CUIT válido.");
    const item = { id: safeId(cuit), name: name.trim(), cuit };
    await saveLaboratoryVeterinarians(uid, [item]);
    setVeterinarians((current) => [item, ...current.filter((old) => old.id !== item.id)].sort((a, b) => a.name.localeCompare(b.name)));
    setFeedback("Veterinario guardado correctamente.");
  };
  const updateProfile = async (nextProfile: LaboratoryProfile) => {
    await saveLaboratoryProfile(uid, nextProfile);
    setProfile(nextProfile);
  };

  if (section === "protocols") return <Protocols uid={uid} protocols={protocols} sampleIntakes={sampleIntakes} loading={loadingData} search={protocolSearch} setSearch={setProtocolSearch} />;
  if (section === "veterinarians") return <Veterinarians veterinarians={veterinarians} inputRef={vetInputRef} onFile={importVeterinarians} onAdd={addVeterinarian} feedback={feedback} error={error} />;
  if (section === "statistics") return <Statistics protocols={protocols} loading={loadingData} />;
  if (section === "settings") return <LaboratorySettings profile={profile} onSave={updateProfile} />;

  return <><header className="topbar module-topbar laboratory-header"><div><span className="eyebrow">LABORATORIO</span><h1>Carga de resultados GRECERT</h1><p>Convertí el TXT oficial en un protocolo, un informe y un Excel listo para importar.</p></div></header>
    {!report ? <section className="panel grecert-upload-panel"><input ref={inputRef} type="file" accept=".txt,text/plain" hidden onChange={(event) => readFile(event.target.files?.[0])} /><button type="button" className={dragging ? "grecert-dropzone dragging" : "grecert-dropzone"} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files?.[0]); }}><span>TXT</span><h2>Arrastrá el archivo descargado desde GRECERT</h2><p>LabOVet detectará el acta, las muestras y el veterinario por CUIT.</p><b>Seleccionar archivo TXT</b></button>{error && <div className="laboratory-message error">{error}</div>}</section> : <>
      <div className="laboratory-outside-action"><button type="button" onClick={() => { setReports([]); setRows([]); setFeedback(""); setError(""); }}>＋ Cargar otro TXT</button></div>
      <section className="panel laboratory-protocol"><div className="protocol-heading"><div><span>INFORME DE ENSAYO</span><h2>N.º {text(report.numeroInforme)}</h2><p>{text(report.codigoLaboratorio)} · {veterinarian?.name || "Veterinario no identificado"}</p></div><div className="protocol-heading-actions"><div><span>ACTA SIGATM</span><b>N.º {text(report.numeroDocumentoUno)}</b></div></div></div>{reports.length > 1 && <label className="protocol-report-picker">Informe<select value={selectedReport} onChange={(event) => openReport(Number(event.target.value))}>{reports.map((item, index) => <option key={`${text(item.numeroInforme)}-${index}`} value={index}>Informe {text(item.numeroInforme)}</option>)}</select></label>}<div className="protocol-section"><h3>Identificación del protocolo</h3><div className="protocol-data-grid"><p><span>RENSPA</span><b>{text(report.renspaUnidadProductiva)}</b></p><p><span>Veterinario</span><b>{veterinarian?.name || "No registrado"}</b><small>CUIT {text(report.cuitDeFuncionario)}</small></p><p><span>Laboratorio</span><b>{text(report.codigoLaboratorio)}</b></p><p><span>Muestras</span><b>{rows.length}</b></p></div></div><div className="protocol-section"><h3>Análisis realizado</h3><div className="protocol-data-grid"><p><span>Ensayo</span><b>{assayName}</b></p><p><span>Fecha de toma</span><b>{text(report.muestra?.fechaDeToma)}</b></p><p><span>Fecha de recepción</span><b>{text(report.muestra?.fechaDeRecepcion)}</b></p><p><span>Técnica</span><b>{text(mainAnalysis?.codigoTecnica) === "37" ? "IDGA" : text(mainAnalysis?.codigoTecnica)}</b></p></div></div><p className="protocol-source">Archivo fuente: {fileName}. Los datos oficiales permanecen bloqueados.</p></section>
      {feedback && <div className="laboratory-message success">{feedback}<button onClick={() => setFeedback("")}>×</button></div>}{error && <div className="laboratory-message error">{error}<button onClick={() => setError("")}>×</button></div>}
      <section className="panel laboratory-results-panel"><div className="laboratory-results-toolbar"><div><span className="eyebrow">TABLA DE RESULTADOS</span><h2>{completed} de {rows.length} resultados informados</h2></div><div><button className={resultFilter === "21" ? "result-pill positive selected" : "result-pill positive"} onClick={() => setResultFilter(resultFilter === "21" ? "all" : "21")}>{positive} positivos</button>{!isAie && <button className={resultFilter === "62" ? "result-pill suspicious selected" : "result-pill suspicious"} onClick={() => setResultFilter(resultFilter === "62" ? "all" : "62")}>{suspicious} sospechosos</button>}<button onClick={() => setRows((current) => current.map((row) => ({ ...row, resultCode: "1" })))}>Todos negativos</button></div></div>
        <div className="laboratory-table-tools compact"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar identificación…" /><label>Primera estampilla<input value={firstStamp} onChange={(event) => setFirstStamp(event.target.value)} inputMode="numeric" /></label></div>
        <div className="laboratory-table-scroll"><div className={`laboratory-table-head compact ${isBrucellosis ? "with-screening" : ""}`}><span>#</span><span>Identificación</span><span>Categoría</span><span>Resultado <button title="Marcar todas las muestras como negativas" onClick={() => setRows((current) => current.map((row) => ({ ...row, resultCode: "1" })))}>↓</button></span>{isBrucellosis && <span>Valor BPA</span>}<span>Antígeno / Kit <button title="Aplicar a todas" onClick={() => applyColumn("antigen")}>↓</button></span><span>Marca <button title="Aplicar a todas" onClick={() => applyColumn("brand")}>↓</button></span><span>Lote <button title="Aplicar a todas" onClick={() => applyColumn("batch")}>↓</button></span><span>Vencimiento <button title="Aplicar a todas" onClick={() => applyColumn("expiration")}>↓</button></span><span>Estampilla <button title="Aplicar igual a todas" onClick={() => applyColumn("stamp")}>＝</button><button title="Completar correlativas" onClick={assignStamps}>↘</button></span></div>{visibleRows.map(({ row, index }) => <div className={`laboratory-result-row compact ${isBrucellosis ? "with-screening" : ""} result-${row.resultCode || "empty"}`} key={`${row.analysisCode}-${row.number}`}><span>{row.number}</span><b>{row.identification || "Sin identificación"}</b><span>{CATEGORIES[row.category] || `Código ${row.category}`}</span><select value={row.resultCode} onChange={(event) => updateRow(index, { resultCode: event.target.value })}><option value="">Elegir…</option>{RESULTS.filter((option) => !isAie || option.code !== "62").map((option) => <option value={option.code} key={option.code}>{option.label}</option>)}</select>{isBrucellosis && <input value={row.screeningValue} onChange={(event) => updateRow(index, { screeningValue: event.target.value })} placeholder="Valor" />}{(["antigen", "brand", "batch", "expiration", "stamp"] as const).map((field) => <input key={field} data-lab-row={index} data-lab-column={field} value={row[field]} onChange={(event) => updateRow(index, { [field]: event.target.value })} onKeyDown={(event) => nextCell(event, index, field)} placeholder={field === "expiration" ? "DD/MM/AAAA" : ""} />)}</div>)}{!visibleRows.length && <div className="laboratory-empty-filter">No hay muestras que coincidan.</div>}</div>
        <footer className="laboratory-export-bar"><div><b>{ready ? "Protocolo completo" : `${rows.length - requiredComplete} filas con datos pendientes`}</b><span>Podés guardar el protocolo y continuar después.</span></div><div className="laboratory-final-actions"><button onClick={saveProtocol} disabled={saving}>{saving ? "Guardando…" : "Guardar protocolo"}</button><button onClick={exportPdf}>Informe PDF</button><button className="primary" disabled={!ready} onClick={exportGreCert}>Exportar Excel GRECERT</button></div></footer>
      </section>
      {isBrucellosis && <section className="panel laboratory-confirmatory-panel">
        <div className="laboratory-results-toolbar"><div><span className="eyebrow">BRUCELOSIS</span><h2>Técnicas confirmatorias</h2><p>Se habilita solamente para las muestras positivas a BPA.</p></div><strong>{confirmatoryRows.length} muestras reactivas</strong></div>
        {!confirmatoryRows.length ? <div className="laboratory-empty-filter">Cuando marques un BPA como positivo, la muestra aparecerá automáticamente en esta tabla.</div> : <>
          <div className="laboratory-confirmatory-scroll"><div className="laboratory-confirmatory-head"><span>#</span><span>Identificación</span><span>Técnica <button onClick={() => applyConfirmatoryColumn("confirmatoryMethod")}>↓</button></span><span>Valor</span><span>Resultado</span><span>Antígeno / Kit <button onClick={() => applyConfirmatoryColumn("confirmatoryAntigen")}>↓</button></span><span>Marca <button onClick={() => applyConfirmatoryColumn("confirmatoryBrand")}>↓</button></span><span>Lote <button onClick={() => applyConfirmatoryColumn("confirmatoryBatch")}>↓</button></span><span>Vencimiento <button onClick={() => applyConfirmatoryColumn("confirmatoryExpiration")}>↓</button></span><span>Estampilla <button onClick={() => applyConfirmatoryColumn("confirmatoryStamp")}>＝</button><button onClick={assignConfirmatoryStamps}>↘</button></span></div>
          {confirmatoryRows.map(({ row, index }, position) => <div className="laboratory-confirmatory-row" key={row.number}><span>{position + 1}</span><b>{row.identification}</b><select value={row.confirmatoryMethod} onChange={(event) => updateRow(index, { confirmatoryMethod: event.target.value as "FPA" | "SAT" })}><option value="">Elegir…</option><option>FPA</option><option>SAT</option></select><input value={row.confirmatoryValue} onChange={(event) => updateRow(index, { confirmatoryValue: event.target.value })} /><select value={row.confirmatoryResultCode} onChange={(event) => updateRow(index, { confirmatoryResultCode: event.target.value })}><option value="">Elegir…</option><option value="1">Negativo</option><option value="21">Positivo</option></select><input value={row.confirmatoryAntigen} onChange={(event) => updateRow(index, { confirmatoryAntigen: event.target.value })} /><input value={row.confirmatoryBrand} onChange={(event) => updateRow(index, { confirmatoryBrand: event.target.value })} /><input value={row.confirmatoryBatch} onChange={(event) => updateRow(index, { confirmatoryBatch: event.target.value })} /><input value={row.confirmatoryExpiration} onChange={(event) => updateRow(index, { confirmatoryExpiration: event.target.value })} placeholder="DD/MM/AAAA" /><input value={row.confirmatoryStamp} onChange={(event) => updateRow(index, { confirmatoryStamp: event.target.value })} /></div>)}</div>
          <footer className="laboratory-export-bar"><div><b>{confirmatoryReady ? "Confirmatorias completas" : "Completá técnica, resultado y reactivo confirmatorio"}</b><span>Este archivo incluye identificación y categoría de cada muestra reactiva.</span></div><button className="primary" disabled={!confirmatoryReady} onClick={exportConfirmatoryGreCert}>Exportar Excel confirmatorias</button></footer>
        </>}
      </section>}
    </>}
    {excelGenerated && <div className="modal-backdrop"><section className="modal-card feedback-modal laboratory-export-modal"><div><h2>Excel generado</h2></div><span className="feedback-icon success">✓</span><h3>Archivo GRECERT listo</h3><p>El Excel se descargó correctamente y ya podés importarlo en GRECERT.</p><footer><button type="button" className="primary" onClick={() => setExcelGenerated(false)}>Aceptar</button></footer></section></div>}
  </>;
}

type IntakeAssignment = { analysisId: string; analysisName: string; result: string; confirmatoryTechnique: string; confirmatoryResult: string; antigen: string; brand: string; lot: string; expiration: string; stamp: string };
type IntakeTube = { tube: number; identification: string; category: string; assignments: IntakeAssignment[] };

function Protocols({ uid, protocols, sampleIntakes, loading, search, setSearch }: { uid: string; protocols: LaboratoryProtocol[]; sampleIntakes: LaboratoryManagementRecord[]; loading: boolean; search: string; setSearch: (value: string) => void }) {
  const [intakes, setIntakes] = useState(sampleIntakes);
  const [selected, setSelected] = useState<{ record: LaboratoryManagementRecord; mode: ProtocolWorkspaceMode } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LaboratoryManagementRecord | null>(null);
  useEffect(() => setIntakes(sampleIntakes), [sampleIntakes]);
  const visible = protocols.filter((item) => `${item.reportNumber} ${item.actNumber} ${item.veterinarianName} ${item.renspa} ${item.assayName}`.toLowerCase().includes(search.toLowerCase()));
  const intakeVisible = intakes.filter((item) => `${item.protocol} ${item.veterinarian} ${item.client} ${item.renspa} ${item.establishment} ${item.analyses}`.toLowerCase().includes(search.toLowerCase()));
  const analysisNames = (item: LaboratoryManagementRecord) => {
    try { return (JSON.parse(String(item.analyses || "[]")) as Array<{ name?: string }>).map((value) => value.name).filter(Boolean).join("\n") || "Sin análisis"; }
    catch { return "Sin análisis"; }
  };
  const shareText = (item: LaboratoryManagementRecord) => `Protocolo ${String(item.protocol)} · ${String(item.client)} · ${String(item.quantity)} muestras.`;
  return <><header className="topbar module-topbar"><div><span className="eyebrow">LABORATORIO</span><h1>Protocolos</h1><p>Ingresos recibidos y protocolos GRECERT procesados, reunidos en un solo lugar.</p></div></header><section className="panel laboratory-list-panel"><div className="laboratory-list-toolbar"><div><h2>{intakes.length + protocols.length} protocolos guardados</h2><p>Administración y técnicos trabajan sobre el mismo protocolo, en vistas separadas.</p></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar protocolo…" /></div><div className="laboratory-protocol-list-head with-actions"><span>Fecha</span><span>Protocolo</span><span>Veterinario</span><span>Productor / RENSPA</span><span>Análisis</span><span>Muestras</span><span>Estado</span><span>Acciones</span></div>{loading ? <div className="laboratory-empty-filter">Cargando protocolos…</div> : intakeVisible.map((item) => <article className="laboratory-protocol-row intake with-actions" key={item.id}><time>{String(item.date || "—")}</time><b>{String(item.protocol || "Sin número")}<small>Ingreso de muestras</small></b><span>{String(item.veterinarian || "—")}</span><span>{String(item.client || "—")}<small>{String(item.renspa || item.establishment || "")}</small></span><span className="protocol-analysis-stack">{analysisNames(item)}</span><strong>{String(item.quantity || 0)}</strong><span><em>{String(item.status || "Recibida")}</em></span><div className="protocol-row-actions"><button title="Cargar resultados" onClick={() => setSelected({ record: item, mode: "results" })}>⚗<small>Resultados</small></button><button title="Cargar caravanas" onClick={() => setSelected({ record: item, mode: "animals" })}>▦<small>Caravanas</small></button><button title="Descargar PDF" onClick={() => exportIntakeProtocolPdf(item)}>↓</button><button title="Enviar por correo" onClick={() => window.open(`mailto:?subject=${encodeURIComponent(String(item.protocol))}&body=${encodeURIComponent(shareText(item))}`)}>✉</button><button title="Enviar por WhatsApp" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText(item))}`, "_blank")}>◉</button><button className="danger" title="Eliminar" onClick={() => setDeleteTarget(item)}>×</button></div></article>)}{visible.map((item) => <article className="laboratory-protocol-row" key={item.id}><time>{item.date || "—"}</time><b>Informe {item.reportNumber}<small>Acta {item.actNumber}</small></b><span>{item.veterinarianName}<small>{item.veterinarianCuit}</small></span><span>{item.renspa}</span><span>{item.assayName}</span><strong>{item.sampleCount}</strong><span><em>{item.positiveCount} positivos</em><small>{item.suspiciousCount} sospechosos</small></span></article>)}{!loading && !intakeVisible.length && !visible.length && <div className="laboratory-empty-filter">No hay protocolos que coincidan.</div>}</section>{selected && <LaboratoryProtocolWorkspace uid={uid} record={selected.record} initialMode={selected.mode} onClose={() => setSelected(null)} onSaved={(record) => { setIntakes((current) => current.map((item) => item.id === record.id ? record : item)); setSelected((current) => current ? { ...current, record } : null); }} />}{deleteTarget && <div className="modal-backdrop"><section className="modal-card feedback-modal"><h2>Eliminar protocolo</h2><p>Se eliminarán el ingreso, las caravanas y los resultados de {String(deleteTarget.protocol)}.</p><footer><button onClick={() => setDeleteTarget(null)}>Cancelar</button><button className="danger" onClick={async () => { await deleteLaboratoryRecord(uid, "samples", deleteTarget.id); setIntakes((current) => current.filter((item) => item.id !== deleteTarget.id)); setDeleteTarget(null); }}>Eliminar definitivamente</button></footer></section></div>}</>;
}

function IntakeProtocolWorkspace({ uid, record, onClose, onSaved, onDeleted }: { uid: string; record: LaboratoryManagementRecord; onClose: () => void; onSaved: (record: LaboratoryManagementRecord) => void; onDeleted: (id: string) => void }) {
  const [rows, setRows] = useState<IntakeTube[]>(() => {
    try {
      const stored = JSON.parse(String(record.tubeRows || "[]")) as IntakeTube[];
      if (stored.length) return stored;
      const analyses = JSON.parse(String(record.analyses || "[]")) as Array<{ id?: string; name?: string; quantity?: number }>;
      return Array.from({ length: Number(record.quantity || 0) }, (_, index) => ({
        tube: index + 1,
        identification: "",
        category: "",
        assignments: analyses.filter((analysis) => index < Number(analysis.quantity || record.quantity || 0)).map((analysis) => ({
          analysisId: String(analysis.id || ""), analysisName: String(analysis.name || "Análisis"), result: "", confirmatoryTechnique: "", confirmatoryResult: "", antigen: "", brand: "", lot: "", expiration: "", stamp: "",
        })),
      }));
    } catch { return []; }
  });
  const [saving, setSaving] = useState(false), [deleteOpen, setDeleteOpen] = useState(false), [message, setMessage] = useState("");
  const [bulkCategory, setBulkCategory] = useState("Vaca"), [bulkAntigen, setBulkAntigen] = useState(""), [bulkBrand, setBulkBrand] = useState(""), [bulkLot, setBulkLot] = useState(""), [bulkExpiration, setBulkExpiration] = useState(""), [firstStamp, setFirstStamp] = useState("");
  const flat = rows.flatMap((tube, tubeIndex) => tube.assignments.map((assignment, assignmentIndex) => ({ tube, tubeIndex, assignment, assignmentIndex })));
  const updateTube = (tubeIndex: number, changes: Partial<IntakeTube>) => setRows((current) => current.map((tube, index) => index === tubeIndex ? { ...tube, ...changes } : tube));
  const updateAssignment = (tubeIndex: number, assignmentIndex: number, changes: Partial<IntakeAssignment>) => setRows((current) => current.map((tube, index) => index !== tubeIndex ? tube : { ...tube, assignments: tube.assignments.map((assignment, position) => position === assignmentIndex ? { ...assignment, ...changes } : assignment) }));
  const applyAssignment = (changes: Partial<IntakeAssignment>) => setRows((current) => current.map((tube) => ({ ...tube, assignments: tube.assignments.map((assignment) => ({ ...assignment, ...changes })) })));
  const complete = rows.length > 0 && rows.every((tube) => tube.identification && tube.category && tube.assignments.every((assignment) => assignment.result && assignment.antigen && assignment.brand && assignment.lot && assignment.expiration && assignment.stamp));
  const save = async () => {
    setSaving(true); setMessage("");
    const next = { ...record, tubeRows: JSON.stringify(rows), status: complete ? "Finalizado" : "En proceso", updatedAt: new Date().toISOString() } as LaboratoryManagementRecord;
    try { await saveLaboratoryRecord(uid, "samples", next); onSaved(next); setMessage("Protocolo guardado correctamente."); }
    catch { setMessage("No pudimos guardar el protocolo."); }
    finally { setSaving(false); }
  };
  const exportPdf = async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(17); pdf.text(`Protocolo ${String(record.protocol)}`, 12, 14);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.text(`Veterinario: ${String(record.veterinarian)}   |   Productor: ${String(record.client)}   |   RENSPA: ${String(record.renspa || "-")}`, 12, 22);
    autoTable(pdf, { startY: 29, head: [["Tubo", "Identificación", "Categoría", "Análisis", "Resultado", "Confirmatoria", "Antígeno", "Marca", "Lote", "Vencimiento", "Estampilla"]], body: flat.map(({ tube, assignment }) => [tube.tube, tube.identification, tube.category, assignment.analysisName, assignment.result, [assignment.confirmatoryTechnique, assignment.confirmatoryResult].filter(Boolean).join(" · "), assignment.antigen, assignment.brand, assignment.lot, assignment.expiration, assignment.stamp]), styles: { fontSize: 6.5, cellPadding: 1.7 }, headStyles: { fillColor: [18, 63, 82] } });
    pdf.save(`${String(record.protocol)}.pdf`);
  };
  return <div className="modal-backdrop protocol-workspace-backdrop"><section className="modal-card protocol-workspace"><header><div><span className="eyebrow">PROTOCOLO OPERATIVO</span><h2>{String(record.protocol)}</h2><p>{String(record.veterinarian)} · {String(record.client)} · {rows.length} tubos</p></div><button onClick={onClose}>×</button></header>{message && <div className="laboratory-message success">{message}</div>}<div className="protocol-bulk-tools"><label>Categoría general<select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)}><option>Vaca</option><option>Vaquillona</option><option>Toro</option><option>Ternero</option><option>Ternera</option><option>Equino</option></select></label><button onClick={() => setRows((current) => current.map((tube) => ({ ...tube, category: bulkCategory })))}>Aplicar categoría</button><button onClick={() => applyAssignment({ result: "Negativo" })}>Todos negativos</button><label>Antígeno<input value={bulkAntigen} onChange={(event) => setBulkAntigen(event.target.value)} /></label><label>Marca<input value={bulkBrand} onChange={(event) => setBulkBrand(event.target.value)} /></label><label>Lote<input value={bulkLot} onChange={(event) => setBulkLot(event.target.value)} /></label><label>Vencimiento<input value={bulkExpiration} onChange={(event) => setBulkExpiration(event.target.value)} placeholder="DD/MM/AAAA" /></label><button onClick={() => applyAssignment({ antigen: bulkAntigen, brand: bulkBrand, lot: bulkLot, expiration: bulkExpiration })}>Aplicar reactivo</button><label>Primera estampilla<input value={firstStamp} onChange={(event) => setFirstStamp(event.target.value)} /></label><button onClick={() => { if (!/^\d+$/.test(firstStamp)) return; let value = BigInt(firstStamp); setRows((current) => current.map((tube) => ({ ...tube, assignments: tube.assignments.map((assignment) => ({ ...assignment, stamp: String(value++) })) }))); }}>Estampillas correlativas</button></div><div className="protocol-workspace-scroll"><div className="protocol-workspace-head"><span>Tubo</span><span>Caravana / identificación</span><span>Categoría</span><span>Análisis</span><span>Resultado</span><span>Técnica complementaria</span><span>Resultado complementario</span><span>Antígeno</span><span>Marca</span><span>Lote</span><span>Vencimiento</span><span>Estampilla</span></div>{flat.map(({ tube, tubeIndex, assignment, assignmentIndex }) => <div className="protocol-workspace-row" key={`${tube.tube}-${assignment.analysisId}`}><b>{tube.tube}</b><input value={tube.identification} onChange={(event) => updateTube(tubeIndex, { identification: event.target.value })} /><select value={tube.category} onChange={(event) => updateTube(tubeIndex, { category: event.target.value })}><option value="">Elegir…</option><option>Vaca</option><option>Vaquillona</option><option>Toro</option><option>Ternero</option><option>Ternera</option><option>Equino</option></select><span>{assignment.analysisName}</span><select value={assignment.result} onChange={(event) => updateAssignment(tubeIndex, assignmentIndex, { result: event.target.value })}><option value="">Elegir…</option><option>Negativo</option><option>Positivo</option><option>Sospechoso</option></select><select value={assignment.confirmatoryTechnique} onChange={(event) => updateAssignment(tubeIndex, assignmentIndex, { confirmatoryTechnique: event.target.value })}><option value="">No corresponde</option><option>FPA</option><option>SAT</option><option>PCR</option></select><select value={assignment.confirmatoryResult} onChange={(event) => updateAssignment(tubeIndex, assignmentIndex, { confirmatoryResult: event.target.value })}><option value="">—</option><option>Negativo</option><option>Positivo</option><option>Sospechoso</option></select>{(["antigen", "brand", "lot", "expiration", "stamp"] as const).map((field) => <input key={field} value={assignment[field]} onChange={(event) => updateAssignment(tubeIndex, assignmentIndex, { [field]: event.target.value })} />)}</div>)}</div><footer><div><b>{complete ? "Protocolo completo" : "Protocolo en proceso"}</b><small>{flat.length} determinaciones sobre {rows.length} tubos</small></div><button className="danger" onClick={() => setDeleteOpen(true)}>Eliminar</button><button onClick={() => window.open(`mailto:?subject=${encodeURIComponent(String(record.protocol))}&body=${encodeURIComponent(`Protocolo ${String(record.protocol)} del laboratorio.`)}`)}>Enviar por mail</button><button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Protocolo ${String(record.protocol)} listo para entregar.`)}`, "_blank")}>Enviar WhatsApp</button><button onClick={exportPdf}>Descargar PDF</button><button className="primary" disabled={saving} onClick={save}>{saving ? "Guardando…" : "Guardar cambios"}</button></footer>{deleteOpen && <div className="protocol-delete-confirm"><div><h3>¿Eliminar {String(record.protocol)}?</h3><p>Se eliminará el ingreso y toda la información cargada por administración y técnicos.</p><button onClick={() => setDeleteOpen(false)}>Cancelar</button><button className="danger" onClick={async () => { await deleteLaboratoryRecord(uid, "samples", record.id); onDeleted(record.id); }}>Eliminar definitivamente</button></div></div>}</section></div>;
}

function Veterinarians({ veterinarians, inputRef, onFile, onAdd, feedback, error }: { veterinarians: LaboratoryVeterinarian[]; inputRef: React.RefObject<HTMLInputElement | null>; onFile: (file?: File) => void; onAdd: (name: string, cuit: string) => Promise<void>; feedback: string; error: string }) {
  const [name, setName] = useState(""); const [cuit, setCuit] = useState(""); const [formError, setFormError] = useState(""); const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setFormError(""); try { await onAdd(name, cuit); setName(""); setCuit(""); } catch (caught) { setFormError(caught instanceof Error ? caught.message : "No pudimos guardar el veterinario."); } finally { setSaving(false); } };
  return <><header className="topbar module-topbar"><div><span className="eyebrow">LABORATORIO</span><h1>Veterinarios</h1><p>Padrón para reconocer automáticamente al profesional informado en cada TXT.</p></div><button className="primary" onClick={() => inputRef.current?.click()}>Importar Excel</button></header><input ref={inputRef} hidden type="file" accept=".xlsx,.xls" onChange={(event) => onFile(event.target.files?.[0])} />{feedback && <div className="laboratory-message success">{feedback}</div>}{(error || formError) && <div className="laboratory-message error">{formError || error}</div>}<form className="panel laboratory-vet-form" onSubmit={submit}><label>Veterinario<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre y apellido" /></label><label>CUIT<input value={cuit} onChange={(event) => setCuit(event.target.value)} inputMode="numeric" placeholder="Sin guiones" /></label><button className="primary" disabled={saving}>{saving ? "Guardando…" : "+ Agregar veterinario"}</button></form><section className="panel laboratory-list-panel"><div className="laboratory-list-toolbar"><div><h2>{veterinarians.length} veterinarios registrados</h2><p>También podés importar un Excel con las columnas “Veterinarios” y “CUIT”.</p></div></div><div className="laboratory-vet-head"><span>Veterinario</span><span>CUIT</span></div>{veterinarians.map((item) => <article className="laboratory-vet-row" key={item.id}><b>{item.name}</b><span>{item.cuit}</span></article>)}{!veterinarians.length && <div className="laboratory-empty-filter">Todavía no cargaste el padrón de veterinarios.</div>}</section></>;
}

function Statistics({ protocols, loading }: { protocols: LaboratoryProtocol[]; loading: boolean }) {
  const samples = protocols.reduce((sum, item) => sum + item.sampleCount, 0), positives = protocols.reduce((sum, item) => sum + item.positiveCount, 0), suspicious = protocols.reduce((sum, item) => sum + item.suspiciousCount, 0);
  const vets = new Set(protocols.map((item) => item.veterinarianCuit).filter(Boolean)).size, renspas = new Set(protocols.map((item) => item.renspa).filter(Boolean)).size;
  const assays = [...new Set(protocols.map((item) => item.assayName))].map((name) => [name, protocols.filter((item) => item.assayName === name).length] as const).sort((a, b) => b[1] - a[1]);
  return <><header className="topbar module-topbar"><div><span className="eyebrow">LABORATORIO</span><h1>Estadísticas</h1><p>Primera lectura de la actividad almacenada. Después incorporaremos filtros más profundos.</p></div></header><div className="laboratory-stat-grid"><article className="panel"><span>Protocolos</span><strong>{loading ? "…" : protocols.length}</strong><small>informes guardados</small></article><article className="panel"><span>Animales analizados</span><strong>{samples}</strong><small>muestras procesadas</small></article><article className="panel warning"><span>Positivos / sospechosos</span><strong>{positives} / {suspicious}</strong><small>resultados para seguimiento</small></article><article className="panel"><span>Veterinarios</span><strong>{vets}</strong><small>profesionales con protocolos</small></article><article className="panel"><span>RENSPA</span><strong>{renspas}</strong><small>unidades productivas</small></article></div><section className="panel laboratory-list-panel"><div className="laboratory-list-toolbar"><div><h2>Protocolos por tipo de muestreo</h2><p>Distribución inicial según el ensayo informado.</p></div></div>{assays.map(([name, count]) => <article className="laboratory-stat-row" key={name}><b>{name}</b><span>{count} protocolos</span><i style={{ width: `${Math.max(8, count / Math.max(protocols.length, 1) * 100)}%` }} /></article>)}{!assays.length && <div className="laboratory-empty-filter">Las estadísticas aparecerán al guardar protocolos.</div>}</section></>;
}

function LaboratorySettings({ profile, onSave }: { profile: LaboratoryProfile; onSave: (profile: LaboratoryProfile) => Promise<void> }) {
  const [draft, setDraft] = useState(profile); const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false); const [error, setError] = useState("");
  useEffect(() => setDraft(profile), [profile]);
  const field = (key: keyof LaboratoryProfile, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setSaved(false); setError(""); try { await onSave(draft); setSaved(true); } catch (caught) { console.error(caught); setError("No pudimos guardar los datos del laboratorio."); } finally { setSaving(false); } };
  return <><header className="topbar module-topbar"><div><span className="eyebrow">LABORATORIO</span><h1>Mis datos</h1><p>Información institucional reutilizada en el encabezado de todos los informes PDF.</p></div></header>{saved && <div className="laboratory-message success">Datos guardados correctamente.</div>}{error && <div className="laboratory-message error">{error}</div>}<form className="panel laboratory-settings-form" onSubmit={submit}><div className="laboratory-settings-intro"><span>L</span><div><h2>Encabezado del laboratorio</h2><p>Todos los campos son opcionales. En los informes se mostrarán solamente aquellos que completes.</p></div></div><div className="laboratory-settings-grid"><label>Nombre del laboratorio<input value={draft.laboratoryName} onChange={(event) => field("laboratoryName", event.target.value)} /></label><label>Código del laboratorio<input value={draft.laboratoryCode} onChange={(event) => field("laboratoryCode", event.target.value)} placeholder="Ej. LRS0361" /></label><label>Director técnico<input value={draft.technicalDirector} onChange={(event) => field("technicalDirector", event.target.value)} /></label><label>Dirección del laboratorio<input value={draft.address} onChange={(event) => field("address", event.target.value)} /></label><label>Teléfono<input value={draft.phone} onChange={(event) => field("phone", event.target.value)} /></label></div><footer><button type="submit" className="primary" disabled={saving}>{saving ? "Guardando…" : "Guardar mis datos"}</button></footer></form></>;
}
