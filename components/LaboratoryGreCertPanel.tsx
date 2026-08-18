"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  LaboratoryProtocol,
  LaboratoryVeterinarian,
  loadLaboratoryData,
  saveLaboratoryProtocol,
  saveLaboratoryVeterinarians,
} from "../lib/laboratory-data";

export type LaboratorySection = "load" | "protocols" | "veterinarians" | "statistics";
type GrecertSubsample = { identificacion?: unknown; identificacionInternaDeLaboratorio?: unknown; codigoTipoIdentificacion?: unknown; codigoDeEdad?: unknown; codigoDeCategoria?: unknown };
type GrecertAnalysis = { codigoEnsayo?: unknown; codigoAnalito?: unknown; codigoMatriz?: unknown; codigoTecnica?: unknown; subMuestras?: unknown };
type GrecertReport = { numeroInforme?: unknown; codigoLaboratorio?: unknown; renspaUnidadProductiva?: unknown; codigotipoDocumentoUno?: unknown; numeroDocumentoUno?: unknown; cuitDeFuncionario?: unknown; muestra?: { fechaDeToma?: unknown; fechaDeRecepcion?: unknown; analisis?: unknown } };
type ResultRow = { number: number; identification: string; internalNumber: string; identificationType: string; category: string; age: string; analysisCode: string; resultCode: string; antigen: string; brand: string; batch: string; expiration: string; stamp: string };

