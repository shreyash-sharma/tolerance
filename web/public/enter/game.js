/* Shift Lead: a playable brochure for Tolerance.
   Everything here is simulated in the browser (see sim.js). The product runs the same steps on records it persists. */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),damp=(k,dt)=>1-Math.exp(-k*dt),sleep=ms=>new Promise(r=>setTimeout(r,ms));
let cur='loader';
const show=id=>{$$('.stage').forEach(s=>s.classList.toggle('hidden',s.id!==id));cur=id};

/* ---------- audio: a few soft synthesized cues, muted with the toggle ---------- */
const Aud=(()=>{let ctx=null,on=localStorage.getItem('tol-snd')!=='off';
 const get=()=>{if(!ctx){try{ctx=new (window.AudioContext||window.webkitAudioContext)()}catch(e){}}if(ctx&&ctx.state==='suspended')ctx.resume();return ctx};
 const tone=(f,t0,d,type,v)=>{const c=get();if(!c||!on)return;const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+t0;o.type=type||'sine';o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v||.05,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g).connect(c.destination);o.start(t);o.stop(t+d+.05)};
 return{click(){tone(520,0,.08,'triangle',.04)},ok(){[523,659,784].forEach((f,i)=>tone(f,i*.09,.24,'sine',.05))},deny(){tone(170,0,.3,'sawtooth',.04);tone(130,.08,.3,'sawtooth',.03)},tick(){tone(880,0,.05,'square',.018)},whoosh(){tone(220,0,.5,'sine',.028);tone(330,.05,.45,'sine',.02)},
  get on(){return on},set on(v){on=v;localStorage.setItem('tol-snd',v?'on':'off')},unlock(){get()}}})();
const sndBtn=$('#snd');const sndLabel=()=>{sndBtn.textContent=Aud.on?'Sound on':'Sound off';sndBtn.setAttribute('aria-pressed',Aud.on)};
sndBtn.onclick=()=>{Aud.on=!Aud.on;Aud.unlock();sndLabel();Aud.click()};sndLabel();

/* ---------- shift state and HUD ---------- */
const G0=()=>({clock:22*60,held:0,peak:0,trust:70,denied:0,evidence:0,escapes:0,wrongCells:0,dec:{},params:null,passed:false,attempts:0,dispatched:0,plan:null,prefs:null});
let G=G0();
const done=new Set();let lot=Sim.lot(7);
const flash=sel=>{const e=$(sel);if(!e)return;const p=e.closest('.hs');if(p){p.classList.remove('flash');void p.offsetWidth;p.classList.add('flash')}};
function hud(){$('#hClock').textContent=Sim.clockStr(G.clock);$('#hHeld').textContent=G.held;$('#hDen').textContent=G.denied;$('#hTrust i').style.width=clamp(G.trust,0,100)+'%'}
const addTime=m=>{G.clock+=m;hud();flash('#hClock')};
const trust=d=>{G.trust=clamp(G.trust+d,0,100);hud()};
const hold=n=>{G.held=n;G.peak=Math.max(G.peak,n);hud();flash('#hHeld')};
const deny=()=>{G.denied++;hud();flash('#hDen');Aud.deny()};
let sayT;function say(t){const el=$('#coreTxt');clearTimeout(sayT);el.textContent='';let i=0;const step=()=>{i+=2;el.textContent=t.slice(0,i);if(i<t.length)sayT=setTimeout(step,15)};step()}
const P=$('#panel');
const panel=h=>{P.innerHTML=h;P.classList.remove('off');P.scrollTop=0};const panelOff=()=>P.classList.add('off');

/* ---------- scenes ---------- */
const VB={x:300,y:60,w:1000,h:562};
const crop=(svg,x,y,w,h)=>svg.replace('viewBox="0 0 1600 900"','viewBox="'+x+' '+y+' '+w+' '+h+'"');
const world=svg=>crop(svg,VB.x,VB.y,VB.w,VB.h),heroCrop=svg=>crop(svg,420,70,1100,620);
function compileScene(art){
 let st='';for(let i=0;i<46;i++)st+='<circle cx="'+((i*353)%1600)+'" cy="'+((i*197)%900)+'" r="'+(.8+(i%4)*.4)+'" class="star" style="animation-delay:'+(-(i%9)*.5)+'s"/>';
 let docs='';if(art)docs=[0,1,2,3].map(i=>'<g transform="translate('+(360+i*30)+' '+(250+i*86)+')"><rect width="190" height="64" rx="12" fill="#10211e" stroke="#e4b977" stroke-opacity=".55"/><path d="M18 26h110M18 42h70" stroke="#8da68f" stroke-linecap="round"/></g>').join('')+'<g transform="translate(920 450) scale(1.4)">'+Scene.core(0,0,1)+'</g>';
 return '<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">'+Iso.defs+'<defs><radialGradient id="cs" cx=".44" cy=".52" r=".7"><stop offset="0" stop-color="#1d4a3d"/><stop offset="1" stop-color="#07110e"/></radialGradient><pattern id="cg" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="#8da68f" stroke-opacity=".08"/></pattern></defs><rect width="1600" height="900" fill="url(#cs)"/><rect width="1600" height="900" fill="url(#cg)"/><g fill="#f2f0e0" opacity=".7">'+st+'</g>'+docs+'</svg>';
}
const LV=[
 {k:'Attach',tag:'LEVEL 1 · ATTACH AND UNDERSTAND',sub:'Four sources. One model. You correct it.',obj:'Feed the four sources to the Core. Resolve what it cannot.',scene:()=>compileScene(true),thumb:s=>s,bg:()=>compileScene(false),mode:'plain'},
 {k:'Investigate',tag:'LEVEL 2 · INVESTIGATE',sub:'Find the drift. Trace the lot. Contain it.',obj:'Collect the evidence, find the drifting weld, and hold only what you must.',scene:()=>Scene.weld(),thumb:world,bg:()=>world(Scene.weld()),mode:'world'},
 {k:'Govern',tag:'LEVEL 3 · GOVERN',sub:'Every action meets a boundary.',obj:'Choose a response. Policy decides whether it can proceed.',scene:()=>Scene.gate(),thumb:world,bg:()=>world(Scene.gate()),mode:'world'},
 {k:'Verify',tag:'LEVEL 4 · VERIFY',sub:'Measure it. Then release it.',obj:'Let the observation window run, read the measurement, then use the key.',scene:()=>Scene.retest(),thumb:world,bg:()=>world(Scene.retest()),mode:'world'},
 {k:'Adapt',tag:'LEVEL 5 · ADAPT',sub:'The world changes. Replan inside policy.',obj:'A supplier slips. Pick a plan that keeps the order and the rules.',scene:()=>Scene.hero(),thumb:heroCrop,bg:()=>heroCrop(Scene.hero()),mode:'plain'}
];

