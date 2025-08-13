
// Toast UI
function showToast(msg){
  let t = document.getElementById('toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'toast';
    t.style.position='fixed';
    t.style.left='50%';
    t.style.bottom='20px';
    t.style.transform='translateX(-50%)';
    t.style.background='#111827';
    t.style.color='#fff';
    t.style.padding='10px 14px';
    t.style.borderRadius='999px';
    t.style.boxShadow='0 10px 30px rgba(0,0,0,.15)';
    t.style.zIndex='9999';
    t.style.opacity='0';
    t.style.transition='opacity .2s ease, transform .2s ease';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity='1';
  t.style.transform='translateX(-50%) translateY(-4px)';
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(-50%)'; }, 2200);
}


function getQueryNumber(name){
  const v = new URLSearchParams(location.search).get(name);
  return v ? Number(v) : null;
}

function computePeopleAfter(){
  const q = getQueryNumber('after');
  if (q !== null && !Number.isNaN(q)) return Math.max(0,q);
  const total = getQueryNumber('total');
  const pos = getQueryNumber('pos');
  if (total !== null && pos !== null) return Math.max(0, total - pos);
  try{
    const lsTotal = Number(localStorage.getItem('TOTAL_SIGNUPS'));
    const lsPos = Number(localStorage.getItem('MY_POSITION'));
    if (!Number.isNaN(lsTotal) && !Number.isNaN(lsPos)) return Math.max(0, lsTotal - lsPos);
  }catch(e){}
  return 260;
}

function reqForLevel(level){ return Math.pow(2, level); }

function priceForLevel(level){
  // Regla usada en nuestras simulaciones:
  // precio(1) = 10 USDT
  // precio(n>=2) = 15 * 2^(n-2)
  if (level===1) return 10;
  return 15 * Math.pow(2, level-2);
}
function payoutForLevel(level){
  // Pagos en mesas pares = 25% de (2 × precio) = 0.5 × precio
  if (level % 2 !== 0) return 0;
  const price = priceForLevel(level);
  return 0.5 * price;
}


function buildBoards(){
  const wrap = document.getElementById('boards-wrap');
  if (!wrap) return;
  const peopleAfter = computePeopleAfter();
  checkNewCompletions(peopleAfter);
  const cards = [];
  for (let level=1; level<=12; level++){
    const req = reqForLevel(level);
    const have = Math.min(peopleAfter, req);
    const missing = Math.max(0, req - peopleAfter);
    const completed = missing === 0;
    const progress = Math.round((have/req)*100);
    const showProgress = level >= 2;
    const payBadge = (level % 2 === 0) ? `<span class="badge" style="background:#e7f6ed;color:#16a34a;border:1px solid #bbf7d0">Paga</span>` : '';
    cards.push(`
      <div class="board">
        <div class="head">
          <div class="name">Mesa ${level}</div>
          <div class="row" style="gap:6px">
            ${payBadge}
            <span class="badge ${completed?'':'info'}" style="background:${completed?'#e7f6ed':'#eef2ff'};color:${completed?'#16a34a':'#334155'};border:1px solid ${completed?'#bbf7d0':'#c7d2fe'}">
              ${completed ? 'Completado' : 'En progreso'}
            </span>
          </div>
        </div>
        <div class="body">\
          <div class="kv"><span style="color:#16a34a;font-weight:700">Pago al usuario</span><span style="color:#16a34a;font-weight:800">+$${payoutForLevel(level).toFixed(2)}</span></div>\
          <div class="kv"><span>Auto-ascenso (siguiente mesa)</span><span>$${(level<12?priceForLevel(level+1):0).toFixed(2)}</span></div>\
          
\
          <div class="kv"><span>Personas requeridas</span><span>${req.toLocaleString()}</span></div>
          <div class="kv"><span>Personas debajo de ti</span><span>${peopleAfter.toLocaleString()}</span></div>
          <div class="kv"><span>Faltan</span><span>${missing.toLocaleString()}</span></div>
          ${ showProgress ? `<div class="progress"><span style="width:${progress}%"></span></div>` : ``}
        </div>
      </div>
    `);
  }
  wrap.innerHTML = cards.join("");
}

window.addEventListener('DOMContentLoaded',()=>{
  buildBoards();
  const copy = document.getElementById('copy-link');
  if (copy){
    copy.onclick = async ()=>{
      const v = document.getElementById('ref-link').value;
      try{ await navigator.clipboard.writeText(v); alert('Copiado'); }catch(e){ alert('No se pudo copiar'); }
    };
  }
});

function checkNewCompletions(peopleAfter){
  const key = 'cw_last_level';
  const prev = Number(localStorage.getItem(key)||0);
  let level = 0;
  for(let l=1;l<=12;l++){ if(peopleAfter>=Math.pow(2,l)) level=l; else break; }
  if(level>prev){
    showToast('¡Subiste a Mesa ' + level + '!');
    localStorage.setItem(key, String(level));
  }
}


// Drawer móvil
window.addEventListener('DOMContentLoaded', ()=>{
  const hamb = document.getElementById('hamb');
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('overlay');
  if (!hamb || !drawer || !overlay) return;
  const open = () => { drawer.classList.add('open'); overlay.classList.add('show'); document.body.style.overflow='hidden'; };
  const close = () => { drawer.classList.remove('open'); overlay.classList.remove('show'); document.body.style.overflow=''; };
  hamb.addEventListener('click', open);
  overlay.addEventListener('click', close);
  drawer.querySelectorAll('a').forEach(a=> a.addEventListener('click', close));
});
