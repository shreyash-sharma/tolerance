/* Tolerance: enter the factory. An illustrated brochure journey. Activities are illustrative; the product runs them against its simulator. */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),damp=(k,dt)=>1-Math.exp(-k*dt);
let cur='loader';
const show=id=>{$$('.stage').forEach(s=>s.classList.toggle('hidden',s.id!==id));cur=id};

/* ---------- world content ---------- */
const prW=Iso.P(800,330),prG=Iso.P(800,360),prR=Iso.P(800,340);
const W=[
 {k:'Investigate',sub:'Which products did the fault touch?',scene:()=>Scene.weld(),pr:prW,
  q:'Which products did the fault touch?',a:'A weld drifted out of tolerance. Before anyone acts, trace the affected cells, modules and pack from the genealogy, and keep observed symptoms apart from proposed causes.',
  intro:'Find the evidence',
  marks:[['LASER-WELD',[.65,.15,2.9],'The weld station reported resistance above its threshold. Source measurements, thresholds and observation time are shown, and marked synthetic.'],
         ['Technician note',[-2.5,0,1.3],'Notes keep their author. Attributed evidence reaches the investigation together with its source.'],
         ['Genealogy',[4.2,0,1.3],'The affected set comes from membership joins: cells, modules and the pack, traced in both directions.']],
  target:['Trace the lot',[1.25,-.5,1.5]],act:'trace',
  done:{tag:'INVESTIGATE COMPLETE',t:'Evidence first.',p:'The affected set is known, and every claim points to a source.',tol:['Traced the affected cells, modules and pack from membership joins','Attached every claim to its source','Kept causes marked as proposed, not verified'],human:['Chose which lot to contain','Added the technician note, with a name on it']}},
 {k:'Govern',sub:'Can the response be trusted?',scene:()=>Scene.gate(),pr:prG,
  q:'Can the response be trusted?',a:'Every proposal meets a boundary. See an early release denied, then watch a bounded correction pass independent policy.',
  intro:'Find the boundary',
  marks:[['Independent policy',[.2,2.7,3.9],'A separate, deterministic service decides. The model and the interface cannot approve themselves.'],
         ['Held release request',[-2.75,2.5,1.2],'Release before a passing retest is denied, and the denial is a persisted decision record.'],
         ['Permitted action',[2.85,2.5,1.2],'A bounded correction passes the gates and runs through the broker, inside the simulator.']],
  target:['Meet the boundary',[.2,2.7,3.1]],act:'govern',
  done:{tag:'GOVERN COMPLETE',t:'Authority stays independent.',p:'One request was denied. One was permitted. Both left a record.',tol:['Denied the early release and recorded why','Checked the correction against policy','Executed it through the broker, in the simulator'],human:['Chose the bounded correction','Kept the release decision for a person']}},
 {k:'Verify',sub:'Did it actually work?',scene:()=>Scene.retest(),pr:prR,
  q:'Did it actually work?',a:'Execution is only the beginning. Advance the simulator, measure the response, and keep release a separate human decision.',
  intro:'Find the measurement',
  marks:[['Measured retest',[-2.2,-.95,2.4],'Before and after weld resistance are measured after the required observation window.'],
         ['Supervisor release',[1,-.2,1.5],'A passing retest does not release product. A separate authorized decision does.'],
         ['Dispatch',[3.1,-.4,1.6],'Dispatch follows release and is recorded, so the outcome can be traced end to end.']],
  target:['Run the retest',[-2.2,-.95,2.1]],act:'verify',
  done:{tag:'VERIFY COMPLETE',t:'Measured. Then released.',p:'A passing retest, then a separate release, then dispatch.',tol:['Advanced the simulator through the observation window','Measured resistance before and after: PASS','Kept the outcome as verified history'],human:['Made the separate release decision','Approved dispatch']}}
];
const done=new Set();let idx=0;
const VB={x:300,y:60,w:1000,h:562};
const crop=(svg,x,y,w,h)=>svg.replace('viewBox="0 0 1600 900"','viewBox="'+x+' '+y+' '+w+' '+h+'"');
const thumb=svg=>crop(svg,VB.x,VB.y,VB.w,VB.h),world=thumb;

/* ---------- backgrounds ---------- */
$('#heroBg').innerHTML=Scene.hero();$('#missionBg').innerHTML=Scene.hero();$('#cardBg').innerHTML=Scene.hero();$('#doneBg').innerHTML=Scene.hero();$('#finalBg').innerHTML=Scene.hero();
$('#lCells').innerHTML=[[230,120,18],[560,140,14],[470,310,16],[250,330,12],[640,300,10]].map((c,i)=>'<g class="cf" style="animation-delay:'+(-i*1.1)+'s"><rect x="'+(c[0]-c[2])+'" y="'+(c[1]-c[2]*1.4)+'" width="'+c[2]*2+'" height="'+c[2]*2.8+'" rx="'+c[2]*.5+'" fill="'+(i%2?'#9fb7a6':'#e4b977')+'" opacity=".9"/><rect x="'+(c[0]-c[2]*.6)+'" y="'+(c[1]-c[2]*1.1)+'" width="'+c[2]*1.2+'" height="'+c[2]*.5+'" rx="'+c[2]*.25+'" fill="#fff" opacity=".4"/></g>').join('');