/* ---------- feedback ---------- */
function burst(x,y,n,color){const ring=document.createElement('div');ring.className='bring';ring.style.left=x+'px';ring.style.top=y+'px';document.body.append(ring);setTimeout(()=>ring.remove(),1000);
 for(let i=0;i<(n||16);i++){const p=document.createElement('div');p.className='bp';const a=Math.random()*Math.PI*2,d=60+Math.random()*170;p.style.left=x+'px';p.style.top=y+'px';p.style.setProperty('--dx',Math.cos(a)*d+'px');p.style.setProperty('--dy',Math.sin(a)*d+'px');p.style.background=color||(Math.random()<.5?'#e4b977':'#9fd08a');p.style.animationDelay=Math.random()*.12+'s';document.body.append(p);setTimeout(()=>p.remove(),1400)}}
const burstAt=el=>{const r=el.getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2)};
const rec=(kind,title,body,code)=>'<div class="rec"><b class="'+kind+'">'+title+'</b><br>'+body+(code?'<code>'+code+'</code>':'')+'</div>';

/* ---------- title, loader, briefing ---------- */
$('#heroBg').innerHTML=Scene.hero();$('#missionBg').innerHTML=Scene.hero();$('#doneBg').innerHTML=Scene.hero();$('#finalBg').innerHTML=Scene.hero();
$('#lCells').innerHTML=[[230,120,18],[560,140,14],[470,310,16],[250,330,12],[640,300,10]].map((c,i)=>'<g class="cf" style="animation-delay:'+(-i*1.1)+'s"><rect x="'+(c[0]-c[2])+'" y="'+(c[1]-c[2]*1.4)+'" width="'+c[2]*2+'" height="'+c[2]*2.8+'" rx="'+c[2]*.5+'" fill="'+(i%2?'#9fb7a6':'#e4b977')+'" opacity=".9"/><rect x="'+(c[0]-c[2]*.6)+'" y="'+(c[1]-c[2]*1.1)+'" width="'+c[2]*1.2+'" height="'+c[2]*.5+'" rx="'+c[2]*.25+'" fill="#fff" opacity=".4"/></g>').join('');
setTimeout(()=>{$('#loader').style.opacity=0;setTimeout(()=>$('#loader').remove(),1000);cur='hero'},2600);
function wrapWords(el){const f=n=>{if(n.nodeType===3){const fr=document.createDocumentFragment();n.textContent.split(/(\s+)/).forEach(t=>{if(!t.trim()){fr.append(t);return}const s=document.createElement('span');s.className='wd';s.textContent=t;fr.append(s)});n.replaceWith(fr)}else n.childNodes.forEach(f)};[...el.childNodes].forEach(f);el.querySelectorAll('.wd').forEach((w,i)=>w.style.transitionDelay=i*70+'ms')}
$$('.line').forEach(wrapWords);
let tl=[];
function intro(){Aud.unlock();Aud.click();$('#missionBg').innerHTML=Scene.hero();show('mission');const m=$('#mission');m.className='stage';$$('.line').forEach(l=>l.classList.remove('on'));
 const at=(t,f)=>tl.push(setTimeout(f,t)),on=s=>$(s).classList.add('on'),off=s=>$(s).classList.remove('on');
 at(60,()=>m.classList.add('t0','t1'));at(900,()=>{on('#l1');on('#l2')});at(4200,()=>{off('#l1');off('#l2');m.classList.add('t2')});
 at(4600,()=>on('#l3'));at(8000,()=>{off('#l3');m.classList.add('t3')});at(8400,()=>on('#l4'));at(11000,()=>{off('#l4');on('#l5')});at(14000,toHub)}
$('#begin').onclick=intro;
$('#skip').onclick=()=>toHub();
function toHub(){tl.forEach(clearTimeout);tl=[];cT=cS=Math.min(N-1,firstOpen());markDone();show('cockpit')}
const firstOpen=()=>{for(let i=0;i<5;i++)if(!done.has(i))return i;return 0};

/* ---------- level select: a curved carousel with damped follow ---------- */
const N=5;let cT=0,cS=0,idle;const ANG=.4488;
$('#track').innerHTML=LV.map((l,i)=>'<article class="win" data-i="'+i+'"><div class="glass"><div class="wsvg">'+l.thumb(l.scene())+'</div><span class="lvn">LEVEL '+(i+1)+'</span><h2>'+l.k+'</h2><p>'+l.sub+'</p><button class="ex" data-i="'+i+'">Play</button></div></article>').join('');
$('#cdots').innerHTML=LV.map((l,i)=>'<i data-i="'+i+'" aria-label="Level '+(i+1)+': '+l.k+'"></i>').join('');
const unlocked=i=>i===0||done.has(i-1)||done.has(i);
function markDone(){$$('.win').forEach((w,i)=>{const g=w.querySelector('.glass');let c=g.querySelector('.chk'),k=g.querySelector('.lock');
 if(done.has(i)&&!c){c=document.createElement('b');c.className='chk';c.textContent='✓ Complete';g.append(c)}if(!done.has(i)&&c)c.remove();
 const lk=!unlocked(i);w.classList.toggle('locked',lk);if(lk&&!k){k=document.createElement('b');k.className='lock';k.textContent='LOCKED';g.append(k)}if(!lk&&k)k.remove();
 w.querySelector('.ex').textContent=lk?'Locked':done.has(i)?'Replay':'Play'})}
