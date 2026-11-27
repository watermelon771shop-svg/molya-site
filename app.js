'use strict';
(()=>{
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s??'').toLocaleLowerCase('ru').replace(/ё/g,'е');
const tokens=s=>norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean); // слова без знаков: «v-bucks» → v, bucks
const isListing=u=>/^https:\/\/playerok\.com\//.test(u||'');
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const GROUPS=[['games','Игры'],['apps','Приложения'],['ai','Нейросети'],['other','Другое']];
const groupName=g=>(GROUPS.find(x=>x[0]===g)||GROUPS[3])[1];
const BUILTIN={discord:'assets/discord.svg',youtube:'assets/youtube.svg',kaspersky:'assets/kaspersky.svg'};
const plural=(n,a,b,c)=>{const m=n%10,h=n%100;return n+' '+(m===1&&h!==11?a:m>=2&&m<=4&&(h<12||h>14)?b:c)};
const goods=n=>plural(n,'товар','товара','товаров');
const NEW_DAYS=14,isNew=p=>{const t=Date.parse(p.added||'');return t>0&&Date.now()-t<NEW_DAYS*864e5};
const newBadge=p=>isNew(p)?'<span class="badge-new">Новинка</span>':''; // метка «Новинка» (14 дней)
const TITLE='Каталог MolyaShop';

let data=null,rawText='',gen=0,rendered='',lastFetch=0,openedInPage=false,returnFocus=null,view=null,homeY=0;
let st={q:'',section:null,cat:null,tab:'all',more:0,cur:null};
const el={all:$('#all'),allGroups:$('#all-groups'),home:$('#home'),gifts:$('#gifts'),section:$('#section'),groups:$('#groups'),results:$('#results'),list:$('#list'),count:$('#count'),empty:$('#empty'),search:$('#search'),sheet:$('#sheet'),secList:$('#sec-list'),secCats:$('#sec-cats'),secCur:$('#sec-cur')};

