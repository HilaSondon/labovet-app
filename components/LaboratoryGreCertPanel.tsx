"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type GrecertSubsample = {
  identificacion?: unknown;
  identificacionInternaDeLaboratorio?: unknown;
  codigoTipoIdentificacion?: unknown;
  codigoDeEdad?: unknown;
  codigoDeCategoria?: unknown;
};

type GrecertAnalysis = {
  id?: unknown;
  codigoEnsayo?: unknown;
  codigoAnalito?: unknown;
  codigoMatriz?: unknown;
  codigoTecnica?: unknown;
  subMuestras?: unknown;
};

type GrecertReport = {
  numeroInforme?: unknown;
  codigoLaboratorio?: unknown;
  renspaUnidadProductiva?: unknown;
  codigoMotivo?: unknown;
  codigoSubMotivo?: unknown;
  codigotipoDocumentoUno?: unknown;
  numeroDocumentoUno?: unknown;
  cuitDeFuncionario?: unknown;
  muestra?: {
    fechaDeToma?: unknown;
    fechaDeRecepcion?: unknown;
    analisis?: unknown;
  };
};

type ResultRow = {
  number: number;
  identification: string;
  internalNumber: string;
  identificationType: string;
  category: string;
  age: string;
  analysisCode: string;
  resultCode: string;
  stamp: string;
};

const RESULT_OPTIONS = [
  { code: "1", label: "Negativo" },
  { code: "21", label: "Positivo" },
  { code: "62", label: "Sospechoso" },
];

const CATEGORY_LABELS: Record<string, string> = { "22": "Padrillo" };
const AGE_LABELS: Record<string, string> = { "10": "N/A" };
const ID_TYPE_LABELS: Record<string, string> = { "4": "N.º de libreta" };

const asText = (value: unknown) => value == null ? "" : String(value);

function parseReports(text: string): GrecertReport[] {
  const cleanText = text.replace(/^\uFEFF/, "").trim();
  const parsed: unknown = JSON.parse(cleanText);
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error("El TXT no contiene ningún informe de GRECERT.");
  }
  for (const item of parsed) {
    if (!item || typeof item !== "object") throw new Error("El archivo contiene un informe inválido.");
    const report = item as GrecertReport;
    if (!report.numeroInforme || !report.muestra || !Array.isArray(report.muestra.analisis)) {
      throw new Error("El TXT no tiene la estructura de informe esperada.");
    }
  }
  return parsed as GrecertReport[];
}

function rowsFromReport(report: GrecertReport): ResultRow[] {
  const analyses = (report.muestra?.analisis || []) as GrecertAnalysis[];
  let number = 0;
  return analyses.flatMap((analysis) => {
    const samples = Array.isArray(analysis.subMuestras)
      ? analysis.subMuestras as GrecertSubsample[]
      : [];
    return samples.map((sample) => ({
      number: ++number,
      identification: asText(sample.identificacion),
      internalNumber: asText(sample.identificacionInternaDeLaboratorio),
      identificationType: asText(sample.codigoTipoIdentificacion),
      category: asText(sample.codigoDeCategoria),
      age: asText(sample.codigoDeEdad),
      analysisCode: asText(analysis.codigoEnsayo),
      resultCode: "",
      stamp: "",
    }));
  });
}

