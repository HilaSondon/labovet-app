import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = new URL("../outputs/anemias-masivas/", import.meta.url);
const publicDir = new URL("../public/laboratory/", import.meta.url);
const outputName = "Plantilla carga masiva anemias.xlsx";
const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Carga de anemias");
const lists = workbook.worksheets.add("Listas permitidas");

const headers = [
  "Fecha Toma", "Fecha Recepción", "Fecha Inicio", "Fecha Fin", "Protocolo", "Acta", "Cantidad",
  "Veterinario", "CUIT", "Motivo", "RENSPA", "Tipo de identificación", "Identificación", "Categoría",
  "Resultado", "Estampilla", "Lote", "Vencimiento", "Estampilla antígeno",
];
sheet.getRange("A1:S1").values = [["DATOS DEL PROTOCOLO", null, null, null, null, null, null, null, null, null, null, "DETALLE DE LAS MUESTRAS", null, null, null, "DATOS DEL ENSAYO", null, null, null]];
sheet.getRange("A2:S2").values = [headers];
sheet.getRange("A1:K1").format = { fill: "#12362F", font: { name: "Arial", bold: true, color: "#FFFFFF", size: 11 }, horizontalAlignment: "left" };
sheet.getRange("L1:O1").format = { fill: "#0C8068", font: { name: "Arial", bold: true, color: "#FFFFFF", size: 11 }, horizontalAlignment: "left" };
sheet.getRange("P1:S1").format = { fill: "#12362F", font: { name: "Arial", bold: true, color: "#FFFFFF", size: 11 }, horizontalAlignment: "left" };
sheet.getRange("A2:S2").format = { fill: "#E6F3EE", font: { name: "Arial", bold: true, color: "#12362F", size: 10 }, wrapText: true, verticalAlignment: "center", horizontalAlignment: "center", borders: { preset: "all", style: "thin", color: "#C5D9D2" } };
sheet.getRange("A3:S2002").format.font = { name: "Arial", size: 10, color: "#12362F" };
sheet.getRange("A3:S2002").format.borders = { insideHorizontal: { style: "thin", color: "#E7EFEC" } };
sheet.getRange("A3:D2002").setNumberFormat("dd/mm/yyyy");
sheet.getRange("R3:R2002").setNumberFormat("dd/mm/yyyy");
for (const range of ["E3:F2002", "I3:I2002", "K3:K2002", "M3:M2002", "P3:P2002", "Q3:Q2002", "S3:S2002"]) sheet.getRange(range).setNumberFormat("@");
sheet.getRange("A1:S2002").format.verticalAlignment = "center";
sheet.getRange("A1:S2").format.rowHeight = 30;
const widths = [13,15,13,13,12,12,10,23,17,25,21,22,22,17,14,14,15,15,21];
widths.forEach((width, index) => { sheet.getRangeByIndexes(0, index, 2002, 1).format.columnWidth = width; });
sheet.freezePanes.freezeRows(2);
sheet.showGridLines = false;

const allowed = {
  motives: [["Motivo", "Código"], ["CERTIFICACION", 68], ["RELEVAMIENTO SANITARIO", 4], ["SANEAMIENTO", 5]],
  ids: [["Tipo de identificación", "Código"], ["Nro de Libreta", 4], ["Nro Pasaporte", 5], ["Nro Chip", 6]],
  categories: [["Categoría", "Código"], ["ASNO", 28], ["BURRO", 27], ["CABALLO", 23], ["MULA", 26], ["PADRILLO", 22], ["POTRILLO/A", 25], ["YEGUA", 24], ["SIN ESPECIFICAR", 11406]],
  results: [["Resultado", "Código"], ["NEGATIVO", 1], ["POSITIVO", 21]],
};
lists.getRange("A1:B4").values = allowed.motives;
lists.getRange("D1:E4").values = allowed.ids;
lists.getRange("G1:H9").values = allowed.categories;
lists.getRange("J1:K3").values = allowed.results;
for (const range of ["A1:B1", "D1:E1", "G1:H1", "J1:K1"]) lists.getRange(range).format = { fill: "#12362F", font: { name: "Arial", bold: true, color: "#FFFFFF" } };
lists.getRange("A1:K9").format.font = { name: "Arial", size: 10 };
for (const col of ["A:B", "D:E", "G:H", "J:K"]) lists.getRange(col).format.columnWidth = 24;
lists.showGridLines = false;