function setCock(v,snap){cT=clamp(v,0,N-1);clearTimeout(idle);if(!snap)idle=setTimeout(()=>{cT=Math.round(cT)},140)}
addEventListener('wheel',e=>{if(cur==='cockpit')setCock(cT+(e.deltaY+e.deltaX)/320)},{passive:true});
let sx=null,sc=0;addEventListener('pointerdown',e=>{sx=e.clientX;sc=cT});
addEventListener('pointermove',e=>{if(sx!==null&&cur==='cockpit'&&Math.abs(e.clientX-sx)>6){clearTimeout(idle);cT=clamp(sc+(sx-e.clientX)/(innerWidth*.5),0,N-1)}});
addEventListener('pointerup',()=>{if(sx!==null&&cur==='cockpit')cT=Math.round(cT);sx=null});
addEventListener('keydown',e=>{if(cur==='cockpit'){if(e.key==='ArrowRight')setCock(Math.round(cT)+1,1);if(e.key==='ArrowLeft')setCock(Math.round(cT)-1,1)}});
$$('#cdots i').forEach(d=>d.onclick=()=>setCock(+d.dataset.i,1));
$$('#track .ex').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;if(!unlocked(i)){Aud.deny();$('#hubTip').textContent='Finish the previous level first.';return}Aud.click();const win=b.closest('.win');$('#track').classList.add('zooming');win.classList.add('zoom');setTimeout(()=>{openLevel(i);$('#track').classList.remove('zooming');win.classList.remove('zoom')},620)});
function renderCock(){const w0=$('.win'),sp=(w0?w0.offsetWidth:600)+Math.min(90,innerWidth*.07);
 $$('.win').forEach((el,i)=>{const o=i-cS;el.style.transform='translate(-50%,-50%) translateX('+o*sp+'px) translateZ('+(-Math.abs(o)*60)+'px) rotateY('+(-o*ANG)+'rad)';el.style.filter='brightness('+(1-Math.min(1,Math.abs(o))*.18)+')'});
 const r=Math.round(cS);$$('#cdots i').forEach((d,k)=>d.classList.toggle('on',r===k))}

/* ---------- play: shared frame ---------- */
const pbg=$('#pbg');let level=-1,tourOn=false;
function openLevel(i){level=i;const L=LV[i];G.clock=i===0?22*60:G.clock;panelOff();$('#cmp').classList.add('off');$('#cmp').innerHTML='';
 pbg.innerHTML=L.bg();$('#lvTag').textContent=L.tag;$('#lvObj').textContent=L.obj;hud();show('play');
 setTimeout(()=>[L1,L2,L3,L4,L5][i](),500)}
const finish=(i)=>{done.add(i);Aud.ok();burst(innerWidth/2,innerHeight*.5,26);setTimeout(()=>debrief(i),900)};

/* ---------- LEVEL 1: attach and understand ---------- */
const SRC=[{t:'PDF',n:'Maintenance manual',d:'Procedures and equipment references',loc:'sample-maintenance.pdf · p.4'},{t:'CSV',n:'Production table',d:'Assets, orders and cell membership',loc:'sample-orders.csv · row 4'},{t:'API',n:'System records',d:'Asset identities, suppliers, work orders',loc:'sample-mes.json · $.assets[3]'},{t:'SIG',n:'Telemetry stream',d:'Timestamped weld resistance',loc:'sample-signal-stream · t=312'}];
const NODES=[['ASSET','W-ST-3  ?','PDF p.4 · CSV row 4',true],['PRODUCT','LOT-SIM-01','CSV row 12'],['PROCEDURE','PR-04 weld service','PDF p.4'],['ORDER','ORD-17','JSON $.orders[2]'],['SUPPLIER','SUP-01','JSON $.suppliers[0]']];
function L1(){
 const cmp=$('#cmp');cmp.classList.remove('off');
 cmp.innerHTML='<div class="srcs">'+SRC.map((s,i)=>'<button class="srcb" data-i="'+i+'"><b>'+s.t+'</b><span>'+s.n+'</span><small>'+s.d+'</small></button>').join('')+'</div><div class="corewrap" id="coreWrap"><svg viewBox="-130 -130 260 260">'+Iso.defs+Scene.core(0,0,1.1)+'</svg></div><svg id="cmpLines"></svg><div id="cmpNodes"></div>';
 say('I am the Core. Four sources are waiting. Click each one and I will fold it into a model.');
 let docked=0;
 $$('.srcb').forEach(b=>b.onclick=()=>{if(b.classList.contains('dock'))return;Aud.click();const cw=$('#coreWrap').getBoundingClientRect(),br=b.getBoundingClientRect();
  b.style.setProperty('--tx',(cw.left+cw.width/2-br.left-br.width/2)+'px');b.style.setProperty('--ty',(cw.top+cw.height/2-br.top-br.height/2)+'px');b.classList.add('dock');Aud.whoosh();
  setTimeout(()=>{burst(cw.left+cw.width/2,cw.top+cw.height/2,10);const c=$('#coreWrap');c.classList.remove('pulse');void c.offsetWidth;c.classList.add('pulse');docked++;addTime(1);trust(1);Aud.tick();
   if(docked===1)say('The first source is in. Facts keep their origin: file, page, row.');
   if(docked===4)L1nodes()},760)});
}
function L1nodes(){
 const cmp=$('#cmp'),cr=cmp.getBoundingClientRect(),cw=$('#coreWrap').getBoundingClientRect(),cx=cw.left+cw.width/2-cr.left,cy=cw.top+cw.height/2-cr.top,R=Math.min(230,cr.width*.2);
 const ang=[-92,-22,48,132,202];let lines='',nodes='';
 NODES.forEach((n,i)=>{const a=ang[i]*Math.PI/180,x=cx+R*1.35*Math.cos(a),y=cy+R*.95*Math.sin(a);
  lines+='<line id="ln'+i+'" x1="'+cx+'" y1="'+cy+'" x2="'+x+'" y2="'+y+'"/>';
  nodes+='<div class="nd'+(n[3]?' q':'')+'" id="nd'+i+'" style="left:'+x+'px;top:'+y+'px;animation-delay:'+(i*.18)+'s"><small>'+n[0]+'</small><b>'+n[1]+'</b><em>'+n[2]+'</em></div>'});
 $('#cmpLines').setAttribute('viewBox','0 0 '+cr.width+' '+cr.height);$('#cmpLines').innerHTML=lines;$('#cmpNodes').innerHTML=nodes;Aud.ok();
 say('Model built: five entities, each tied to a source. But one thing I will not guess.');
 setTimeout(L1alias,1300);
}
function L1alias(){
 let wrong=false;
 const draw=()=>panel('<small class="k">DECISION FOR YOU</small><h3>Which station is “W-ST-3”?</h3><p>Two sources use this alias. A proposed match is not a confirmed fact, so the Core is asking.</p>'
  +'<div class="evc">PDF p.4: “W-ST-3 laser head, replace optics every 8 weeks.”<code>sample-maintenance.pdf</code></div><div class="evc">CSV row 4: asset W-ST-3, signal weld_resistance_mohm.<code>sample-orders.csv</code></div><div class="evc">CSV row 9: asset W-ST-7, signal camera_exposure.<code>sample-orders.csv</code></div>'
  +'<button class="opt" data-a="L"><span class="tg ai">AI PROPOSAL</span><b>LASER-WELD</b><span>The weld station.</span></button><button class="opt" data-a="V" '+(wrong?'disabled':'')+'><span class="tg ai">AI PROPOSAL</span><b>VISION-INSPECTION</b><span>The camera arch.</span></button>');
 draw();
 const bind=()=>$$('.opt').forEach(o=>o.onclick=()=>{Aud.click();
  if(o.dataset.a==='V'){wrong=true;G.wrongCells+=0;trust(-8);addTime(2);Aud.deny();$('#nd0').querySelector('b').textContent='VISION-INSPECTION';
   say('Conflict. The weld-resistance signal in row 4 belongs to the laser head. I have flagged your mapping; review it.');
   P.querySelector('.opt[data-a=V]').disabled=true;P.insertAdjacentHTML('beforeend',rec('den','CONFLICT FLAGGED','The signal weld_resistance_mohm cannot come from a camera station. The mapping stays open until you confirm one.','finding F-01 invalidated · 1 dependent relationship reopened'));G.dec.aliasWrong=true;return}
  /* correct mapping */
  $('#nd0').classList.remove('q');$('#nd0').classList.add('fixed');$('#nd0').querySelector('b').textContent='LASER-WELD';$('#ln0').classList.add('fix');burstAt($('#nd0'));Aud.ok();trust(5);G.dec.alias='LASER-WELD';
  say(wrong?'Fixed. I rewired the model and re-checked every fact that used the old mapping.':'Confirmed. Your decision is recorded with your name on it, and the graph is final.');
  panel('<small class="k">LEVEL 1 COMPLETE</small><h3>The model is compiled.</h3><p>Five entities. Every fact points at a source. One ambiguity resolved by a person.</p>'+rec('ok','MAPPING SAVED','W-ST-3 → LASER-WELD. Dependent relationships updated: 3.','actor: shift lead · prior value: ambiguous')+'<div class="btnrow"><button class="pbtn" id="go">Continue <span>→</span></button></div>');
  $('#go').onclick=()=>{Aud.click();finish(0)}});
 bind();
}

