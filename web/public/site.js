/* Tolerance brochure behaviour. Presentation only: nothing here processes plant data. */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),lerp=(a,b,t)=>a+(b-a)*t;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- scenes ---------- */
$('#scene').innerHTML=Scene.hero();
$('#closingArt').innerHTML=Scene.retest();
const fp=Scene.hero.fault();

/* ---------- compiler story (five beats; formulas follow the Tolerance product's own story component) ---------- */
const beats=[
 ['Connect the fragments.','Manuals. Production records. Machine signals. Bring existing sources into view without replacing the systems behind them.','SOURCE DISCOVERY','Ingest'],
 ['Keep the evidence.','Information enters a shared model with its origin attached. Proposed identity matches stay open for human review.','KNOWLEDGE COMPILATION','Understand'],
 ['Compose the response.','Confirmed context defines specialist roles and scoped tools. One coordinator connects the workflow.','WORKFLOW SYNTHESIS','Compose'],
 ['Pass the safety boundary.','A proposal reaches independent policy. Restricted actions stop here. Required approvals stay with people.','GOVERNED EXECUTION','Govern'],
 ['Verify. Then learn.','Measure the response, retain verified outcomes, and use them to inform the next recommendation. Memory never grants authority.','OPERATIONAL FEEDBACK','Learn'],
];
const nodes=[[510,120],[615,165],[620,280],[510,325],[440,240]];
function storySVG(p){
 const ingest=clamp(p*5),graph=clamp((p-.15)*6),agents=clamp((p-.35)*6),safety=clamp((p-.55)*6),learn=clamp((p-.76)*5);
 let s='<defs><linearGradient id="sm" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dbe2ce"/><stop offset=".5" stop-color="#668979"/><stop offset="1" stop-color="#163b30"/></linearGradient><radialGradient id="sg"><stop stop-color="#e3bb7a" stop-opacity=".18"/><stop offset="1" stop-color="#e3bb7a" stop-opacity="0"/></radialGradient><pattern id="sgr" width="45" height="45" patternUnits="userSpaceOnUse"><path d="M45 0H0V45" fill="none" stroke="#8da68f" stroke-opacity=".08"/></pattern></defs>'
  +'<rect width="900" height="600" fill="url(#sgr)"/><ellipse cx="485" cy="285" rx="310" ry="270" fill="url(#sg)"/>';
 s+='<g opacity="'+(1-ingest*.7)+'">'+['PDF','CSV','API','SIGNAL'].map((l,i)=>'<g transform="translate(45 '+(90+i*110)+')"><rect width="100" height="65" rx="10" fill="#1b352b" stroke="#77917b" stroke-opacity=".5"/><text x="16" y="25" class="srcl">'+l+'</text><path d="M16 39h65M16 48h45" stroke="#78937c" stroke-opacity=".5" stroke-linecap="round"/></g>').join('')+'</g>';
 for(let i=0;i<16;i++){const lane=i%4,t=clamp(ingest*1.7-i*.038);s+='<g opacity="'+(t>0&&t<1?1:0)+'" transform="translate('+lerp(150,355,t)+' '+lerp(115+lane*110,280+(lane-1.5)*12,t)+') rotate('+t*90+')"><rect width="12" height="18" rx="4" fill="'+(lane%2?'#b9d0be':'#e5bd7e')+'"/></g>'}
 for(let i=0;i<4;i++)s+='<path d="M145 '+(122+i*110)+' C240 '+(122+i*110)+',245 285,350 285" fill="none" stroke="#ddb77e" stroke-opacity="'+(.1+ingest*.35)+'" stroke-dasharray="4 9" stroke-linecap="round"/>';
 s+='<g transform="translate(350 285)"><ellipse rx="'+(110+graph*30)+'" ry="'+(150+graph*20)+'" fill="#e4b977" opacity="'+(.05+graph*.06)+'"/>'+Symbiont.art(1.3)+'<text y="178" text-anchor="middle" class="lbl">SYMBIOTIC COMPILER</text></g>';
 s+='<g opacity="'+graph+'">'+nodes.map((n,i)=>'<g transform="translate('+lerp(350,n[0],graph)+' '+lerp(285,n[1],graph)+')"><line x1="'+(350-lerp(350,n[0],graph))+'" y1="'+(285-lerp(285,n[1],graph))+'" x2="0" y2="0" stroke="#a6c3a6" stroke-opacity=".4"/><circle r="24" fill="#203f32" stroke="#b3c5a0"/><circle r="5" fill="#e7c38b"/><text y="44" text-anchor="middle" class="lbl">'+['ASSET','ORDER','PROCEDURE','SUPPLIER','SOURCE'][i]+'</text></g>').join('')+'</g>';
 s+='<g opacity="'+agents+'">'+[0,1,2].map(i=>'<g transform="translate('+lerp(530,710,agents)+' '+(150+i*100)+')"><path d="M-90 '+(85-i*65)+'Q-45 0 0 0" fill="none" stroke="#c4b389" stroke-opacity=".4"/><rect x="-30" y="-25" width="140" height="52" rx="12" fill="#213d30" stroke="#a1ba92"/><text x="40" y="-2" text-anchor="middle" class="lbl">'+['INVESTIGATE','PLAN','VERIFY'][i]+'</text><text x="40" y="14" text-anchor="middle" class="mic">SCOPED TOOLS</text></g>').join('')+'</g>';
 s+='<g opacity="'+safety+'" transform="translate(650 '+lerp(560,470,safety)+')"><path d="M-200 0H160" stroke="#b5ca9e" stroke-opacity=".3"/><path d="M0 -48L36 -30V3Q30 32 0 48Q-30 32 -36 3V-30Z" fill="#283f2f" stroke="#e0be84" stroke-width="2" stroke-linejoin="round"/><path d="M-15 0L-3 12L18 -13" fill="none" stroke="#e0be84" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="-105" y="-12" text-anchor="middle" class="lbl">PROPOSAL</text><text x="108" y="-12" text-anchor="middle" class="lbl">PERMITTED</text><text y="75" text-anchor="middle" class="lbl">INDEPENDENT AUTHORITY</text><g transform="translate(-95 33)"><path d="M-5 -5L5 5M5 -5L-5 5" stroke="#d18e75" stroke-width="2" stroke-linecap="round"/><text x="15" y="4" class="mic">RESTRICTED / STOP</text></g></g>';
 s+='<g opacity="'+learn+'"><path d="M795 390C850 535 315 575 300 380" fill="none" stroke="#b2d4ad" stroke-width="2" stroke-dasharray="850" stroke-dashoffset="'+850*(1-learn)+'" stroke-linecap="round"/><circle cx="'+lerp(795,310,learn)+'" cy="'+(390+Math.sin(learn*Math.PI)*145)+'" r="5" fill="#d9edbb"/><text x="430" y="566" class="lbl">MEASURED OUTCOME → MEMORY → NEXT RECOMMENDATION</text></g>';
 return s;
}
const cpin=$('#cpin'),cSec=$('.compiler'),cScene=$('#cpScene'),cText=$('#cpText'),cKick=$('#cpKick'),cTime=$('#cpTime');
cTime.innerHTML=beats.map((b,i)=>'<button aria-label="Story stage '+(i+1)+': '+b[2]+'"><i></i><span>0'+(i+1)+'</span>'+b[3]+'</button>').join('');
const cBtns=$$('#cpTime button');
cBtns.forEach((b,i)=>b.onclick=()=>{const top=cSec.getBoundingClientRect().top+scrollY,span=cSec.offsetHeight-innerHeight;window.scrollTo({top:top+span*(i/5+.055),behavior:reduced?'auto':'smooth'})});
let beat=-1;
function setBeat(b){if(b===beat)return;beat=b;cText.classList.remove('swap');void cText.offsetWidth;cText.classList.add('swap');cText.querySelector('h3').textContent=beats[b][0];cText.querySelector('p').textContent=beats[b][1];cKick.textContent='0'+(b+1)+' / '+beats[b][2];cBtns.forEach((x,i)=>i===b?x.setAttribute('aria-current','step'):x.removeAttribute('aria-current'))}