/* data */
function prepare(raw){
 const byPos=(a,b)=>(a.position??0)-(b.position??0);
 const sections=new Map(raw.sections.filter(s=>s.visible).sort(byPos).map(s=>[s.id,{...s,products:[],cats:[]}]));
 // вкладки внутри: сначала все остальные, в конце «Услуги», затем «Другое» (решение владельца)
 const tail=c=>c.slug==='services'?1:c.slug==='other'?2:0;
 const cats=new Map(raw.categories.filter(c=>c.visible&&sections.has(c.section_id)).sort((a,b)=>tail(a)-tail(b)||byPos(a,b)).map(c=>[c.id,{...c,n:0}]));
 const products=[];
 // товар может стоять в нескольких местах: category_id (главное) + extra_category_ids; в поиске — одна карточка
 raw.products.filter(p=>p.visible&&!p.deleted&&isListing(p.playerok_url)).sort(byPos).forEach(p=>{
  const places=[p.category_id,...(p.extra_category_ids||[])].filter(id=>cats.has(id)).map(id=>cats.get(id));
  if(!places.length)return;
  const [cat]=places,sec=sections.get(cat.section_id);
  const hay=norm([p.title,p.description,p.keywords,...places.flatMap(c=>{const s=sections.get(c.section_id);return [s.name,c.name,s.keywords]})].join(' '));
  // иконка карточки: в общем разделе (aggregate, например «Нейросети») — иконка бренда товара
  const brand=places.map(c=>sections.get(c.section_id)).find(s=>!s.aggregate)||sec,art=s=>s.aggregate?brand:s;
  const item={...p,cat,sec,art:art(sec),hay,words:tokens(hay),tw:tokens(p.title),secs:[...new Set(places.map(c=>c.section_id))]};products.push(item);
  places.forEach(c=>{const s=sections.get(c.section_id);if(s.products.some(x=>x.id===p.id))return;c.n++;s.products.push(c===cat?item:{...item,cat:c,sec:s,art:art(s)})});
 });
 cats.forEach(c=>{if(c.n)sections.get(c.section_id).cats.push(c)});
 const list=[...sections.values()].filter(s=>s.products.length);
 // порядок каталогов (решение владельца): Steam, Telegram, затем по числу товаров
 const first=['steam','telegram'],rank=s=>{const i=first.indexOf(s.id);return i<0?first.length:i};
 const ranked=[...list].sort((a,b)=>rank(a)-rank(b)||b.products.length-a.products.length||(a.position??0)-(b.position??0));
 return {sections:list,ranked,products,byId:new Map(products.map(p=>[p.id,p])),secById:new Map(list.map(s=>[s.id,s]))};
}
function icon(s,img){
 const src=[img,s.image,BUILTIN[s.id]].find(u=>/^assets\/[\w.-]+$/.test(u||'')); // только локальные файлы: внешняя картинка = сторонний запрос
 return src?`<img class="ic" src="${esc(src)}" alt="" loading="lazy" decoding="async" width="96" height="96">`:`<span class="ic letter" aria-hidden="true">${esc((s.name||'M')[0])}</span>`;
}
// цвет подложки: без style= в разметке (CSP без 'unsafe-inline'), ставим через CSSOM
const tintOf=s=>s.color&&/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s.color)?s.color:'';
const tint=s=>{const c=tintOf(s);return c?`data-tint="${esc(c)}"`:''};
const applyTints=r=>{r.querySelectorAll('[data-tint]').forEach(e=>e.style.setProperty('--tint',e.dataset.tint))};
const setTint=(e,s)=>{const c=tintOf(s);c?e.style.setProperty('--tint',c):e.style.removeProperty('--tint')};
const CURS=[['RUB','Россия'],['KZT','Казахстан'],['USD','Global']];
const curOf=p=>(p.title.match(/\b(RUB|KZT|USD)\b/)||[])[1]||''; // валюта из названия «Пополнение 1100 RUB»
const sumOf=p=>+(p.title.replace(/[\s\u00a0]/g,'').match(/\d+/)||[0])[0];
const secHash=(s,c)=>'#/'+encodeURIComponent(s.id)+(c?'/'+encodeURIComponent(c.slug):'');

/* «Все каталоги»: группы, внутри — порядок как в ленте */
function tile(s){
 return `<a class="tile tint" href="${secHash(s)}" ${tint(s)}>${icon(s)}<span><b>${esc(s.name)}</b></span></a>`;
}
function renderAll(){
 el.allGroups.innerHTML=GROUPS.map(([g,label])=>{
  const secs=data.ranked.filter(s=>(GROUPS.some(x=>x[0]===s.group_name)?s.group_name:'other')===g);
  if(!secs.length)return '';
  return `<section class="group" aria-labelledby="g-${g}"><h2 class="group__title" id="g-${g}">${label}</h2><nav class="tiles tiles--all" aria-label="${label}">${secs.map(tile).join('')}</nav></section>`;
 }).join('');
 applyTints(el.allGroups);
}