export default function LaboratoryGreCertPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reports, setReports] = useState<GrecertReport[]>([]);
  const [selectedReport, setSelectedReport] = useState(0);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [antigen, setAntigen] = useState("");
  const [brand, setBrand] = useState("");
  const [batch, setBatch] = useState("");
  const [expiration, setExpiration] = useState("");
  const [firstStamp, setFirstStamp] = useState("");

  const report = reports[selectedReport];
  const analyses = (report?.muestra?.analisis || []) as GrecertAnalysis[];
  const completed = rows.filter((row) => row.resultCode).length;
  const ready = rows.length > 0 && completed === rows.length;
  const positive = rows.filter((row) => row.resultCode === "21").length;
  const suspicious = rows.filter((row) => row.resultCode === "62").length;
  const assayCodes = useMemo(
    () => [...new Set(analyses.map((analysis) => asText(analysis.codigoEnsayo)).filter(Boolean))],
    [analyses],
  );

  const openReport = (index: number, sourceReports = reports) => {
    setSelectedReport(index);
    setRows(rowsFromReport(sourceReports[index]));
    setFeedback("");
  };

  const readFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setFeedback("");
    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("Seleccioná el archivo .txt descargado desde GRECERT.");
      return;
    }
    try {
      const parsedReports = parseReports(await file.text());
      setReports(parsedReports);
      setFileName(file.name);
      openReport(0, parsedReports);
      setFeedback(`${parsedReports.length} informe${parsedReports.length === 1 ? "" : "s"} y ${rowsFromReport(parsedReports[0]).length} muestra${rowsFromReport(parsedReports[0]).length === 1 ? "" : "s"} detectados correctamente.`);
    } catch (caught) {
      console.error("TXT GRECERT inválido", caught);
      setReports([]);
      setRows([]);
      setError(caught instanceof Error ? caught.message : "No pudimos leer el archivo TXT.");
    }
  };

  const updateRow = (index: number, changes: Partial<ResultRow>) =>
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row));

  const assignStamps = () => {
    if (!/^\d+$/.test(firstStamp.trim())) {
      setError("Ingresá una primera estampilla numérica válida.");
      return;
    }
    const start = BigInt(firstStamp.trim());
    setRows((current) => current.map((row, index) => ({ ...row, stamp: String(start + BigInt(index)) })));
    setError("");
  };

  const exportGreCert = () => {
    if (!ready || !report) return;
    const headers = [
      "numero", "identificacion", "idTipoIdentificacion", "nroInternoLab",
      "idCategoria", "idEdad", "sexo", "fechaVacunacion", "antigenoKit",
      "marca", "lote", "vtoAntigeno", "estampilla", "idResultadoLetra",
      "resultadoNumero", "idUnidadDeMedida", "observacion",
    ];
    const output = rows.map((row) => [
      String(row.number), "", "", "", "", "", "", "", antigen, brand,
      batch, expiration, row.stamp, row.resultCode, "", "", "",
    ]);
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...output]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");
    XLSX.writeFile(
      workbook,
      `Resultados_GRECERT_Acta_${asText(report.numeroDocumentoUno) || "sin-numero"}.xls`,
      { bookType: "biff8" },
    );
    setFeedback("Excel para importar en GRECERT generado correctamente.");
  };

  return (
    <>
      <header className="topbar module-topbar laboratory-header">
        <div><span className="eyebrow">LABORATORIO</span><h1>Carga de resultados GRECERT</h1><p>Convertí el TXT oficial en una carga clara y un Excel listo para importar.</p></div>
      </header>

      {!report ? (
        <section className="panel grecert-upload-panel">
          <input ref={inputRef} type="file" accept=".txt,text/plain" hidden onChange={(event) => readFile(event.target.files?.[0])} />
          <button
            type="button"
            className={dragging ? "grecert-dropzone dragging" : "grecert-dropzone"}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files?.[0]); }}
          >
            <span>TXT</span><h2>Arrastrá aquí el archivo descargado desde GRECERT</h2><p>O tocá para seleccionarlo desde tu computadora.</p><b>Seleccionar archivo TXT</b>
          </button>
          {error && <div className="laboratory-message error">{error}</div>}
        </section>
      ) : (
        <>
          <section className="panel laboratory-report-summary">
            <div className="laboratory-report-title"><div><span>ACTA SIGATM</span><h2>N.º {asText(report.numeroDocumentoUno)}</h2><p>{fileName}</p></div><button type="button" onClick={() => { setReports([]); setRows([]); setError(""); setFeedback(""); }}>Cargar otro TXT</button></div>
            {reports.length > 1 && <label>Informe<select value={selectedReport} onChange={(event) => openReport(Number(event.target.value))}>{reports.map((item, index) => <option key={`${asText(item.numeroInforme)}-${index}`} value={index}>Informe {asText(item.numeroInforme)}</option>)}</select></label>}
            <div className="laboratory-meta-grid">
              <article><span>Informe</span><b>{asText(report.numeroInforme)}</b></article>
              <article><span>Laboratorio</span><b>{asText(report.codigoLaboratorio)}</b></article>
              <article><span>RENSPA</span><b>{asText(report.renspaUnidadProductiva)}</b></article>
              <article><span>Fecha de toma</span><b>{asText(report.muestra?.fechaDeToma)}</b></article>
              <article><span>Fecha de recepción</span><b>{asText(report.muestra?.fechaDeRecepcion)}</b></article>
              <article><span>Ensayo</span><b>{assayCodes.join(", ") || "Sin código"}</b></article>
              <article><span>Muestras</span><b>{rows.length}</b></article>
            </div>
          </section>

          {feedback && <div className="laboratory-message success">{feedback}<button type="button" onClick={() => setFeedback("")}>×</button></div>}
          {error && <div className="laboratory-message error">{error}<button type="button" onClick={() => setError("")}>×</button></div>}

          <section className="panel laboratory-reagent-panel">
            <div><span className="eyebrow">DATOS DEL REACTIVO</span><h2>Aplicados a todas las muestras</h2></div>
            <div className="laboratory-reagent-grid">
              <label>Antígeno / Kit<input value={antigen} onChange={(event) => setAntigen(event.target.value)} /></label>
              <label>Marca<input value={brand} onChange={(event) => setBrand(event.target.value)} /></label>
              <label>Lote<input value={batch} onChange={(event) => setBatch(event.target.value)} /></label>
              <label>Vencimiento<input value={expiration} onChange={(event) => setExpiration(event.target.value)} placeholder="DD/MM/AAAA" /></label>
            </div>
            <div className="laboratory-stamp-tools"><label>Primera estampilla<input value={firstStamp} onChange={(event) => setFirstStamp(event.target.value)} inputMode="numeric" /></label><button type="button" onClick={assignStamps}>Completar correlativas</button></div>
          </section>

          <section className="panel laboratory-results-panel">
            <div className="laboratory-results-toolbar">
              <div><span className="eyebrow">RESULTADOS</span><h2>{completed} de {rows.length} completos</h2></div>
              <div><span className="result-pill positive">{positive} positivos</span><span className="result-pill suspicious">{suspicious} sospechosos</span><button type="button" onClick={() => setRows((current) => current.map((row) => ({ ...row, resultCode: "1" })))}>Todos negativos</button></div>
            </div>
            <div className="laboratory-table-scroll">
              <div className="laboratory-table-head"><span>#</span><span>N.º interno</span><span>Identificación oficial</span><span>Tipo</span><span>Categoría</span><span>Edad</span><span>Resultado</span><span>Estampilla</span></div>
              {rows.map((row, index) => <div className={`laboratory-result-row result-${row.resultCode || "empty"}`} key={`${row.analysisCode}-${row.number}`}>
                <span>{row.number}</span><span>{row.internalNumber || "—"}</span><b>{row.identification || "Sin identificación"}</b><span>{ID_TYPE_LABELS[row.identificationType] || `Código ${row.identificationType}`}</span><span>{CATEGORY_LABELS[row.category] || `Código ${row.category}`}</span><span>{AGE_LABELS[row.age] || `Código ${row.age}`}</span>
                <select value={row.resultCode} onChange={(event) => updateRow(index, { resultCode: event.target.value })}><option value="">Elegir…</option>{RESULT_OPTIONS.map((option) => <option value={option.code} key={option.code}>{option.label}</option>)}</select>
                <input value={row.stamp} onChange={(event) => updateRow(index, { stamp: event.target.value })} />
              </div>)}
            </div>
            <footer className="laboratory-export-bar"><div><b>{ready ? "Resultados completos" : `${rows.length - completed} resultados pendientes`}</b><span>Los datos oficiales del TXT permanecen bloqueados.</span></div><button type="button" className="primary" disabled={!ready} onClick={exportGreCert}>Exportar Excel GRECERT</button></footer>
          </section>
        </>
      )}
    </>
  );
}