const RESULTS = [{ code: "1", label: "Negativo" }, { code: "21", label: "Positivo" }, { code: "62", label: "Sospechoso" }];
const CATEGORIES: Record<string, string> = { "22": "Padrillo" };
const text = (value: unknown) => value == null ? "" : String(value);
const digits = (value: string) => value.replace(/\D/g, "");
const safeId = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]/g, "-") || String(Date.now());
const assayLabel = (code: string) => code === "1056" ? "Anemia Infecciosa Equina" : `Ensayo ${code || "sin código"}`;

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
      analysisCode: text(analysis.codigoEnsayo), resultCode: "", antigen: "", brand: "", batch: "", expiration: "", stamp: "",
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
  const [veterinarians, setVeterinarians] = useState<LaboratoryVeterinarian[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [protocolSearch, setProtocolSearch] = useState("");

  useEffect(() => {
    let active = true;
    loadLaboratoryData(uid).then((data) => { if (active) { setProtocols(data.protocols); setVeterinarians(data.veterinarians); } })
      .catch((caught) => { console.error(caught); if (active) setError("No pudimos cargar los datos del laboratorio."); })
      .finally(() => active && setLoadingData(false));
    return () => { active = false; };
  }, [uid]);

  const report = reports[selectedReport];
  const analyses = (report?.muestra?.analisis || []) as GrecertAnalysis[];
  const mainAnalysis = analyses[0];
  const assayName = assayLabel(text(mainAnalysis?.codigoEnsayo));
  const veterinarian = veterinarians.find((item) => digits(item.cuit) === digits(text(report?.cuitDeFuncionario)));
  const completed = rows.filter((row) => row.resultCode).length;
  const requiredComplete = rows.filter((row) => row.resultCode && row.antigen && row.brand && row.batch && row.expiration).length;
  const ready = rows.length > 0 && requiredComplete === rows.length;
  const positive = rows.filter((row) => row.resultCode === "21").length;
  const suspicious = rows.filter((row) => row.resultCode === "62").length;
  const visibleRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => {
    const query = search.trim().toLowerCase();
    return (!query || row.identification.toLowerCase().includes(query) || row.internalNumber.toLowerCase().includes(query)) && (resultFilter === "all" || row.resultCode === resultFilter);
  });

  const openReport = (index: number, source = reports) => { setSelectedReport(index); setRows(rowsFromReport(source[index])); setFeedback(""); };
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
    const output = rows.map((row) => [String(row.number), "", "", "", "", "", "", "", row.antigen, row.brand, row.batch, row.expiration, row.stamp, row.resultCode, "", "", ""]);
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...output]); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");
    XLSX.writeFile(workbook, `Resultados_GRECERT_Acta_${text(report.numeroDocumentoUno) || "sin-numero"}.xls`, { bookType: "biff8" });
    setFeedback("Excel para GRECERT generado correctamente.");
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
    pdf.setFillColor(18, 63, 82); pdf.rect(0, 0, 297, 25, "F"); pdf.setTextColor(255); pdf.setFontSize(17); pdf.text(`LabOVet · Informe N.º ${text(report.numeroInforme)}`, 12, 11); pdf.setFontSize(9); pdf.text(`Acta ${text(report.numeroDocumentoUno)} · RENSPA ${text(report.renspaUnidadProductiva)} · ${assayName}`, 12, 18);
    pdf.setTextColor(20); pdf.text(`Veterinario: ${veterinarian?.name || "No identificado"} · CUIT ${text(report.cuitDeFuncionario)} · ${rows.length} muestras`, 12, 33);
    autoTable(pdf, { startY: 39, head: [["#", "Identificación", "Categoría", "Resultado", "Antígeno / Kit", "Marca", "Lote", "Vencimiento", "Estampilla"]], body: rows.map((row) => [row.number, row.identification, CATEGORIES[row.category] || row.category, RESULTS.find((option) => option.code === row.resultCode)?.label || "Pendiente", row.antigen, row.brand, row.batch, row.expiration, row.stamp]), styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [18, 63, 82] } });
    const exceptions = rows.filter((row) => row.resultCode === "21" || row.resultCode === "62");
    if (exceptions.length) { pdf.addPage("a4", "landscape"); pdf.setFontSize(17); pdf.setTextColor(18, 63, 82); pdf.text("Resumen de positivos y sospechosos", 12, 18); pdf.setFontSize(10); pdf.setTextColor(40); pdf.text(`${positive} positivos · ${suspicious} sospechosos`, 12, 26); autoTable(pdf, { startY: 32, head: [["#", "Identificación", "Categoría", "Resultado", "Estampilla"]], body: exceptions.map((row) => [row.number, row.identification, CATEGORIES[row.category] || row.category, RESULTS.find((option) => option.code === row.resultCode)?.label || "", row.stamp]), headStyles: { fillColor: [163, 55, 55] } }); }
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

  if (section === "protocols") return <Protocols protocols={protocols} loading={loadingData} search={protocolSearch} setSearch={setProtocolSearch} />;
  if (section === "veterinarians") return <Veterinarians veterinarians={veterinarians} inputRef={vetInputRef} onFile={importVeterinarians} onAdd={addVeterinarian} feedback={feedback} error={error} />;
  if (section === "statistics") return <Statistics protocols={protocols} loading={loadingData} />;

  return <><header className="topbar module-topbar laboratory-header"><div><span className="eyebrow">LABORATORIO</span><h1>Carga de resultados GRECERT</h1><p>Convertí el TXT oficial en un protocolo, un informe y un Excel listo para importar.</p></div></header>
    {!report ? <section className="panel grecert-upload-panel"><input ref={inputRef} type="file" accept=".txt,text/plain" hidden onChange={(event) => readFile(event.target.files?.[0])} /><button type="button" className={dragging ? "grecert-dropzone dragging" : "grecert-dropzone"} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files?.[0]); }}><span>TXT</span><h2>Arrastrá el archivo descargado desde GRECERT</h2><p>LabOVet detectará el acta, las muestras y el veterinario por CUIT.</p><b>Seleccionar archivo TXT</b></button>{error && <div className="laboratory-message error">{error}</div>}</section> : <>
      <section className="panel laboratory-protocol"><div className="protocol-heading"><div><span>INFORME DE ENSAYO</span><h2>N.º {text(report.numeroInforme)}</h2><p>{text(report.codigoLaboratorio)} · {veterinarian?.name || "Veterinario no identificado"}</p></div><div className="protocol-heading-actions"><div><span>ACTA SIGATM</span><b>N.º {text(report.numeroDocumentoUno)}</b></div><button type="button" onClick={() => { setReports([]); setRows([]); }}>Cargar otro TXT</button></div></div>{reports.length > 1 && <label className="protocol-report-picker">Informe<select value={selectedReport} onChange={(event) => openReport(Number(event.target.value))}>{reports.map((item, index) => <option key={`${text(item.numeroInforme)}-${index}`} value={index}>Informe {text(item.numeroInforme)}</option>)}</select></label>}<div className="protocol-section"><h3>Identificación del protocolo</h3><div className="protocol-data-grid"><p><span>RENSPA</span><b>{text(report.renspaUnidadProductiva)}</b></p><p><span>Veterinario</span><b>{veterinarian?.name || "No registrado"}</b><small>CUIT {text(report.cuitDeFuncionario)}</small></p><p><span>Laboratorio</span><b>{text(report.codigoLaboratorio)}</b></p><p><span>Muestras</span><b>{rows.length}</b></p></div></div><div className="protocol-section"><h3>Análisis realizado</h3><div className="protocol-data-grid"><p><span>Ensayo</span><b>{assayName}</b></p><p><span>Fecha de toma</span><b>{text(report.muestra?.fechaDeToma)}</b></p><p><span>Fecha de recepción</span><b>{text(report.muestra?.fechaDeRecepcion)}</b></p><p><span>Técnica</span><b>{text(mainAnalysis?.codigoTecnica) === "37" ? "IDGA" : text(mainAnalysis?.codigoTecnica)}</b></p></div></div><p className="protocol-source">Archivo fuente: {fileName}. Los datos oficiales permanecen bloqueados.</p></section>
      {feedback && <div className="laboratory-message success">{feedback}<button onClick={() => setFeedback("")}>×</button></div>}{error && <div className="laboratory-message error">{error}<button onClick={() => setError("")}>×</button></div>}
      <section className="panel laboratory-results-panel"><div className="laboratory-results-toolbar"><div><span className="eyebrow">TABLA DE RESULTADOS</span><h2>{completed} de {rows.length} resultados informados</h2></div><div><button className={resultFilter === "21" ? "result-pill positive selected" : "result-pill positive"} onClick={() => setResultFilter(resultFilter === "21" ? "all" : "21")}>{positive} positivos</button><button className={resultFilter === "62" ? "result-pill suspicious selected" : "result-pill suspicious"} onClick={() => setResultFilter(resultFilter === "62" ? "all" : "62")}>{suspicious} sospechosos</button><button onClick={() => setRows((current) => current.map((row) => ({ ...row, resultCode: "1" })))}>Todos negativos</button></div></div>
        <div className="laboratory-table-tools compact"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar identificación…" /><label>Primera estampilla<input value={firstStamp} onChange={(event) => setFirstStamp(event.target.value)} inputMode="numeric" /></label></div>
        <div className="laboratory-table-scroll"><div className="laboratory-table-head compact"><span>#</span><span>Identificación</span><span>Categoría</span><span>Resultado</span><span>Antígeno / Kit <button title="Aplicar a todas" onClick={() => applyColumn("antigen")}>↓</button></span><span>Marca <button title="Aplicar a todas" onClick={() => applyColumn("brand")}>↓</button></span><span>Lote <button title="Aplicar a todas" onClick={() => applyColumn("batch")}>↓</button></span><span>Vencimiento <button title="Aplicar a todas" onClick={() => applyColumn("expiration")}>↓</button></span><span>Estampilla <button title="Aplicar igual a todas" onClick={() => applyColumn("stamp")}>＝</button><button title="Completar correlativas" onClick={assignStamps}>↘</button></span></div>{visibleRows.map(({ row, index }) => <div className={`laboratory-result-row compact result-${row.resultCode || "empty"}`} key={`${row.analysisCode}-${row.number}`}><span>{row.number}</span><b>{row.identification || "Sin identificación"}</b><span>{CATEGORIES[row.category] || `Código ${row.category}`}</span><select value={row.resultCode} onChange={(event) => updateRow(index, { resultCode: event.target.value })}><option value="">Elegir…</option>{RESULTS.map((option) => <option value={option.code} key={option.code}>{option.label}</option>)}</select>{(["antigen", "brand", "batch", "expiration", "stamp"] as const).map((field) => <input key={field} data-lab-row={index} data-lab-column={field} value={row[field]} onChange={(event) => updateRow(index, { [field]: event.target.value })} onKeyDown={(event) => nextCell(event, index, field)} placeholder={field === "expiration" ? "DD/MM/AAAA" : ""} />)}</div>)}{!visibleRows.length && <div className="laboratory-empty-filter">No hay muestras que coincidan.</div>}</div>
        <footer className="laboratory-export-bar"><div><b>{ready ? "Protocolo completo" : `${rows.length - requiredComplete} filas con datos pendientes`}</b><span>Podés guardar el protocolo y continuar después.</span></div><div className="laboratory-final-actions"><button onClick={saveProtocol} disabled={saving}>{saving ? "Guardando…" : "Guardar protocolo"}</button><button onClick={exportPdf}>Informe PDF</button><button className="primary" disabled={!ready} onClick={exportGreCert}>Exportar Excel GRECERT</button></div></footer>
      </section></>}
  </>;
}