/* ---------- scroll-linked behaviour ---------- */
const nav=$('#nav'),heroCopy=$('#heroCopy'),hero=$('#hero'),stmt=$('.statement');
function onScroll(){
 const y=scrollY;nav.classList.toggle('stuck',y>90);
 /* hero: camera drifts toward the fault, copy eases up and fades (presentation only) */
 const hp=clamp(y/(hero.offsetHeight*.95));
 if(!reduced){
  heroCopy.style.transform='translateY('+(-hp*70)+'px)';heroCopy.style.opacity=1-hp*.85;
 }
 const r=stmt.getBoundingClientRect(),sp=clamp((innerHeight*.85-r.top)/(innerHeight*.55));
 stmt.style.setProperty('--a',clamp(sp*2));stmt.style.setProperty('--b',clamp(sp*2-1));
 /* compiler: progress through the pinned section drives every beat */
 const cr=cSec.getBoundingClientRect(),p=clamp(-cr.top/(cSec.offsetHeight-innerHeight));
 setBeat(Math.min(4,Math.floor(p*5)));cScene.innerHTML=storySVG(p);
 cBtns.forEach((b,i)=>b.firstChild.style.transform='scaleX('+clamp(p*5-i)+')');
 /* fallback reveal in case observers lag */
 $$('.rv:not(.in)').forEach(el=>{const q=el.getBoundingClientRect();if(q.top<innerHeight*.9&&q.bottom>0)el.classList.add('in')});
}
addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll);

