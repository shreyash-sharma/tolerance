/* Art: smooth, shaded vector scenery. Every outline is a Catmull-Rom spline converted to cubic Beziers, so there are no straight facets. */
window.Art=(function(){
  let uid=0;const id=p=>p+(++uid);
  const f=n=>Math.round(n*10)/10;

  /* open spline through points -> path commands */
  function spline(pts,closed){
    const n=pts.length,P=i=>closed?pts[(i+n)%n]:pts[Math.max(0,Math.min(n-1,i))];
    let d='M'+f(pts[0][0])+' '+f(pts[0][1]);
    const last=closed?n:n-1;
    for(let i=0;i<last;i++){
      const p0=P(i-1),p1=P(i),p2=P(i+1),p3=P(i+2);
      d+=' C'+f(p1[0]+(p2[0]-p0[0])/6)+' '+f(p1[1]+(p2[1]-p0[1])/6)+' '+f(p2[0]-(p3[0]-p1[0])/6)+' '+f(p2[1]-(p3[1]-p1[1])/6)+' '+f(p2[0])+' '+f(p2[1]);
    }
    return closed?d+'Z':d;
  }
  /* ground silhouette that continues straight down to the bottom edge */
  function ground(pts,bottom=900,w=1600){
    const a=pts[0],b=pts[pts.length-1];
    return spline(pts)+' L'+f(b[0])+' '+bottom+' L'+f(a[0])+' '+bottom+'Z';
  }
  /* a shaded ground layer: vertical gradient plus a soft rim light along the ridge */
  function layer(pts,top,bot,rim,bottom=900,line){
    const g=id('lg');
    return '<defs><linearGradient id="'+g+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+top+'"/><stop offset="1" stop-color="'+bot+'"/></linearGradient></defs>'
      +'<path d="'+ground(pts,bottom)+'" fill="url(#'+g+')"/>'
      +(rim?'<path d="'+spline(pts)+'" fill="none" stroke="'+rim+'" stroke-width="3" stroke-linecap="round" opacity=".55"/>':'')
      +(line?'<path d="'+spline(pts)+'" fill="none" stroke="'+line+'" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>':'');
  }
  /* closed organic shape (rocks, islands) with top-left light */
  function blob(pts,top,bot,rim){
    const g=id('bg'),d=spline(pts,true);
    return '<defs><linearGradient id="'+g+'" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="'+top+'"/><stop offset="1" stop-color="'+bot+'"/></linearGradient></defs>'
      +'<path d="'+d+'" fill="url(#'+g+')"/><path d="'+d+'" fill="none" stroke="'+rim+'" stroke-width="2.5" stroke-linejoin="round" opacity=".35"/>';
  }
  /* wavy cloud made of overlapping soft ellipses */
  function cloud(cx,cy,w,op){
    return '<g opacity="'+op+'" filter="url(#blur6)" fill="#ffd2ee"><ellipse cx="'+cx+'" cy="'+cy+'" rx="'+w+'" ry="'+w*.075+'"/><ellipse cx="'+(cx+w*.35)+'" cy="'+(cy-w*.06)+'" rx="'+w*.5+'" ry="'+w*.055+'"/><ellipse cx="'+(cx-w*.4)+'" cy="'+(cy+w*.02)+'" rx="'+w*.45+'" ry="'+w*.05+'"/></g>';
  }
  /* the pod: lit sphere, one wide central window with slim side windows, quiet banding and a flush hatch */
  function pod(x,y,size){
    const s=id('p');
    return '<svg x="'+x+'" y="'+y+'" width="'+size+'" height="'+size+'" viewBox="0 0 200 200" overflow="visible">'
    +'<defs><radialGradient id="'+s+'b" cx=".32" cy=".26" r=".9"><stop offset="0" stop-color="#e9d2ff"/><stop offset=".5" stop-color="#c08ef0"/><stop offset="1" stop-color="#8a52cf"/></radialGradient>'
    +'<linearGradient id="'+s+'w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8dcff"/><stop offset="1" stop-color="#a9b9ff"/></linearGradient>'
    +'<clipPath id="'+s+'c"><circle cx="100" cy="100" r="96"/></clipPath><clipPath id="'+s+'m"><rect x="56" y="44" width="92" height="60" rx="20"/></clipPath></defs>'
    +'<g clip-path="url(#'+s+'c)"><circle cx="100" cy="100" r="96" fill="url(#'+s+'b)"/>'
    +'<path d="M132 0a100 100 0 0 1 0 200 64 100 0 0 0 0-200z" fill="#6a38b8" opacity=".32"/>'
    +'<rect x="-14" y="52" width="52" height="46" rx="16" fill="url(#'+s+'w)" stroke="#5a2f9a" stroke-width="1.6"/><rect x="164" y="52" width="40" height="46" rx="16" fill="url(#'+s+'w)" stroke="#5a2f9a" stroke-width="1.6"/>'
    +'<rect x="56" y="44" width="92" height="60" rx="20" fill="url(#'+s+'w)" stroke="#5a2f9a" stroke-width="1.8"/>'
    +'<g clip-path="url(#'+s+'m)"><path d="M78 40l22 70h-14l-22-70zM108 40l22 70h-8l-22-70z" fill="#fff" opacity=".45"/></g>'
    +'<path d="M96 6q4 18 0 36M104 6q-4 18 0 36" stroke="#5a2f9a" stroke-width="1.4" fill="none" opacity=".6"/>'
    +'<path d="M2 120q98 22 196 0M8 138q92 20 184 0M22 156q78 18 156 0" stroke="#5a2f9a" stroke-width="1.3" fill="none" opacity=".45" stroke-linecap="round"/></g>'
    +'<circle cx="100" cy="100" r="96" fill="none" stroke="#5a2f9a" stroke-width="1.8" opacity=".7"/>'
    +'<ellipse cx="100" cy="178" rx="19" ry="5" fill="#3a1fa0"/><ellipse cx="100" cy="178" rx="9" ry="2.2" fill="#b8a8ff" opacity=".9"/></svg>';
  }
  /* rounded crystal: stroked with its own colour so every corner is soft, lit from the top-left */
  function gem(cx,cy,r,top,bot,rot=0){
    const g=id('gm'),pts=[0,1,2,3,4,5].map(i=>{const a=Math.PI/3*i+Math.PI/6;return [cx+Math.cos(a)*r,cy+Math.sin(a)*r*1.08]});
    const d='M'+pts.map(p=>f(p[0])+' '+f(p[1])).join('L')+'Z';
    return '<g transform="rotate('+rot+' '+cx+' '+cy+')"><defs><linearGradient id="'+g+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+top+'"/><stop offset="1" stop-color="'+bot+'"/></linearGradient></defs>'
      +'<path d="'+d+'" fill="url(#'+g+')" stroke="url(#'+g+')" stroke-width="'+r*.34+'" stroke-linejoin="round"/>'
      +'<path d="M'+f(pts[5][0])+' '+f(pts[5][1])+'L'+f(cx)+' '+f(cy)+'L'+f(pts[1][0])+' '+f(pts[1][1])+'M'+f(cx)+' '+f(cy)+'L'+f(pts[3][0])+' '+f(pts[3][1])+'" stroke="#fff" stroke-opacity=".45" stroke-width="'+f(r*.07)+'" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
      +'<ellipse cx="'+f(cx-r*.3)+'" cy="'+f(cy-r*.45)+'" rx="'+f(r*.3)+'" ry="'+f(r*.14)+'" fill="#fff" opacity=".45" transform="rotate(-25 '+f(cx-r*.3)+' '+f(cy-r*.45)+')"/></g>';
  }

  /* illustrated cloud: bumpy top, flat underside, soft edge */
  function cloud2(cx,cy,w,op){
    const b=[[cx-w,cy],[cx-w*.78,cy-w*.12],[cx-w*.5,cy-w*.06],[cx-w*.3,cy-w*.2],[cx,cy-w*.12],[cx+w*.28,cy-w*.22],[cx+w*.55,cy-w*.08],[cx+w*.82,cy-w*.12],[cx+w,cy]];
    return '<g opacity="'+op+'" filter="url(#blur2)"><path d="'+spline(b)+' L'+(cx+w)+' '+(cy+w*.05)+' L'+(cx-w)+' '+(cy+w*.05)+'Z" fill="#f6a8ee"/><path d="M'+(cx-w*.9)+' '+(cy+w*.02)+'L'+(cx+w*.9)+' '+(cy+w*.02)+'" stroke="#e58ae0" stroke-width="3" opacity=".5"/></g>';
  }
  /* small rocky island with a dark rim, for the data particle to sit on */
  function island(cx,cy,w,top,bot,line){
    const p=[[cx-w,cy+10],[cx-w*.7,cy-14],[cx-w*.2,cy-24],[cx+w*.3,cy-20],[cx+w*.8,cy-8],[cx+w,cy+12],[cx+w*.5,cy+30],[cx-w*.4,cy+32]];
    const g=id('is');
    return '<defs><linearGradient id="'+g+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+top+'"/><stop offset="1" stop-color="'+bot+'"/></linearGradient></defs><path d="'+spline(p,true)+'" fill="url(#'+g+')" stroke="'+line+'" stroke-width="2.2" stroke-linejoin="round" opacity=".98"/>'
      +'<path d="'+spline([[cx-w*.6,cy-8],[cx-w*.1,cy-16],[cx+w*.4,cy-12]])+'" stroke="#fff" stroke-opacity=".3" stroke-width="3" fill="none" stroke-linecap="round"/>';
  }
  /* shared defs */
  function defs(){
    return '<defs><filter id="blur2" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="1.4"/></filter><filter id="blur6" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>'
      +'<filter id="blur10" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10"/></filter>'
      +'<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter></defs>';
  }

  /* the home hero scene */
  function hero(){
    const sky=id('sk'),bm=id('bm'),hz=id('hz'),pad=id('pd'),cb=id('cb');
    return '<svg viewBox="0 0 1600 900" preserveAspectRatio="xMaxYMax slice" shape-rendering="geometricPrecision">'+defs()
    +'<defs><linearGradient id="'+sky+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#43125f"/><stop offset=".38" stop-color="#7d2bb0"/><stop offset=".68" stop-color="#c63f9e"/><stop offset=".86" stop-color="#ff7d62"/><stop offset="1" stop-color="#ffa45a"/></linearGradient>'
    +'<linearGradient id="'+bm+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0d9ff" stop-opacity=".85"/><stop offset="1" stop-color="#d9b8ff" stop-opacity=".18"/></linearGradient>'
    +'<radialGradient id="'+hz+'" cx=".5" cy="1" r=".6"><stop offset="0" stop-color="#ffc07a" stop-opacity=".75"/><stop offset="1" stop-color="#ffc07a" stop-opacity="0"/></radialGradient>'
    +'<radialGradient id="'+pad+'" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#d6fff0"/><stop offset="1" stop-color="#7fd3bd"/></radialGradient>'
    +'<linearGradient id="'+cb+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8ff9f"/><stop offset="1" stop-color="#8fdb4e"/></linearGradient></defs>'
    +'<rect width="1600" height="900" fill="url(#'+sky+')"/><rect y="500" width="1600" height="400" fill="url(#'+hz+')"/>'
    +'<g class="stars" fill="#fff"><circle cx="210" cy="130" r="2"/><circle cx="520" cy="70" r="1.6"/><circle cx="900" cy="160" r="2.2"/><circle cx="1320" cy="90" r="1.6"/><circle cx="700" cy="240" r="1.4"/><circle cx="1480" cy="210" r="1.8"/></g>'
    +'<g class="cloud c1">'+cloud(300,540,170,.5)+'</g><g class="cloud c2">'+cloud(1180,480,190,.4)+'</g>'
    +layer([[-40,640],[140,606],[340,632],[520,598],[720,646],[900,612],[1100,664],[1300,626],[1500,650],[1660,634]],'#3fae98','#1f7364','#a7f0de')
    +layer([[-40,716],[200,690],[420,730],[660,698],[900,742],[1180,708],[1440,736],[1660,712]],'#2d9380','#175e51','#7fdac4')
    +layer([[880,760],[980,690],[1130,642],[1300,616],[1460,600],[1660,570]],'#58c8b2','#2f9e8b','#d4fff1')
    +layer([[-40,842],[260,812],[560,848],[980,818],[1300,846],[1660,822]],'#175e51','#0d3b33','')
    +'<g transform="translate(190 0)"><g class="pod"><polygon points="1012,342 1088,342 1330,808 872,808" fill="url(#'+bm+')" class="beam" filter="url(#blur6)"/>'
    +'<g class="podbody">'+pod(905,165,190)+'</g></g>'
    +'<ellipse cx="1100" cy="808" rx="210" ry="38" fill="url(#'+pad+')"/><ellipse cx="1100" cy="812" rx="30" ry="6.5" fill="#0f4a40" opacity=".85"/>'
    +'<g class="cube"><circle cx="1100" cy="716" r="66" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="7 7" opacity=".85" class="ring"/>'
    +'<g filter="url(#glow)" opacity=".5"><circle cx="1100" cy="716" r="36" fill="#bfff7a"/></g>'
    +'<path d="M1100 684l30 17v36l-30 17-30-17v-36z" fill="url(#'+cb+')" stroke="#a9ea68" stroke-width="1.5" stroke-linejoin="round"/><path d="M1070 701l30 17 30-17M1100 718v36" stroke="#8fdb4e" stroke-width="1.5" fill="none" stroke-linecap="round"/></g>'
    +'</g></svg>';
  }
  return {spline,ground,layer,blob,cloud,cloud2,island,pod,gem,defs,hero};
})();
