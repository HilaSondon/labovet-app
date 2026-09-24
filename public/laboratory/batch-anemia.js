(() => {
  const state = { protocols: [], json: [] };
  const requiredHeaders = ["FECHA TOMA", "FECHA RECEPCION", "FECHA INICIO", "FECHA FIN", "PROTOCOLO", "ACTA", "CANTIDAD", "VETERINARIO", "CUIT", "MOTIVO", "RENSPA", "TIPO DE IDENTIFICACION", "IDENTIFICACION", "CATEGORIA", "RESULTADO", "ESTAMPILLA", "LOTE", "VENCIMIENTO", "ESTAMPILLA ANTIGENO"];
  const aliases = { "FECHA RECEPCION": ["FECHA RECEPCION"], "TIPO DE IDENTIFICACION": ["TIPO DE IDENTIFICACION"], "IDENTIFICACION": ["IDENTIFICACION", "N°", "NRO"], "ESTAMPILLA ANTIGENO": ["ESTAMPILLA ANTIGENO", "EST. ANTIGENO"] };
  const normalizedHeader = value => norm(String(value || "").replace(/[←°º]/g, ""));
  const dateLabel = value => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return `${String(value.getDate()).padStart(2, "0")}/${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
    if (typeof value === "number") { const d = XLSX.SSF.parse_date_code(value); if (d) return `${String(d.d).padStart(2, "0")}/${String(d.m).padStart(2, "0")}/${d.y}`; }
    const match = String(value || "").trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    return match ? `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[3]}` : "";
  };
  const jsonDate = value => value ? `${value} 08:00` : "";
  const cellText = value => value == null ? "" : String(value).trim();
  const lookup = (rows, value) => rows.find(row => norm(row.Descripcion) === norm(value));
  const headerIndex = (headers, name) => headers.findIndex(value => (aliases[name] || [name]).includes(value));
  const valueAt = (row, indexes, name) => row[indexes[name]];
  const anemiaConfiguration = () => {
    const diagnosis = profile.diagnoses.find(item => canonicalDiagnosis(item.name) === "ANEMIAS");
    const technique = diagnosis?.techniques.find(item => norm(item.technique).includes("IDGA")) || diagnosis?.techniques[0];
    const director = profile.directors.find(item => String(item.code || "").trim());
    const conclusion = profile.conclusions.find(item => norm(item) === "SIN OBSERVACIONES") || profile.conclusions[0] || "";
    const errors = [];
    if (!profile.labCode) errors.push("Completá el código del laboratorio en Mis datos.");
    if (!director?.code) errors.push("Completá el código GRECERT del director técnico.");
    if (!technique?.code) errors.push("Configurá ANEMIAS y su código de ensayo en Mis datos.");
    if (!technique?.brand) errors.push("Completá la marca del antígeno de ANEMIAS en Mis datos.");
    if (!conclusion) errors.push("Configurá una conclusión para los protocolos.");
    return { diagnosis, technique, director, conclusion, errors };
  };
  function parseWorkbook(file) {
    return file.arrayBuffer().then(buffer => {
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
      const headerRow = rows.findIndex(row => row.some(value => normalizedHeader(value) === "PROTOCOLO"));
      if (headerRow < 0) throw Error("No se encontró la fila de encabezados de la plantilla.");
      const headers = rows[headerRow].map(normalizedHeader), indexes = {};
      for (const name of requiredHeaders) { indexes[name] = headerIndex(headers, name); if (indexes[name] < 0) throw Error(`Falta la columna “${name.toLowerCase()}”. Descargá la plantilla actualizada.`); }
      const protocols = []; let current = null;
      rows.slice(headerRow + 1).forEach((row, offset) => {
        const rowNumber = headerRow + offset + 2, protocolNumber = cellText(valueAt(row, indexes, "PROTOCOLO")), identification = cellText(valueAt(row, indexes, "IDENTIFICACION"));
        const hasContent = row.some(value => cellText(value)); if (!hasContent) return;
        if (protocolNumber) {
          current = { rowNumber, errors: [], samples: [], number: protocolNumber, act: cellText(valueAt(row, indexes, "ACTA")), declared: Number(valueAt(row, indexes, "CANTIDAD")), vet: cellText(valueAt(row, indexes, "VETERINARIO")), cuit: formatCuit(valueAt(row, indexes, "CUIT")), motive: cellText(valueAt(row, indexes, "MOTIVO")), renspa: cellText(valueAt(row, indexes, "RENSPA")), takeDate: dateLabel(valueAt(row, indexes, "FECHA TOMA")), receptionDate: dateLabel(valueAt(row, indexes, "FECHA RECEPCION")), startDate: dateLabel(valueAt(row, indexes, "FECHA INICIO")), endDate: dateLabel(valueAt(row, indexes, "FECHA FIN")), assayDefaults: {} };
          protocols.push(current);
        }
        if (!current) throw Error(`La fila ${rowNumber} contiene una muestra antes del primer número de protocolo.`);
        if (!identification) { current.errors.push(`Fila ${rowNumber}: falta la identificación del animal.`); return; }
        for (const field of ["LOTE", "VENCIMIENTO", "ESTAMPILLA ANTIGENO"]) { const value = valueAt(row, indexes, field); if (cellText(value)) current.assayDefaults[field] = value; }
        current.samples.push({ rowNumber, identification, idType: cellText(valueAt(row, indexes, "TIPO DE IDENTIFICACION")), category: cellText(valueAt(row, indexes, "CATEGORIA")), result: cellText(valueAt(row, indexes, "RESULTADO")), stamp: cellText(valueAt(row, indexes, "ESTAMPILLA")), lot: cellText(valueAt(row, indexes, "LOTE")), expiry: dateLabel(valueAt(row, indexes, "VENCIMIENTO")), antigen: cellText(valueAt(row, indexes, "ESTAMPILLA ANTIGENO")) });
      });
      if (!protocols.length) throw Error("La planilla no contiene protocolos.");
      return protocols;
    });
  }
  function validateAndBuild(protocols) {
    const config = anemiaConfiguration(), numbers = new Set();
    const idRows = catalog("identificationTypes"), resultRows = catalog("results"), unit = catalog("lotUnits").find(row => norm(row.Descripcion).startsWith("TUBO"));
    const categoryOptions = categoryRows("EQUIDO"), product = productCode("EQUIDO");
    const output = [];
    for (const protocol of protocols) {
      if (numbers.has(protocol.number)) protocol.errors.push("El número de protocolo está repetido en la planilla."); else numbers.add(protocol.number);
      if (!protocol.act) protocol.errors.push("Falta el número de acta.");
      if (!Number.isInteger(protocol.declared) || protocol.declared < 1) protocol.errors.push("La cantidad declarada no es válida.");
      if (protocol.declared !== protocol.samples.length) protocol.errors.push(`Declara ${protocol.declared || 0} muestras, pero se encontraron ${protocol.samples.length}.`);
      if (!protocol.vet) protocol.errors.push("Falta el veterinario.");
      if (protocol.cuit.replace(/\D/g, "").length !== 11) protocol.errors.push("El CUIT no tiene 11 dígitos.");
      if (!protocol.renspa) protocol.errors.push("Falta el RENSPA.");
      for (const [label, value] of [["fecha de toma", protocol.takeDate], ["fecha de recepción", protocol.receptionDate], ["fecha de inicio", protocol.startDate], ["fecha de finalización", protocol.endDate]]) if (!value) protocol.errors.push(`Falta o no es válida la ${label}.`);
      const mapping = codeMappings.find(row => canonicalDiagnosis(row.diagnosis) === "ANEMIAS" && norm(row.submotive) === norm(protocol.motive));
      if (!mapping?.motiveCode || !mapping?.submotiveCode) protocol.errors.push(`El motivo “${protocol.motive || "vacío"}” no corresponde a ANEMIAS.`);
      const subSamples = protocol.samples.map(sample => {
        const idType = lookup(idRows, sample.idType), category = lookup(categoryOptions, sample.category), result = lookup(resultRows, sample.result);
        if (!idType) protocol.errors.push(`Fila ${sample.rowNumber}: tipo de identificación desconocido.`);
        if (!category) protocol.errors.push(`Fila ${sample.rowNumber}: categoría desconocida.`);
        if (!result || ![1, 21].includes(Number(result["#"]))) protocol.errors.push(`Fila ${sample.rowNumber}: resultado no permitido.`);
        if (!sample.stamp) protocol.errors.push(`Fila ${sample.rowNumber}: falta la estampilla.`);
        const lot = sample.lot || cellText(protocol.assayDefaults.LOTE), expiry = sample.expiry || dateLabel(protocol.assayDefaults.VENCIMIENTO), antigen = sample.antigen || cellText(protocol.assayDefaults["ESTAMPILLA ANTIGENO"]);
        if (!lot) protocol.errors.push(`Fila ${sample.rowNumber}: falta el lote.`);
        if (!expiry) protocol.errors.push(`Fila ${sample.rowNumber}: falta o no es válido el vencimiento.`);
        if (!antigen) protocol.errors.push(`Fila ${sample.rowNumber}: falta la estampilla del antígeno.`);
        return { codigoResultadoLetra: Number(result?.["#"] || 0), identificacion: sample.identification, codigoTipoIdentificacion: Number(idType?.["#"] || 0), codigoDeCategoria: Number(category?.["#"] || 0), antigeno: antigen, marcaDeAntigeno: config.technique?.brand || "", lote: lot, fechaDeVencimientoDeAnalisis: jsonDate(expiry), estampilla: sample.stamp };
      });
      protocol.errors = [...new Set(protocol.errors)];
      if (!protocol.errors.length && !config.errors.length) output.push({ numeroInforme: protocol.number, codigoLaboratorio: profile.labCode, renspaUnidadProductiva: protocol.renspa, codigoMotivo: Number(mapping.motiveCode), codigoSubMotivo: Number(mapping.submotiveCode), codigotipoDocumentoUno: 21, numeroDocumentoUno: protocol.act, cuitDeFuncionario: protocol.cuit, muestra: { fechaDeToma: jsonDate(protocol.takeDate), fechaDeRecepcion: jsonDate(protocol.receptionDate), codigoDeProducto: product || "E17", cantidadDeLote: protocol.samples.length, codigoUnidadDeMedidaDeLote: Number(unit?.["#"] || 326), analisis: [{ codigoEnsayo: Number(config.technique.code), resultadoUnico: false, fechaInicio: jsonDate(protocol.startDate), fechaFin: jsonDate(protocol.endDate), subMuestras: subSamples }], codigoDirectorTecnico: Number(config.director.code), conclusionTramite: config.conclusion }, codigoTipoDeTramite: 3 });
    }
    return { config, output };
  }
  function render(protocols, config, output) {
    state.protocols = protocols; state.json = output;
    $("anemiaBatchResult").hidden = false; $("anemiaDropZone").classList.add("anemia-loaded");
    $("anemiaProtocolCount").textContent = protocols.length; $("anemiaSampleCount").textContent = protocols.reduce((sum, item) => sum + item.samples.length, 0);
    const invalid = protocols.filter(item => item.errors.length).length + (config.errors.length ? protocols.filter(item => !item.errors.length).length : 0);
    $("anemiaReadyCount").textContent = config.errors.length ? 0 : protocols.length - invalid; $("anemiaErrorCount").textContent = invalid;
    const warning = $("anemiaConfigWarning"); warning.hidden = !config.errors.length; warning.replaceChildren();
    if (config.errors.length) { const title = document.createElement("b"); title.textContent = "Falta completar Mis datos"; const list = document.createElement("ul"); config.errors.forEach(error => { const item = document.createElement("li"); item.textContent = error; list.append(item); }); warning.append(title, list); }
    const body = $("anemiaReviewBody"); body.replaceChildren();
    protocols.forEach(protocol => { const row = document.createElement("tr"); const values = [protocol.number, protocol.act, `${protocol.takeDate || "—"} / ${protocol.receptionDate || "—"} / ${protocol.startDate || "—"} / ${protocol.endDate || "—"}`, `${protocol.vet || "—"} · ${protocol.cuit || "—"}`, protocol.motive || "—", `${protocol.samples.length} de ${protocol.declared || 0}`]; values.forEach(value => { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); }); const status = document.createElement("td"); status.className = protocol.errors.length || config.errors.length ? "batch-error" : "batch-ready"; status.textContent = protocol.errors.length ? protocol.errors.join(" ") : config.errors.length ? "Falta configuración del laboratorio." : "Listo"; row.append(status); body.append(row); });
    $("downloadAnemiaJson").disabled = Boolean(config.errors.length || invalid || !output.length);
  }
  async function load(file) {
    if (!file || !/\.xlsx?$/i.test(file.name)) return toast("Seleccioná la plantilla Excel de anemias.");
    toast("Leyendo planilla de anemias…");
    try { const protocols = await parseWorkbook(file), result = validateAndBuild(protocols); render(protocols, result.config, result.output); toast(result.config.errors.length || protocols.some(item => item.errors.length) ? "La planilla tiene datos para revisar." : `${protocols.length} protocolos listos para descargar.`); }
    catch (error) { clear(); toast(error.message); }
  }
  function clear() { state.protocols = []; state.json = []; $("anemiaExcel").value = ""; $("anemiaBatchResult").hidden = true; $("anemiaDropZone").classList.remove("anemia-loaded", "drag-over"); $("anemiaReviewBody").replaceChildren(); }
  $("selectAnemiaExcel").onclick = () => $("anemiaExcel").click();
  $("anemiaExcel").onchange = event => { const file = event.target.files[0]; event.target.value = ""; load(file); };
  $("clearAnemiaBatch").onclick = clear;
  $("downloadAnemiaJson").onclick = () => { if (!state.json.length || $("downloadAnemiaJson").disabled) return toast("Revisá los errores antes de descargar."); downloadBlob(`Anemias masivas ${today()}.json`, JSON.stringify(state.json, null, 2), "application/json"); };
  const zone = $("anemiaDropZone"); let dragDepth = 0;
  zone.addEventListener("dragenter", event => { if (![...event.dataTransfer.types].includes("Files")) return; event.preventDefault(); dragDepth++; zone.classList.add("drag-over"); });
  zone.addEventListener("dragover", event => { if (![...event.dataTransfer.types].includes("Files")) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; });
  zone.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) zone.classList.remove("drag-over"); });
  zone.addEventListener("drop", event => { event.preventDefault(); dragDepth = 0; zone.classList.remove("drag-over"); const files = [...event.dataTransfer.files]; if (files.length !== 1) return toast("Arrastrá una sola plantilla Excel por vez."); load(files[0]); });
})();