/* главная: лента каталогов + витрина */
const STRIP_N=15,SHOW_N=8;
const TABS=[['all','Все'],['accounts','Аккаунты'],['subscriptions','Подписки'],['currency','Пополнение'],['services','Услуги'],['other','Другое']];
const tabOf=p=>TABS.some(t=>t[0]===p.cat.slug&&t[0]!=='all')?p.cat.slug:'other';
function showcase(tab){ // по одному товару из каждого каталога: отмеченный "top":1, иначе первый
 const out=[],seen=new Set();
 data.ranked.forEach(s=>{
  // в общем каталоге («Нейросети») — только товары без своего бренда, чтобы бренд не повторялся
  const c=s.products.filter(p=>!seen.has(p.id)&&(tab==='all'||tabOf(p)===tab)&&(!s.aggregate||p.art===s));
  const big=[...s.cats].sort((a,b)=>b.n-a.n)[0]; // без отметки — товар из самого большого раздела каталога
  const p=c.find(x=>x.top)||c.find(x=>x.cat===big)||c[0];if(p){seen.add(p.id);out.push(p)}
 });
 return out;
}
function showCard(p){
 return `<article class="card card--show"><button class="card__open" type="button" data-id="${esc(p.id)}"><span class="show__head"><span class="show__ic">${icon(p.art,p.image)}</span><span class="show__name"><b>${esc(p.sec.name)}</b><small>${esc(p.cat.name)}</small></span></span><span class="card__body">${newBadge(p)?`<span class="badges badges--row">${newBadge(p)}</span>`:''}<span class="card__title card__title--clamp">${esc(p.title)}</span>${p.price_text?`<span class="card__price">${esc(p.price_text)}</span>`:''}</span></button><a class="btn btn--primary ext" href="${esc(p.playerok_url)}" target="_blank" rel="noopener noreferrer" aria-label="Купить на Playerok: ${esc(p.title)}">Купить</a></article>`;
}
function renderGroups(){
 const r=data.ranked,rest=r.slice(STRIP_N);
 const si=s=>`<a class="si" href="${secHash(s)}">${icon(s)}<span class="si__name">${esc(s.name)}</span></a>`;
 const all=rest.length?`<a class="si si--all" href="#/all" aria-label="Все каталоги: ещё ${rest.length}"><span class="si__mini">${rest.slice(0,4).map(s=>icon(s)).join('')}</span><span class="si__name">+${rest.length}</span></a>`:'';
 el.groups.innerHTML=`<div class="strip-head"><h3>Каталоги</h3><a class="textlink" href="#/all">Все ${r.length} →</a></div>
<div class="strip-wrap"><button class="strip__nav strip__nav--prev" type="button" aria-label="Прокрутить назад" data-strip="-1">‹</button><nav class="strip" id="strip" aria-label="Каталоги">${r.slice(0,STRIP_N).map(si).join('')}${all}</nav><button class="strip__nav strip__nav--next" type="button" aria-label="Прокрутить вперёд" data-strip="1">›</button></div>
<section class="showcase" aria-labelledby="show-title"><h3 id="show-title">Витрина</h3><div class="chips" id="show-tabs" role="group" aria-label="Тип товара"></div><div class="grid" id="show-list"></div><button class="btn btn--line show-more" id="show-more" type="button" hidden>Показать ещё</button></section>`;
 renderShowcase();
 $('#strip').addEventListener('scroll',stripNav,{passive:true});requestAnimationFrame(stripNav);
}
// стрелки ленты (≥960): пересчёт при показе главной и при изменении ширины окна — пока главная скрыта, размеров нет
function stripNav(){
 const sc=$('#strip');if(!sc||el.home.hidden)return;
 $('.strip__nav--prev').hidden=sc.scrollLeft<8;$('.strip__nav--next').hidden=sc.scrollLeft+sc.clientWidth>=sc.scrollWidth-8;
}
window.addEventListener('resize',stripNav,{passive:true});
function renderShowcase(){
 const tabs=TABS.filter(([t])=>t==='all'||showcase(t).length);
 if(!tabs.some(t=>t[0]===st.tab))st.tab='all';
 $('#show-tabs').innerHTML=tabs.map(([t,l])=>`<button class="chip" type="button" data-tab="${t}" aria-pressed="${st.tab===t}">${l}</button>`).join('');
 const list=showcase(st.tab),n=SHOW_N*(1+st.more);
 $('#show-list').innerHTML=list.slice(0,n).map(showCard).join('');
 $('#show-more').hidden=list.length<=n;
}
el.groups.addEventListener('click',e=>{
 const t=e.target.closest('[data-tab]');if(t){st.tab=t.dataset.tab;st.more=0;renderShowcase();return}
 if(e.target.closest('#show-more')){st.more++;renderShowcase();return}
 const n=e.target.closest('[data-strip]');if(n){const sc=$('#strip');sc.scrollBy({left:+n.dataset.strip*sc.clientWidth*.8,behavior:reduced()?'auto':'smooth'});return}
 openCard(e);
});
function card(p,inSection){
 // на странице каталога строка раздела повторяет выбранную вкладку — тогда её не показываем
 const path=inSection?(p.cat.slug===st.cat?'':esc(p.cat.name)):esc(p.sec.name)+' · '+esc(p.cat.name);
 return `<article class="card"><button class="card__open" type="button" data-id="${esc(p.id)}"><span class="card__art tint" ${tint(p.art)}>${newBadge(p)?`<span class="badges">${newBadge(p)}</span>`:''}${icon(p.art,p.image)}</span><span class="card__body">${path?`<span class="card__path">${path}</span>`:''}<span class="card__title">${esc(p.title)}</span>${p.price_text?`<span class="card__price">${esc(p.price_text)}</span>`:''}</span></button><a class="btn btn--primary ext" href="${esc(p.playerok_url)}" target="_blank" rel="noopener noreferrer" aria-label="Купить на Playerok: ${esc(p.title)}">Купить</a></article>`;
}
function renderSearch(){
 const words=tokens(st.q);
 el.groups.hidden=words.length>0;el.results.hidden=!words.length;
 if(!words.length){el.list.innerHTML='';return}
 // слово ищется с начала слова, а не внутри: «кс» найдёт «кс2», но не «робуксы»; совпадения в названии — выше
 const has=(list,w)=>list.some(x=>x.startsWith(w));
 const hits=data.products.filter(p=>words.every(w=>has(p.words,w)));
 const score=p=>words.filter(w=>has(p.tw,w)).length;
 hits.sort((a,b)=>score(b)-score(a));
 el.list.innerHTML=hits.map(p=>card(p,false)).join('');applyTints(el.list);
 el.count.textContent=hits.length?'Найдено: '+goods(hits.length):''; // при пустом результате хватает «Ничего не нашлось»
 el.empty.hidden=hits.length>0;
 // ничего не нашлось — плитка каталога: если слово из его "fallback" (например, ИИ → «Нейросети»), иначе «Другие игры»
 const fb=s=>tokens(s.fallback).some(f=>words.some(w=>w.length>1&&f.startsWith(w)));
 const alt=!hits.length&&(data.sections.find(s=>s.fallback&&fb(s))||data.secById.get('other-games'));$('#empty-more').hidden=!alt;
 $('#empty-sec').innerHTML=alt?`<nav class="tiles tiles--all tiles--one" aria-label="Каталог">${tile(alt)}</nav>`:'';applyTints($('#empty-sec')); // сам каталог, товары — после нажатия
}
function renderHome(){
 const x=$('#strip')?.scrollLeft||0; // при обновлении каталога лента остаётся на месте
 renderGroups();renderAll();renderSearch();
 if(x)$('#strip').scrollLeft=x;
}

