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

type ViewKey = "estadisticas" | "productores" | "establecimientos" | "campanas" | "sanidad" | "renspa" | "agenda-rural" | "pacientes" | "historia" | "vacunas" | "desparasitaciones" | "estudios" | "recordatorios" | "agenda-clinica" | "turnos" | "sigatm";
const LARGE_MENU: [ViewKey,string][] = [["productores","Productores"],["establecimientos","Establecimientos"],["campanas","Campañas"],["sanidad","Historial sanitario"],["renspa","RENSPA"],["agenda-rural","Agenda rural"]];
const SMALL_MENU: [ViewKey,string][] = [["pacientes","Pacientes"],["historia","Historia clínica"],["vacunas","Vacunas"],["desparasitaciones","Desparasitaciones"],["estudios","Estudios"],["recordatorios","Recordatorios"],["agenda-clinica","Agenda"]];

export default function Home() {
  const [activeView, setActiveView] = useState<ViewKey>("sigatm");
  const [largeOpen, setLargeOpen] = useState(false);
  const [smallOpen, setSmallOpen] = useState(false);
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
      <nav className="main-nav"><p>PRINCIPAL</p>
        <button className={activeView==="estadisticas"?"active":""} onClick={()=>setActiveView("estadisticas")}><span>▥</span> Estadísticas</button>
        <button className={LARGE_MENU.some(([key])=>key===activeView)?"active":""} onClick={()=>setLargeOpen(v=>!v)}><span>♞</span> Grandes animales <i>{largeOpen?"⌃":"⌄"}</i></button>
        {largeOpen&&<div className="submenu">{LARGE_MENU.map(([key,label])=><button key={key} className={activeView===key?"selected":""} onClick={()=>setActiveView(key)}>{label}</button>)}</div>}
        <button className={SMALL_MENU.some(([key])=>key===activeView)?"active":""} onClick={()=>setSmallOpen(v=>!v)}><span>♧</span> Pequeños animales <i>{smallOpen?"⌃":"⌄"}</i></button>
        {smallOpen&&<div className="submenu">{SMALL_MENU.map(([key,label])=><button key={key} className={activeView===key?"selected":""} onClick={()=>setActiveView(key)}>{label}</button>)}</div>}
        <button className={activeView==="turnos"?"active":""} onClick={()=>setActiveView("turnos")}><span>□</span> Turnos</button>
        <p>HERRAMIENTAS</p><button className={activeView==="sigatm"?"active":""} onClick={()=>setActiveView("sigatm")}><span>⇄</span> Conversor SIGATM</button>
      </nav>
      <div className="sidebar-bottom"><div className="mini-avatar">HS</div><div><b>Hilario</b><small>Administrador</small></div><span>⋮</span></div>
    </aside>

    <section className="workspace">
      {activeView!=="sigatm" ? <ModuleView view={activeView} /> : <>
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
      </>}
    </section>
  </main>;
}

