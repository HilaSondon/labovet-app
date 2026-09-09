"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import "../app/guides.css";
import "../app/guide-demo.css";

type Step = {
  title: string;
  intro: string;
  items: string[];
  tip: string;
  image?: string;
};

const vetconverSteps: Step[] = [
  { title: "Elegí el tipo de trabajo", intro: "Abrí Planillas SIGATM y seleccioná el análisis que vas a preparar.", items: ["Elegí Anemia equina, Brucelosis, Leucosis, Brucella ovis, Aujeszky, Triquina o Aves.", "VetConver completa automáticamente especie, tipo de identificación, categoría y edad habituales.", "Estos valores son una ayuda inicial: podés modificarlos antes de descargar."], tip: "Elegir primero el trabajo evita cargar códigos que no correspondan a la especie." },
  { title: "Pegá o escribí las identificaciones", intro: "Podés copiar desde Excel, pegar un mensaje de WhatsApp o escribir una muestra por renglón.", items: ["Si copiás Excel, podés usar columnas separadas por tabulación.", "También podés escribir, por ejemplo: 2324-5465 VACA.", "En equinos se acepta LIBRETA 03123135 YEGUA o 03123135 YEGUA LIBRETA.", "Los guiones internos de caravanas o identificaciones se conservan."], tip: "No hace falta ordenar previamente toda la información: revisala en la tabla del paso siguiente." },
  { title: "Procesá la información", intro: "Tocá “Procesar información” para convertir el texto en filas estructuradas.", items: ["Cada renglón se transforma en una muestra.", "VetConver reconoce abreviaturas frecuentes como VC, VQ, VAQ y T.", "Si un dato no puede interpretarse, queda marcado para que lo corrijas."], tip: "Procesar no envía información a ningún servidor; los datos permanecen en tu navegador." },
  { title: "Revisá los valores generales", intro: "Usá los selectores para aplicar un mismo valor a todas las filas.", items: ["Confirmá estado del animal, identificación, categoría y edad.", "Si cambiás un selector general, el valor se aplica al lote completo.", "Después podés corregir una fila individual desde la tabla."], tip: "Revisá especialmente la categoría y el tipo de identificación en trabajos con datos variados." },
  { title: "Corregí la vista previa", intro: "La tabla muestra exactamente qué se incluirá en el archivo.", items: ["Los campos en rojo requieren atención.", "VetConver detecta identificaciones faltantes, duplicados y códigos inválidos.", "Podés agregar o eliminar filas y corregir cualquier celda."], tip: "El botón de descarga se habilita únicamente cuando no quedan errores." },
  { title: "Descargá el Excel", intro: "Cuando todo esté validado, descargá el archivo listo para SIGATM.", items: ["Tocá “Descargar Excel para SIGATM”.", "Elegí un nombre que te permita reconocer el trabajo.", "No cambies los encabezados ni el orden de las columnas del archivo descargado.", "Luego abrí la pestaña “Cómo cargar en SIGATM” para completar el acta."], tip: "Podés guardar el archivo como respaldo antes de subirlo a SIGATM." },
];