/* section page */
const catOf=(s,cat)=>{const has=c=>s.cats.some(x=>x.slug===c);return has(cat)?cat:has(s.start_cat)?s.start_cat:s.cats.reduce((a,b)=>b.n>a.n?b:a).slug}; // без «Все»: start_cat каталога, иначе вкладка, где больше всего товаров (при равенстве — первая)
function renderSection(){
 const s=data.secById.get(st.section);if(!s)return;
 st.cat=catOf(s,st.cat);
 const a=document.activeElement,keep=el.secList.contains(a)&&a.closest('.card__open')?.dataset.id; // фокус на карточке сохраняем
 $('#sec-art').innerHTML=icon(s);setTint($('#sec-art'),s);
 const g=groupName(s.group_name);$('#sec-group').textContent=g;$('#sec-group').hidden=norm(g)===norm(s.name);
 $('#sec-title').textContent=s.name;
 const chip=(slug,label,n)=>`<button class="chip" type="button" data-cat="${esc(slug)}" aria-pressed="${st.cat===slug}">${esc(label)}</button>`;
 el.secCats.hidden=!s.cats.length; // вкладка видна, даже если раздел один
 el.secCats.innerHTML=s.cats.map(x=>chip(x.slug,x.name,x.n)).join('');
 let list=s.products.filter(p=>p.cat.slug===st.cat);
 // «Пополнение баланса»: кнопки валют, по умолчанию рубли, внутри — по возрастанию суммы (решение владельца)
 const curs=st.cat==='currency'?CURS.filter(([c])=>list.some(p=>curOf(p)===c)):[];
 if(!curs.some(([c])=>c===st.cur))st.cur=curs[0]?.[0]||null;
 el.secCur.hidden=!curs.length;
 el.secCur.innerHTML=curs.map(([c,l])=>`<button class="chip" type="button" data-cur="${c}" aria-pressed="${st.cur===c}">${l} <span>(${c})</span></button>`).join('');
 if(curs.length)list=list.filter(p=>curOf(p)===st.cur).sort((a,b)=>sumOf(a)-sumOf(b));
 el.secList.innerHTML=list.map(p=>card(p,true)).join('');applyTints(el.secList);
 rendered=gen+'|'+s.id+'|'+st.cat;
 if(keep)el.secList.querySelector(`.card__open[data-id="${CSS.escape(keep)}"]`)?.focus({preventScroll:true});
 document.title=s.name+' — MolyaShop';
}
el.secCats.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||!data)return;
 st.cat=b.dataset.cat||null;const s=data.secById.get(st.section);
 history.replaceState(null,'',location.pathname+location.search+secHash(s,st.cat&&s.cats.find(x=>x.slug===st.cat)));
 renderSection();
});

