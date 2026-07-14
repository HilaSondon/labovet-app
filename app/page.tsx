"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type AnimalRow = { tube: string; animal: string; idType: string; identifier: string; category: string; age: string; vaccination: string; notes: string };
type ErrorMap = Record<string, string>;

const SPECIES = ["BOVINO", "BUBALINO", "CAPRINO", "EQUINO", "OVINO", "PORCINO"] as const;
const ANIMALS: Record<string, number> = { "No aplica": 1, "Animal sano": 2, "Animal enfermo": 3, "Animal caído": 4, "Animal muerto": 5 };
const ID_TYPES: Record<string, number> = { Caravana: 1, Nombre: 2, "Nro de Certificado": 3, "Nro de Libreta": 4, "Nro Pasaporte": 5, "Nro Chip": 6, "Nro de Registro RRI": 7, "Marcas y Señales": 8, "Lote/Lance": 9, Tanque: 10, Colmena: 11, "No aplica": 12, Sexo: 13 };
const CATEGORIES: Record<string, Record<string, number>> = {
  BOVINO: { BUEYES: 101, NOVILLITO: 8, NOVILLO: 50, "SIN ESPECIFICAR": 11410, TERNERA: 351, TERNERO: 350, TORITO: 470, MEJ: 470, TORO: 100, VACA: 7, VAQUILLONA: 200 },
  BUBALINO: { BUEYES: 408, NOVILLITO: 404, NOVILLO: 403, "SIN ESPECIFICAR": 11417, TERNERA: 406, TERNERO: 405, TORITO: 471, MEJ: 471, TORO: 407, VACA: 401, VAQUILLONA: 402 },
  CAPRINO: { CABRA: 20, "CABRILLAS/CHIVITOS": 418, CABRITO: 21, CAPON: 417, CHIVO: 19, "SIN ESPECIFICAR": 11402 },
  EQUINO: { ASNO: 28, BURRO: 27, CABALLO: 23, MULA: 26, PADRILLO: 22, "POTRILLO/A": 25, POTRILLO: 25, POTRILLA: 25, "SIN ESPECIFICAR": 11406, YEGUA: 24 },
  OVINO: { "BORREGO/A": 11, CAPON: 12, CARNERO: 9, "CORDERO/A": 13, OVEJA: 10, "SIN ESPECIFICAR": 11401 },
  PORCINO: { CACHORRA: 476, CACHORRO: 18, "CAPON/ HEMBRA SIN SERVICIO": 17, CERDA: 15, LECHON: 16, MEI: 437, PADRILLO: 14, "SIN ESPECIFICAR": 11399 },
};
const AGES: Record<string, Record<string, number>> = {
  BOVINO: { "< A 1 AÑO": 2, "< A 6 MESES": 1, "< DE 2 AÑOS": 3, ADULTO: 5, CRIA: 6, "DE 1 A 2 AÑOS": 4, JUVENIL: 7, MAYORES: 8, MENORES: 9, "N/A": 10, ">=2 Y <4 AÑOS": 41, ">=4 Y <7 AÑOS": 42, "6 A 18 MESES": 21, ">=7 Y <9 AÑOS": 61, ">=9 AÑOS": 62 },
  BUBALINO: { "< A 1 AÑO": 2, ADULTO: 5, CRIA: 6, JUVENIL: 7, "N/A": 10 }, CAPRINO: { "N/A": 10 }, EQUINO: { "N/A": 10 },
  OVINO: { "BOCA LLENA (> DE 4 AÑOS)": 181, "2 DIENTES (1 AÑO)": 161, "4 DIENTES (2 AÑOS)": 162, "N/A": 10 }, PORCINO: { "N/A": 10 },
};

