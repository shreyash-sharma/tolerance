/* Scene: original isometric scenes for the Tolerance brochure. All geometry is drawn here; nothing is imported. */
window.Scene=(function(){
  const {box,strip,drum,mix,P,U,defs,id,f}=Iso;
  const C={floor:'#1f3d36',floor2:'#27493f',metal:'#5f7b6e',metalLt:'#9bbbab',graphite:'#34463f',amber:'#e4b977',amberHot:'#ffcf86',ivory:'#e9e5d8',sage:'#9fb7a6',green:'#9fd08a',red:'#e0876b'};
  const names=['INTAKE','SORTING','ASSEMBLY','PROCESS','INSPECTION','PACKING','TESTING','DISPATCH'];

  function stationArt(pr,i,x,fault){
    let s='';const y=0;
    if(i===0){ s+=box(pr,x,y,0,1.6,1.4,1.0,C.metal); for(let k=0;k<3;k++)s+=box(pr,x+.35+k*.4,y+.5,1.0,.12,.12,.55,C.metalLt,{noShadow:1,round:3}); s+=strip(pr,x+.2,y+.2,1.0,1.2,.12,C.amber,.8)}
    if(i===1){ s+=box(pr,x,y,0,1.6,1.4,.8,C.metal); s+=box(pr,x+.2,y+.3,.8,1.2,.8,.28,C.graphite,{noShadow:1}); s+=strip(pr,x+.3,y+.5,1.08,1.0,.12,C.sage,.7)}
    if(i===2){ s+=box(pr,x,y,0,1.6,1.4,1.1,C.metal); s+=box(pr,x+.6,y+.5,1.1,.35,.35,.7,C.metalLt,{noShadow:1,round:4}); s+=box(pr,x+.2,y+.55,1.8,1.0,.25,.22,C.metalLt,{noShadow:1,round:4}); s+=strip(pr,x+.25,y+.15,1.1,1.1,.1,C.amber,.7)}
    if(i===3){ s+=box(pr,x,y,0,1.6,1.4,1.3,fault?mix(C.metal,'#7a3b2a',.25):C.metal); s+=box(pr,x+.5,y+.45,1.3,.6,.5,.55,C.graphite,{noShadow:1,round:4});
      const b0=pr(x+.8,y+.7,1.85),b1=pr(x+.8,y+2.0,.2);
      s+='<path d="M'+f(b0[0])+' '+f(b0[1])+'L'+f(b1[0])+' '+f(b1[1])+'" stroke="'+(fault?C.red:C.amberHot)+'" stroke-width="3" stroke-linecap="round" class="weldbeam"/>';
      s+='<circle cx="'+f(b1[0])+'" cy="'+f(b1[1])+'" r="32" fill="'+(fault?'url(#glR)':'url(#glA)')+'" opacity=".8" class="weldglow"/>'}
    if(i===4){ s+=box(pr,x,y,0,.3,.3,1.4,C.metal,{round:4}); s+=box(pr,x,y+2.4,0,.3,.3,1.4,C.metal,{round:4}); s+=box(pr,x-.05,y,1.4,.4,2.8,.28,C.metalLt,{round:4}); s+=strip(pr,x+.05,y+.2,1.68,.2,2.4,C.sage,.8)}
    if(i===5){ s+=box(pr,x-.1,y,0,1.9,1.8,.9,C.metal); s+=box(pr,x+.2,y+.3,.9,1.3,1.2,.5,C.metalLt,{noShadow:1}); s+=strip(pr,x+.3,y+.4,1.4,1.1,.1,C.amber,.7)}
    if(i===6){ s+=box(pr,x,y,0,1.6,1.4,1.2,C.metal); s+=box(pr,x+.15,y+.1,1.2,.9,.12,.55,C.graphite,{noShadow:1,round:3}); s+=strip(pr,x+.25,y+.12,1.5,.7,.1,C.green,.9)}
    if(i===7){ for(let k=0;k<4;k++)s+=box(pr,x+(k%2)*.8,y+Math.floor(k/2)*.75,0,.72,.68,.55+(k===3?.4:0),k%2?C.metalLt:C.metal,{round:4}); }
    return s;
  }

  /* the hero: eight stations, a conveyor and a live fault at the weld station */
  function hero(){
    const pr=P(520,170),sp=2.6,fx=3*sp;
    let s='<svg viewBox="0 0 1600 900" preserveAspectRatio="xMaxYMid slice" shape-rendering="geometricPrecision">'+defs
     +'<defs><radialGradient id="hglow" cx=".55" cy=".52" r=".6"><stop offset="0" stop-color="#e4b977" stop-opacity=".24"/><stop offset="1" stop-color="#e4b977" stop-opacity="0"/></radialGradient>'
     +'<radialGradient id="hvig" cx=".55" cy=".5" r=".75"><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></radialGradient>'
     +'<linearGradient id="slab" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c3a33"/><stop offset="1" stop-color="#12261f"/></linearGradient></defs>'
     +'<rect width="1600" height="900" fill="#0c1715"/><rect width="1600" height="900" fill="url(#hglow)"/>';
    s+='<g id="sceneRoot">';
    /* floor slab with a quiet grid */
    s+=box(pr,-2,-2.4,-.5,sp*8+1.2,7.6,.5,'#21443b',{noShadow:1,round:10,line:'#b9d4c3'});
    const g=[];for(let k=-1;k<=sp*8;k+=1.3){const a=pr(k,-2.2,0),b=pr(k,5,0);g.push('M'+f(a[0])+' '+f(a[1])+'L'+f(b[0])+' '+f(b[1]))}for(let k=-2;k<=5;k+=1.3){const a=pr(-1.8,k,0),b=pr(sp*8,k,0);g.push('M'+f(a[0])+' '+f(a[1])+'L'+f(b[0])+' '+f(b[1]))}
    s+='<path d="'+g.join('')+'" stroke="#8da68f" stroke-opacity=".07" fill="none"/>';
    /* conveyor */
    s+=box(pr,-1.2,2.1,0,sp*8+.6,.9,.2,'#2b3d38',{noShadow:1,round:5});
    const c0=pr(-1,2.55,.21),c1=pr(sp*8-.4,2.55,.21);
    s+='<path d="M'+f(c0[0])+' '+f(c0[1])+'L'+f(c1[0])+' '+f(c1[1])+'" stroke="'+C.amber+'" stroke-opacity=".55" stroke-width="2.2" stroke-dasharray="4 14" stroke-linecap="round" class="belt"/>';
    /* stations, back to front so nearer ones overlap correctly */
    for(let i=0;i<8;i++){s+='<g class="st st'+i+'">'+stationArt(pr,i,i*sp,i===3)+'</g>'}
    /* cells riding the conveyor */
    const d0=pr(-1,2.55,.4),d1=pr(sp*8-1,2.55,.4),dx=d1[0]-d0[0],dy=d1[1]-d0[1];
    s+='<g class="cells" style="--dx:'+f(dx)+'px;--dy:'+f(dy)+'px">';
    for(let k=0;k<9;k++)s+='<g class="cell" style="animation-delay:'+(-k*1.7)+'s"><g transform="translate('+f(d0[0])+' '+f(d0[1])+')"><rect x="-7" y="-9" width="14" height="14" rx="4" fill="'+(k===4?C.red:C.sage)+'" stroke="#0c1715" stroke-opacity=".4"/><rect x="-5" y="-7" width="10" height="3" rx="1.5" fill="#fff" opacity=".35"/></g></g>';
    s+='</g>';
    /* the fault: a calm, pulsing marker with a tag */
    const w=pr(fx+.8,.7,2.3);
    s+='<g class="fault" transform="translate('+f(w[0])+' '+f(w[1]-30)+')"><circle r="22" fill="none" stroke="'+C.red+'" stroke-width="1.5" class="pulse"/><circle r="22" fill="none" stroke="'+C.red+'" stroke-width="1.5" class="pulse p2"/><circle r="5" fill="'+C.red+'"/>'
       +'<path d="M0 -8V-70" stroke="'+C.red+'" stroke-opacity=".6" stroke-dasharray="3 4"/><g transform="translate(0 -92)"><rect x="-94" y="-18" width="188" height="36" rx="10" fill="#10211e" stroke="'+C.red+'" stroke-opacity=".7"/><text x="0" y="-2" text-anchor="middle" class="tg1">FAULT · PROCESS</text><text x="0" y="12" text-anchor="middle" class="tg2">reading above its limit</text></g></g>';
    /* quiet station tags */
    names.forEach((nm,i)=>{if(i===3)return;const p=pr(i*sp+.8,.7,(i===4?2.0:i===7?1.4:1.9));s+='<text x="'+f(p[0])+'" y="'+f(p[1]-26)+'" text-anchor="middle" class="tag">'+nm+'</text>'});
    s+='</g><rect width="1600" height="900" fill="url(#hvig)" pointer-events="none"/></svg>';
    return s;
  }
  hero.fault=function(){const pr=P(520,170);const w=pr(3*2.6+.8,.7,1.4);return {x:w[0],y:w[1]}};

  /* ---------- immersive worlds ---------- */
  const ws=(inner,bg)=>'<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" shape-rendering="geometricPrecision">'+defs+'<defs><radialGradient id="wbg" cx=".5" cy=".42" r=".7"><stop offset="0" stop-color="'+bg[0]+'"/><stop offset="1" stop-color="'+bg[1]+'"/></radialGradient></defs><rect width="1600" height="900" fill="url(#wbg)"/>'+inner+'</svg>';
  const slab=(pr,w,d)=>box(pr,-w/2,-d/2,-.5,w,d,.5,'#1a352f',{noShadow:1,round:10,line:'#6a8579'});

  /* world 1: the weld station, a lot of cells, and a measured fault */
  function weld(){
    const pr=P(800,330);let s=slab(pr,9,6);
    s+=box(pr,-3.6,-.9,0,2.2,1.8,.7,C.metal,{round:5});
    /* the module fixture with a row of cells */
    s+=box(pr,-1,-1.5,0,3.4,3,.5,C.graphite,{round:6});
    for(let r=0;r<2;r++)for(let k=0;k<8;k++){const bad=(r===0&&k===5);s+=box(pr,-.8+k*.38,-.85+r*.9,.5,.3,.7,.62,bad?'#8d4a39':C.sage,{noShadow:1,round:3})}
    s+=strip(pr,-.85,-.1,1.13,3.0,.14,C.amber,.85);
    /* the laser head and beam */
    s+=box(pr,.2,-.2,2.3,.9,.7,.5,C.graphite,{round:5}); s+=box(pr,.5,.05,1.2,.3,.2,1.1,C.metalLt,{noShadow:1,round:4});
    const b0=pr(.65,.15,1.2),b1=pr(.65,.15,.62);
    s+='<path d="M'+f(b0[0])+' '+f(b0[1])+'L'+f(b1[0])+' '+f(b1[1])+'" stroke="'+C.red+'" stroke-width="4" stroke-linecap="round" class="weldbeam"/><circle cx="'+f(b1[0])+'" cy="'+f(b1[1])+'" r="40" fill="url(#glR)" opacity=".8" class="weldglow"/>';
    /* the pack that the lot feeds */
    s+=box(pr,3.2,-1,0,2,2,.9,C.metal,{round:6}); s+=strip(pr,3.4,-.8,.92,1.6,.12,C.sage,.6);
    return ws('<g id="wRoot">'+s+'</g>',['#1b3a33','#0b1614']);
  }
  /* world 2: the independent boundary */
  function gate(){
    const pr=P(800,360);let s=slab(pr,10,5.4);
    s+=box(pr,-4.4,2.1,0,9,.8,.2,'#2b3d38',{noShadow:1,round:5});
    s+=box(pr,0,1.6,0,.4,.4,2.6,C.metal,{round:5}); s+=box(pr,0,3.4,0,.4,.4,2.6,C.metal,{round:5}); s+=box(pr,-.05,1.5,2.6,.5,2.4,.4,C.metalLt,{round:5});
    const sh=pr(.2,2.7,3.3);
    s+='<g transform="translate('+f(sh[0])+' '+f(sh[1])+')"><path d="M0 -34L26 -22V4Q22 24 0 36Q-22 24 -26 4V-22Z" fill="#17302a" stroke="'+C.amber+'" stroke-width="2.4" stroke-linejoin="round"/><path d="M-11 2L-2 11L14 -9" fill="none" stroke="'+C.amber+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>';
    s+=box(pr,-3.2,2.15,.2,.9,.7,.7,C.red==='x'?C.red:'#8d4a39',{round:5}); /* held proposal */
    s+=box(pr,2.4,2.15,.2,.9,.7,.7,C.green,{round:5});                       /* permitted action */
    const x1=pr(-2.6,2.5,1.2);s+='<g transform="translate('+f(x1[0])+' '+f(x1[1])+')"><circle r="15" fill="#10211e" stroke="'+C.red+'" stroke-width="2"/><path d="M-6 -6L6 6M6 -6L-6 6" stroke="'+C.red+'" stroke-width="2.4" stroke-linecap="round"/></g>';
    s+=box(pr,-3.8,-1.6,0,2.4,1.6,1.0,C.metal,{round:5}); s+=strip(pr,-3.6,-1.4,1.02,1.6,.1,C.sage,.7);
    return ws('<g id="wRoot">'+s+'</g>',['#1f3b3b','#0a1618']);
  }
  /* world 3: measured retest, a separate release, dispatch */
  function retest(){
    const pr=P(800,340);let s=slab(pr,10,5.6);
    s+=box(pr,-4.4,2.1,0,9,.8,.2,'#2b3d38',{noShadow:1,round:5});
    s+=box(pr,-2.6,-1.2,0,2.6,2.2,1.1,C.metal,{round:6});
    s+=box(pr,-2.3,-1.1,1.1,1.4,.14,.9,C.graphite,{noShadow:1,round:4});
    const scr=pr(-2.2,-.95,1.9);
    s+='<g transform="translate('+f(scr[0])+' '+f(scr[1])+')">'+[0,1,2,3,4].map(i=>'<rect x="'+(i*13-30)+'" y="'+(-6-[10,16,26,22,34][i])+'" width="9" height="'+[10,16,26,22,34][i]+'" rx="2.5" fill="'+(i<2?C.red:C.green)+'" opacity=".95" class="bar b'+i+'"/>').join('')+'</g>';
    s+=box(pr,.2,-1.1,0,1.6,1.8,.8,C.metal,{round:6}); s+=strip(pr,.35,-.9,.82,1.3,.12,C.green,.85);
    for(let k=0;k<4;k++)s+=box(pr,2.7+(k%2)*.85,-1.1+Math.floor(k/2)*.8,0,.75,.7,.55+(k===3?.45:0),k===3?C.green:C.metalLt,{round:4});
    s+=box(pr,-.6,2.15,.2,.9,.7,.7,C.green,{round:5});
    return ws('<g id="wRoot">'+s+'</g>',['#22392f','#0b1613']);
  }
  return {C,names,hero,weld,gate,retest,stationArt};
})();