const VIEW_CONTENT: Record<Exclude<ViewKey,"sigatm">,{eyebrow:string;title:string;description:string;action:string;stats:[string,string,string][];columns:string[];rows:string[][]}> = {
  estadisticas:{eyebrow:"RESUMEN GENERAL",title:"Estadísticas",description:"Una mirada rápida a la actividad de tu consultorio.",action:"Exportar estadísticas",stats:[["Protocolos","128","+12% este año"],["Muestras","3.842","420 este mes"],["Pacientes","86","12 nuevos"],["Archivos SIGATM","37","generados"]],columns:["Fecha","Actividad","Tipo","Estado"],rows:[["Hoy, 10:30","Campaña de saneamiento · La Esperanza","Grandes animales","Completado"],["Ayer, 17:15","Vacuna séxtuple · Mora","Pequeños animales","Registrado"],["11/07/2026","Archivo SIGATM · 93 animales","Conversión","Generado"]]},
  productores:{eyebrow:"GRANDES ANIMALES",title:"Productores",description:"Productores, datos de contacto y actividad sanitaria.",action:"Nuevo productor",stats:[["Productores activos","32","5 nuevos este año"],["Establecimientos","41","con RENSPA"],["Campañas","18","últimos 90 días"],["Muestras","3.842","acumuladas"]],columns:["Productor","CUIT","Establecimiento","Localidad","Último trabajo","Estado"],rows:[["Est. La Esperanza","30-71234567-8","La Esperanza","Azul","09/07/2026","Activo"],["Los Aromos S.A.","30-69876543-2","Los Aromos","Tandil","06/07/2026","Activo"],["María González","27-24567890-4","El Ombú","Rauch","28/06/2026","Activo"]]},
  establecimientos:{eyebrow:"GRANDES ANIMALES",title:"Establecimientos",description:"Campos y establecimientos vinculados a cada productor.",action:"Nuevo establecimiento",stats:[["Establecimientos","41","activos"],["Con RENSPA","39","95%"],["Bovinos","34","principal especie"],["Localidades","8","alcance regional"]],columns:["Establecimiento","Productor","RENSPA","Localidad","Especie","Acciones"],rows:[["La Esperanza","Est. La Esperanza","01.023.0.12345/00","Azul","Bovino","Ver ficha"],["Los Aromos","Los Aromos S.A.","01.017.0.55421/00","Tandil","Bovino","Ver ficha"],["El Ombú","María González","01.041.0.98812/00","Rauch","Ovino","Ver ficha"]]},
  campanas:{eyebrow:"GRANDES ANIMALES",title:"Campañas",description:"Organizá muestreos, saneamientos y campañas programadas.",action:"Nueva campaña",stats:[["Campañas activas","7","este mes"],["Muestras previstas","620","estimadas"],["Pendientes SIGATM","4","archivos"],["Finalizadas","18","últimos 90 días"]],columns:["Campaña","Establecimiento","Fecha","Análisis","Animales","Estado"],rows:[["Saneamiento BPA","La Esperanza","18/07/2026","Brucelosis","120","Programada"],["Tricho/Campy","Los Aromos","22/07/2026","Tricomoniasis","35","Pendiente"],["Control anual","El Ombú","29/07/2026","Brucelosis","86","Borrador"]]},
  sanidad:{eyebrow:"GRANDES ANIMALES",title:"Historial sanitario",description:"Consultá trabajos, diagnósticos y resultados históricos.",action:"Exportar historial",stats:[["Trabajos","128","registrados"],["Muestras","3.842","procesadas"],["Positivos","42","1,1%"],["Productores","32","vinculados"]],columns:["Fecha","Productor","Establecimiento","Análisis","Resultado","Laboratorio"],rows:[["09/07/2026","Est. La Esperanza","La Esperanza","Brucelosis","93 negativos","Regional Sur"],["06/07/2026","Los Aromos S.A.","Los Aromos","Tricho/Campy","En proceso","Lab Azul"]]},
  renspa:{eyebrow:"GRANDES ANIMALES",title:"RENSPA",description:"Buscá y administrá los RENSPA utilizados con frecuencia.",action:"Agregar RENSPA",stats:[["Registrados","39","activos"],["Verificados","36","92%"],["Pendientes","3","por revisar"],["Usados este mes","12","establecimientos"]],columns:["RENSPA","Establecimiento","Productor","Localidad","Especie","Último uso"],rows:[["01.023.0.12345/00","La Esperanza","Est. La Esperanza","Azul","Bovino","09/07/2026"],["01.017.0.55421/00","Los Aromos","Los Aromos S.A.","Tandil","Bovino","06/07/2026"]]},
  "agenda-rural":{eyebrow:"GRANDES ANIMALES",title:"Agenda rural",description:"Visitas a campo y trabajos programados.",action:"Nueva visita",stats:[["Esta semana","8","visitas"],["Hoy","2","trabajos"],["Pendientes","4","confirmaciones"],["Kilómetros","286","estimados"]],columns:["Fecha y hora","Productor","Establecimiento","Trabajo","Localidad","Estado"],rows:[["15/07 · 08:30","Est. La Esperanza","La Esperanza","Sangrado BPA","Azul","Confirmado"],["15/07 · 15:00","Los Aromos S.A.","Los Aromos","Revisación toros","Tandil","Confirmado"]]},
  pacientes:{eyebrow:"PEQUEÑOS ANIMALES",title:"Pacientes",description:"Fichas de pacientes y datos de sus propietarios.",action:"Nuevo paciente",stats:[["Pacientes activos","86","12 nuevos"],["Caninos","62","72%"],["Felinos","24","28%"],["Consultas","143","últimos 90 días"]],columns:["Paciente","Especie","Raza","Edad","Propietario","Teléfono","Última consulta"],rows:[["Mora","Canino","Labrador","6 años","Lucía Pérez","2494 555-120","13/07/2026"],["Simón","Felino","Europeo","3 años","Martín López","2494 555-843","12/07/2026"],["Frida","Canino","Mestiza","9 años","Ana Silva","2494 555-311","10/07/2026"]]},
  historia:{eyebrow:"PEQUEÑOS ANIMALES",title:"Historia clínica",description:"Evoluciones, diagnósticos y tratamientos por paciente.",action:"Nueva entrada",stats:[["Entradas","412","históricas"],["Este mes","34","consultas"],["Tratamientos","11","activos"],["Controles","8","pendientes"]],columns:["Fecha","Paciente","Motivo","Diagnóstico","Tratamiento","Profesional"],rows:[["13/07/2026","Mora","Control anual","Paciente sana","Plan sanitario","Dr. Sondon"],["12/07/2026","Simón","Dermatitis","Alergia alimentaria","Dieta y control","Dr. Sondon"]]},
  vacunas:{eyebrow:"PEQUEÑOS ANIMALES",title:"Vacunas",description:"Aplicaciones realizadas y próximos vencimientos.",action:"Registrar vacuna",stats:[["Aplicadas","124","este año"],["Vencen este mes","9","recordatorios"],["Caninos","82","66%"],["Felinos","42","34%"]],columns:["Paciente","Vacuna","Aplicación","Próxima dosis","Propietario","Estado"],rows:[["Mora","Séxtuple","13/07/2026","13/07/2027","Lucía Pérez","Al día"],["Simón","Triple felina","02/02/2026","02/02/2027","Martín López","Al día"]]},
  desparasitaciones:{eyebrow:"PEQUEÑOS ANIMALES",title:"Desparasitaciones",description:"Control interno y externo de cada paciente.",action:"Registrar aplicación",stats:[["Aplicadas","98","este año"],["Próximas","7","este mes"],["Internas","64","registros"],["Externas","34","registros"]],columns:["Paciente","Producto","Tipo","Última aplicación","Próxima","Estado"],rows:[["Mora","Total Full","Interna","15/04/2026","15/07/2026","Próxima"],["Frida","Bravecto","Externa","10/05/2026","10/08/2026","Al día"]]},
  estudios:{eyebrow:"PEQUEÑOS ANIMALES",title:"Estudios",description:"Solicitudes, archivos y resultados diagnósticos.",action:"Nuevo estudio",stats:[["Estudios","76","este año"],["Pendientes","5","resultados"],["Laboratorio","48","análisis"],["Imágenes","28","estudios"]],columns:["Fecha","Paciente","Estudio","Laboratorio","Resultado","Archivo"],rows:[["12/07/2026","Simón","Hemograma","Regional Sur","Recibido","Ver PDF"],["10/07/2026","Frida","Ecografía abdominal","Vet Imagen","Pendiente","—"]]},
  recordatorios:{eyebrow:"PEQUEÑOS ANIMALES",title:"Recordatorios",description:"Seguimientos, vacunas y controles próximos.",action:"Nuevo recordatorio",stats:[["Pendientes","14","tareas"],["Hoy","3","avisos"],["WhatsApp","5","por enviar"],["Completados","28","este mes"]],columns:["Fecha","Paciente","Propietario","Motivo","Canal","Estado"],rows:[["15/07/2026","Mora","Lucía Pérez","Control anual","WhatsApp","Pendiente"],["18/07/2026","Simón","Martín López","Control dermatológico","Teléfono","Programado"]]},
  "agenda-clinica":{eyebrow:"PEQUEÑOS ANIMALES",title:"Agenda clínica",description:"Consultas y procedimientos de pequeños animales.",action:"Nuevo turno",stats:[["Turnos hoy","6","consultas"],["Disponibles","3","horarios"],["Confirmados","5","pacientes"],["Urgencias","1","atendida"]],columns:["Hora","Paciente","Propietario","Motivo","Duración","Estado"],rows:[["09:00","Mora","Lucía Pérez","Control anual","30 min","Confirmado"],["10:00","Simón","Martín López","Control piel","30 min","Confirmado"],["11:30","Frida","Ana Silva","Ecografía","45 min","Pendiente"]]},
  turnos:{eyebrow:"AGENDA",title:"Turnos",description:"Todos los compromisos del consultorio en una sola agenda.",action:"Nuevo turno",stats:[["Hoy","8","actividades"],["Grandes animales","2","visitas"],["Pequeños animales","6","consultas"],["Pendientes","2","confirmaciones"]],columns:["Fecha","Hora","Tipo","Cliente / paciente","Actividad","Estado"],rows:[["15/07/2026","08:30","Grandes animales","Est. La Esperanza","Sangrado BPA","Confirmado"],["15/07/2026","09:00","Pequeños animales","Mora · Lucía Pérez","Control anual","Confirmado"],["15/07/2026","15:00","Grandes animales","Los Aromos","Revisación toros","Confirmado"]]}
};

function ModuleView({view}:{view:Exclude<ViewKey,"sigatm">}) {
  const data=VIEW_CONTENT[view];
  return <><header className="topbar module-topbar"><div><span className="eyebrow">{data.eyebrow}</span><h1>{data.title}</h1><p>{data.description}</p></div><button className="primary">＋ {data.action}</button></header>
    <div className="module-stats">{data.stats.map(([label,value,note])=><article className="panel stat-card" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</div>
    <section className="panel module-table"><div className="module-toolbar"><div><h2>{view==="estadisticas"?"Actividad reciente":data.title}</h2><p>Información de muestra para diseñar y validar esta sección.</p></div><label>⌕ <input placeholder="Buscar..."/></label></div>
      <div className="table-scroll"><table><thead><tr>{data.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{data.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{j===row.length-1?<span className="table-status">{cell}</span>:cell}</td>)}</tr>)}</tbody></table></div>
    </section>
    <div className="draft-note"><b>Primera maqueta navegable</b><span>Estos datos son demostrativos. En los próximos pasos definiremos juntos formularios, acciones y qué información guardar en Firebase.</span></div>
  </>;
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