const norm = (v: unknown) => String(v ?? "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\([^)]*\)/g, "").replace(/\./g, "").replace(/\s+/g, " ").trim();
const findCode = (map: Record<string, number>, value: string) => Object.entries(map).find(([key]) => norm(key) === norm(value))?.[1];

export default function Home() {
  const [species, setSpecies] = useState("BOVINO");
  const [defaultAnimal, setDefaultAnimal] = useState("Animal sano");
  const [defaultId, setDefaultId] = useState("Caravana");
  const [defaultAge, setDefaultAge] = useState("ADULTO");
  const [rows, setRows] = useState<AnimalRow[]>([]);
  const [filename, setFilename] = useState("");
  const [message, setMessage] = useState("Elegí una planilla para comenzar");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const errors = useMemo(() => validateRows(rows, species), [rows, species]);
  const errorRows = new Set(Object.keys(errors).map((key) => key.split(":")[0])).size;
  const ready = rows.length > 0 && Object.keys(errors).length === 0;

  async function loadFile(file?: File) {
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      if (!data.length) throw new Error("La planilla está vacía.");
      const headers = Object.keys(data[0]);
      const pick = (row: Record<string, unknown>, wanted: string[]) => { const key = headers.find((h) => wanted.includes(norm(h).replace(/\s/g, ""))); return key ? row[key] : ""; };
      const parsed = data.map((r) => ({
        tube: norm(pick(r, ["TUBO", "NUMEROTUBO", "NROMUESTRA"])).replace(/\s/g, ""), animal: defaultAnimal, idType: defaultId,
        identifier: norm(pick(r, ["IDENTIFICACION", "IDENTIFICADOR", "CARAVANA"])).replace(/\s/g, ""),
        category: norm(pick(r, ["CATEGORIA", "CATEGORÍA"])), age: defaultAge, vaccination: "", notes: "",
      })).filter((r) => r.tube || r.identifier || r.category);
      if (!parsed.length) throw new Error("No pude encontrar datos. Necesito columnas TUBO, IDENTIFICACION y CATEGORIA.");
      setRows(parsed); setFilename(file.name); setMessage(`${parsed.length} animales detectados en ${file.name}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No pude leer el archivo."); setRows([]); }
  }

  function updateRow(index: number, field: keyof AnimalRow, value: string) {
    setRows((current) => current.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }

  function download() {
    if (!ready) return;
    const output = rows.map((r) => ({
      "Método recolección": 1, "Cantidad Recolección": 1, "Numero tubo / muestra": r.tube,
      "Código de Animal muestreado": ANIMALS[r.animal], "Código de Tipo Identificación": ID_TYPES[r.idType], Identificador: r.identifier,
      "Código de Categoría": findCode(CATEGORIES[species], r.category), "Código de Edad": findCode(AGES[species], r.age),
      "Fecha Vacunación": r.vaccination, Observaciones: r.notes,
    }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(output), "SIGATM");
    XLSX.writeFile(wb, `SIGATM_${species}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function reset() { setRows([]); setFilename(""); setMessage("Elegí una planilla para comenzar"); if (inputRef.current) inputRef.current.value = ""; }
  function onDrop(e: DragEvent) { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files[0]); }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">L</span><div><b>LabOVet</b><small>Gestión veterinaria</small></div></div>
      <nav><p>PRINCIPAL</p><button><span>⌂</span> Inicio</button><p>GRANDES ANIMALES</p><button className="active"><span>⇄</span> Conversor SIGATM</button><button disabled><span>▤</span> Historial <em>Próximamente</em></button></nav>
      <div className="sidebar-bottom"><div className="mini-avatar">HS</div><div><b>Hilario</b><small>Administrador</small></div><span>⋮</span></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><span className="eyebrow">GRANDES ANIMALES</span><h1>Conversor SIGATM</h1><p>Convertí tu planilla de animales al formato oficial, sin cargar datos del productor.</p></div><div className="status-pill"><i /> Procesamiento local y privado</div></header>

      <div className="steps"><div className={rows.length ? "done" : "current"}><b>1</b><span><strong>Cargar planilla</strong><small>Excel del veterinario</small></span></div><hr/><div className={rows.length ? "current" : ""}><b>2</b><span><strong>Revisar datos</strong><small>Validar y corregir</small></span></div><hr/><div className={ready ? "current" : ""}><b>3</b><span><strong>Descargar</strong><small>Excel para SIGATM</small></span></div></div>

      <div className="content-grid">
        <section className="panel setup-panel"><div className="panel-title"><div><span className="icon-box">⚙</span><div><h2>Configuración general</h2><p>Estos datos se aplicarán a todos los animales.</p></div></div><span className="required">Campos obligatorios</span></div>
          <div className="form-grid">
            <label>Especie<select value={species} onChange={(e) => { const s=e.target.value; setSpecies(s); setDefaultAge(Object.keys(AGES[s])[0]); setRows([]); }}>{SPECIES.map(v=><option key={v}>{v}</option>)}</select></label>
            <label>Animal muestreado<select value={defaultAnimal} onChange={(e)=>setDefaultAnimal(e.target.value)}>{Object.keys(ANIMALS).map(v=><option key={v}>{v}</option>)}</select></label>
            <label>Tipo de identificación<select value={defaultId} onChange={(e)=>setDefaultId(e.target.value)}>{Object.keys(ID_TYPES).map(v=><option key={v}>{v}</option>)}</select></label>
            <label>Edad<select value={defaultAge} onChange={(e)=>setDefaultAge(e.target.value)}>{Object.keys(AGES[species]).map(v=><option key={v}>{v}</option>)}</select></label>
          </div>
        </section>

        <section className="panel upload-panel"><div className="panel-title"><div><span className="icon-box green">↥</span><div><h2>Cargar planilla</h2><p>Columnas esperadas: TUBO, IDENTIFICACION y CATEGORIA.</p></div></div></div>
          <div className={`dropzone ${dragging ? "dragging" : ""}`} onDragOver={(e)=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={onDrop} onClick={()=>inputRef.current?.click()}>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={(e:ChangeEvent<HTMLInputElement>)=>loadFile(e.target.files?.[0])}/><div className="file-icon">X</div><strong>{filename || "Arrastrá tu archivo Excel acá"}</strong><span>{filename ? message : "o hacé clic para buscarlo en tu computadora"}</span><button type="button">Seleccionar archivo</button><small>Formatos admitidos: .xlsx y .xls</small>
          </div>
        </section>
      </div>

      {rows.length > 0 && <section className="panel preview-panel">
        <div className="preview-header"><div><span className="icon-box blue">✓</span><div><h2>Vista previa editable</h2><p>{rows.length} registros · {errorRows ? `${errorRows} filas necesitan revisión` : "Todos los datos están listos"}</p></div></div><div className="summary"><span className="ok">{rows.length-errorRows} correctos</span>{errorRows>0&&<span className="bad">{errorRows} con error</span>}</div></div>
        <div className="table-scroll"><table><thead><tr><th>#</th><th>Tubo / muestra</th><th>Animal</th><th>Tipo identificación</th><th>Identificador</th><th>Categoría</th><th>Edad</th><th>Fecha vacunación</th><th>Observaciones</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i} className={Object.keys(errors).some(k=>k.startsWith(`${i}:`))?"row-error":""}><td>{i+1}</td>{(["tube","animal","idType","identifier","category","age","vaccination","notes"] as (keyof AnimalRow)[]).map(field=><td key={field}>{field==="animal"||field==="idType"||field==="category"||field==="age"?<select className={errors[`${i}:${field}`]?"invalid":""} value={r[field]} onChange={e=>updateRow(i,field,e.target.value)}>{Object.keys(field==="animal"?ANIMALS:field==="idType"?ID_TYPES:field==="category"?CATEGORIES[species]:AGES[species]).map(v=><option key={v}>{v}</option>)}</select>:<input className={errors[`${i}:${field}`]?"invalid":""} value={r[field]} placeholder={field==="vaccination"?"DD/MM/AAAA":""} title={errors[`${i}:${field}`]} onChange={e=>updateRow(i,field,e.target.value)}/>}</td>)}</tr>)}</tbody></table></div>
        <div className="actions"><button className="ghost" onClick={reset}>Limpiar y cargar otro</button><div><span>{ready ? "Archivo listo para exportar" : "Corregí los campos marcados en rojo"}</span><button className="primary" disabled={!ready} onClick={download}>Descargar Excel SIGATM <b>→</b></button></div></div>
      </section>}
      {!rows.length && <div className="privacy-note"><span>◉</span><div><b>Tus datos no salen de tu computadora</b><p>La planilla se procesa directamente en este navegador. En esta primera versión no se almacena ni se envía ningún archivo.</p></div></div>}
    </section>
  </main>;
}

function validateRows(rows: AnimalRow[], species: string): ErrorMap {
  const errors: ErrorMap = {}; const tubes = new Map<string,number>(); const ids = new Map<string,number>();
  rows.forEach((r,i)=>{
    if(!r.tube) errors[`${i}:tube`]="Tubo vacío"; else if(tubes.has(r.tube)){errors[`${i}:tube`]="Tubo repetido";errors[`${tubes.get(r.tube)}:tube`]="Tubo repetido"}else tubes.set(r.tube,i);
    if(!r.identifier) errors[`${i}:identifier`]="Identificador vacío"; else if(ids.has(r.identifier)){errors[`${i}:identifier`]="Identificador repetido";errors[`${ids.get(r.identifier)}:identifier`]="Identificador repetido"}else ids.set(r.identifier,i);
    if(!findCode(CATEGORIES[species],r.category)) errors[`${i}:category`]="Categoría inválida";
    if(!findCode(AGES[species],r.age)) errors[`${i}:age`]="Edad inválida";
    if(r.vaccination&&!/^\d{2}\/\d{2}\/\d{4}$/.test(r.vaccination)) errors[`${i}:vaccination`]="Usar DD/MM/AAAA";
  }); return errors;
}