/* ---------- LEVEL 2: investigate ---------- */
const EVID=[['Station reading','LASER-WELD reports weld resistance above the 0.55 mΩ threshold since 14:20. Synthetic measurement.','telemetry · sample 312'],['Technician note','“After the shift change the fixture clamp felt loose, near the middle of module A.” Attributed to M. Okafor.','note N-04 · author: M. Okafor'],['Serial scan','Cells 1–8 are in module A. Cells 9–16 are in module B. Both modules feed pack P1.','genealogy · LOT-SIM-01']];
function L2(){
 const got=new Set();
 say('A weld is drifting. Open all three pieces of evidence before you accuse a cell.');
 panel('<small class="k">STEP 1 OF 3</small><h3>Collect the evidence</h3><p>Every claim needs a source. Open all three.</p><div class="ev">'+EVID.map((e,i)=>'<button data-e="'+i+'"><i></i>'+e[0]+'</button>').join('')+'</div><div id="evb"></div><div class="btnrow"><button class="pbtn" id="nx" disabled>Find the drifting cell <span>→</span></button></div>');
 $$('.ev button').forEach(b=>b.onclick=()=>{Aud.click();const i=+b.dataset.e;b.classList.add('got');if(!got.has(i)){got.add(i);G.evidence++;trust(3);addTime(1)}
  $('#evb').innerHTML='<div class="evc">'+EVID[i][1]+'<code>'+EVID[i][2]+'</code></div>';
  if(got.size===3){$('#nx').disabled=false;say('Evidence in hand. Now find the cell. The Core can read the numbers, but you decide what to flag.')}});
 $('#nx').onclick=()=>{Aud.click();L2cells()};
}
function L2cells(){
 const flagged=new Set();
 panel('<small class="k">STEP 2 OF 3</small><h3>Find the drifting weld</h3><p>Hover a cell to read its weld resistance. Flag the one above the threshold.</p><div class="mlab"><span>MODULE A · CELLS 1–8</span><span>THRESHOLD '+lot.T+' mΩ</span></div><div class="cg" id="cgA"></div><div class="mlab"><span>MODULE B · CELLS 9–16</span></div><div class="cg" id="cgB"></div><div class="rd" id="rd">Hover a cell.</div>');
 lot.cells.forEach(c=>{const b=document.createElement('button');b.textContent=c.i+1;b.setAttribute('aria-label','Cell '+(c.i+1));
  b.onmouseenter=b.onfocus=()=>{$('#rd').textContent='Cell '+(c.i+1)+' · '+c.R.toFixed(3)+' mΩ'+(c.R>lot.T?'  ABOVE THRESHOLD':'')};
  b.onclick=()=>{Aud.click();if(flagged.has(c.i))return;flagged.add(c.i);
   if(c.i===lot.bad){b.classList.add('bad');Aud.ok();burstAt(b);trust(4);say('Cell 6. That matches the clamp note and the reading. Now decide how much to hold.');setTimeout(L2contain,900)}
   else{b.classList.add('chk2');b.disabled=true;G.wrongCells++;trust(-3);addTime(3);Aud.deny();$('#rd').textContent='Cell '+(c.i+1)+' reads '+c.R.toFixed(3)+' mΩ. Within spec. +3 min.';say('That one reads inside spec. Checking cells at random costs shift time.')}};
  (c.i<8?$('#cgA'):$('#cgB')).append(b)});
}
function L2contain(){
 panel('<small class="k">STEP 3 OF 3</small><h3>Decide what to hold</h3><p>Cell 6 sits in module A, which feeds pack P1. Holding more is safe but costs throughput. Holding less is a bet.</p>'
  +'<button class="opt" data-h="lot"><b>Hold the whole lot</b><span>16 cells, 2 modules and the pack: 19 units on hold.</span></button>'
  +'<button class="opt" data-h="modA"><b>Hold module A and the pack</b><span>The module with the weld and the pack it feeds: 10 units on hold.</span></button>'
  +'<button class="opt" data-h="cell"><b>Hold only the flagged cell</b><span>1 unit on hold. The rest keeps moving.</span></button>');
 $$('.opt').forEach(o=>o.onclick=()=>{Aud.click();const h=o.dataset.h;$$('.opt').forEach(x=>x.disabled=true);
  const units=lot.units[h];hold(units);G.dec.hold=h;addTime(2);let msg,kind='ok',title='CONTAINED';
  if(h==='lot'){trust(0);G.escapes+=0;msg='Nothing can escape, and 19 units are waiting. Safe, and slow.';say('Safe. It costs the most throughput, so keep an eye on the clock.')}
  if(h==='modA'){trust(6);msg='Module A and pack P1 are held, matching the genealogy. Module B can move once the pack is clear.';say('That matches the genealogy exactly. Efficient and safe.')}
  if(h==='cell'){trust(-10);G.escapes+=4;kind='den';title='ESCAPES';msg='Module A and pack P1 still carry the weld, and cells 5 and 7 sit at 0.52 and 0.53 mΩ. 4 units would ship with a weld at or near threshold.';Aud.deny();say('Risky. Cells 5 and 7 share that fixture, and the module and pack still carry the weld.')}
  P.insertAdjacentHTML('beforeend',rec(kind,title,msg,'held: '+units+' units · hold scope: '+h)+'<div class="btnrow"><button class="pbtn" id="go">Continue <span>→</span></button></div>');$('#go').onclick=()=>{Aud.click();finish(1)}});
}

