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
  antigen: string;
  brand: string;
  batch: string;
  expiration: string;
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
      antigen: "",
      brand: "",
      batch: "",
      expiration: "",
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
  const [bulkAntigen, setBulkAntigen] = useState("");
  const [bulkBrand, setBulkBrand] = useState("");
  const [bulkBatch, setBulkBatch] = useState("");
  const [bulkExpiration, setBulkExpiration] = useState("");
  const [firstStamp, setFirstStamp] = useState("");
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState<"all" | "21" | "62">("all");

  const report = reports[selectedReport];
  const analyses = (report?.muestra?.analisis || []) as GrecertAnalysis[];
  const mainAnalysis = analyses[0];
  const completed = rows.filter((row) => row.resultCode).length;
  const requiredComplete = rows.filter((row) => row.resultCode && row.antigen && row.brand && row.batch && row.expiration).length;
  const ready = rows.length > 0 && requiredComplete === rows.length;
  const positive = rows.filter((row) => row.resultCode === "21").length;
  const suspicious = rows.filter((row) => row.resultCode === "62").length;
  const assayCodes = useMemo(
    () => [...new Set(analyses.map((analysis) => asText(analysis.codigoEnsayo)).filter(Boolean))],
    [analyses],
  );
  const assayName = asText(mainAnalysis?.codigoEnsayo) === "1056"
    ? "Anemia Infecciosa Equina"
    : `Ensayo ${asText(mainAnalysis?.codigoEnsayo) || "sin código"}`;
  const matrixName = asText(mainAnalysis?.codigoMatriz) === "2"
    ? "Suero"
    : `Matriz ${asText(mainAnalysis?.codigoMatriz) || "sin código"}`;
  const techniqueName = asText(mainAnalysis?.codigoTecnica) === "37"
    ? "IDGA"
    : `Técnica ${asText(mainAnalysis?.codigoTecnica) || "sin código"}`;
  const visibleRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const query = search.trim().toLowerCase();
      return (!query || row.identification.toLowerCase().includes(query) || row.internalNumber.toLowerCase().includes(query))
        && (resultFilter === "all" || row.resultCode === resultFilter);
    });

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

  const applyBulkReagent = () => {
    if (![bulkAntigen, bulkBrand, bulkBatch, bulkExpiration].some((value) => value.trim())) {
      setError("Completá al menos un dato antes de aplicarlo a todas las filas.");
      return;
    }
    setRows((current) => current.map((row) => ({
      ...row,
      antigen: bulkAntigen.trim() || row.antigen,
      brand: bulkBrand.trim() || row.brand,
      batch: bulkBatch.trim() || row.batch,
      expiration: bulkExpiration.trim() || row.expiration,
    })));
    setError("");
    setFeedback("Datos del reactivo aplicados a todas las muestras.");
  };

  const focusNextCell = (event: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, column: string) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const next = document.querySelector<HTMLInputElement>(`[data-lab-row="${rowIndex + 1}"][data-lab-column="${column}"]`);
    next?.focus();
    next?.select();
  };

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
      String(row.number), "", "", "", "", "", "", "", row.antigen, row.brand,
      row.batch, row.expiration, row.stamp, row.resultCode, "", "", "",
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
          <section className="panel laboratory-protocol">
            <div className="protocol-heading">
              <div><span>INFORME DE ENSAYO</span><h2>N.º {asText(report.numeroInforme)}</h2><p>{asText(report.codigoLaboratorio)} · Documento oficial recibido desde GRECERT</p></div>
              <div className="protocol-heading-actions"><div><span>ACTA SIGATM</span><b>N.º {asText(report.numeroDocumentoUno)}</b></div><button type="button" onClick={() => { setReports([]); setRows([]); setError(""); setFeedback(""); }}>Cargar otro TXT</button></div>
            </div>
            {reports.length > 1 && <label className="protocol-report-picker">Informe<select value={selectedReport} onChange={(event) => openReport(Number(event.target.value))}>{reports.map((item, index) => <option key={`${asText(item.numeroInforme)}-${index}`} value={index}>Informe {asText(item.numeroInforme)}</option>)}</select></label>}
            <div className="protocol-section">
              <h3>Lugar de toma de muestra</h3>
              <div className="protocol-data-grid"><p><span>RENSPA</span><b>{asText(report.renspaUnidadProductiva)}</b></p><p><span>Funcionario actuante</span><b>{asText(report.cuitDeFuncionario)}</b></p><p><span>Laboratorio</span><b>{asText(report.codigoLaboratorio)}</b></p></div>
            </div>
            <div className="protocol-section two-columns">
              <div><h3>Detalle de la muestra recibida</h3><div className="protocol-data-grid"><p><span>Cantidad</span><b>{rows.length} {rows.length === 1 ? "muestra" : "muestras"}</b></p><p><span>Fecha de toma</span><b>{asText(report.muestra?.fechaDeToma)}</b></p><p><span>Ingreso al laboratorio</span><b>{asText(report.muestra?.fechaDeRecepcion)}</b></p></div></div>
              <div><h3>Documento que ampara el lote</h3><div className="protocol-data-grid"><p><span>Tipo</span><b>Acta</b></p><p><span>Número</span><b>{asText(report.numeroDocumentoUno)}</b></p></div></div>
            </div>
            <div className="protocol-section analysis-summary">
              <h3>Análisis realizado</h3>
              <div className="protocol-data-grid"><p><span>Ensayo</span><b>{assayName}</b><small>Código {assayCodes.join(", ")}</small></p><p><span>Matriz</span><b>{matrixName}</b><small>Código {asText(mainAnalysis?.codigoMatriz)}</small></p><p><span>Técnica</span><b>{techniqueName}</b><small>Código {asText(mainAnalysis?.codigoTecnica)}</small></p><p><span>Analito</span><b>Código {asText(mainAnalysis?.codigoAnalito)}</b></p></div>
            </div>
            <p className="protocol-source">Archivo fuente: {fileName}. Los datos oficiales permanecen bloqueados.</p>
          </section>

          {feedback && <div className="laboratory-message success">{feedback}<button type="button" onClick={() => setFeedback("")}>×</button></div>}
          {error && <div className="laboratory-message error">{error}<button type="button" onClick={() => setError("")}>×</button></div>}

          <section className="panel laboratory-results-panel">
            <div className="laboratory-results-toolbar">
              <div><span className="eyebrow">TABLA DE RESULTADOS</span><h2>{completed} de {rows.length} resultados informados</h2></div>
              <div><button type="button" className={resultFilter === "21" ? "result-pill positive selected" : "result-pill positive"} onClick={() => setResultFilter((current) => current === "21" ? "all" : "21")}>{positive} positivos</button><button type="button" className={resultFilter === "62" ? "result-pill suspicious selected" : "result-pill suspicious"} onClick={() => setResultFilter((current) => current === "62" ? "all" : "62")}>{suspicious} sospechosos</button><button type="button" onClick={() => setRows((current) => current.map((row) => ({ ...row, resultCode: "1" })))}>Todos negativos</button></div>
            </div>
            <div className="laboratory-fast-entry">
              <div><b>Carga rápida</b><span>Completá solo los datos repetidos y aplicalos a todas las filas.</span></div>
              <label>Antígeno / Kit<input value={bulkAntigen} onChange={(event) => setBulkAntigen(event.target.value)} /></label>
              <label>Marca<input value={bulkBrand} onChange={(event) => setBulkBrand(event.target.value)} /></label>
              <label>Lote<input value={bulkBatch} onChange={(event) => setBulkBatch(event.target.value)} /></label>
              <label>Vencimiento<input value={bulkExpiration} onChange={(event) => setBulkExpiration(event.target.value)} placeholder="DD/MM/AAAA" /></label>
              <button type="button" onClick={applyBulkReagent}>Aplicar a todas</button>
            </div>
            <div className="laboratory-table-tools"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar identificación o N.º interno…" /><div><label>Primera estampilla<input value={firstStamp} onChange={(event) => setFirstStamp(event.target.value)} inputMode="numeric" /></label><button type="button" onClick={assignStamps}>Completar correlativas</button></div></div>
            <div className="laboratory-table-scroll">
              <div className="laboratory-table-head"><span>#</span><span># Lab</span><span>Identificación</span><span>Categoría</span><span>Técnica</span><span>Edad</span><span>Resultado</span><span>Antígeno / Kit</span><span>Marca</span><span>Lote</span><span>Vencimiento</span><span>Estampilla</span></div>
              {visibleRows.map(({ row, index }) => <div className={`laboratory-result-row result-${row.resultCode || "empty"}`} key={`${row.analysisCode}-${row.number}`}>
                <span>{row.number}</span><span>{row.internalNumber || "—"}</span><b>{row.identification || "Sin identificación"}<small>{ID_TYPE_LABELS[row.identificationType] || `Tipo ${row.identificationType}`}</small></b><span>{CATEGORY_LABELS[row.category] || `Código ${row.category}`}</span><span>{techniqueName}</span><span>{AGE_LABELS[row.age] || `Código ${row.age}`}</span>
                <select value={row.resultCode} onChange={(event) => updateRow(index, { resultCode: event.target.value })}><option value="">Elegir…</option>{RESULT_OPTIONS.map((option) => <option value={option.code} key={option.code}>{option.label}</option>)}</select>
                <input data-lab-row={index} data-lab-column="antigen" value={row.antigen} onChange={(event) => updateRow(index, { antigen: event.target.value })} onKeyDown={(event) => focusNextCell(event, index, "antigen")} />
                <input data-lab-row={index} data-lab-column="brand" value={row.brand} onChange={(event) => updateRow(index, { brand: event.target.value })} onKeyDown={(event) => focusNextCell(event, index, "brand")} />
                <input data-lab-row={index} data-lab-column="batch" value={row.batch} onChange={(event) => updateRow(index, { batch: event.target.value })} onKeyDown={(event) => focusNextCell(event, index, "batch")} />
                <input data-lab-row={index} data-lab-column="expiration" value={row.expiration} onChange={(event) => updateRow(index, { expiration: event.target.value })} onKeyDown={(event) => focusNextCell(event, index, "expiration")} placeholder="DD/MM/AAAA" />
                <input data-lab-row={index} data-lab-column="stamp" value={row.stamp} onChange={(event) => updateRow(index, { stamp: event.target.value })} onKeyDown={(event) => focusNextCell(event, index, "stamp")} />
              </div>)}
              {!visibleRows.length && <div className="laboratory-empty-filter">No hay muestras que coincidan con el filtro.</div>}
            </div>
            <footer className="laboratory-export-bar"><div><b>{ready ? "Protocolo completo" : `${rows.length - requiredComplete} filas con datos pendientes`}</b><span>Resultado, antígeno, marca, lote y vencimiento deben estar completos.</span></div><button type="button" className="primary" disabled={!ready} onClick={exportGreCert}>Exportar Excel GRECERT</button></footer>
          </section>
        </>
      )}
    </>
  );
}
