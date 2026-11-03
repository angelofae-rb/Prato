(() => {
'use strict';
const $ = id => document.getElementById(id);
const MEALS = [['cafe','Café da manhã'],['almoco','Almoço'],['lanche','Lanche'],['jantar','Jantar'],['exercicio','Exercícios']];
const DEFAULT_PERFIL = {kcal:2200, prot:130, carb:250, fat:70, agua:2000, pesos:[], apiKey:''};
const state = {perfil:{...DEFAULT_PERFIL}, days:{}, cur:todayKey()};
let sel = null;           // alimento escolhido na busca
let aiBlob = null, aiResult = null;

// ---------- utilidades ----------
function todayKey(d=new Date()){const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`}
function keyToDate(k){const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)}
function shift(k,n){const d=keyToDate(k);d.setDate(d.getDate()+n);return todayKey(d)}
const fmt = n => Math.round(+n||0).toLocaleString('pt-BR');
const fmt1 = n => (Math.round((+n||0)*10)/10).toLocaleString('pt-BR');
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),3000)}
function mealByHour(){const h=new Date().getHours();return h<10?'cafe':h<15?'almoco':h<18?'lanche':'jantar'}
function currentWeight(){const p=state.perfil.pesos||[];return p.length?p[p.length-1].kg:75}

// ---------- armazenamento (IndexedDB, com localStorage de reserva) ----------
const DBNAME='prato', STORE='kv', KEY='state', LSKEY='prato-state';
let idb=null;
function openIDB(){return new Promise(res=>{
  try{const r=indexedDB.open(DBNAME,1);
    r.onupgradeneeded=()=>r.result.createObjectStore(STORE);
    r.onsuccess=()=>res(r.result); r.onerror=()=>res(null);
  }catch(e){res(null)}
})}
function idbGet(){return new Promise(res=>{try{const r=idb.transaction(STORE).objectStore(STORE).get(KEY);r.onsuccess=()=>res(r.result||null);r.onerror=()=>res(null)}catch(e){res(null)}})}
function idbPut(v){return new Promise(res=>{try{const t=idb.transaction(STORE,'readwrite');t.objectStore(STORE).put(v,KEY);t.oncomplete=()=>res(true);t.onerror=()=>res(false)}catch(e){res(false)}})}
let saveTimer=null;
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(flush,150)}
async function flush(){
  const data={v:1, perfil:state.perfil, days:state.days, savedAt:Date.now()};
  let ok=false;
  if(idb) ok=await idbPut(data);
  try{localStorage.setItem(LSKEY,JSON.stringify(data));ok=true}catch(e){}
  if(!ok) toast('Não foi possível salvar neste aparelho.');
}
async function load(){
  idb=await openIDB();
  let data=idb?await idbGet():null;
  if(!data){try{data=JSON.parse(localStorage.getItem(LSKEY)||'null')}catch(e){}}
  if(data){state.perfil={...DEFAULT_PERFIL,...(data.perfil||{})};state.days=data.days||{}}
  // pede ao navegador para não apagar os dados quando faltar espaço
  if(navigator.storage&&navigator.storage.persist){try{const p=await navigator.storage.persisted()||await navigator.storage.persist();
    $('storageInfo').textContent=p?'Os registros ficam salvos neste aparelho, protegidos contra limpeza automática do navegador.':'Os registros ficam salvos neste aparelho. Instale o app e baixe um backup de vez em quando.'}catch(e){}}
}

// ---------- cálculos ----------
function day(k=state.cur){return state.days[k]||(state.days[k]={agua:0,entradas:[]})}
function totals(d){
  const t={kcal:0,burn:0,p:0,c:0,g:0};
  (d?.entradas||[]).forEach(e=>{ if(e.tipo==='exercicio') t.burn+=+e.kcal||0; else {t.kcal+=+e.kcal||0;t.p+=+e.p||0;t.c+=+e.c||0;t.g+=+e.g||0} });
  return t;
}
function streak(){
  const has=k=>(state.days[k]?.entradas||[]).length>0;
  let n=0,k=todayKey(); if(!has(k)) k=shift(k,-1);
  while(has(k)){n++;k=shift(k,-1)}
  return n;
}

// ---------- tela principal ----------
function render(){
  const k=state.cur, d=state.days[k]||{agua:0,entradas:[]}, P=state.perfil, t=totals(d);
  const isToday=k===todayKey(), dt=keyToDate(k);
  $('dayTitle').textContent=isToday?'Hoje':k===shift(todayKey(),-1)?'Ontem':dt.toLocaleDateString('pt-BR',{weekday:'long'});
  $('daySub').textContent=dt.toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
  $('nextDay').disabled=isToday;
  const s=streak(); $('streak').textContent=`🔥 ${s} ${s===1?'dia':'dias'}`;

  const budget=P.kcal+t.burn, left=budget-t.kcal;
  $('kcalLeft').textContent=fmt(Math.abs(left));
  $('kcalLeft').style.color=left>=0?'var(--ink)':'var(--kcal)';
  $('kcalLeftLbl').textContent=left>=0?'kcal restantes':'kcal acima';
  $('ringArc').setAttribute('stroke-dashoffset',(339.3*(1-Math.min(1,budget>0?t.kcal/budget:0))).toFixed(1));
  $('kGoal').textContent=fmt(P.kcal); $('kEaten').textContent=fmt(t.kcal); $('kBurn').textContent=t.burn?'+'+fmt(t.burn):'0';
  [['p',t.p,P.prot],['c',t.c,P.carb],['g',t.g,P.fat]].forEach(([id,v,g])=>{$(id+'Txt').textContent=`${fmt(v)}/${fmt(g)} g`;$(id+'Bar').style.width=Math.min(100,g?v/g*100:0)+'%'});

  const n=Math.max(4,Math.round(P.agua/250)), filled=Math.round((d.agua||0)/250);
  $('waterTxt').textContent=`${fmt(d.agua||0)} / ${fmt(P.agua)} ml`;
  $('cups').innerHTML=Array.from({length:Math.max(n,filled)},(_,i)=>`<button class="cup ${i<filled?'on':''}" data-cup="${i}" aria-label="${i<filled?'Tirar':'Marcar'} copo ${i+1} de 250 ml"></button>`).join('');

  $('meals').innerHTML=MEALS.map(([id,label])=>{
    const ents=(d.entradas||[]).filter(e=>(e.tipo==='exercicio'?'exercicio':e.refeicao)===id);
    const tot=ents.reduce((a,e)=>a+(+e.kcal||0),0);
    const rows=ents.map(e=>`<div class="it"><div><div class="n">${esc(e.nome)}</div><div class="p">${esc(e.porcao||'')}${e.tipo==='exercicio'?'':` · P ${fmt(e.p)} · C ${fmt(e.c)} · G ${fmt(e.g)} g`}</div></div><div class="k ${e.tipo==='exercicio'?'ex':''}">${e.tipo==='exercicio'?'−':''}${fmt(e.kcal)}</div><button class="del" data-del="${e.id}" aria-label="Apagar ${esc(e.nome)}">×</button></div>`).join('');
    return `<section class="card meal"><div class="hd"><h3>${label}</h3><span class="tot">${tot?(id==='exercicio'?'−':'')+fmt(tot)+' kcal':''}</span><button class="addlink" data-add="${id}" aria-label="Adicionar em ${label}">+</button></div>${rows?`<div class="items">${rows}</div>`:`<div class="emptymeal">${id==='exercicio'?'Nenhum exercício.':'Nada registrado.'}</div>`}</section>`;
  }).join('');
}

$('meals').addEventListener('click',e=>{
  const del=e.target.closest('[data-del]'), add=e.target.closest('[data-add]');
  if(del){const d=day();const i=d.entradas.findIndex(x=>x.id===del.dataset.del);if(i>=0){const [rm]=d.entradas.splice(i,1);render();save();undoToast(rm,i)}}
  if(add) openAdd(add.dataset.add);
});
let lastRemoved=null;
function undoToast(rm,i){lastRemoved={k:state.cur,rm,i};toast(`“${rm.nome}” apagado. Toque aqui para desfazer.`)}
$('toast').addEventListener('click',()=>{if(lastRemoved){const {k,rm,i}=lastRemoved;day(k).entradas.splice(i,0,rm);lastRemoved=null;render();save();$('toast').classList.remove('show')}});
$('cups').addEventListener('click',e=>{const b=e.target.closest('[data-cup]');if(!b)return;const d=day(),i=+b.dataset.cup,f=Math.round((d.agua||0)/250);d.agua=(i<f?i:i+1)*250;render();save()});
$('prevDay').onclick=()=>{state.cur=shift(state.cur,-1);render()};
$('nextDay').onclick=()=>{if(state.cur!==todayKey()){state.cur=shift(state.cur,1);render()}};

function addEntry(entry){
  const d=day(); entry.id=uid(); entry.ts=Date.now(); d.entradas.push(entry); render(); save();
}

// ---------- folhas ----------
let lastFocus=null;
function openSheet(id){lastFocus=document.activeElement;$(id).classList.add('show')}
function closeSheets(){document.querySelectorAll('.sheet.show').forEach(s=>s.classList.remove('show'));if(lastFocus)lastFocus.focus()}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeSheets);
document.querySelectorAll('.sheet').forEach(s=>s.addEventListener('click',e=>{if(e.target===s)closeSheets()}));
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheets()});

// ---------- registrar ----------
$('mealSel').innerHTML=MEALS.filter(m=>m[0]!=='exercicio').map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
$('exSel').innerHTML=EXERCISES.map(([n],i)=>`<option value="${i}">${n}</option>`).join('');
function setTab(t){
  document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));
  document.querySelectorAll('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==t);
  $('mealField').hidden=t==='ex';
  if(t==='ex'){$('exKg').value=currentWeight();exPreview()}
  if(t==='ai') aiStateText();
}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
$('fab').onclick=()=>openAdd();
function openAdd(meal){
  const curTab=document.querySelector('[data-tab][aria-selected="true"]').dataset.tab;
  if(meal==='exercicio') setTab('ex');
  else { $('mealSel').value=meal||mealByHour(); setTab(meal?'food':curTab); }
  sel=null;$('foodDetail').hidden=true;$('q').value='';search();
  openSheet('addSheet');
  if(!document.querySelector('[data-pane="food"]').hidden) setTimeout(()=>$('q').focus(),50);
}

// busca de alimentos
function frequent(){
  const count={};
  Object.values(state.days).forEach(d=>(d.entradas||[]).forEach(e=>{if(e.ref!=null)count[e.ref]=(count[e.ref]||0)+1}));
  return Object.entries(count).sort((a,b)=>b[1]-a[1]).map(([i])=>+i).filter(i=>FOODS[i]);
}
function search(){
  const q=norm($('q').value.trim());
  let idx;
  if(!q){const f=frequent();idx=[...f,...FOODS.map((_,i)=>i).filter(i=>!f.includes(i))]}
  else{const words=q.split(/\s+/);idx=FOODS.map((f,i)=>[i,norm(f[0])]).filter(([,n])=>words.every(w=>n.includes(w))).sort((a,b)=>a[1].indexOf(words[0])-b[1].indexOf(words[0])).map(([i])=>i)}
  $('results').innerHTML=idx.length?idx.slice(0,40).map(i=>{const f=FOODS[i];const p=f[5][0];return `<button class="res ${sel===i?'sel':''}" data-food="${i}"><span>${esc(f[0])}<br><small>${p[0]} (${p[1]} g)</small></span><small>${fmt(f[1]*p[1]/100)} kcal</small></button>`}).join('')
    :`<div class="res" style="display:block"><small>Nada encontrado. Use a aba Manual ou a IA.</small></div>`;
}
$('q').addEventListener('input',search);
$('results').addEventListener('click',e=>{
  const b=e.target.closest('[data-food]');if(!b)return;
  sel=+b.dataset.food;const f=FOODS[sel];
  $('portion').innerHTML=f[5].map(([l,g],i)=>`<option value="${g}">${l} (${g} g)</option>`).join('')+`<option value="1">gramas</option>`;
  $('qty').value=1;$('foodDetail').hidden=false;search();foodPreview();
  setTimeout(()=>$('foodDetail').scrollIntoView({block:'nearest',behavior:'smooth'}),30);
});
function foodCalc(){
  if(sel==null)return null;const f=FOODS[sel];const grams=(+$('qty').value||0)*(+$('portion').value||0);const k=grams/100;
  return {grams,kcal:f[1]*k,p:f[2]*k,c:f[3]*k,g:f[4]*k};
}
function foodPreview(){const r=foodCalc();if(!r)return;$('foodPrev').innerHTML=`<b>${fmt(r.kcal)} kcal</b><span>${fmt(r.grams)} g</span><span>P ${fmt1(r.p)} g</span><span>C ${fmt1(r.c)} g</span><span>G ${fmt1(r.g)} g</span>`;$('addFood').disabled=!r.grams}
$('qty').addEventListener('input',foodPreview);$('portion').addEventListener('change',()=>{if($('portion').value==='1')$('qty').value=100;foodPreview()});
$('addFood').onclick=()=>{
  const r=foodCalc();if(!r||!r.grams)return;const f=FOODS[sel];const ps=$('portion');
  const unit=ps.value==='1'?`${fmt(r.grams)} g`:`${fmt1($('qty').value)} × ${ps.options[ps.selectedIndex].text}`;
  addEntry({tipo:'alimento',ref:sel,refeicao:$('mealSel').value,nome:f[0],porcao:unit,kcal:Math.round(r.kcal),p:+r.p.toFixed(1),c:+r.c.toFixed(1),g:+r.g.toFixed(1)});
  toast(`${f[0]} adicionado.`);sel=null;$('foodDetail').hidden=true;$('q').value='';search();
};

// exercício
function exCalc(){const [n,met]=EXERCISES[+$('exSel').value];const min=+$('exMin').value||0;const kg=+$('exKg').value||75;return {n,min,kcal:met*kg*min/60}}
function exPreview(){const r=exCalc();$('exPrev').innerHTML=`<b>${fmt(r.kcal)} kcal</b><span>gastas em ${fmt(r.min)} min</span>`;$('addEx').disabled=!r.min}
['exSel','exMin','exKg'].forEach(id=>$(id).addEventListener('input',exPreview));
$('addEx').onclick=()=>{const r=exCalc();if(!r.min)return;addEntry({tipo:'exercicio',nome:r.n,porcao:`${fmt(r.min)} min`,kcal:Math.round(r.kcal),p:0,c:0,g:0});toast('Exercício adicionado.');closeSheets()};

// manual
$('addManual').onclick=()=>{
  const nome=$('mName').value.trim(),kcal=+$('mKcal').value;
  if(!nome||!(kcal>=0)||$('mKcal').value===''){toast('Preencha o nome e as calorias.');return}
  addEntry({tipo:'alimento',refeicao:$('mealSel').value,nome,porcao:'manual',kcal:Math.round(kcal),p:+$('mP').value||0,c:+$('mC').value||0,g:+$('mG').value||0});
  ['mName','mKcal','mP','mC','mG'].forEach(id=>$(id).value='');toast('Adicionado.');closeSheets();
};

// IA (opcional, com chave própria da API da Anthropic)
function aiStateText(){
  const has=!!state.perfil.apiKey;
  $('aiState').textContent=has?(navigator.onLine?'Descreva a refeição ou anexe uma foto. A IA separa os itens e calcula calorias e macros.':'Sem internet agora: a IA só funciona online. Use a busca de alimentos.'):'Para usar a IA, salve em Ajustes (engrenagem) uma chave gratuita do Google Gemini ou uma da Anthropic. Sem chave, use a busca de alimentos ou a aba Manual.';
  $('aiGo').disabled=!has; $('aiPhotoBtn').disabled=!has;
}
$('aiPhotoBtn').onclick=()=>$('aiPhoto').click();
$('aiPhoto').onchange=async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  try{const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=URL.createObjectURL(f)});
    const s=Math.min(1,1024/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    aiBlob=c.toDataURL('image/jpeg',.85);$('aiPhotoImg').src=aiBlob;$('aiPhotoPrev').classList.add('show');
  }catch(err){toast('Não consegui abrir essa imagem.')}
};
$('aiPhotoDel').onclick=()=>{aiBlob=null;$('aiPhotoPrev').classList.remove('show')};
const AI_PROMPT=`Você é um nutricionista brasileiro. Estime calorias e macronutrientes do que a pessoa comeu, a partir do texto e/ou da foto.
Separe cada alimento em um item, com porções caseiras brasileiras e valores da tabela TACO quando possível. Se a quantidade não foi dita, assuma uma porção típica de adulto e diga qual.
Responda SOMENTE com JSON válido, sem markdown: {"itens":[{"nome":"","porcao":"","kcal":0,"proteina_g":0,"carbo_g":0,"gordura_g":0}],"comentario":"frase curta em português"}`;

// Detecta o provedor pela chave: "AIza…" = Google Gemini (plano gratuito), "sk-ant-…" = Anthropic.
function provider(key){return /^AIza/.test(key)?'gemini':/^sk-ant-/.test(key)?'anthropic':null}
const GEMINI_MODELS=['gemini-3.8-flash','gemini-3.5-flash-lite','gemini-3.1-flash-lite'];
function httpError(status,who){
  if(status===400||status===401||status===403) return new Error(`Chave ${who} inválida ou sem permissão. Confira em Ajustes.`);
  if(status===429) return new Error(who==='do Gemini'?'Limite gratuito do Gemini atingido por agora. Espere um minuto (ou até amanhã) e tente de novo.':'Muitas análises seguidas. Espere um pouco.');
  return new Error('A IA respondeu com erro '+status+'.');
}
async function askAI(prompt, dataUrl){
  const key=state.perfil.apiKey, img=dataUrl?dataUrl.split(',')[1]:null;
  if(provider(key)==='gemini'){
    const parts=[{text:prompt}]; if(img) parts.unshift({inline_data:{mime_type:'image/jpeg',data:img}});
    let last=null;
    for(const m of GEMINI_MODELS){
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,{method:'POST',
        headers:{'content-type':'application/json','x-goog-api-key':key},
        body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',temperature:0.2}})});
      if(r.ok){const j=await r.json();return (j.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('')}
      last=r.status; if(r.status!==404&&r.status!==429&&r.status!==503) break; // tenta o próximo modelo gratuito
    }
    throw httpError(last,'do Gemini');
  }
  const content=[]; if(img) content.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:img}});
  content.push({type:'text',text:prompt});
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify({model:'claude-haiku-5-5',max_tokens:1200,messages:[{role:'user',content}]})});
  if(!r.ok) throw httpError(r.status,'da Anthropic');
  const j=await r.json(); return (j.content||[]).map(c=>c.text||'').join('');
}
$('aiGo').onclick=async()=>{
  const text=$('aiText').value.trim();if(!text&&!aiBlob){toast('Descreva a refeição ou anexe uma foto.');return}
  const prompt=`${AI_PROMPT}\n\nRegistro: ${text||'(veja a foto)'}`;
  $('aiGo').disabled=true;$('aiGo').textContent='Calculando…';$('aiOut').innerHTML='';
  try{
    const txt=await askAI(prompt, aiBlob);
    const a=txt.indexOf('{'),b=txt.lastIndexOf('}');const o=JSON.parse(txt.slice(a,b+1));
    const num=v=>Math.max(0,Math.round((+v||0)*10)/10);
    aiResult=(o.itens||[]).slice(0,20).map(i=>({nome:String(i.nome||'Item').slice(0,80),porcao:String(i.porcao||'').slice(0,60),kcal:Math.round(num(i.kcal)),p:num(i.proteina_g),c:num(i.carbo_g),g:num(i.gordura_g)}));
    const tot=aiResult.reduce((s,i)=>s+i.kcal,0);
    $('aiOut').innerHTML=aiResult.length?`<div class="results">${aiResult.map(i=>`<div class="res"><span>${esc(i.nome)}<br><small>${esc(i.porcao)} · P ${fmt(i.p)} · C ${fmt(i.c)} · G ${fmt(i.g)} g</small></span><small>${fmt(i.kcal)} kcal</small></div>`).join('')}</div>${o.comentario?`<p class="note">${esc(o.comentario)}</p>`:''}<button class="btn" id="aiAdd">Adicionar tudo (${fmt(tot)} kcal)</button>`
      :`<p class="note">${esc(o.comentario||'Não identifiquei alimentos nesse registro.')}</p>`;
    const add=$('aiAdd');if(add)add.onclick=()=>{const meal=$('mealSel').value;aiResult.forEach(i=>addEntry({tipo:'alimento',refeicao:meal,...i}));toast(`${aiResult.length} itens adicionados.`);$('aiText').value='';aiBlob=null;$('aiPhotoPrev').classList.remove('show');$('aiOut').innerHTML='';closeSheets()};
  }catch(err){$('aiOut').innerHTML=`<p class="note" style="color:var(--kcal)">${esc(err.message&&!/JSON|Unexpected/.test(err.message)?err.message:'Não consegui calcular. Verifique a internet e tente de novo.')}</p>`}
  finally{$('aiGo').disabled=false;$('aiGo').textContent='Calcular'}
};

// ---------- ajustes ----------
$('openSettings').onclick=()=>{const P=state.perfil;$('gKcal').value=P.kcal;$('gWater').value=P.agua;$('gProt').value=P.prot;$('gCarb').value=P.carb;$('gFat').value=P.fat;$('apiKey').value=P.apiKey||'';renderWeights();resetWipe();openSheet('setSheet')};
$('goalsForm').addEventListener('submit',e=>{e.preventDefault();const v=id=>Math.max(0,Math.round(+$(id).value||0));Object.assign(state.perfil,{kcal:v('gKcal')||2200,agua:v('gWater')||2000,prot:v('gProt'),carb:v('gCarb'),fat:v('gFat')});render();save();toast('Metas salvas.')});
function renderWeights(){
  const w=[...(state.perfil.pesos||[])].reverse().slice(0,8);
  $('weights').innerHTML=w.length?w.map((x,i)=>{const prev=w[i+1];const d=prev?Math.round((x.kg-prev.kg)*10)/10:0;return `<div><span class="d">${keyToDate(x.data).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'2-digit'})}</span><span>${fmt1(x.kg)} kg ${d?`<span class="${d>0?'up':'down'}">(${d>0?'+':''}${fmt1(d)})</span>`:''}</span></div>`}).join(''):'<div><span class="d">Nenhum peso registrado.</span></div>';
}
$('weightForm').addEventListener('submit',e=>{e.preventDefault();const kg=Math.round((+$('wKg').value||0)*10)/10;if(!kg)return;const t=todayKey();
  state.perfil.pesos=(state.perfil.pesos||[]).filter(x=>x.data!==t).concat({data:t,kg}).sort((a,b)=>a.data.localeCompare(b.data)).slice(-365);
  $('wKg').value='';renderWeights();save();toast('Peso registrado.')});
$('saveKey').onclick=()=>{const k=$('apiKey').value.trim();if(k&&!provider(k)){toast('Chave não reconhecida. A do Gemini começa com AIza e a da Anthropic com sk-ant-.');return}state.perfil.apiKey=k;save();toast(!k?'Chave removida.':provider(k)==='gemini'?'Chave do Gemini salva neste aparelho.':'Chave da Anthropic salva neste aparelho.')};

// backup
$('exportBtn').onclick=()=>{
  const data={app:'prato',v:1,exportadoEm:new Date().toISOString(),perfil:{...state.perfil,apiKey:''},days:state.days};
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));a.download=`prato-backup-${todayKey()}.json`;document.body.appendChild(a);a.click();a.remove();
  toast('Backup baixado. A chave da IA não vai no arquivo.');
};
$('importBtn').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  try{const o=JSON.parse(await f.text());if(o.app!=='prato'||!o.days)throw 0;
    const key=state.perfil.apiKey;state.perfil={...DEFAULT_PERFIL,...o.perfil,apiKey:key};state.days=o.days;render();await flush();toast('Backup restaurado.');closeSheets();
  }catch(err){toast('Esse arquivo não é um backup do Prato.')}
};
let wipeArmed=false;
function resetWipe(){wipeArmed=false;$('wipeBtn').textContent='Apagar todos os dados'}
$('wipeBtn').onclick=async()=>{
  if(!wipeArmed){wipeArmed=true;$('wipeBtn').textContent='Toque de novo para apagar tudo';setTimeout(resetWipe,4000);return}
  state.perfil={...DEFAULT_PERFIL};state.days={};state.cur=todayKey();await flush();resetWipe();render();closeSheets();toast('Todos os dados foram apagados.');
};

// ---------- instalação ----------
let deferred=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;$('installBtn').hidden=false});
$('installBtn').onclick=async()=>{if(!deferred)return;deferred.prompt();await deferred.userChoice;deferred=null;$('installBtn').hidden=true};
window.addEventListener('appinstalled',()=>{$('installBtn').hidden=true;toast('Prato instalado.')});
if('serviceWorker' in navigator && location.protocol!=='file:'){navigator.serviceWorker.register('sw.js').catch(()=>{})}

// troca de dia à meia-noite com o app aberto
let lastToday=todayKey();
setInterval(()=>{const t=todayKey();if(t!==lastToday){if(state.cur===lastToday)state.cur=t;lastToday=t;render()}},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush()});

load().then(render);
})();