el.secCur.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!data)return;st.cur=b.dataset.cur;renderSection()});

/* search */
function resetSearch(){st.q='';el.search.value='';if(data)renderSearch();el.search.focus({preventScroll:true})}
el.search.addEventListener('input',()=>{st.q=norm(el.search.value).trim();if(data)renderSearch()});
$('#reset').addEventListener('click',resetSearch);
document.querySelectorAll('[data-reset]').forEach(b=>b.addEventListener('click',resetSearch));
const openCard=e=>{
 const b=e.target.closest('.card__open');if(!b)return;
 returnFocus=b;openedInPage=true;location.hash='#/product/'+encodeURIComponent(b.dataset.id);
};
el.list.addEventListener('click',openCard);el.secList.addEventListener('click',openCard);

/* product sheet */
const sheetPanel=el.sheet.querySelector('.sheet__panel');
function showSheet(p){
 $('#sheet-art').innerHTML=icon(p.art,p.image);setTint($('#sheet-art'),p.art);
 $('#sheet-path').textContent=p.sec.name+' · '+p.cat.name;
 $('#sheet-title').textContent=p.title;$('#sheet-path').insertAdjacentHTML('beforeend',newBadge(p)?` <span class="badges badges--inline">${newBadge(p)}</span>`:'');
 const d=sheetDesc(p);$('#sheet-desc').textContent=d;$('#sheet-desc').hidden=!d;
 const pr=$('#sheet-price');pr.textContent=p.price_text||'';pr.hidden=!p.price_text;
 $('#sheet-buy').href=p.playerok_url;
 renderSimilar(p);
 document.title=p.title+' — MolyaShop';
 if(el.sheet.hidden){
  el.sheet.hidden=false;document.documentElement.classList.add('locked');
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.sheet.classList.add('is-open')));
 }
 $('#sheet-buy').focus({preventScroll:true});
}
// описание без общей фразы (она уже есть в плашке под ценой) и без пересказа названия
const STD_DESC='Способ получения и условия указаны в объявлении.';
const STOP=new Set(['и','с','со','в','во','на','по','для','без','от','до','из','к','а','the']);
function sheetDesc(p){
 const d=String(p.description||'').replace(STD_DESC,'').trim();if(!d)return '';
 const tw=tokens(p.title),stem=w=>w.slice(0,Math.max(3,Math.min(5,w.length-1)));
 const same=tokens(d).filter(w=>!STOP.has(w)).every(w=>tw.some(t=>t.startsWith(stem(w))||w.startsWith(stem(t))));
 return same?'':d;
}
function similar(p,n=4){
 const out=[],seen=new Set([p.id]),add=x=>{if(out.length<n&&!seen.has(x.id)){seen.add(x.id);out.push(x)}};
 const inSecs=p.secs.flatMap(id=>data.secById.get(id)?.products||[]);
 inSecs.filter(x=>x.cat.slug===p.cat.slug).forEach(add);inSecs.forEach(add); // сначала тот же раздел внутри каталога
 data.products.filter(x=>x.sec.group_name===p.sec.group_name&&x.cat.slug===p.cat.slug).forEach(add);
 data.products.filter(x=>x.sec.group_name===p.sec.group_name).forEach(add);
 return out;
}
function renderSimilar(p){
 const list=similar(p);$('#sheet-similar').hidden=!list.length;
 $('#similar-list').innerHTML=list.map(x=>`<button class="sim" type="button" data-id="${esc(x.id)}"><span class="sim__art tint" ${tint(x.art)}>${icon(x.art,x.image)}</span><span class="sim__body"><span class="sim__title">${esc(x.title)}</span>${x.price_text?`<span class="sim__price">${esc(x.price_text)}</span>`:''}</span><span class="sim__go" aria-hidden="true">→</span></button>`).join('');applyTints($('#similar-list'));
}
$('#similar-list').addEventListener('click',e=>{
 const b=e.target.closest('.sim');if(!b||!data)return;const q=data.byId.get(b.dataset.id);if(!q)return;
 history.replaceState(null,'',location.pathname+location.search+'#/product/'+encodeURIComponent(q.id)); // без новой записи в истории: «назад» закрывает окно
 showSheet(q);sheetPanel.scrollTo({top:0,behavior:reduced()?'auto':'smooth'});
});
function hideSheet(){
 if(el.sheet.hidden)return false;
 el.sheet.classList.remove('is-open');el.sheet.hidden=true;document.documentElement.classList.remove('locked');
 let f=returnFocus;
 if(f&&!f.isConnected)f=document.querySelector(`.card__open[data-id="${CSS.escape(f.dataset.id||'')}"]`);
 if(f)f.focus({preventScroll:true});
 returnFocus=null;return true;
}
function closeSheet(){
 if(el.sheet.hidden)return;
 if(openedInPage){openedInPage=false;history.back();return}
 const s=view==='section'&&data.secById.get(st.section);
 history.replaceState(null,'',location.pathname+location.search+(s?secHash(s,st.cat&&s.cats.find(x=>x.slug===st.cat)):view==='all'?'#/all':''));
 hideSheet();route();
}
el.sheet.addEventListener('click',e=>{if(e.target.closest('[data-close]'))closeSheet()});