/* ---------- loader and hero ---------- */
setTimeout(()=>{$('#loader').style.opacity=0;setTimeout(()=>$('#loader').remove(),1000);cur='hero'},2800);

/* ---------- intro ---------- */
function wrapWords(el){const f=n=>{if(n.nodeType===3){const fr=document.createDocumentFragment();n.textContent.split(/(\s+)/).forEach(t=>{if(!t.trim()){fr.append(t);return}const s=document.createElement('span');s.className='wd';s.textContent=t;fr.append(s)});n.replaceWith(fr)}else n.childNodes.forEach(f)};[...el.childNodes].forEach(f);el.querySelectorAll('.wd').forEach((w,i)=>w.style.transitionDelay=i*70+'ms')}
$$('.line').forEach(wrapWords);
let tl=[];
function intro(){$('#missionBg').innerHTML=Scene.hero();show('mission');const m=$('#mission');m.className='stage';$$('.line').forEach(l=>l.classList.remove('on'));
 const at=(t,f)=>tl.push(setTimeout(f,t)),on=s=>$(s).classList.add('on'),off=s=>$(s).classList.remove('on');
 at(60,()=>m.classList.add('t0','t1'));at(900,()=>{on('#l1');on('#l2')});at(4200,()=>{off('#l1');off('#l2');m.classList.add('t2')});
 at(4600,()=>on('#l3'));at(8000,()=>{off('#l3');m.classList.add('t3')});at(8400,()=>on('#l4'));at(11000,()=>{off('#l4');on('#l5')});at(14500,toCockpit)}
$('#begin').onclick=intro;
function toCockpit(){tl.forEach(clearTimeout);tl=[];cT=cS=0;markDone();show('cockpit')}
$('#skip').onclick=toCockpit;

/* ---------- cockpit: curved carousel with damped follow ---------- */
$('#track').innerHTML=W.map((w,i)=>'<article class="win"><div class="glass"><div class="wsvg">'+w.scene()+'</div><h2>'+w.k+'</h2><p>'+w.sub+'</p><button class="ex" data-i="'+i+'">Explore</button></div></article>').join('');
$('#cdots').innerHTML=W.map((w,i)=>'<i data-i="'+i+'" aria-label="'+w.k+'"></i>').join('');
let cT=0,cS=0,idle;const ANG=.4488;
function setCock(v,snap){cT=clamp(v,0,2);clearTimeout(idle);if(!snap)idle=setTimeout(()=>{cT=Math.round(cT)},140)}
addEventListener('wheel',e=>{if(cur==='cockpit')setCock(cT+(e.deltaY+e.deltaX)/320)},{passive:true});
let sx=null,sc=0;addEventListener('pointerdown',e=>{sx=e.clientX;sc=cT});
addEventListener('pointermove',e=>{if(sx!==null&&cur==='cockpit'){clearTimeout(idle);cT=clamp(sc+(sx-e.clientX)/(innerWidth*.5),0,2)}});
addEventListener('pointerup',()=>{if(sx!==null&&cur==='cockpit')cT=Math.round(cT);sx=null});
addEventListener('keydown',e=>{if(cur==='cockpit'){if(e.key==='ArrowRight')setCock(Math.round(cT)+1,1);if(e.key==='ArrowLeft')setCock(Math.round(cT)-1,1)}});
$$('#cdots i').forEach(d=>d.onclick=()=>setCock(+d.dataset.i,1));
$$('#track .ex').forEach(b=>b.onclick=()=>{idx=+b.dataset.i;const win=b.closest('.win');$('#track').classList.add('zooming');win.classList.add('zoom');setTimeout(()=>{openCard();$('#track').classList.remove('zooming');win.classList.remove('zoom')},650)});
function renderCock(){const w0=$('.win'),sp=(w0?w0.offsetWidth:600)+Math.min(90,innerWidth*.07);
 $$('.win').forEach((el,i)=>{const o=i-cS;el.style.transform='translate(-50%,-50%) translateX('+o*sp+'px) translateZ('+(-Math.abs(o)*60)+'px) rotateY('+(-o*ANG)+'rad)';el.style.filter='brightness('+(1-Math.min(1,Math.abs(o))*.18)+')'});
 const r=Math.round(cS);$$('#cdots i').forEach((d,k)=>d.classList.toggle('on',r===k))}

/* ---------- card ---------- */
function openCard(){const w=W[idx];$('#cT').textContent=w.q;$('#cP').textContent=w.a;$('#cPh').innerHTML=crop(w.scene(),470,125,660,255);
 $('#cardDots').innerHTML=W.map((_,i)=>'<i class="'+(i===idx?'on':'')+'"></i>').join('');show('card')}
$('#cardGo').onclick=openWorld;

