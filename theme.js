'use strict';
// Тема сайта: по умолчанию как на устройстве посетителя (дневная или ночная).
// Если посетитель сам нажал кнопку, его выбор хранится только в его браузере.
(()=>{
 const KEY='molya-theme',root=document.documentElement;
 const mq=window.matchMedia?matchMedia('(prefers-color-scheme: dark)'):null;
 const saved=()=>{try{return localStorage.getItem(KEY)}catch{return null}};
 const get=()=>saved()||(mq&&mq.matches?'dark':'light');
 const apply=t=>{
  if(t==='dark')root.dataset.theme='dark';else delete root.dataset.theme;
  const m=document.querySelector('meta[name=theme-color]');if(m)m.content=t==='dark'?'#0f1420':'#f3f6fc';
  document.querySelectorAll('[data-theme-toggle]').forEach(b=>{b.setAttribute('aria-pressed',String(t==='dark'));b.setAttribute('aria-label',t==='dark'?'Включить дневную тему':'Включить ночную тему')});
 };
 apply(get());
 // тема на устройстве сменилась (например, вечером) — следуем, пока посетитель не выбрал сам
 if(mq){const on=()=>{if(!saved())apply(get())};mq.addEventListener?mq.addEventListener('change',on):mq.addListener&&mq.addListener(on)}
 document.addEventListener('DOMContentLoaded',()=>{
  apply(get());
  document.querySelectorAll('[data-theme-toggle]').forEach(b=>b.addEventListener('click',()=>{
   const t=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(KEY,t)}catch{}apply(t);
  }));
 });
})();