const trap=(e,panel)=>{
 const f=[...panel.querySelectorAll('a[href],button')];const first=f[0],last=f[f.length-1];
 if(e.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){e.preventDefault();last.focus()}
 else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
};
document.addEventListener('keydown',e=>{
 if(el.sheet.hidden)return;
 if(e.key==='Escape'){e.preventDefault();closeSheet();return}
 if(e.key==='Tab')trap(e,sheetPanel);
});

/* views */
function show(name){
 if(view===name)return false;
 if(view==='home')homeY=window.scrollY;
 el.home.hidden=name!=='home';el.section.hidden=name!=='section';el.gifts.hidden=name!=='gifts';el.all.hidden=name!=='all';
 const from=view;view=name;
 if(name==='home'){requestAnimationFrame(stripNav);if(from)requestAnimationFrame(()=>window.scrollTo(0,homeY))}
 return true;
}

/* routing: #/ · #/<section> · #/<section>/<category> · #/product/<id> · #/gifts (старая #gift) · #catalog · #how */
function scrollToEl(node){if(node)node.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'})}
function route(){
 const h=location.hash;
 if(h==='#gift'){history.replaceState(null,'',location.pathname+location.search+'#/gifts');route();return} // старая ссылка на окно подарка
 const parts=h.startsWith('#/')?h.slice(2).split('/').map(x=>{try{return decodeURIComponent(x)}catch{return x}}):[];
 const head=parts[0]||'';
 if(head==='product'){
  if(!data)return;
  const p=data.byId.get(parts[1]||'');
  if(p){
   if(!view||(view==='gifts'))openSection(p.sec.id,p.cat.slug,false); // за окном — каталог на вкладке этого товара
   showSheet(p);return;
  }
  history.replaceState(null,'',location.pathname+location.search);
 }
 hideSheet();openedInPage=false;
 if(head==='all'){
  if(!data)return;
  if(show('all')){document.title='Все каталоги — MolyaShop';window.scrollTo(0,0);$('#all-title').focus({preventScroll:true})}
  return;
 }
 if(head==='gifts'){
  if(show('gifts')){document.title='Подарки за покупки — MolyaShop';window.scrollTo(0,0);$('#gifts-title').focus({preventScroll:true})}
  return;
 }
 if(head){
  if(!data)return;
  if(data.secById.has(head)){
   openSection(head,parts[1]||null,true);
   if(parts[1]&&parts[1]!==st.cat){const s=data.secById.get(head);history.replaceState(null,'',location.pathname+location.search+secHash(s,s.cats.find(x=>x.slug===st.cat)))} // неверная вкладка в ссылке → настоящая
   return;
  }
  history.replaceState(null,'',location.pathname+location.search);
 }
 const changed=show('home');document.title=TITLE;
 if(h==='#catalog'||h==='#how'){requestAnimationFrame(()=>scrollToEl(document.querySelector(h)));return}
 if(!changed&&(h==='#/'))window.scrollTo(0,0);
}
function openSection(id,cat,focus){
 const same=view==='section'&&st.section===id,s=data.secById.get(id);
 st.section=id;
 // тот же каталог и та же вкладка уже на экране — не перерисовываем (иначе пропадает фокус на карточке)
 if(!(same&&rendered===gen+'|'+id+'|'+catOf(s,cat||st.cat))){st.cat=cat;renderSection()}
 if(show('section')||!same){window.scrollTo(0,0);if(focus)$('#sec-title').focus({preventScroll:true})}
}
window.addEventListener('hashchange',route);

/* gifts view: copy message */
$('#copy-gift').addEventListener('click',async()=>{
 const text=$('#gift-message').textContent,status=$('#copy-status');
 try{await navigator.clipboard.writeText(text);status.textContent='Сообщение скопировано.'}
 catch{const r=document.createRange();r.selectNodeContents($('#gift-message'));const s=getSelection();s.removeAllRanges();s.addRange(r);status.textContent='Текст выделен, скопируйте его вручную.'}
});

/* load */
async function load(first){
 try{
  const r=await fetch('catalog.json',{cache:'no-cache'});if(!r.ok)throw Error(r.status);
  const text=await r.text();lastFetch=Date.now();
  if(data&&text===rawText)return; // каталог не изменился — ничего не перерисовываем
  const raw=JSON.parse(text);if(![raw.sections,raw.categories,raw.products].every(Array.isArray))throw Error('format');
  data=prepare(raw);rawText=text;gen++;
  renderHome();
  if(first)route();
  else if(view==='section'){if(data.secById.has(st.section))renderSection();else location.hash='#/'}
 }catch{
  if(data)return;
  el.groups.innerHTML='<div class="notice"><p>Не удалось загрузить каталог. Проверьте соединение и попробуйте ещё раз.</p><button class="linkbtn" type="button" id="retry">Повторить</button></div>';
  $('#retry').addEventListener('click',()=>load(true));
 }
}
window.addEventListener('focus',()=>{if(data&&Date.now()-lastFetch>60000)load(false)});
route();load(true);
})();