/* ---------- world: parallax scene with hotspots anchored to scene coordinates ---------- */
const wScene=$('#wScene'),wMarks=$('#wMarks');wMarks.style.inset='-8%';
function placeMarks(){const w=W[idx],cw=wMarks.offsetWidth,ch=wMarks.offsetHeight,k=Math.max(cw/VB.w,ch/VB.h),ox=(cw-VB.w*k)/2,oy=(ch-VB.h*k)/2;
 $$('.mk').forEach(m=>{const p=w.pr(...m._p);m.style.left=((p[0]-VB.x)*k+ox)+'px';m.style.top=((p[1]-VB.y)*k+oy)+'px'})}
function openWorld(){const w=W[idx];wScene.innerHTML=world(w.scene());wMarks.innerHTML='';
 const mk=(label,pos,cls,fn)=>{const d=document.createElement('div');d.className='mk '+(cls||'');d._p=pos;d.innerHTML='<span class="lb" role="button" tabindex="0">'+label+'</span><i></i><span class="dot"></span>';const go=()=>fn();d.querySelector('.lb').onclick=go;d.querySelector('.lb').onkeydown=e=>{if(e.key==='Enter'||e.key===' ')go()};wMarks.append(d)};
 w.marks.forEach(m=>mk(m[0],m[1],'',()=>{$('#infop h4').textContent=m[0];$('#infop p').textContent=m[2];$('#infop').classList.add('on')}));
 mk(w.target[0],w.target[1],'t',()=>{const r=wMarks.querySelector('.mk.t .dot').getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2,20);setTimeout(completeWorld,700)});
 $('#wiT').innerHTML=w.intro.replace(' ','<br>');$('#wdots').innerHTML=W.map((_,i)=>'<i class="'+(i===idx?'on':'')+'"></i>').join('');
 $('#world').classList.remove('landed','introDone');$('#infop').classList.remove('on');show('world');placeMarks();
 setTimeout(()=>$('#world').classList.add('landed'),500);clearTimeout(window._wi);window._wi=setTimeout(()=>$('#world').classList.add('introDone'),4300)}
addEventListener('resize',()=>{if(cur==='world')placeMarks()});
$('#infoX').onclick=()=>$('#infop').classList.remove('on');$('#back').onclick=()=>show('cockpit');
let mx=.5,my=.5,px=.5,py=.5,last=performance.now();
addEventListener('mousemove',e=>{mx=e.clientX/innerWidth;my=e.clientY/innerHeight});
(function loop(now){const dt=Math.min(.25,(now-last)/1000);last=now;
 if(cur==='world'){px+=(mx-px)*damp(3.2,dt);py+=(my-py)*damp(3.2,dt);const t='translate3d('+(-(px-.5)*2*72)+'px,'+(-(py-.5)*2*38)+'px,0)';wScene.style.transform=t;wMarks.style.transform=t}
 if(cur==='cockpit'){cS+=(cT-cS)*damp(6,dt);if(Math.abs(cT-cS)<1e-4)cS=cT;renderCock()}
 requestAnimationFrame(loop)})(last);


/* ---------- feedback: particle burst and shockwave ---------- */
function burst(x,y,n=18,color){const ring=document.createElement('div');ring.className='bring';ring.style.left=x+'px';ring.style.top=y+'px';document.body.append(ring);setTimeout(()=>ring.remove(),1000);
 for(let i=0;i<n;i++){const p=document.createElement('div');p.className='bp';const a=Math.random()*Math.PI*2,d=60+Math.random()*170;p.style.left=x+'px';p.style.top=y+'px';p.style.setProperty('--dx',Math.cos(a)*d+'px');p.style.setProperty('--dy',Math.sin(a)*d+'px');p.style.background=color||(Math.random()<.5?'#e4b977':'#9fd08a');p.style.animationDelay=Math.random()*.12+'s';document.body.append(p);setTimeout(()=>p.remove(),1400)}}
function markDone(){$$('.win').forEach((w,i)=>{let c=w.querySelector('.chk');if(done.has(i)&&!c){c=document.createElement('b');c.className='chk';c.textContent='✓ Complete';w.querySelector('.glass').append(c)}})}
function celebrate1(){burst(innerWidth/2,innerHeight*.55,26)}
function celebrate(){for(let k=0;k<6;k++)setTimeout(()=>burst(innerWidth*(.2+Math.random()*.6),innerHeight*(.35+Math.random()*.3),22),k*260)}
/* ---------- completion: what Tolerance did, and what the person decided ---------- */
function completeWorld(){done.add(idx);const d=W[idx].done;
 $('#dTag').textContent=d.tag;$('#dT').textContent=d.t;$('#dP').textContent=d.p;
 $('#dArt').innerHTML='<div class="two"><div><b>Tolerance did</b><ul>'+d.tol.map(x=>'<li>'+x+'</li>').join('')+'</ul></div><div><b>You decided</b><ul>'+d.human.map(x=>'<li>'+x+'</li>').join('')+'</ul></div></div>';
 show('done')}
$('#dGo').onclick=()=>{if(done.size>=3){show('final');setTimeout(celebrate,500)}else{markDone();show('cockpit')}};
