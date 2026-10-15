/* Scene2: the luminous, layered hero. A compiler core drops down a beam onto the weld fault. All art is original. */
(function(){
  const {box,mix,P,defs,id,f}=Iso,C=Scene.C,names=Scene.names,stationArt=Scene.stationArt;

  /* Tolerance's compiler motif: a faceted hexagonal core with an amber evidence band */
  function core(cx,cy,k){
    const g=id('cg');
    return '<g transform="translate('+f(cx)+' '+f(cy)+') scale('+k+')"><defs><linearGradient id="'+g+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#eef2dc"/><stop offset=".5" stop-color="#7fa595"/><stop offset="1" stop-color="#1c4a3d"/></linearGradient></defs>'
     +'<ellipse cy="96" rx="64" ry="14" fill="url(#isoshade)" opacity=".8"/>'
     +'<circle r="120" fill="url(#glA)" opacity=".45"/>'
     +'<path d="M0 -72L64 -36V36L0 72L-64 36V-36Z" fill="url(#'+g+')" stroke="#d6e4cf" stroke-width="2" stroke-linejoin="round"/>'
     +'<path d="M0 -72V0L64 -36M0 0V72M0 0L-64 -36" fill="none" stroke="#f4f8e8" stroke-opacity=".55" stroke-width="1.4" stroke-linecap="round"/>'
     +'<path d="M-64 -10L0 26L64 -10V8L0 44L-64 8Z" fill="#ffd391" stroke="#ffd391" stroke-width="2" stroke-linejoin="round" class="cband"/>'
     +'<g class="orbit"><ellipse rx="104" ry="30" fill="none" stroke="#e4b977" stroke-opacity=".55" stroke-dasharray="3 9"/><circle cx="104" cy="0" r="5" fill="#ffd391"/><circle cx="-104" cy="0" r="4" fill="#9fd08a"/></g></g>';
  }

  function hero(){
    const pr=P(520,200),sp=2.6,fx=3*sp,ft=pr(fx+.8,.7,1.9);
    let s='<svg viewBox="0 0 1600 900" preserveAspectRatio="xMaxYMid slice" shape-rendering="geometricPrecision">'+defs;
    s+='<defs><linearGradient id="hsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050d0c"/><stop offset=".45" stop-color="#0d2420"/><stop offset=".78" stop-color="#2a3a2c"/><stop offset="1" stop-color="#5a4224"/></linearGradient>'
     +'<radialGradient id="hglow" cx=".58" cy=".78" r=".55"><stop offset="0" stop-color="#ffc77a" stop-opacity=".55"/><stop offset="1" stop-color="#ffc77a" stop-opacity="0"/></radialGradient>'
     +'<radialGradient id="hmint" cx=".18" cy=".3" r=".5"><stop offset="0" stop-color="#6fe0b0" stop-opacity=".16"/><stop offset="1" stop-color="#6fe0b0" stop-opacity="0"/></radialGradient>'
     +'<linearGradient id="hbeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd391" stop-opacity="0"/><stop offset=".55" stop-color="#ffd391" stop-opacity=".38"/><stop offset="1" stop-color="#ffd391" stop-opacity=".12"/></linearGradient>'
     +'<linearGradient id="hray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8f3dc" stop-opacity=".18"/><stop offset="1" stop-color="#e8f3dc" stop-opacity="0"/></linearGradient>'
     +'<linearGradient id="hsky2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a3a33"/><stop offset="1" stop-color="#0d1f1b"/></linearGradient></defs>';
    s+='<rect width="1600" height="900" fill="url(#hsky)"/><rect width="1600" height="900" fill="url(#hglow)"/><rect width="1600" height="900" fill="url(#hmint)"/>';
    let st='';for(let i=0;i<46;i++){const x=(i*397)%1600,y=(i*181)%420,r=.8+((i*7)%5)*.35;st+='<circle cx="'+x+'" cy="'+y+'" r="'+r+'" class="star" style="animation-delay:'+(-(i%9)*.45)+'s"/>'}
    s+='<g id="lySky" fill="#f2f0e0">'+st+'</g>';
    s+='<g id="lyRays"><path d="M1100 -40L1360 -40L980 620L760 620Z" fill="url(#hray)"/><path d="M1420 -40L1560 -40L1300 560L1180 560Z" fill="url(#hray)" opacity=".7"/><path d="M780 -40L860 -40L640 600L560 600Z" fill="url(#hray)" opacity=".55"/></g>';
    let sk='';const tw=[[40,130,70],[130,200,54],[210,110,80],[320,240,60],[400,150,90],[520,190,50],[600,120,100],[730,230,56],[820,160,76],[930,210,60],[1010,130,92],[1130,250,52],[1210,170,84],[1330,220,60],[1410,140,90],[1520,200,70]];
    tw.forEach((t,i)=>{const x=t[0],h=t[1],w=t[2],y=640-h;sk+='<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="6" fill="url(#hsky2)"/>';for(let k=0;k<4;k++)if((i+k)%3===0)sk+='<rect x="'+(x+10+(k%2)*(w/2-8))+'" y="'+(y+16+Math.floor(k/2)*26)+'" width="7" height="10" rx="2" fill="#ffcf86" opacity=".8" class="lit" style="animation-delay:'+(-(i*3+k)*.7)+'s"/>'});
    sk+='<rect x="205" y="360" width="14" height="140" rx="6" fill="#16302a"/><rect x="1000" y="330" width="16" height="190" rx="6" fill="#16302a"/>';
    s+='<g id="lyFar" opacity=".85">'+sk+'<rect y="636" width="1600" height="264" fill="#0b1815"/></g>';

    s+='<g id="sceneRoot"><g id="lyFloor"><g class="slab">'+box(pr,-2,-2.4,-.5,sp*8+1.2,7.6,.5,'#244a40',{noShadow:1,round:10,line:'#cfe6d6'})+'</g>';
    const g=[];for(let k=-1;k<=sp*8;k+=1.3){const a=pr(k,-2.2,0),b=pr(k,5,0);g.push('M'+f(a[0])+' '+f(a[1])+'L'+f(b[0])+' '+f(b[1]))}for(let k=-2;k<=5;k+=1.3){const a=pr(-1.8,k,0),b=pr(sp*8,k,0);g.push('M'+f(a[0])+' '+f(a[1])+'L'+f(b[0])+' '+f(b[1]))}
    s+='<path d="'+g.join('')+'" stroke="#a8d4b9" stroke-opacity=".1" fill="none"/>';
    s+=box(pr,-1.2,2.1,0,sp*8+.6,.9,.2,'#33473f',{noShadow:1,round:5});
    const c0=pr(-1,2.55,.21),c1=pr(sp*8-.4,2.55,.21);
    s+='<path d="M'+f(c0[0])+' '+f(c0[1])+'L'+f(c1[0])+' '+f(c1[1])+'" stroke="#ffcf86" stroke-opacity=".8" stroke-width="2.4" stroke-dasharray="4 14" stroke-linecap="round" class="belt"/></g><g id="lyStations">';
    for(let i=0;i<8;i++)s+='<g class="st" style="--i:'+i+'">'+stationArt(pr,i,i*sp,i===3)+'</g>';
    const d0=pr(-1,2.55,.4),d1=pr(sp*8-1,2.55,.4),dx=d1[0]-d0[0],dy=d1[1]-d0[1];
    s+='<g class="cells" style="--dx:'+f(dx)+'px;--dy:'+f(dy)+'px">';
    for(let k=0;k<9;k++)s+='<g class="cell" style="animation-delay:'+(-k*1.7)+'s"><g transform="translate('+f(d0[0])+' '+f(d0[1])+')"><rect x="-7" y="-9" width="14" height="14" rx="4" fill="'+(k===4?C.red:'#bcd8c6')+'"/><rect x="-5" y="-7" width="10" height="3" rx="1.5" fill="#fff" opacity=".5"/></g></g>';
    s+='</g>';
    names.forEach((nm,i)=>{if(i===3)return;const p=pr(i*sp+.8,.7,(i===4?2.0:i===7?1.4:1.9));s+='<text x="'+f(p[0])+'" y="'+f(p[1]-26)+'" text-anchor="middle" class="tag">'+nm+'</text>'});
    /* symbiosis: knowledge flows from the plant up to the core, proposals flow back down */
    {const cx=ft[0],cy=ft[1]-130;let lk='';
     for(let i=0;i<8;i++){const tp=pr(i*sp+.8,.7,1.55),dx=(i-3)*14;
      const d1='M'+f(cx)+' '+f(cy)+' C'+f(cx+dx*2)+' '+f(cy+60)+' '+f(tp[0])+' '+f(tp[1]-110)+' '+f(tp[0])+' '+f(tp[1]-6);
      const d2='M'+f(cx+7)+' '+f(cy+4)+' C'+f(cx+dx*2+12)+' '+f(cy+64)+' '+f(tp[0]+8)+' '+f(tp[1]-108)+' '+f(tp[0]+6)+' '+f(tp[1]-6);
      lk+='<path d="'+d1+'" class="flowA"/><path d="'+d2+'" class="flowB"/>'
        +'<circle r="3.2" fill="#ffd391"><animateMotion dur="'+(3.2+i*.22)+'s" begin="'+(2.8+i*.15)+'s" repeatCount="indefinite" path="'+d1+'"/></circle>'
        +'<circle r="2.8" fill="#9fe6bf"><animateMotion dur="'+(3.6+i*.2)+'s" begin="'+(3+i*.12)+'s" repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear" path="'+d2+'"/></circle>'}
     s+='<g class="symb" fill="none">'+lk+'</g>';}
    s+='<g class="fault" transform="translate('+f(ft[0])+' '+f(ft[1]+10)+')"><circle r="22" fill="none" stroke="'+C.red+'" stroke-width="1.6" class="pulse"/><circle r="22" fill="none" stroke="'+C.red+'" stroke-width="1.6" class="pulse p2"/><circle r="5" fill="'+C.red+'"/></g></g>';

    s+='<g id="lyCore"><g class="coreDrop"><polygon points="'+f(ft[0]-34)+',-700 '+f(ft[0]+34)+',-700 '+f(ft[0]+120)+','+f(ft[1]+50)+' '+f(ft[0]-120)+','+f(ft[1]+50)+'" fill="url(#hbeam)" class="beam2"/>'
      +'<g class="coreBob"><g transform="translate('+f(ft[0])+' '+f(ft[1]-205)+')">'+Symbiont.art(1.18)+'</g></g>'
      +'<g class="coreTag" transform="translate('+f(ft[0]+96)+' '+f(ft[1]-250)+')"><rect x="-4" y="-18" width="188" height="38" rx="10" fill="#10211e" stroke="#e4b977" stroke-opacity=".6"/><text x="12" y="-2" class="tg1" style="fill:#f4dca8">SYMBIOTIC COMPILER</text><text x="12" y="13" class="tg2">evidence attached to every fact</text></g></g></g></g>';
    let du='';for(let i=0;i<26;i++){du+='<circle cx="'+((i*251)%1600)+'" cy="'+(120+(i*173)%700)+'" r="'+(1.2+(i%4)*.6)+'" class="dust" style="animation-delay:'+(-(i%11)*1.3)+'s;animation-duration:'+(9+(i%7)*2)+'s"/>'}
    s+='<g fill="#ffe3b0" opacity=".55">'+du+'</g></svg>';
    return s;
  }
  hero.fault=function(){const pr=P(520,200),w=pr(3*2.6+.8,.7,1.9);return {x:w[0],y:w[1]}};
  Scene.hero=hero;Scene.core=core;
})();