/* ---------- LEVEL 3: govern ---------- */
function dials(into,onApply,hintText){
 const b=Sim.BAND;const pct=(v,lo,hi)=>((v-lo)/(hi-lo)*100);
 into.innerHTML='<div class="dial"><label>Laser power <span id="pv">2.70 kW</span></label><input type="range" id="pw" min="2" max="3.4" step="0.05" value="2.7"><div class="band"><i style="left:'+pct(b.p[0],2,3.4)+'%;width:'+(pct(b.p[1],2,3.4)-pct(b.p[0],2,3.4))+'%"></i></div></div>'
  +'<div class="dial"><label>Dwell time <span id="dv">55 ms</span></label><input type="range" id="dw" min="30" max="80" step="1" value="55"><div class="band"><i style="left:'+pct(b.d[0],30,80)+'%;width:'+(pct(b.d[1],30,80)-pct(b.d[0],30,80))+'%"></i></div></div>'
  +'<p class="pp" style="margin-top:8px">Green is the band policy allows. Inside it, some settings work better than others.'+(hintText?' '+hintText:'')+'</p><div id="dres"></div><div class="btnrow"><button class="pbtn" id="ap">Request this correction <span>→</span></button></div>';
 const pw=$('#pw'),dw=$('#dw');pw.oninput=()=>{$('#pv').textContent=(+pw.value).toFixed(2)+' kW';Aud.tick()};dw.oninput=()=>{$('#dv').textContent=dw.value+' ms';Aud.tick()};
 $('#ap').onclick=()=>{Aud.click();const p=+pw.value,d=+dw.value,ck=Sim.check(p,d);
  if(!ck.ok){deny();addTime(3);trust(1);$('#dres').innerHTML=rec('den','DENIED · parameter bounds',ck.why,'gate: parameter_bounds · policy v1 · persisted');say('Denied. The band is fixed by policy. I can propose; I cannot widen it.');G.dec.boundsHit=(G.dec.boundsHit||0)+1;return}
  onApply(p,d)}
}
function L3(){
 const tried={};
 say('I can propose three responses. Policy decides which of them can run. Pick one.');
 panel('<small class="k">THE CORE PROPOSES</small><h3>Choose a response</h3><p>The weld is out of tolerance and module A is on hold.</p>'
  +'<button class="opt" data-o="bypass"><span class="tg ai">AI PROPOSAL</span><b>Release now, skip the retest</b><span>Get the line moving. 0 minutes.</span></button>'
  +'<button class="opt" data-o="fix"><span class="tg ai">AI PROPOSAL</span><b>Apply a bounded weld correction</b><span>Re-run the weld with settings you choose, inside the allowed band.</span></button>'
  +'<button class="opt" data-o="thr"><span class="tg ai">AI PROPOSAL</span><b>Raise the threshold to 0.80 mΩ</b><span>The lot would pass as it is.</span></button><div id="res"></div>');
 $$('.opt').forEach(o=>o.onclick=()=>{Aud.click();const k=o.dataset.o;
  if(k==='bypass'){deny();addTime(3);trust(2);G.dec.bypass=true;o.disabled=true;$('#res').insertAdjacentHTML('afterbegin',rec('den','DENIED · release before retest','Gate failed: no passing retest on record. The decision is persisted with scope, actor and policy version.','gate: postcondition_required · policy v1'));say('Denied, and recorded. A release needs a passing retest first.')}
  if(k==='thr'){deny();addTime(3);trust(2);G.dec.threshold=true;o.disabled=true;$('#res').insertAdjacentHTML('afterbegin',rec('den','DENIED · policy rules are fixed','Neither the model nor this request can change a policy rule. Only an authorized human process can.','gate: policy_immutable · policy v1'));say('Denied. I am not allowed to move the goalposts, and neither is this request.')}
  if(k==='fix'){$$('.opt').forEach(x=>x.disabled=true);say('Good. Choose the settings. Policy only allows the green band.');const box=document.createElement('div');$('#res').append(box);
   dials(box,(p,d)=>{G.params={p,d};G.dec.params=p.toFixed(2)+' kW / '+d+' ms';G.attempts++;Aud.ok();burstAt($('#ap'));addTime(4);trust(4);
    box.insertAdjacentHTML('beforeend',rec('ok','PERMITTED · bounded correction','Gates passed: parameter bounds, scope, actor. Executed through the broker, in the simulator.','power '+p.toFixed(2)+' kW · dwell '+d+' ms · event recorded')+'<div class="btnrow"><button class="pbtn" id="go">Continue <span>→</span></button></div>');$('#ap').disabled=true;$('#go').onclick=()=>{Aud.click();finish(2)};say('Executed. A correction is not a recovery yet. Next we measure it.')})}
 });
}

