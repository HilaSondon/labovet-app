// Shared report data and layout. Exporters never modify the protocol being edited.
export const FOOTER='El Plan Nacional de Control y Erradicación de Brucelosis Bovina (Resolución SENASA N°67/19) establece las obligaciones ante uno o más animales positivos a brucelosis. Si ésta es su situación, debe concurrir, en un plazo máximo de 60 días, a la oficina local del SENASA para descartar o confirmar el caso y presentar un plan de saneamiento. Recuerde que los resultados positivos no descartados generan restricciones para acceder a ciertos mercados que así lo exigen.';
const clean=v=>String(v??'');
const norm=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v.split('-').reverse().join('/'):v||'';
const short=v=>clean(v).split(' (')[0];
const border={style:'thin',color:{argb:'FF333333'}};
const DIAGNOSIS_COLORS={
 BRUCELOSIS:'DCEFE7',
 'BRUCELLA OVIS':'E6E0F8',
 'BRUCELOSIS OVINA':'E6E0F8',
 AUJESZKY:'FDE8D7',
 ANEMIAS:'DDEBFA',
 'ANEMIA INFECCIOSA EQUINA':'DDEBFA',
 'INFLUENZA AVIAR':'FFF2CC',
 'MICOPLASMOSIS AVIAR':'F3E3F5',
 TRIQUINA:'F7DFE3',
 TRIQUINELOSIS:'F7DFE3',
 LEUCOSIS:'E2F0CB',
 PAL:'E8E0D8'
};
function diagnosisLabel(data){return clean(data.diagnosis||'').trim()||'DIAGNÓSTICO';}
function diagnosisColor(data){return DIAGNOSIS_COLORS[norm(diagnosisLabel(data))]||'DBE4F4';}
function reportBandTitle(data,title){return `${title} - ${diagnosisLabel(data)}`;}
export function reportRows(data){
 const queues=new Map();
 for(const r of data.secondary?.rows||[]){const key=JSON.stringify([r.tube,r.identifier]);if(!queues.has(key))queues.set(key,[]);queues.get(key).push(r)}
 return data.rows.map(row=>({row,extra:queues.get(JSON.stringify([row.tube,row.identifier]))?.shift()}));
}
function columns(data){
 const cols=[{label:'Identificación',width:48,get:r=>r.row.identifier||r.row.tube},{label:'Categoría',width:32,get:r=>r.row.category}];
 const groups=[];let remaining=94,number=(data.primary.value?2:1)+(data.secondary?(data.secondary.value?2:1):0),w=remaining/number;
 for(const [config,key] of [[data.primary,'row'],[data.secondary,'extra']]){
  if(!config)continue;const start=cols.length;
  if(config.value)cols.push({label:'Valor',width:w,get:r=>r[key]?.resultNumber??'',numeric:true});
  cols.push({label:'Resultado',width:w,get:r=>r[key]?.result||''});
  groups.push({name:short(config.technique),start,end:cols.length-1});
 }
 return {cols,groups};
}
function rowColor(data,r){
 const result=norm(r.extra?.result||r.row.result);
 return result==='POSITIVO'?'FCE2E2':['SOSPECHOSO','DUDOSO'].includes(result)?'FFF2CC':null;
}
function summary(data,rows){
 const counts={NEGATIVO:0,POSITIVO:0,SOSPECHOSO:0,'SIN RESULTADO':0};
 const identifiers={POSITIVO:[],SOSPECHOSO:[]};
 const categories={};
 for(const r of rows){let result=norm(r.extra?.result||r.row.result)||'SIN RESULTADO';if(result==='DUDOSO')result='SOSPECHOSO';counts[result]=(counts[result]||0)+1;const identifier=clean(r.extra?.identifier||r.extra?.tube||r.row.identifier||r.row.tube||'S/N');if(identifiers[result]&&identifier)identifiers[result].push(identifier);const category=clean(r.row.category).trim()||'SIN CATEGORÍA';categories[category]=(categories[category]||0)+1}
 return {counts,identifiers,categories};
}
function summaryLine(label,count,identifiers){return `${label}: ${count}${identifiers?.length?` (${identifiers.join(', ')})`:''}`;}
function categorySummary(categories){return 'Categorías: '+Object.entries(categories).sort((a,b)=>a[0].localeCompare(b[0],'es')).map(([name,count])=>`${name}: ${count}`).join(', ');}
function reagentLines(data){
 const lines=[];
 for(const config of [data.primary,data.secondary].filter(Boolean)){
  lines.push({text:config.technique,bold:true});
  for(const [key,label] of [['brand','Marca'],['antigen','Antígeno'],['lot','Lote'],['expiry','Vencimiento'],['stamp','Estampilla']]){
   const values=[...new Set((config.rows||data.rows).map(r=>clean(r[key])).filter(Boolean))];
   const value=values.length>4?`${values.length} valores distintos por muestra`:values.map(v=>key==='expiry'?date(v):v).join(' / ');
   lines.push({text:`${label}: ${value||'Sin informar'}`});
  }
  lines.push({text:''});
 }
 return lines;
}
async function imageData(url,opacity=1){
 if(!url)return null;
 const img=new Image();img.src=url;await img.decode();
 const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const context=canvas.getContext('2d');context.globalAlpha=opacity;context.drawImage(img,0,0);
 return {base64:canvas.toDataURL('image/png'),width:img.naturalWidth,height:img.naturalHeight};
}
export async function buildPdf(data){
 const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});
 const logos=await Promise.all([imageData(data.lab.logo),imageData('assets/vetconver-logo.png',.32)]);
 const {cols,groups}=columns(data),rows=reportRows(data);const bands=[];
 const text=(s,x,y,size=9,bold=false,align='left')=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(20);doc.text(Array.isArray(s)?s:clean(s),x,y,{align})};
 const wrap=(s,width,size=9,bold=false)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);return doc.splitTextToSize(clean(s),width)};
 const rule=y=>{doc.setDrawColor(35);doc.setLineWidth(.25);doc.line(14,y,196,y)};
 const logo=(image,x,maxWidth=27,maxHeight=22)=>{if(!image)return;const k=Math.min(maxWidth/image.width,maxHeight/image.height);doc.addImage(image.base64,'PNG',x+(27-image.width*k)/2,10+(22-image.height*k)/2,image.width*k,image.height*k)};
 function header(){
  logo(logos[0],14);logo(logos[1],169,15,11);
  let y=12;
  for(const [value,size,bold] of [[data.lab.code,10,true],[data.lab.name,11,true],[data.lab.director?`Director técnico: ${data.lab.director}`:'',9,false],[data.lab.contact,8,false]]){
   const lines=wrap(value,122,size,bold);text(lines,105,y,size,bold,'center');y+=lines.length*size*.39+1;
  }
  y=Math.max(36,y+2);rule(y);text(`PROTOCOLO Nº: ${data.number}`,38,y+7,10,true);text(`ACTA Nº: ${data.actNumber}`,128,y+7,10,true);return y+12;
 }
 function pair(label,value,x,y,width,labelWidth){text(label,x,y,8,true);const lines=wrap(value,width-labelWidth,8);text(lines,x+labelWidth,y,8);return Math.max(4.4,lines.length*3.2+1)}
 function details(y){
  const left=[['Motivo:',data.motive],['Submotivo:',data.submotive],['Especie:',data.species],['Cantidad:',String(rows.length)]];
  const right=[['Fecha toma de muestra:',date(data.sampleDate)],['Fecha de recepción:',date(data.receivedDate)],['Fecha de inicio:',date(data.startDate)],['Fecha de fin:',date(data.endDate)]];
  for(let i=0;i<4;i++)y+=Math.max(pair(...left[i],15,y,107,23),pair(...right[i],128,y,67,40));
  rule(y+1);y+=7;
  y+=Math.max(pair('Veterinario:',data.vet,15,y,107,23),pair('RENSPA:',data.renspa,128,y,67,21));
  y+=Math.max(pair('Productor:',data.holder,15,y,107,23),pair('Localidad:',data.locality,128,y,67,21));
  if(data.establishment)y+=pair('Establecimiento:',data.establishment,15,y,107,23);
  rule(y+1);return y+4;
 }
 function band(y,title){doc.setFillColor('#'+diagnosisColor(data));doc.rect(14,y,182,5,'F');text(title,105,y+3.6,9,false,'center');bands.push({page:doc.getNumberOfPages(),y});return y+9}
 function tableHead(y){
  let x=18;const upper=Math.max(5,...groups.map(g=>wrap(g.name,cols.slice(g.start,g.end+1).reduce((s,c)=>s+c.width,0)-3,8,true).length*3.2+2));
  for(let i=0;i<cols.length;i++){
   const c=cols[i];if(i<2){doc.rect(x,y,c.width,upper+6);text(c.label,x+c.width/2,y+upper+4,8,true,'center')}
   else {doc.rect(x,y+upper,c.width,6);text(c.label,x+c.width/2,y+upper+4,8,true,'center')}
   x+=c.width;
  }
  for(const g of groups){const x=18+cols.slice(0,g.start).reduce((s,c)=>s+c.width,0),w=cols.slice(g.start,g.end+1).reduce((s,c)=>s+c.width,0);doc.rect(x,y,w,upper);text(wrap(g.name,w-3,8,true),x+w/2,y+3.7,8,true,'center')}
  return y+upper+6;
 }
 let y=tableHead(band(details(header()),reportBandTitle(data,'INFORME DE ENSAYO')));
 for(const r of rows){
  const values=cols.map(c=>wrap(c.get(r),c.width-3,8)),height=Math.max(5.2,...values.map(v=>v.length*3.2+2));
  if(y+height>267){doc.addPage();y=tableHead(band(header(),reportBandTitle(data,'INFORME DE ENSAYO')))}
  const fill=rowColor(data,r);if(fill){doc.setFillColor('#'+fill);doc.rect(18,y,174,height,'F')}
  let x=18;cols.forEach((c,i)=>{doc.rect(x,y,c.width,height);text(values[i],x+c.width/2,y+3.6,8,false,'center');x+=c.width});y+=height;
 }
 // Summary starts on a dedicated page, including when only one sample exists.
 doc.addPage();y=band(header(),reportBandTitle(data,'REACTIVOS Y RESUMEN'));
 const ensure=h=>{if(y+h>265){doc.addPage();y=band(header(),reportBandTitle(data,'REACTIVOS Y RESUMEN (CONTINUACIÓN)'))}};
 function paragraph(s,bold=false,size=9){const lines=wrap(s,178,size,bold);for(const line of lines){ensure(4.5);text(line,16,y,size,bold);y+=4.5}}
 paragraph('Datos de reactivos',true,11);y+=2;
 for(const line of reagentLines(data))paragraph(line.text,line.bold);
 ensure(35);rule(y);y+=7;paragraph('Resumen',true,11);y+=2;
 paragraph(`Cantidad de muestras: ${rows.length}`);
 const totals=summary(data,rows);
 paragraph(summaryLine('Negativo',totals.counts.NEGATIVO));
 paragraph(summaryLine('Positivo',totals.counts.POSITIVO,totals.identifiers.POSITIVO));
 paragraph(summaryLine('Sospechoso',totals.counts.SOSPECHOSO,totals.identifiers.SOSPECHOSO));
 paragraph(categorySummary(totals.categories));
 y+=4;ensure(20);rule(y);y+=7;paragraph('Conclusión',true,11);paragraph(data.conclusion||'Sin informar');
 const total=doc.getNumberOfPages();
 for(const b of bands){doc.setPage(b.page);text(`Página ${b.page} de ${total}`,194,b.y+3.6,8,false,'right')}
 for(let p=1;p<=total;p++){doc.setPage(p);rule(273);text(wrap(FOOTER,181,8),105,278,8,false,'center')}
 return doc;
}