/* ---------- worlds: each gets its own sky, skyline, light shafts and dust ---------- */
(function(){
  const skies={
   weld:  {top:'#050c18',mid:'#10303c',hor:'#b3702c',glow:'#ffb866',star:1,   tw:'#1a2f3a',win:'#ffcf86'},
   gate:  {top:'#09121f',mid:'#1c3a4c',hor:'#9a6a5c',glow:'#ffd7b0',star:.7,  tw:'#20384a',win:'#ffe0b8'},
   retest:{top:'#08170f',mid:'#1f4a36',hor:'#c9a64a',glow:'#fff0a8',star:.45, tw:'#1d3f2d',win:'#fff0b0'}};
  function layers(k){
   const p=skies[k],u=Iso.id('wk');
   let st='';for(let i=0;i<60;i++){const x=(i*313)%1600,y=(i*149)%430,r=.8+((i*7)%5)*.36;st+='<circle cx="'+x+'" cy="'+y+'" r="'+r+'" class="star" style="animation-delay:'+(-(i%9)*.5)+'s"/>'}
   const tw=[[30,150,80],[140,230,60],[230,130,90],[340,260,66],[430,170,100],[560,210,56],[650,140,110],[790,250,60],[880,180,84],[990,230,66],[1080,150,100],[1210,270,58],[1290,190,92],[1410,240,64],[1500,160,90]];
   let sk='';tw.forEach((t,i)=>{const x=t[0],h=t[1],w=t[2],y=480-h;sk+='<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="6" fill="'+p.tw+'"/>';for(let j=0;j<4;j++)if((i+j)%3===0)sk+='<rect x="'+(x+10+(j%2)*(w/2-8))+'" y="'+(y+16+Math.floor(j/2)*26)+'" width="7" height="10" rx="2" fill="'+p.win+'" class="lit" style="animation-delay:'+(-(i*3+j)*.8)+'s"/>'});
   return '<defs><linearGradient id="'+u+'s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+p.top+'"/><stop offset=".5" stop-color="'+p.mid+'"/><stop offset="1" stop-color="'+p.hor+'"/></linearGradient>'
    +'<linearGradient id="'+u+'f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f241d"/><stop offset="1" stop-color="#050b09"/></linearGradient><radialGradient id="'+u+'g" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="'+p.glow+'" stop-opacity=".5"/><stop offset="1" stop-color="'+p.glow+'" stop-opacity="0"/></radialGradient>'
    +'<linearGradient id="'+u+'r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef6e8" stop-opacity=".2"/><stop offset="1" stop-color="#eef6e8" stop-opacity="0"/></linearGradient></defs>'
    +'<rect width="1600" height="900" fill="url(#'+u+'s)"/><rect width="1600" height="900" fill="url(#'+u+'g)"/>'
    +'<g fill="#f2f0e0" opacity="'+p.star+'">'+st+'</g>'
    +'<g><path d="M300 -40L520 -40L760 700L560 700Z" fill="url(#'+u+'r)"/><path d="M1100 -40L1240 -40L1020 640L900 640Z" fill="url(#'+u+'r)" opacity=".7"/></g>'
    +'<g opacity=".9">'+sk+'<rect y="476" width="1600" height="440" fill="url(#'+u+'f)"/></g>';
  }
  const dust='<g fill="#ffe3b0" opacity=".5">'+Array.from({length:24},(_,i)=>'<circle cx="'+((i*263)%1600)+'" cy="'+(140+(i*181)%680)+'" r="'+(1.2+(i%4)*.6)+'" class="dust" style="animation-delay:'+(-(i%11)*1.3)+'s;animation-duration:'+(9+(i%7)*2)+'s"/>').join('')+'</g>';
  const orig={weld:Scene.weld,gate:Scene.gate,retest:Scene.retest};
  ['weld','gate','retest'].forEach(k=>{Scene[k]=()=>orig[k]().replace('<rect width="1600" height="900" fill="url(#wbg)"/>',layers(k)).replace('<g id="wRoot">','<g id="wRoot" class="wrise">').replace('</svg>',dust+'</svg>')});
})();