const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.15});
$$('.rv').forEach(el=>io.observe(el));
new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting&&e.target.classList.add('in')),{rootMargin:'0px 0px -25% 0px'}).observe($('#tree'));
requestAnimationFrame(()=>{$$('.hero .rv').forEach(el=>el.classList.add('in'));onScroll()});

/* ---------- one living world behind the whole page: a camera travels along the line as you scroll ---------- */
const pr=Iso.P(520,200),SP=2.6,at=(i,dx=.8,dy=.7,z=1)=>{const p=pr(i*SP+dx,dy,z);return {x:p[0],y:p[1]}};
const FOCUS={weld:fp,s1:at(1),s5:at(5),s6:at(6),vision:at(4,.2,1.2,1.2),end:at(7,.8,.7,.8),mid:at(3.5)};
const stops=[
 {el:'#hero',    f:FOCUS.weld,   c:[1150,480],k:.94, s:0},
 {el:'#what',    f:FOCUS.mid,    c:[800,450], k:1.0, s:.86},
 {el:'#sources', f:FOCUS.s1,     c:[980,500], k:1.45,s:.74},
 {el:'.statement',f:FOCUS.mid,    c:[800,450], k:.9, s:.84},
 {el:'.parts',   f:FOCUS.s5,     c:[1060,470],k:1.25,s:.82},
 {el:'#compiler',f:FOCUS.weld,   c:[800,450], k:1.0, s:.96},
 {el:'.pillars-wrap',f:FOCUS.s6,  c:[800,450], k:1.0, s:.88},
 {el:'.tiles-wrap',f:FOCUS.mid,   c:[800,450], k:1.1, s:.9},
 {el:'#authority',f:FOCUS.vision, c:[1020,470],k:1.8, s:.58},
 {el:'.closing', f:FOCUS.end,     c:[1000,470],k:1.35,s:.3}
];
let centers=[];const measure=()=>{centers=stops.map(s=>{const e=$(s.el);return e?e.getBoundingClientRect().top+scrollY+e.offsetHeight/2:0})};
measure();addEventListener('load',measure);addEventListener('resize',measure);
setTimeout(measure,600);setTimeout(measure,2000);
const smooth=t=>t*t*(3-2*t);
function target(){const y=scrollY+innerHeight*.5;let i=0;while(i<stops.length-2&&y>centers[i+1])i++;
 const a=stops[i],b=stops[i+1],t=smooth(clamp((y-centers[i])/Math.max(1,centers[i+1]-centers[i])));
 return {fx:lerp(a.f.x,b.f.x,t),fy:lerp(a.f.y,b.f.y,t),cx:lerp(a.c[0],b.c[0],t),cy:lerp(a.c[1],b.c[1],t),k:lerp(a.k,b.k,t),s:lerp(a.s,b.s,t)}}
const cam={...target()};let mx=.5,my=.5,px=.5,py=.5,last=performance.now();
addEventListener('mousemove',e=>{mx=e.clientX/innerWidth;my=e.clientY/innerHeight});
const el$=id=>document.getElementById(id),root=el$('sceneRoot'),sky=el$('lySky'),far=el$('lyFar'),rays=el$('lyRays'),coreEl=el$('lyCore');
function frame(now){const dt=Math.min(.25,(now-last)/1000);last=now;const t=target(),r=reduced?1:1-Math.exp(-3.4*dt);
 for(const k in t)cam[k]+=(t[k]-cam[k])*r;
 px+=(mx-px)*(1-Math.exp(-3*dt));py+=(my-py)*(1-Math.exp(-3*dt));const dx=(px-.5)*2,dy=(py-.5)*2,pm=reduced?0:1;
 root.setAttribute('transform','translate('+(cam.cx-dx*28*pm)+' '+(cam.cy-dy*16*pm)+') scale('+cam.k+') translate('+(-cam.fx)+' '+(-cam.fy)+')');
 sky.setAttribute('transform','translate('+(-dx*8*pm)+' '+(-dy*5*pm)+')');far.setAttribute('transform','translate('+(-dx*16*pm)+' '+(-dy*7*pm)+')');rays.setAttribute('transform','translate('+(-dx*22*pm)+' 0)');
 document.documentElement.style.setProperty('--scrim',cam.s.toFixed(3));
 const hp=clamp(scrollY/(hero.offsetHeight*.8));coreEl.style.transform='translateY('+(-hp*340)+'px)';coreEl.style.opacity=clamp(1-hp*1.25);
 requestAnimationFrame(frame)}
requestAnimationFrame(frame);
/* hero headline: words rise in one by one */
$$('.hero h1').forEach(h=>{let i=0;const w=n=>{if(n.nodeType===3){const f=document.createDocumentFragment();n.textContent.split(/(\s+)/).forEach(t=>{if(!t.trim()){f.append(t);return}const s=document.createElement('span');s.className='wd';s.style.animationDelay=(.25+(i++)*.12)+'s';s.textContent=t;f.append(s)});n.replaceWith(f)}else n.childNodes.forEach(w)};[...h.childNodes].forEach(w)});