function Protocols({ protocols, loading, search, setSearch }: { protocols: LaboratoryProtocol[]; loading: boolean; search: string; setSearch: (value: string) => void }) {
  const visible = protocols.filter((item) => `${item.reportNumber} ${item.actNumber} ${item.veterinarianName} ${item.renspa} ${item.assayName}`.toLowerCase().includes(search.toLowerCase()));
  return <><header className="topbar module-topbar"><div><span className="eyebrow">LABORATORIO</span><h1>Protocolos</h1><p>Historial de informes guardados y resultados procesados.</p></div></header><section className="panel laboratory-list-panel"><div className="laboratory-list-toolbar"><div><h2>{protocols.length} protocolos guardados</h2><p>Buscá por informe, acta, veterinario, RENSPA o análisis.</p></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar protocolo…" /></div><div className="laboratory-protocol-list-head"><span>Fecha</span><span>Informe / Acta</span><span>Veterinario</span><span>RENSPA</span><span>Análisis</span><span>Muestras</span><span>Resultados</span></div>{loading ? <div className="laboratory-empty-filter">Cargando protocolos…</div> : visible.map((item) => <article className="laboratory-protocol-row" key={item.id}><time>{item.date || "—"}</time><b>Informe {item.reportNumber}<small>Acta {item.actNumber}</small></b><span>{item.veterinarianName}<small>{item.veterinarianCuit}</small></span><span>{item.renspa}</span><span>{item.assayName}</span><strong>{item.sampleCount}</strong><span><em>{item.positiveCount} positivos</em><small>{item.suspiciousCount} sospechosos</small></span></article>)}{!loading && !visible.length && <div className="laboratory-empty-filter">No hay protocolos que coincidan.</div>}</section></>;
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