/* ---------- LEVEL 4: verify ---------- */
function L4(){
 let ticks=0,tested=false,keyBusy=false;
 const bars=(cells,hot)=>'<div class="mb"><div class="thr" style="bottom:'+(lot.T/0.9*100*1.0+8)+'px"><em>0.55</em></div>'+cells.map(c=>'<span class="'+(c.R>lot.T?'hot':'')+'" style="--h:'+clamp(c.R/0.9,.05,1)*100+'%" title="Cell '+(c.i+1)+': '+c.R.toFixed(3)+'"></span>').join('')+'</div>';
 say('The correction ran. Now the simulator must run through its observation window. Advance the clock.');
 const main=()=>{panel('<small class="k">OBSERVATION WINDOW</small><h3>Let it settle, then measure</h3><p>A retest only counts after the window. Each step is 10 simulated minutes.</p><div class="pips"><i></i><i></i><i></i></div><div class="btnrow"><button class="pbtn" id="adv">Advance 10 minutes <span>▸</span></button><button class="pbtn alt" id="rt" disabled>Run the retest</button></div><div id="mres"></div>'
  +'<button class="key" id="key"><u></u><svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="#e4b977" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="15" r="5"/><path d="M15 15H27M23 15v5M27 15v4"/></svg><span>Hold to turn the key: request release<small>Only a person can do this. Hold for one second.</small></span></button><div id="kres"></div>');
  $('#adv').onclick=()=>{if(ticks>=3)return;Aud.tick();ticks++;addTime(10);$$('.pips i').forEach((x,i)=>x.classList.toggle('on',i<ticks));if(ticks===3){$('#adv').disabled=true;$('#rt').disabled=false;say('The window is complete. Run the retest and read the measurement.')}};
  $('#rt').onclick=()=>{Aud.click();$('#rt').disabled=true;const r=Sim.retest(lot,G.params.p,G.params.d);tested=true;const modA=lot.cells.slice(0,8);
   $('#mres').innerHTML='<p class="pp" style="margin-top:12px">Module A weld resistance, before then after (mΩ):</p>'+bars(modA)+bars(r.cells.slice(0,8));
   setTimeout(()=>{$$('#mres .mb')[1].querySelectorAll('span').forEach(s=>s.style.opacity=1)},50);
   const resultCell=r.cells[lot.bad];
   if(r.pass){G.passed=true;Aud.ok();trust(5);G.dec.R=r.R;$('#mres').insertAdjacentHTML('beforeend',rec('ok','PASS',"Cell 6 now measures "+r.R.toFixed(3)+" mΩ, inside the 0.55 limit. The lot stays on hold until a separate release.",'measured · observation window complete'));say('Pass. Cell 6 is back in spec. That is a measurement, not a hope. Release is still your call.')}
   else{Aud.deny();trust(-2);G.attempts++;$('#mres').insertAdjacentHTML('beforeend',rec('den','FAIL',"Cell 6 still measures "+r.R.toFixed(3)+" mΩ, above the 0.55 limit. The setting was allowed, but it did not fix the weld. Try nearer the middle of the band.",'measured · observation window complete')+'<div class="btnrow"><button class="pbtn" id="again">Adjust the correction <span>↺</span></button></div>');say('Fail. The setting was legal, but it did not work. That is why we measure. Try again.');
    $('#again').onclick=()=>{Aud.click();retry()}}};
  holdKey()};
 const retry=()=>{panel('<small class="k">ADJUST THE CORRECTION</small><h3>Try different settings</h3><p>Last attempt: '+G.params.p.toFixed(2)+' kW and '+G.params.d+' ms.</p><div id="rb"></div>');
  dials($('#rb'),(p,d)=>{G.params={p,d};G.dec.params=p.toFixed(2)+' kW / '+d+' ms';Aud.ok();addTime(4);ticks=0;tested=false;main();say('Executed again. Run the observation window and measure.')},'Hint: the best setting is near the middle of the green.')};
 const holdKey=()=>{const key=$('#key'),bar=key.querySelector('u');let t=null,t0=0;
  const start=()=>{if(keyBusy)return;t0=performance.now();bar.style.transition='width 1s linear';bar.style.width='100%';t=setTimeout(release,1000)};
  const stop=()=>{clearTimeout(t);bar.style.transition='width .25s';bar.style.width='0'};
  key.onpointerdown=e=>{e.preventDefault();start()};key.onpointerup=key.onpointerleave=stop;
  key.onkeydown=e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();start()}};key.onkeyup=stop;
  const release=()=>{bar.style.transition='width .25s';bar.style.width='0';
   if(!G.passed){deny();addTime(3);G.dec.earlyRelease=true;$('#kres').innerHTML=rec('den','DENIED · release before a passing retest','Gate failed: no passing retest on record. The key does not override the gate.','gate: postcondition_required · policy v1');say('Denied. Even with your key, release needs a passing retest. That is the boundary working.');return}
   keyBusy=true;Aud.ok();burstAt(key);G.dispatched=G.held;G.dec.release=G.held;const n=G.held;hold(0);addTime(5);trust(5);
   $('#kres').innerHTML=rec('ok','RELEASED · scoped supervisor decision',n+' units released by you, then dispatched. Both steps are recorded.','actor: shift lead · scope: LOT-SIM-01 · dispatch event recorded')+'<div class="btnrow"><button class="pbtn" id="go">Continue <span>→</span></button></div>';say('Released and dispatched. Verified before released. That order is the whole point.');$('#go').onclick=()=>{Aud.click();finish(3)}}};
 main();
}

