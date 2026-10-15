/* Enter the factory: a short, forgiving, movement-driven showcase of the Symbiotic Compiler.
   Scroll, drag, arrow keys or autoplay. Nothing can be failed. Everything shown is simulated. */
(function(){
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),lerp=(a,b,t)=>a+(b-a)*t,sm=t=>t*t*(3-2*t),eo=t=>1-Math.pow(1-t,3),damp=(k,dt)=>1-Math.exp(-k*dt);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const win=(p,a,b,fi,fo)=>clamp((p-a)/fi)*clamp((b-p)/fo);

/* ---------- geometry shared with the hero scene ---------- */
const pr=Iso.P(520,200),SP=2.6,ft0=Scene.hero.fault(),FT={x:ft0.x,y:ft0.y},C={x:FT.x,y:FT.y-205};
const st=(i,dx,dy,z)=>{const p=pr(i*SP+(dx===undefined?.8:dx),dy===undefined?.7:dy,z===undefined?1.5:z);return{x:p[0],y:p[1]}};
const belt=xw=>{const q=pr(xw,2.55,.95);return[q[0],q[1]]};
const NAMES=Scene.names;

/* ---------- loader ---------- */
$('#lCells').innerHTML=[[230,120,18],[560,140,14],[470,310,16],[250,330,12],[640,300,10]].map((c,i)=>'<g class="cf" style="animation-delay:'+(-i*1.1)+'s"><rect x="'+(c[0]-c[2])+'" y="'+(c[1]-c[2]*1.4)+'" width="'+c[2]*2+'" height="'+c[2]*2.8+'" rx="'+c[2]*.5+'" fill="'+(i%2?'#9fb7a6':'#e4b977')+'" opacity=".9"/></g>').join('');
let live=false;
setTimeout(()=>{$('#loader').style.opacity=0;setTimeout(()=>$('#loader').remove(),1000);live=true},2600);

/* ---------- the world (mounted as the loader leaves, so its entrance plays) ---------- */
let root=null,sky,far,rays,sRoot;
function mount(){
 $('#world').innerHTML=Scene.hero();root=$('#sceneRoot');sky=$('#lySky');far=$('#lyFar');rays=$('#lyRays');
 $('#story').innerHTML=storyMarkup();sRoot=$('#sRoot');cache();
 
}
setTimeout(mount,1700);

/* ---------- camera path ---------- */
const K=[
 {p:0,   f:[FT.x,FT.y-40],            c:[1150,480],k:.94},
 {p:.1,  f:[C.x,C.y+70],              c:[980,460], k:1.3},
 {p:.3,  f:[st(3.3).x,st(3.3).y-110], c:[1000,470],k:1.08},
 {p:.5,  f:[FT.x,FT.y-100],           c:[1010,470],k:1.7},
 {p:.7,  f:[st(4,.2,1.2,1.2).x,st(4).y-70],c:[930,470],k:1.8},
 {p:.87, f:[FT.x,FT.y-100],           c:[1010,470],k:1.7},
 {p:1,   f:[st(3.5).x,st(3.5).y-30],  c:[820,480], k:.86}
];
function camAt(p){let i=0;while(i<K.length-2&&p>K[i+1].p)i++;const a=K[i],b=K[i+1],t=sm(clamp((p-a.p)/(b.p-a.p)));
 return{fx:lerp(a.f[0],b.f[0],t),fy:lerp(a.f[1],b.f[1],t),cx:lerp(a.c[0],b.c[0],t),cy:lerp(a.c[1],b.c[1],t),k:lerp(a.k,b.k,t)}}

/* ---------- story layer: what the compiler does, drawn in the same scene coordinates ---------- */
const DOCS=[['PDF','Maintenance manual','p.4'],['CSV','Production table','row 4'],['API','System records','$.assets[3]'],['SIG','Telemetry stream','t=312']];
const S0=[[C.x-560,C.y-250],[C.x-330,C.y-380],[C.x+300,C.y-380],[C.x+540,C.y-240]];
const GN=[['ASSET','ASSET-3  ?','PDF p.4 · CSV row 4',-270,40],['PRODUCT','LOT-01','CSV row 12',-170,-130],['PROCEDURE','PR-04 service','PDF p.4',170,-130],['ORDER','ORD-17','JSON $.orders[2]',275,35],['SUPPLIER','SUP-01','JSON $.suppliers[0]',10,175]];
const lotCells=Sim.lot(7).cells,CX0=FT.x-210,CY0=FT.y-205;
const GATE=st(4,.2,1.2,1.2),A3=st(3),A4=st(4,.8,.7,1.5);
function pill(id,x,y,w,t1,t2,t3){return '<g id="'+id+'" transform="translate('+x+' '+y+')"><rect x="'+(-w/2)+'" y="-27" width="'+w+'" height="54" rx="15" fill="#10211e" stroke="#aec29b" stroke-opacity=".6"/><text x="'+(-w/2+14)+'" y="-9" class="ss">'+t1+'</text><text x="'+(-w/2+14)+'" y="8" class="sv">'+t2+'</text><text x="'+(-w/2+14)+'" y="21" class="sm" style="font-size:8.5px">'+t3+'</text></g>'}
function storyMarkup(){
 let m='<g id="sRoot">';
 /* sources */
 DOCS.forEach((d,i)=>{const P=S0[i],Pc=[lerp(P[0],C.x,.5),Math.min(P[1],C.y)-150];
  m+='<path id="dt'+i+'" d="M'+P[0]+' '+P[1]+'Q'+Pc[0]+' '+Pc[1]+' '+C.x+' '+C.y+'" fill="none" stroke="#e4b977" stroke-opacity=".35" stroke-dasharray="3 9"/>'
   +'<g id="d'+i+'"><g class="bobd b'+(i%3+1)+'"><rect x="-66" y="-38" width="132" height="76" rx="13" fill="#10211e" stroke="#e4b977" stroke-opacity=".8"/><text x="-52" y="-13" class="sl" style="fill:#e4b977">'+d[0]+'</text><text x="-52" y="7" class="sv" style="font-size:12.5px">'+d[1]+'</text><text x="-52" y="25" class="sm">'+d[2]+'</text></g></g>'
   +'<circle id="dr'+i+'" cx="'+C.x+'" cy="'+C.y+'" r="30" fill="none" stroke="#ffd391" stroke-width="2"/>'});
 /* compiled model */
 m+='<g id="gG">';
 GN.forEach((n,j)=>{const x=C.x+n[3],y=C.y+n[4];m+='<path id="gl'+j+'" d="M'+C.x+' '+(C.y+20)+'L'+x+' '+y+'" pathLength="1" fill="none" stroke="#e4b977" stroke-opacity=".6" stroke-width="1.5" stroke-dasharray="1" stroke-dashoffset="1"/>'+pill('gn'+j,x,y,j===2?176:156,n[0],n[1],n[2])});
 const n0=[C.x+GN[0][3],C.y+GN[0][4]];
 m+='<path id="ca0" d="M'+n0[0]+' '+n0[1]+'L'+A3.x+' '+(A3.y-30)+'" fill="none" stroke="#e4b977" stroke-width="1.8" stroke-dasharray="4 7"/>'
  +'<path id="ca1" d="M'+n0[0]+' '+n0[1]+'L'+A4.x+' '+(A4.y-30)+'" fill="none" stroke="#e4b977" stroke-width="1.8" stroke-dasharray="4 7"/>'
  +'<path id="rs0" d="M'+n0[0]+' '+n0[1]+'L'+A3.x+' '+(A3.y-30)+'" fill="none" stroke="#9fd08a" stroke-width="2.6"/>'
  +'<g id="q3" transform="translate('+A3.x+' '+(A3.y-46)+')"><rect x="-50" y="-14" width="100" height="26" rx="13" fill="#10211e" stroke="#e4b977"/><text y="4" text-anchor="middle" class="sl">PROCESS?</text></g>'
  +'<g id="q4" transform="translate('+A4.x+' '+(A4.y-46)+')"><rect x="-62" y="-14" width="124" height="26" rx="13" fill="#10211e" stroke="#e4b977"/><text y="4" text-anchor="middle" class="sl">INSPECTION?</text></g>'
  +'<g id="cf" transform="translate('+(n0[0])+' '+(n0[1]+56)+')"><text text-anchor="middle" class="sbig" id="cfT" style="fill:#9fd08a">HOLD YOUR CURSOR ON THE WELD STATION</text></g></g>';
 /* investigate */
 m+='<g id="gI"><text x="'+CX0+'" y="'+(CY0-14)+'" class="sl">BATCH A · UNITS 1–8</text><text x="'+CX0+'" y="'+(CY0+70)+'" class="sl">BATCH B · UNITS 9–16</text><text x="'+(CX0+8*52-4)+'" y="'+(CY0-14)+'" text-anchor="end" class="sm">LIMIT</text>';
 lotCells.forEach((c,i)=>{const x=CX0+(i%8)*52,y=CY0+(i<8?0:76),h=clamp(c.R/.9,.05,1)*40,bad=c.i===5;
  m+='<g id="c'+i+'"><rect x="'+x+'" y="'+y+'" width="42" height="56" rx="10" fill="#10211e" stroke="'+(bad?'#e0876b':'#aec29b')+'" stroke-opacity=".8"/><rect id="cb'+i+'" x="'+(x+7)+'" y="'+(y+50-h)+'" width="28" height="'+h+'" rx="5" fill="'+(bad?'#e0876b':'#9fb7a6')+'"/></g>'});
 m+='<rect id="scan" x="'+CX0+'" y="'+(CY0-8)+'" width="3" height="144" rx="1.5" fill="#ffd391" opacity=".9"/>'
  +'<rect id="brk" x="'+(CX0-8)+'" y="'+(CY0-8)+'" width="'+(8*52+4)+'" height="72" rx="16" fill="none" stroke="#e4b977" stroke-width="2.4"/>'
  +'<path id="trc" d="M'+(CX0+8*52+2)+' '+(CY0+28)+'C'+(CX0+8*52+60)+' '+(CY0+28)+' '+(CX0+8*52+60)+' '+(CY0+40)+' '+(CX0+8*52+104)+' '+(CY0+40)+'" fill="none" stroke="#e4b977" stroke-width="2" stroke-dasharray="4 7"/>'
  +'<g id="pk" transform="translate('+(CX0+8*52+150)+' '+(CY0+40)+')"><rect x="-46" y="-30" width="92" height="60" rx="13" fill="#10211e" stroke="#e4b977" stroke-opacity=".8"/><text y="-4" text-anchor="middle" class="sl">DOWNSTREAM</text><text y="14" text-anchor="middle" class="sm">fed by batch A</text></g>'
  +'<g id="dec" transform="translate('+CX0+' '+(CY0+168)+')"><rect width="392" height="50" rx="16" fill="#10211e" stroke="#9fd08a" stroke-opacity=".8"/><circle cx="26" cy="19" r="7" fill="#e9e5d8"/><path d="M13 40Q26 25 39 40" fill="#e9e5d8"/><text x="56" y="21" class="sl" style="fill:#9fd08a">YOUR CALL</text><text x="56" y="38" class="sv" style="font-size:13px">Hold batch A and what it feeds</text></g></g>';
 /* govern */
 m+='<g id="gV"><g transform="translate('+GATE.x+' '+(GATE.y-150)+')"><circle r="50" fill="none" stroke="#e4b977" stroke-opacity=".5" class="dpulse"/><path d="M0 -38L30 -24V6Q26 30 0 42Q-26 30 -30 6V-24Z" fill="#17302a" stroke="#e4b977" stroke-width="2.6" stroke-linejoin="round"/><path d="M-12 2L-2 12L16 -10" fill="none" stroke="#e4b977" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><text y="66" text-anchor="middle" class="sl">INDEPENDENT POLICY</text></g>';
 [['RELEASE NOW','#8d4a39'],['RAISE THRESHOLD','#8d4a39'],['BOUNDED CORRECTION','#2f7a45']].forEach((c,k)=>{m+='<g id="cr'+k+'"><rect x="-58" y="-20" width="116" height="40" rx="10" fill="'+c[1]+'" stroke="#f0eee4" stroke-opacity=".4"/><text y="4" text-anchor="middle" class="sl" style="font-size:9px">'+c[0]+'</text></g>'});
 m+='<g id="mk0"><text id="mk0t" class="sbig" text-anchor="middle" style="fill:#e0876b">DENIED</text></g><g id="mk1"><text class="sbig" text-anchor="middle" style="fill:#e0876b">DENIED</text></g><g id="mk2"><text class="sbig" text-anchor="middle" style="fill:#9fd08a">PERMITTED</text></g></g>';
 /* verify */
 const VX=FT.x-150,VY=FT.y-150;
 m+='<g id="gR"><rect x="'+(VX-22)+'" y="'+(VY-44)+'" width="'+(8*38+170)+'" height="232" rx="22" fill="#0c1917" fill-opacity=".72" stroke="#aec29b" stroke-opacity=".25"/><text x="'+VX+'" y="'+(VY-16)+'" class="sl">BATCH A · READINGS · BEFORE → AFTER</text>';
 for(let i=0;i<8;i++)m+='<rect id="vb'+i+'" x="'+(VX+i*38)+'" width="26" rx="6"/>';
 m+='<line x1="'+(VX-6)+'" x2="'+(VX+8*38)+'" y1="'+(VY+100-Sim.T/.9*100)+'" y2="'+(VY+100-Sim.T/.9*100)+'" stroke="#e0876b" stroke-dasharray="4 5"/><text x="'+(VX+8*38)+'" y="'+(VY+100-Sim.T/.9*100-6)+'" text-anchor="end" class="sm">limit</text>'
  +'<g id="pass" transform="translate('+(VX)+' '+(VY+128)+')"><rect width="232" height="34" rx="17" fill="#17302a" stroke="#9fd08a"/><text x="116" y="22" text-anchor="middle" class="sl" style="fill:#9fd08a" id="passT">PASS · MEASURED</text></g>'
  +'<g id="key" transform="translate('+(VX+8*38+90)+' '+(VY+30)+')"><g id="keyr"><circle r="20" fill="#10211e" stroke="#e4b977" stroke-width="2.4"/><circle r="6" fill="#e4b977"/><path d="M20 0H70M58 0V14M70 0V10" stroke="#e4b977" stroke-width="3" stroke-linecap="round" fill="none"/></g><text y="52" text-anchor="middle" class="sl" id="keyT">ONLY A PERSON RELEASES</text></g>';
 for(let j=0;j<10;j++)m+='<rect id="dp'+j+'" x="-9" y="-11" width="18" height="18" rx="5" fill="#bcd8c6" stroke="#10211e" stroke-opacity=".4"/>';
 m+='<g id="dcn"><text id="dcnT" class="sbig" text-anchor="middle" style="fill:#9fd08a">10 UNITS DISPATCHED</text></g></g>';
 return m+'</g>';
}
const E={};
function cache(){$$('#story [id]').forEach(e=>E[e.id]=e)}
const set=(id,a,v)=>{const e=E[id];if(e)e.setAttribute(a,v)},op=(id,v)=>set(id,'opacity',v.toFixed(3)),tf=(id,x,y,s)=>set(id,'transform','translate('+x+' '+y+')'+(s!==undefined?' scale('+s+')':''));
let conf=false,dwell=0;

function story(p,dt){
 /* 1. sources fly into the compiler */
 const a=p/.2;
 for(let i=0;i<4;i++){const t=clamp((a-i*.12)/.62),e=eo(t),P=S0[i],Pc=[lerp(P[0],C.x,.5),Math.min(P[1],C.y)-150];
  const x=(1-e)*(1-e)*P[0]+2*(1-e)*e*Pc[0]+e*e*C.x,y=(1-e)*(1-e)*P[1]+2*(1-e)*e*Pc[1]+e*e*C.y;
  tf('d'+i,x,y,lerp(1,.16,e));op('d'+i,p>.205?0:t>=.97?0:1);op('dt'+i,p>.205?0:.4*(1-e));
  const rp=clamp((t-.86)/.14);set('dr'+i,'r',(26+110*rp).toFixed(1));op('dr'+i,t>.86&&p<.3?(1-rp)*.9:0)}
 /* 2. the compiled model, with one fact it will not guess */
 const g=clamp((p-.2)/.2);op('gG',win(p,.19,.43,.03,.05));
 for(let j=0;j<5;j++){const v=clamp(g*5.5-j*.6);op('gn'+j,v);set('gl'+j,'stroke-dashoffset',(1-v).toFixed(3))}
 if(!conf&&g>.93)conf=true;
 const showC=clamp((g-.45)*7);
 op('ca0',conf?0:showC);op('ca1',conf?0:showC);op('q3',conf?0:showC);op('q4',conf?0:showC);op('rs0',conf?1:0);
 if(E.gn0){E.gn0.querySelector('.sv').textContent=conf?'PROCESS':'ASSET-3  ?';E.gn0.querySelector('rect').setAttribute('stroke',conf?'#9fd08a':'#e4b977')}
 if(E.cfT){E.cfT.textContent=conf?(dwell>=1?'CONFIRMED BY A PERSON':'IN THE PRODUCT, A PERSON CONFIRMS THIS'):'HOLD YOUR CURSOR ON THE PROCESS STATION';op('cf',clamp((g-.55)*8))}
 /* 3. trace the drift down to the module and the pack */
 const u=clamp((p-.4)/.2);op('gI',win(p,.385,.64,.04,.05));
 const sx=CX0-6+8*52*clamp(u/.5);set('scan','x',sx.toFixed(1));op('scan',u>.02&&u<.52?.9:0);
 lotCells.forEach((c,i)=>{const x=CX0+(i%8)*52;op('cb'+i,x<sx?1:0)});
 const tr=clamp((u-.55)*6);op('brk',tr);op('trc',tr);op('pk',tr);op('dec',clamp((u-.78)*8));
 /* 4. every action meets a boundary */
 const v=clamp((p-.6)/.22);op('gV',win(p,.585,.84,.04,.05));
 const crate=(k,t0)=>{const t=clamp(v-t0);let xw,mk=0;
  if(k<2){const tt=t/.4;if(tt<.55)xw=lerp(2,10.1,eo(tt/.55));else{xw=lerp(10.1,6,eo(clamp((tt-.55)/.35)));mk=clamp((tt-.58)*6)}}
  else{const tt=clamp((v-.52)/.46);xw=lerp(2,17.5,sm(tt));mk=clamp((xw-11.3)*1.2)}
  const q=belt(xw);tf('cr'+k,q[0],q[1]-26);op('cr'+k,(k<2?v>t0:v>.52)?clamp(t*8)*(k<2?(v>t0+.5?0:1):(v>.97?0:1)):0);
  const mx=GATE.x+(k===0?-130:k===1?130:0),my=GATE.y-(k===2?10:-8)+(k===2?-50:50);tf('mk'+k,mx,my);op('mk'+k,mk*(k<2?(v>t0+.5?0:1):1))};
 crate(0,0);crate(1,.16);crate(2,.52);
 /* 5. measure it, then a person releases */
 const w=clamp((p-.8)/.13);op('gR',win(p,.785,.95,.04,.05));
 const m=sm(clamp((w-.1)/.5)),VX=FT.x-150,VY=FT.y-150;
 for(let i=0;i<8;i++){const before=lotCells[i].R,after=i===5?Sim.after(2.7,55):before,val=lerp(before,after,m),h=clamp(val/.9,.05,1)*100;
  set('vb'+i,'y',(VY+100-h).toFixed(1));set('vb'+i,'height',h.toFixed(1));set('vb'+i,'fill',val>Sim.T?'#e0876b':'#9fd08a')}
 op('pass',clamp((w-.55)*8));if(E.passT)E.passT.textContent='PASS · MEASURED';
 const kr=clamp((w-.62)/.2)*90;if(E.keyr)E.keyr.setAttribute('transform','rotate('+kr.toFixed(1)+')');if(E.keyT)E.keyT.textContent=w>.84?'RELEASED BY A PERSON':'ONLY A PERSON RELEASES';
 const d=clamp((w-.84)/.16);
 for(let j=0;j<10;j++){const tt=clamp(d*1.3-j*.06),q=belt(lerp(9,19.4,sm(tt)));tf('dp'+j,q[0],q[1]-20);op('dp'+j,d>0&&tt<1?1:0)}
 const dq=st(7,.8,.7,1.9);tf('dcn',dq.x,dq.y-40);op('dcn',clamp((d-.7)*5));
}

/* ---------- chapters, rail, copy ---------- */
const CHB=[0,.2,.4,.6,.8,.94];
const COPY=[
 ['01 / ATTACH','It starts by listening.','Four sources come in: a manual, a table, system records, a signal stream. Nothing is replaced. Every fact keeps its origin.'],
 ['02 / UNDERSTAND','It compiles what it hears.','The Symbiotic Compiler builds a model where each fact points to its source. When two sources disagree, it does not guess. It waits for a person.'],
 ['03 / INVESTIGATE','A reading drifts. Where does it spread?','Move across the units. The compiler traces each one to its batch and everything downstream. How much to hold is your decision.'],
 ['04 / GOVERN','It proposes. Policy decides.','A release before the retest is denied. A threshold change is denied. A bounded correction passes. Each leaves a record.'],
 ['05 / VERIFY','Measure it. Then you release it.','The retest passes on measurement, not hope. A person turns the key. Dispatch follows.'],
 ['THE LOOP','Both sides get better.','Verified outcomes become history that improves the next recommendation.']
];
$('#rail').innerHTML=['Attach','Understand','Investigate','Govern','Verify'].map((n,i)=>'<button data-i="'+i+'"><i></i>'+n+'</button>').join('');
const railB=$$('#rail button');railB.forEach(b=>b.onclick=()=>{pause();pT=CHB[+b.dataset.i]+.012});
let chapI=-1;
function setChap(i){if(i===chapI)return;chapI=i;const c=$('#chap');c.classList.add('swap');setTimeout(()=>{$('#cE').textContent=COPY[i][0];$('#cH').textContent=COPY[i][1];$('#cP').textContent=COPY[i][2];c.classList.remove('swap')},260)}

/* ---------- input: scroll, drag, keys, autoplay ---------- */
let pT=0,pS=0,auto=false,mx=innerWidth*.6,my=innerHeight*.5,dragging=false,lx=0,ly=0;
const autoBtn=$('#auto');
function setAuto(v){auto=v;autoBtn.setAttribute('aria-pressed',v);autoBtn.querySelector('span').textContent=v?'Pause':'Autoplay'}
function pause(){if(auto)setAuto(false)}
autoBtn.onclick=()=>{if(pT>=.999)pT=0;setAuto(!auto)};
addEventListener('wheel',e=>{e.preventDefault();pause();let d=(Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX)*(e.deltaMode===1?33:1);d=Math.max(-70,Math.min(70,d));pT=clamp(pT+d/7500)},{passive:false});
addEventListener('pointerdown',e=>{if(e.target.closest('a,button'))return;dragging=true;lx=e.clientX;ly=e.clientY});
addEventListener('pointermove',e=>{mx=e.clientX;my=e.clientY;hot=!!e.target.closest('a,button');if(dragging){pause();pT=clamp(pT+((ly-e.clientY)+(lx-e.clientX))/1100);lx=e.clientX;ly=e.clientY}});
addEventListener('pointerup',()=>dragging=false);
addEventListener('keydown',e=>{const k=e.key;if(k===' '){e.preventDefault();if(pT>=.999)pT=0;setAuto(!auto);return}pause();
 if(k==='ArrowDown'||k==='ArrowRight'||k==='PageDown')pT=clamp(pT+.045);if(k==='ArrowUp'||k==='ArrowLeft'||k==='PageUp')pT=clamp(pT-.045);if(k==='Home')pT=0;if(k==='End')pT=1});
$('#again').onclick=()=>{pT=0;conf=false;dwell=0};

/* ---------- cursor, companion, station tags ---------- */
const orb=$('#orb'),tip=$('#tip'),ring=$('#orbRing'),introE=$('#intro'),loopE=$('#loop'),chapE=$('#chap');
const tags=NAMES.map((n,i)=>{const d=document.createElement('div');d.className='stg'+(i===3?' bad':'');d.innerHTML=n+(i===3?'<small>drift</small>':'');$('#stationTags').append(d);return d});
let orbS=1,hot=false,ox=mx,oy=my,last=performance.now(),pt=null;
function frame(now){const dt=Math.min(.25,(now-last)/1000);last=now;
 if(auto){pT=clamp(pT+dt*.0145);if(pT>=1)setAuto(false)}
 {const st=(pT-pS)*(reduced?1:damp(2.6,dt)),mxs=.16*dt;pS+=reduced?st:Math.max(-mxs,Math.min(mxs,st))}if(Math.abs(pT-pS)<1e-4)pS=pT;
 const p=pS;
 /* intro and loop card */
 introE.classList.toggle('gone',p>.03);loopE.classList.toggle('off',p<.945);chapE.classList.toggle('off',p<.03||p>=.945);document.body.classList.toggle('deep',p>.38);
 if(p>=.03)setChap(p>=CHB[5]?5:CHB.findIndex((b,i)=>p>=b&&p<(CHB[i+1]||2)));
 railB.forEach((b,i)=>{const lo=CHB[i],hi=CHB[i+1];b.classList.toggle('on',p>=lo&&p<hi||(i===4&&p>=hi));b.firstChild.style.transform='scaleX('+clamp((p-lo)/(hi-lo))+')'});
 if(root){
  const c=camAt(p),dx=((mx/innerWidth)-.5)*2,dy=((my/innerHeight)-.5)*2,pm=reduced?0:1;
  const tr='translate('+(c.cx-dx*26*pm)+' '+(c.cy-dy*15*pm)+') scale('+c.k+') translate('+(-c.fx)+' '+(-c.fy)+')';
  root.setAttribute('transform',tr);if(sRoot)sRoot.setAttribute('transform',tr);
  sky.setAttribute('transform','translate('+(-dx*8*pm)+' '+(-dy*5*pm)+')');far.setAttribute('transform','translate('+(-dx*16*pm)+' '+(-dy*7*pm)+')');rays.setAttribute('transform','translate('+(-dx*22*pm)+' 0)');
  story(p,dt);
  /* stations reveal as the cursor nears them */
  if(!pt)pt=$('#world svg').createSVGPoint();const m=root.getScreenCTM();let near=-1,nd=1e9;
  if(m)NAMES.forEach((n,i)=>{const a=st(i,.8,.7,1.9);pt.x=a.x;pt.y=a.y;const s=pt.matrixTransform(m),d=Math.hypot(mx-s.x,my-s.y);
   tags[i].style.left=s.x+'px';tags[i].style.top=s.y+'px';if(d<nd){nd=d;near=i}});
  hot=hot||nd<150;tags.forEach((tg,i)=>tg.classList.toggle('on',(i===near&&nd<150)||(i===3&&p>.38&&p<.62)));
  
  /* hold the cursor on the weld station to confirm the ambiguous fact */
  if(m&&p>.3&&p<.42&&!conf){const a=st(3,.8,.7,1.5);pt.x=a.x;pt.y=a.y;const s=pt.matrixTransform(m);
   if(Math.hypot(mx-s.x,my-s.y)<95)dwell=Math.min(1,dwell+dt);else dwell=Math.max(0,dwell-dt*1.6);
   if(dwell>=1){conf=true}}
  else if(!(p>.3&&p<.42)&&!conf)dwell=0;
  ring.setAttribute('stroke-dashoffset',(107*(1-(conf&&dwell>=1?1:dwell))).toFixed(1));
  /* cell readings follow the cursor */
  let tipOn=false;
  if(p>.42&&p<.62){for(let i=0;i<16;i++){const e=E['c'+i];if(!e)continue;const r=e.getBoundingClientRect();if(mx>=r.left&&mx<=r.right&&my>=r.top&&my<=r.bottom){const R=lotCells[i].R;tip.innerHTML='Unit '+(i+1)+' · reading '+R.toFixed(2)+'<small>'+(R>Sim.T?'above the limit':'within the limit')+'</small>';tipOn=true;tip.style.transform='translate('+(mx+14)+'px,'+(my-60)+'px)';break}}}
  tip.classList.toggle('off',!tipOn);
 }
 /* orb follows at once, companion drifts behind */
 ox+=(mx-ox)*.4;oy+=(my-oy)*.4;
 orbS+=((hot?1.45:1)-orbS)*.18;orb.style.transform='translate('+ox+'px,'+oy+'px) scale('+orbS.toFixed(3)+')';
 requestAnimationFrame(frame)}
requestAnimationFrame(frame);
window.TOL={get p(){return pS},set p(v){pT=clamp(v)}};
})();