export async function buildExcel(data){
 if(!window.ExcelJS)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='vendor/exceljs.min.js';s.onload=resolve;s.onerror=()=>reject(Error('No se pudo cargar la exportación de Excel.'));document.head.append(s)});
 const wb=new window.ExcelJS.Workbook();wb.creator='VetConver';
 const {cols,groups}=columns(data),rows=reportRows(data),logos=await Promise.all([imageData(data.lab.logo),imageData('assets/vetconver-logo.png',.32)]);
 const logoIds=logos.map(im=>im?wb.addImage({base64:im.base64,extension:'png'}):null);
 const n=cols.length,split=Math.max(2,Math.floor(n/2));
 function merge(ws,row,start,end,value,options={}){
  if(end>start)ws.mergeCells(row,start,row,end);
  const c=ws.getCell(row,start);c.value=value;c.font={name:'Arial',size:9,...options.font};c.alignment={vertical:'middle',wrapText:true,...options.alignment};if(options.fill)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+options.fill}};return c;
 }
 function newSheet(name){
  const ws=wb.addWorksheet(name,{views:[{showGridLines:false}],pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:1,horizontalCentered:true,margins:{left:.4,right:.4,top:.35,bottom:.35,header:0,footer:0}}});
  cols.forEach((c,i)=>ws.getColumn(i+1).width=c.width*.54);
  [data.lab.code,data.lab.name,data.lab.director?`Director técnico: ${data.lab.director}`:'',data.lab.contact].forEach((v,i)=>{merge(ws,i+1,1,n,v,{font:{size:i===1?11:9,bold:i<2},alignment:{horizontal:'center'}});ws.getRow(i+1).height=20});
  // Logos occupy the whitespace beside the centered heading.
  logoIds.forEach((id,i)=>{if(id!==null){const im=logos[i],k=Math.min((i?42:75)/im.width,(i?30:54)/im.height);ws.addImage(id,{tl:{col:i?n-0.7:0,row:i?0.6:0.2},ext:{width:im.width*k,height:im.height*k}})}});
  merge(ws,6,1,split,`PROTOCOLO Nº: ${data.number}`,{font:{bold:true}});merge(ws,6,split+1,n,`ACTA Nº: ${data.actNumber}`,{font:{bold:true}});ws.getRow(6).height=22;
  return ws;
 }
 function footer(ws,row){
  merge(ws,row,1,n,FOOTER,{font:{size:8},alignment:{horizontal:'center'}});ws.getRow(row).height=58;
  ws.pageSetup.printArea=`A1:${ws.getColumn(n).letter}${row}`;
 }
 function table(ws,start,pageRows){
  for(let i=0;i<2;i++){ws.mergeCells(start,i+1,start+1,i+1);const c=ws.getCell(start,i+1);c.value=cols[i].label;c.font={name:'Arial',size:9,bold:true};c.alignment={horizontal:'center',vertical:'middle'}}
  for(const g of groups)merge(ws,start,g.start+1,g.end+1,g.name,{font:{bold:true},alignment:{horizontal:'center'}});
  cols.slice(2).forEach((c,i)=>merge(ws,start+1,i+3,i+3,c.label,{font:{bold:true},alignment:{horizontal:'center'}}));
  ws.getRow(start).height=22;ws.getRow(start+1).height=20;
  pageRows.forEach((r,i)=>{const rr=start+2+i;cols.forEach((c,j)=>{const cell=ws.getCell(rr,j+1),value=c.get(r);cell.value=c.numeric&&value!==''&&Number.isFinite(Number(value))?Number(value):clean(value);cell.font={name:'Arial',size:9};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};const color=rowColor(data,r);if(color)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+color}}});ws.getRow(rr).height=Math.max(18,...cols.map(c=>Math.ceil(clean(c.get(r)).length/(c.width*.65))*12))});
  for(let r=start;r<start+2+pageRows.length;r++)for(let c=1;c<=n;c++)ws.getCell(r,c).border={top:border,bottom:border,left:border,right:border};
  return start+2+pageRows.length;
 }
 // One print-ready sheet per sample page; no fixed 50-sample limit.
 const chunks=[];for(let i=0;i<rows.length;){const capacity=i===0?25:34;chunks.push(rows.slice(i,i+capacity));i+=capacity}if(!chunks.length)chunks.push([]);
 chunks.forEach((chunk,i)=>{
  const ws=newSheet(`Muestras ${i+1}`);let r=8;
  if(i===0){
   const left=[['Motivo',data.motive],['Submotivo',data.submotive],['Especie',data.species],['Cantidad',String(rows.length)],['Veterinario',data.vet],['Productor',data.holder],['Establecimiento',data.establishment||'']];
   const right=[['Fecha de toma',date(data.sampleDate)],['Recepción',date(data.receivedDate)],['Inicio',date(data.startDate)],['Finalización',date(data.endDate)],['RENSPA',data.renspa],['Localidad',data.locality],['','']];
   left.forEach(([l,v],j)=>{merge(ws,r,1,split,`${l}: ${v}`);const [rightLabel,rightValue]=right[j];merge(ws,r,split+1,n,rightLabel?`${rightLabel}: ${rightValue}`:'');ws.getRow(r).height=j<2?28:20;r++});r++;
  }
  merge(ws,r,1,n,`${reportBandTitle(data,'INFORME DE ENSAYO')} · Página ${i+1} de ${chunks.length+1}`,{alignment:{horizontal:'center'},fill:diagnosisColor(data)});r+=2;
  r=table(ws,r,chunk);footer(ws,r+2);
 });
 const ws=newSheet('Resumen');let r=8;
 const add=(v,bold=false)=>{merge(ws,r,1,n,v,{font:{bold}});ws.getRow(r).height=Math.max(18,Math.ceil(clean(v).length/100)*14);r++};
 add('DATOS DE REACTIVOS',true);for(const line of reagentLines(data))add(line.text,line.bold);
 r++;add('RESUMEN',true);add(`Cantidad de muestras: ${rows.length}`);
 const totals=summary(data,rows);
 add(summaryLine('Negativo',totals.counts.NEGATIVO));
 add(summaryLine('Positivo',totals.counts.POSITIVO,totals.identifiers.POSITIVO));
 add(summaryLine('Sospechoso',totals.counts.SOSPECHOSO,totals.identifiers.SOSPECHOSO));
 add(categorySummary(totals.categories));
 add('CONCLUSIÓN',true);add(data.conclusion||'Sin informar');footer(ws,r+2);
 return wb;
}