/* ---------- LEVEL 5: adapt and learn ---------- */
function L5(){
 const o=Sim.plan.options,prefs={A:.5,B:.5,C:.2,D:.5};
 say('Bad news from purchasing. SUP-01 slipped by eight hours. The order is due in six.');
 panel('<small class="k">THE WORLD CHANGED</small><h3>Supplier SUP-01 is 8 hours late</h3><p>ORD-17 needs 16 cells in 6 hours. Stock on hand: 10. The delayed delivery brings 12 more, 8 hours from now.</p>'
  +'<button class="opt" data-p="D"><span class="tg rk">CORE RANKS #1</span><b>'+o.D.name+'</b><span>'+o.D.note+'</span></button>'
  +'<button class="opt" data-p="B"><span class="tg rk">CORE RANKS #2</span><b>'+o.B.name+'</b><span>'+o.B.note+'</span></button>'
  +'<button class="opt" data-p="A"><span class="tg rk">CORE RANKS #3</span><b>'+o.A.name+'</b><span>'+o.A.note+'</span></button>'
  +'<button class="opt" data-p="C"><span class="tg ai">AI PROPOSAL</span><b>'+o.C.name+'</b><span>16 on time, 0 late.</span></button><div id="res"></div>');
 $$('.opt').forEach(b=>b.onclick=()=>{Aud.click();const k=b.dataset.p,op=o[k];
  if(op.policy==='deny'){deny();addTime(2);trust(1);b.disabled=true;G.dec.gradeB=true;$('#res').innerHTML=rec('den','DENIED · grade policy',op.note+' The Core ranks only options that policy allows.','gate: grade_requirement · policy v1');say('Denied. I should not have been offered that as a plan, and I will weigh it down next time.');prefs.C=Math.max(0,prefs.C-.15);return}
  $$('.opt').forEach(x=>x.disabled=true);G.plan=k;G.dec.plan=op.name;addTime(k==='A'?30:12);
  const score=op.onTime/Sim.plan.need;trust(score>=.6?6:2);Aud.ok();burstAt(b);
  prefs[k]=Math.min(1,prefs[k]+.1+.3*score);
  const rows=Object.keys(o).filter(x=>x!=='C').map(x=>'<div><span>'+o[x].name+'</span><span><i style="width:'+Math.round(prefs[x]*100)+'%"></i></span></div>').join('');
  G.prefs=prefs;
  say(k==='D'?'That keeps every unit on time and the rules intact. I will prefer plans like it.':k==='B'?'Ten on time, six late. A reasonable compromise, and I have noted it.':'Everything arrives late. Allowed, but I will weigh it down next time.');
  $('#res').innerHTML=rec(score>=.6?'ok':'den','PLAN COMMITTED',op.name+': '+op.onTime+' of '+Sim.plan.need+' on time, '+op.late+' late.','measured against the declared plan · policy unchanged')
   +'<p class="pp" style="margin-top:12px"><b>Core preference update</b> (allowed options only, from measured outcomes)</p><div class="prefs">'+rows+'</div><div class="btnrow"><button class="pbtn" id="go">Finish the shift <span>→</span></button></div>';
  $('#go').onclick=()=>{Aud.click();finish(4)}});
}

/* ---------- debrief ---------- */
function debrief(i){
 const L=LV[i],d=G.dec;let tol,human;
 if(i===0){tol=['Parsed four supported source types','Built 5 entities, each with a source locator','Refused to guess the ambiguous alias'];human=[d.aliasWrong?'Corrected the mapping after the Core flagged a conflict':'Resolved the alias correctly the first time','Confirmed W-ST-3 is the LASER-WELD station']}
 if(i===1){tol=['Surfaced three pieces of attributed evidence','Traced the lot from cell to module to pack','Kept causes marked as proposed, not verified'];human=['Found the drifting cell (cell 6)'+(G.wrongCells?' after '+G.wrongCells+' wrong flag'+(G.wrongCells>1?'s':''):' with no wrong flags'),{lot:'Held the whole lot (19 units)',modA:'Held module A and the pack (10 units)',cell:'Held only the flagged cell, and let 4 units escape'}[d.hold]]}
 if(i===2){const den=[d.bypass&&'the early release',d.threshold&&'the threshold change'].filter(Boolean);tol=['Proposed three options','Denied '+(den.length?den.join(' and '):'nothing, because you did not try the bypass'),'Ran the bounded correction through the broker'];human=['Chose settings '+d.params,d.boundsHit?'Pushed outside the band '+d.boundsHit+' time'+(d.boundsHit>1?'s':'')+' and was denied':'Stayed inside the allowed band']}
 if(i===3){tol=['Advanced the simulator through the observation window','Measured cell 6: '+(d.R?d.R.toFixed(3)+' mΩ, PASS':'see report'),'Kept the outcome as verified history'];human=[d.earlyRelease?'Tried the key too early and was denied':'Waited for the measurement','Released '+(d.release||0)+' units with the key, then dispatched']}
 if(i===4){tol=['Ranked only options that policy allows','Denied the grade-violating pull'+(d.gradeB?' you tried':''),'Updated its preference from the measured outcome'];human=['Chose “'+d.plan+'”',G.plan==='D'?'Kept every unit on time and the rules intact':G.plan==='B'?'Accepted 6 late units to stay inside the rules':'Accepted a late order to stay inside the rules']}
 $('#dTag').textContent='LEVEL '+(i+1)+' COMPLETE · '+L.k.toUpperCase();$('#dT').textContent=['The model is yours to correct.','Evidence first.','Authority stays independent.','Measured. Then released.','Adapted inside the rules.'][i];$('#dP').textContent=['The Core compiled it. You made the call it could not.','You held what you had to, and no more.','Some requests were denied. Every denial left a record.','A pass did not release anything. You did.','The world changed and the policy did not.'][i];
 $('#dArt').innerHTML='<div class="two"><div><b>Tolerance did</b><ul>'+tol.map(x=>'<li>'+x+'</li>').join('')+'</ul></div><div><b>You decided</b><ul>'+human.map(x=>'<li>'+x+'</li>').join('')+'</ul></div></div>';
 $('#dGo').textContent=done.size>=5?'See your shift report':'Back to the levels';show('done');
}
$('#dGo').onclick=()=>{Aud.click();if(done.size>=5){report();return}markDone();cT=cS=Math.min(N-1,firstOpen());show('cockpit')};