const sigatmSteps: Step[] = [
  { title: "Ingresá a Actas DNSA", intro: "Primero llegá al listado desde el menú principal de SIGATM.", items: ["Ingresá a SIGATM con tu usuario y contraseña habituales.", "Abrí el menú principal ubicado en el lateral izquierdo.", "Buscá la sección de actas e ingresá a “Actas DNSA”.", "Esperá a que aparezca el listado de actas cargadas.", "En la parte superior del listado, tocá el botón azul “+ Nueva Acta”."], tip: "Si el menú está contraído, tocá el ícono de tres líneas para ver los nombres de las secciones." },
  { title: "Creá una nueva Acta DNSA", intro: "Ingresá a SIGATM, abrí Actas DNSA y tocá “+ Nueva Acta”.", items: ["Elegí el área o programa correspondiente al análisis.", "Seleccioná motivo y submotivo.", "Completá la fecha de toma de muestra.", "Usuario GDE y Documento GDE pueden quedar vacíos cuando no correspondan."], tip: "El número de acta y la fecha de alta se asignan automáticamente.", image: "/sigatm/assets/manual/01-datos-acta-redactado.png" },
  { title: "Indicá el lugar de la toma", intro: "Completá el establecimiento donde se obtuvieron las muestras.", items: ["Elegí normalmente “Unidad productiva”.", "Ingresá el RENSPA y tocá la lupa azul.", "Si no conocés el RENSPA, utilizá la búsqueda de establecimiento.", "Verificá titular y establecimiento antes de continuar."], tip: "Completá “Otro lugar” solo si el origen difiere del sitio de toma.", image: "/sigatm/assets/manual/02-lugar-muestra.png" },
  { title: "Subí las muestras", intro: "Elegí especie y matriz antes de cargar el archivo creado por VetConver.", items: ["Tocá “Seleccionar Especie” y confirmá la correcta.", "Elegí la matriz; para sangrados generalmente corresponde Suero.", "Marcá “Muestras y submuestras”.", "En “Subir archivo de muestras”, tocá Buscar y seleccioná el Excel.", "Tocá “Agregar muestras” y revisá la grilla."], tip: "No modifiques los encabezados del Excel. Si SIGATM marca errores, corregí la fila en VetConver y descargalo nuevamente.", image: "/sigatm/assets/manual/03-muestras.png" },
  { title: "Asigná el ensayo", intro: "Indicá qué diagnóstico y técnica realizará el laboratorio.", items: ["Elegí el grupo de análisis correspondiente.", "Marcá la técnica solicitada por el laboratorio o el programa sanitario.", "Podés seleccionar más de una técnica si corresponde.", "Tocá el botón azul “Asignar”."], tip: "Ante dudas sobre la técnica, confirmala con el laboratorio antes de finalizar.", image: "/sigatm/assets/manual/04-ensayos.png" },
  { title: "Elegí laboratorio y finalizá", intro: "Revisá el acta completa antes de enviarla.", items: ["Seleccioná el laboratorio de destino.", "Usá “Grabar borrador” si todavía necesitás revisar información.", "Tocá “Finalizar” solamente cuando todo esté correcto.", "Imprimí el talón y envialo con las muestras cuando corresponda."], tip: "Finalizar envía el acta al laboratorio; una corrección posterior puede requerir rectificarla o rehacerla.", image: "/sigatm/assets/manual/05-finalizar.png" },
];

const demoStages = ["Elegimos Brucelosis bovina", "Pegamos 100 caravanas", "Procesamos la información", "Aplicamos estado y edad a todas", "Validamos las 100 muestras", "Descargamos el archivo", "Abrimos el Excel listo para SIGATM"];