sheet.getRange("J3:J2002").dataValidation = { rule: { type: "list", formula1: "'Listas permitidas'!$A$2:$A$4" } };
sheet.getRange("L3:L2002").dataValidation = { rule: { type: "list", formula1: "'Listas permitidas'!$D$2:$D$4" } };
sheet.getRange("N3:N2002").dataValidation = { rule: { type: "list", formula1: "'Listas permitidas'!$G$2:$G$9" } };
sheet.getRange("O3:O2002").dataValidation = { rule: { type: "list", formula1: "'Listas permitidas'!$J$2:$J$3" } };
sheet.getRange("G3:G2002").dataValidation = { rule: { type: "whole", operator: "between", formula1: 1, formula2: 5000 } };

const info = workbook.worksheets.add("Cómo completar");
info.getRange("A1:D1").values = [["Plantilla para carga masiva de anemias", null, null, null]];
info.getRange("A1:D1").format = { font: { name: "Arial", bold: true, size: 16, color: "#12362F" }, borders: { bottom: { style: "thin", color: "#0C8068" } } };
info.getRange("A3:B9").values = [
  ["Regla", "Descripción"],
  ["Una fila por animal", "Completá la identificación, categoría, resultado y datos del ensayo en cada fila."],
  ["Inicio de protocolo", "Completá Protocolo, Acta, Cantidad, Veterinario, CUIT, Motivo y RENSPA en la primera fila de cada protocolo."],
  ["Continuación", "En las filas siguientes del mismo protocolo dejá vacíos esos datos generales y continuá con las muestras."],
  ["Fechas", "Fecha Toma y Fecha Recepción se envían al JSON. Fecha Inicio y Fecha Fin corresponden al análisis."],
  ["Valores permitidos", "Usá las listas desplegables de Motivo, Tipo de identificación, Categoría y Resultado."],
  ["Identificaciones", "Conservá guiones y ceros iniciales. Las columnas de identificación están configuradas como texto."],
];
info.getRange("A3:B3").format = { fill: "#12362F", font: { name: "Arial", bold: true, color: "#FFFFFF" } };
info.getRange("A4:B9").format = { font: { name: "Arial", size: 10, color: "#12362F" }, wrapText: true, verticalAlignment: "top" };
info.getRange("A1:D9").format.font.name = "Arial";
info.getRange("A:A").format.columnWidth = 25;
info.getRange("B:B").format.columnWidth = 80;
info.getRange("A4:B9").format.rowHeight = 34;
info.showGridLines = false;

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(publicDir, { recursive: true });
const check = await workbook.inspect({ kind: "table", sheetId: "Carga de anemias", range: "A1:S8", include: "values,formulas", tableMaxRows: 8, tableMaxCols: 19 });
console.log(check.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan" });
console.log(errors.ndjson);
for (const [sheetName, range, fileName] of [["Carga de anemias", "A1:S12", "plantilla-anemias-preview.png"], ["Listas permitidas", "A1:K10", "plantilla-anemias-listas.png"], ["Cómo completar", "A1:B9", "plantilla-anemias-ayuda.png"]]) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(new URL(fileName, outputDir), new Uint8Array(await preview.arrayBuffer()));
}
const file = await SpreadsheetFile.exportXlsx(workbook);
await file.save(fileURLToPath(new URL(outputName, outputDir)));
await file.save(fileURLToPath(new URL(outputName, publicDir)));