/* ---------- shift report ---------- */
function report(){
 const used=G.clock-22*60,d=G.dec;
 const badges=[['Evidence first',G.evidence>=3&&G.wrongCells===0],['Boundary tested',G.denied>=1],['Clean containment',G.escapes===0],['Verified before release',G.passed&&G.dispatched>0],['Adapted within policy',G.plan&&Sim.plan.options[G.plan].onTime>=10]];
 $('#rT').textContent=G.escapes===0&&G.denied>=1?'A careful shift.':'Shift complete.';
 $('#rS').textContent='You and the Core recovered the line in '+Math.floor(used/60)+' h '+String(used%60).padStart(2,'0')+' min of simulated time. The Core saw and proposed. You held the key.';
 $('#rStats').innerHTML=[[Math.floor(used/60)+'h '+used%60+'m','SHIFT TIME'],[G.peak,'PEAK UNITS HELD'],[G.escapes,'UNITS ESCAPED'],[G.denied,'ACTIONS DENIED'],[Math.round(G.trust)+'%','EVIDENCE TRUST']].map(s=>'<div><b>'+s[0]+'</b><small>'+s[1]+'</small></div>').join('');
 $('#rBadges').innerHTML=badges.map(b=>'<span class="'+(b[1]?'on':'')+'">'+(b[1]?'✓ ':'')+b[0]+'</span>').join('');
 $('#rCols').innerHTML='<div><b>What Tolerance did</b><ul><li>Compiled four sources into a model with provenance</li><li>Proposed options, and ranked only allowed ones</li><li>Executed through an independent gate and measured the result</li><li>Kept the outcome as history and updated its preference</li></ul></div><div><b>What you decided</b><ul><li>Which station “W-ST-3” really is</li><li>'+({lot:'Hold the whole lot',modA:'Hold module A and the pack',cell:'Hold only the cell'}[d.hold]||'What to hold')+'</li><li>Settings '+(d.params||'')+'</li><li>The release, then the plan: '+(d.plan||'')+'</li></ul></div>';
 show('final');setTimeout(()=>{for(let k=0;k<5;k++)setTimeout(()=>burst(innerWidth*(.2+Math.random()*.6),innerHeight*(.3+Math.random()*.3),20),k*240)},500);
}
$('#replay').onclick=()=>{Aud.click();G=G0();done.clear();lot=Sim.lot(7);hud();toHub()};

/* ---------- loop: parallax in play, damped carousel in the hub ---------- */
let mx=.5,my=.5,px=.5,py=.5,last=performance.now();
addEventListener('mousemove',e=>{mx=e.clientX/innerWidth;my=e.clientY/innerHeight});
(function loop(now){const dt=Math.min(.25,(now-last)/1000);last=now;
 if(cur==='play'){px+=(mx-px)*damp(3.2,dt);py+=(my-py)*damp(3.2,dt);pbg.style.transform='translate3d('+(-(px-.5)*2*46)+'px,'+(-(py-.5)*2*26)+'px,0)'}
 if(cur==='cockpit'){cS+=(cT-cS)*damp(6,dt);if(Math.abs(cT-cS)<1e-4)cS=cT;renderCock()}
 requestAnimationFrame(loop)})(last);
markDone();

/* ---------- the 60-second tour: the same game, played for you, with captions ---------- */
const cap=$('#tourCap');
const say2=t=>{cap.innerHTML=t+' <button class="textlink" id="stopTour" style="margin-left:10px;font-size:12px;color:#19251f;text-decoration:underline">Stop tour</button>';cap.classList.remove('off');const b=$('#stopTour');if(b)b.onclick=()=>{tourOn=false;cap.classList.add('off')}};
const waitFor=async(sel,ms=6000)=>{const t0=Date.now();while(Date.now()-t0<ms&&tourOn){const e=document.querySelector(sel);if(e&&!e.disabled&&e.offsetParent!==null)return e;await sleep(120)}return null};
const clickWhen=async(sel,pause=700)=>{const e=await waitFor(sel);if(!e||!tourOn)return false;e.click();await sleep(pause);return true};
async function tour(){
 if(tourOn)return;tourOn=true;G=G0();done.clear();lot=Sim.lot(7);hud();Aud.unlock();
 say2('Tolerance is a symbiotic compiler for factories. You are the person with the key.');
 $('#missionBg').innerHTML=Scene.hero();show('mission');const m=$('#mission');m.className='stage t0 t1';await sleep(2600);if(!tourOn)return;
 toHub();await sleep(900);
 say2('Level 1. The Core compiles four sources, then asks you about one ambiguous fact.');openLevel(0);await sleep(1700);
 for(const i of [0,1,2,3]){if(!await clickWhen('.srcb:not(.dock)',900))return}
 if(!await waitFor('.opt[data-a=L]',8000))return;await sleep(1500);say2('You decide which station “W-ST-3” is. A proposed match is not a confirmed fact.');await clickWhen('.opt[data-a=L]',1500);await clickWhen('#go',900);await sleep(1500);
 if(!tourOn)return;say2('Level 2. Evidence first, then find the drifting weld and hold only what you must.');
 await clickWhen('#dGo',500);await waitFor('.win',3000);openLevel(1);await sleep(1500);
 for(const i of [0,1,2]){if(!await clickWhen('.ev button:not(.got)',650))return}
 await clickWhen('#nx',900);if(!await waitFor('#cgA button',4000))return;await sleep(700);const bad=$$('#cgA button')[5];if(bad&&tourOn)bad.click();await sleep(1700);
 await clickWhen('.opt[data-h=modA]',900);await clickWhen('#go',900);await sleep(1500);
 if(!tourOn)return;say2('Level 3. Policy denies a bypass, then runs a bounded correction.');
 await clickWhen('#dGo',500);openLevel(2);await sleep(1500);
 await clickWhen('.opt[data-o=bypass]',1500);await clickWhen('.opt[data-o=fix]',1000);
 {const pw=await waitFor('#pw');if(pw){pw.value=3.35;pw.dispatchEvent(new Event('input'))}}await clickWhen('#ap',1500);
 {const pw=$('#pw');if(pw){pw.value=2.7;pw.dispatchEvent(new Event('input'))}}await clickWhen('#ap',1200);await clickWhen('#go',900);await sleep(1500);
 if(!tourOn)return;say2('Level 4. Wait for the measurement. A pass does not release anything. The key does.');
 await clickWhen('#dGo',500);openLevel(3);await sleep(1500);
 for(let i=0;i<3;i++)await clickWhen('#adv',600);await clickWhen('#rt',1600);
 {const k=await waitFor('#key');if(k&&tourOn){k.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));await sleep(1200);}}
 await clickWhen('#go',900);await sleep(1500);
 if(!tourOn)return;say2('Level 5. The world changes. The Core ranks only options policy allows.');
 await clickWhen('#dGo',500);openLevel(4);await sleep(1500);
 await clickWhen('.opt[data-p=D]',1700);await clickWhen('#go',900);await sleep(1500);
 await clickWhen('#dGo',900);say2('That is the symbiosis: the Core sees and proposes. You decide and hold the key.');await sleep(4500);cap.classList.add('off');tourOn=false;
}
$('#tour').onclick=tour;