function VetconverDemo() {
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => stage === demoStages.length - 1 ? setPlaying(false) : setStage((value) => value + 1), 2200);
    return () => window.clearTimeout(timer);
  }, [playing, stage]);
  const restart = () => { setStage(0); setPlaying(true); };
  return <section className="guide-demo" aria-label="Demostración animada de VetConver">
    <div className="demo-heading"><div><span>DEMOSTRACIÓN INTERACTIVA</span><h2>De 100 caravanas a un Excel listo</h2><p>Una simulación breve del proceso completo. No utiliza datos reales ni genera archivos.</p></div><div className="demo-controls"><button onClick={() => stage === demoStages.length - 1 ? restart() : setPlaying((value) => !value)}>{playing ? "Pausar" : stage === demoStages.length - 1 ? "Repetir" : "Reproducir"}</button>{stage > 0 && <button className="quiet" onClick={restart}>Reiniciar</button>}</div></div>
    <div className="demo-window"><div className="demo-progress"><i style={{ width: `${((stage + 1) / demoStages.length) * 100}%` }} /></div><div className="demo-status"><b>Paso {stage + 1} de {demoStages.length}</b><span>{demoStages[stage]}</span></div>
      {stage < 6 ? <div className="demo-app"><aside>{["Anemia equina", "Brucelosis bovina", "Leucosis bovina"].map((item, index) => <div key={item} className={index === 1 ? "chosen" : ""}>{item}</div>)}</aside><main>
        <div className={`demo-paste ${stage >= 1 ? "filled" : ""}`}>{stage >= 1 ? <><code>032025000001887&nbsp;&nbsp;VACA</code><code>032025000001888&nbsp;&nbsp;VACA</code><code>032025000001889&nbsp;&nbsp;VACA</code><small>… 97 filas más</small></> : <span>Pegá acá las identificaciones</span>}</div>
        <button className={stage === 2 ? "pulse" : ""}>Procesar información</button>
        {stage >= 3 && <div className="demo-defaults"><span>Estado: <b>Animal sano</b></span><span>Edad: <b>Adulto</b></span></div>}
        {stage >= 2 && <div className="demo-result"><b>{stage >= 4 ? "100 correctos" : "100 animales cargados"}</b><span>{stage >= 4 ? "✓ Sin errores" : "Listos para revisar"}</span></div>}
        {stage >= 5 && <div className="demo-download">↓ 100 - Brucelosis - archivo SIGATM.xlsx</div>}
      </main></div> : <div className="demo-sheet"><div>A</div><div>B</div><div>C</div><div>D</div><b>Tubo</b><b>Animal</b><b>Tipo ID</b><b>Identificador</b>{["032025000001887", "032025000001888", "032025000001889"].map((id, index) => <span key={id}><em>{index + 1}</em><em>2</em><em>1</em><em>{id}</em></span>)}<small>100 filas preparadas para cargar en SIGATM</small></div>}
    </div>
    <ol className="demo-dots">{demoStages.map((label, index) => <li key={label} className={index === stage ? "active" : index < stage ? "done" : ""}><button title={label} aria-label={label} onClick={() => { setStage(index); setPlaying(false); }}>{index + 1}</button></li>)}</ol>
  </section>;
}

export default function GuidePanel({ guide }: { guide: "vetconver" | "sigatm" }) {
  const [selected, setSelected] = useState(0);
  const steps = guide === "vetconver" ? vetconverSteps : sigatmSteps;
  const step = steps[selected];
  return (
    <section className="guide-page">
      <header className="guide-heading">
        <span>GUÍA PASO A PASO</span>
        <h1>{guide === "vetconver" ? "Cómo usar VetConver" : "Cómo cargar el archivo en SIGATM"}</h1>
        <p>{guide === "vetconver" ? "Desde los datos originales hasta el Excel validado y listo para descargar." : "Recorrido completo para incorporar el archivo generado a una nueva Acta DNSA."}</p>
      </header>
      {guide === "vetconver" && <VetconverDemo />}
      <nav className="guide-step-tabs" aria-label="Pasos de la guía">
        {steps.map((item, index) => <button key={item.title} className={selected === index ? "active" : ""} onClick={() => setSelected(index)}><b>{index + 1}</b><span>{item.title}</span></button>)}
      </nav>
      <article className={`guide-content ${step.image ? "with-image" : ""}`}>
        <div className="guide-instructions">
          <span>PASO {selected + 1} DE {steps.length}</span>
          <h2>{step.title}</h2>
          <p>{step.intro}</p>
          <ol>{step.items.map((item) => <li key={item}>{item}</li>)}</ol>
          <div className="guide-tip">{step.tip}</div>
        </div>
        {step.image && <figure><Image src={step.image} width={1200} height={760} alt={`Captura del paso ${selected + 1}: ${step.title}`} /><figcaption>Referencia visual dentro de SIGATM.</figcaption></figure>}
      </article>
      <footer className="guide-navigation">
        <button onClick={() => setSelected((value) => Math.max(0, value - 1))} disabled={selected === 0}>← Anterior</button>
        <span>Paso {selected + 1} de {steps.length}</span>
        <button className="next" onClick={() => setSelected((value) => Math.min(steps.length - 1, value + 1))} disabled={selected === steps.length - 1}>Siguiente →</button>
      </footer>
    </section>
  );
}
