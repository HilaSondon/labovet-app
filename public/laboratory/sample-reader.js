function normalize(v){return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim()}
function ageCode(value,ages){
 if(["N/A","NO APLICA"].includes(normalize(value)))return 10;
 if(!normalize(value))return "";
 return ages.find(a=>normalize(a.Descripcion)===normalize(value))?.["#"]??"";
}
function readSamples(lines,categories,ages){
 const result=[];
 const candidates=[...categories].sort((a,b)=>normalize(b.Descripcion).length-normalize(a.Descripcion).length);
 const start=/^(.+?)\s+(Animal sano|Animal enfermo|Animal caído|Animal muerto|No aplica|N\/A)\s+(.+)$/i;
 for(let i=0;i<lines.length;i++){
  const m=lines[i].match(start);if(!m)continue;
  const prefix=m[1].trim().match(/^(\d+)(?:\s+(.*))?$/)||m[1].trim().match(/^\S+\s+(\d+)\s+(\d{8,})$/);if(!prefix)continue;
  let raw=m[3].replace(/\b\d{2}\/\d{2}\/\d{4}\b/g,"").trim();
  let cat;
  for(let n=0;n<4;n++){
   cat=candidates.find(c=>normalize(raw).startsWith(normalize(c.Descripcion)+"/"));
   if(cat||!lines[i+1]||start.test(lines[i+1])||/^(Número|Página|SERVICIO|Fecha|Motivo|Expediente)/i.test(lines[i+1]))break;
   raw+=" "+lines[++i];
  }
  const category=cat?.Descripcion||raw;
  const age=cat?raw.slice(raw.indexOf("/",normalize(cat.Descripcion).length-1)+1).trim():"";
  result.push({selected:false,tube:prefix[1],identifier:prefix[2]?.trim()||prefix[1],
   category,categoryCode:cat?.["#"]??"",age,ageCode:ageCode(age,ages),
   animalStatus:/^(No aplica|N\/A)$/i.test(m[2])?"N/A":m[2],identificationType:m[2],
   idTypeCode:prefix[2]?1:12,resultCode:"",resultNumber:"",antigen:"",brand:"",lot:"",expiry:"",stamp:""});
 }
 return result;
}
function readCells(pages,categories,ages){
 const candidates=[...categories].sort((a,b)=>normalize(b.Descripcion).length-normalize(a.Descripcion).length);
 return pages.flatMap(p=>p.sampleCells||[]).map(cell=>{
  const raw=cell.categoryAge.trim(),cat=candidates.find(c=>normalize(raw).startsWith(normalize(c.Descripcion)+"/"));
  const category=cat?.Descripcion||raw;
  const age=cat?raw.slice(raw.indexOf("/",normalize(cat.Descripcion).length-1)+1).trim():"";
  return {...cell,selected:false,identifier:cell.identifier||cell.tube,category,categoryCode:cat?.["#"]??"",age,ageCode:ageCode(age,ages),animalStatus:/^(No aplica|N\/A)$/i.test(cell.animalStatus)?"N/A":cell.animalStatus,identificationType:cell.animalStatus,idTypeCode:cell.identifier?1:12,resultCode:"",resultNumber:"",antigen:"",brand:"",lot:"",expiry:"",stamp:""};
 });
}
if(typeof module!=="undefined")module.exports={readSamples,readCells,ageCode};
else window.sampleReader={readSamples,readCells,ageCode};
