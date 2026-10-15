/* Symbiont: the Symbiotic Compiler as a living double helix.
   An organic strand (mint, flowing) and a crystalline strand (amber, angular) twist around each other.
   Rungs are evidence links. Raw noisy particles drift in at the top; an ordered lattice comes out at the bottom:
   noise in, structure out, two different things woven together. All geometry is original. */
window.Symbiont=(function(){
  let n=0;const f=v=>Math.round(v*10)/10;
  const YR=86,N=40,A=40,MINT='#9fe6bf',AMB='#ffd391';

  function art(k){
    const id='sy'+(++n);
    return '<g class="symb-inst" data-sym="'+id+'" transform="scale('+(k||1)+')">'
     +'<defs><radialGradient id="'+id+'m" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="'+MINT+'" stop-opacity=".26"/><stop offset=".55" stop-color="'+AMB+'" stop-opacity=".12"/><stop offset="1" stop-color="'+AMB+'" stop-opacity="0"/></radialGradient></defs>'
     +'<ellipse rx="96" ry="132" fill="url(#'+id+'m)"/>'
     +'<ellipse rx="54" ry="102" fill="none" stroke="#e6f0e0" stroke-opacity=".2" stroke-width="1.2"/>'
     +'<g class="sy-in"></g><g class="sy-back"><path class="sy-ob"/><path class="sy-cb"/></g><g class="sy-rungs"></g><g class="sy-front"><path class="sy-of"/><path class="sy-cf"/></g><g class="sy-nodes"></g><g class="sy-out"></g></g>';
  }

  /* static helix icon for small sizes, drawn in a -24..24 box */
  function glyph(){
    return '<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M-9 -20C13 -12 -13 -4 9 4S-9 18 9 22" stroke="'+MINT+'" stroke-width="3.4"/><path d="M9 -20L-9 -8L9 4L-9 16L9 22" stroke="'+AMB+'" stroke-width="3.4" stroke-linejoin="miter"/><path d="M-6 -12H6M-3 4H3M-6 17H6" stroke="#f0eee4" stroke-opacity=".6" stroke-width="1.4"/></g>';
  }

  function runs(pts,front){
    /* build a path of the runs where depth is on the requested side; keep runs connected across the crossing */
    let d='',open=false;
    for(let i=0;i<pts.length;i++){
      const p=pts[i],on=front?p.z>=0:p.z<0;
      if(on){if(!open){const q=pts[i-1]||p;d+='M'+f(q.x)+' '+f(q.y)+'L'+f(p.x)+' '+f(p.y);open=true}else d+='L'+f(p.x)+' '+f(p.y)}
      else open=false;
    }
    return d;
  }

  function tickOne(g,t){
    const ph=t*1.05,oPts=[],cPts=[];
    for(let i=0;i<=N;i++){
      const y=-YR+i*(2*YR/N),th=ph+y*0.062;
      oPts.push({x:A*Math.sin(th),y:y,z:Math.cos(th)});
    }
    /* the crystalline strand has the same depth but only a few vertices, joined by straight edges */
    const step=3;
    for(let i=0;i<=N;i+=step){
      const p=oPts[i];cPts.push({x:-p.x,y:p.y,z:-p.z});
    }
    const q=(c,v)=>{const e=g.querySelector(c);if(e)e.setAttribute('d',v)};
    q('.sy-ob',runs(oPts.map(p=>p),false));q('.sy-of',runs(oPts,true));
    q('.sy-cb',runs(cPts,false));q('.sy-cf',runs(cPts,true));
    /* rungs, shimmering with depth */
    let r='',nd='';
    for(let i=0;i<cPts.length;i++){
      const c=cPts[i],o=oPts[i*step];const op=.12+.4*Math.abs(o.z);
      r+='<line x1="'+f(o.x)+'" y1="'+f(o.y)+'" x2="'+f(c.x)+'" y2="'+f(c.y)+'" stroke="#f0eee4" stroke-opacity="'+op.toFixed(2)+'" stroke-width="'+(1+Math.abs(o.z)*.8).toFixed(1)+'"/>';
      const s=2.4+2.4*Math.max(0,c.z);
      nd+='<path d="M'+f(c.x)+' '+f(c.y-s)+'L'+f(c.x+s)+' '+f(c.y)+'L'+f(c.x)+' '+f(c.y+s)+'L'+f(c.x-s)+' '+f(c.y)+'Z" fill="'+AMB+'" opacity="'+(.55+.45*Math.max(0,c.z)).toFixed(2)+'"/>';
    }
    for(let i=0;i<=N;i+=4){const o=oPts[i];nd+='<circle cx="'+f(o.x)+'" cy="'+f(o.y)+'" r="'+(2+1.8*Math.max(0,o.z)).toFixed(1)+'" fill="'+MINT+'" opacity="'+(.5+.5*Math.max(0,o.z)).toFixed(2)+'"/>'}
    const rg=g.querySelector('.sy-rungs');if(rg)rg.innerHTML=r;
    const nn=g.querySelector('.sy-nodes');if(nn)nn.innerHTML=nd;
    /* inflow: raw, noisy particles that settle as they approach the helix */
    let inn='';
    for(let j=0;j<14;j++){
      const s=(t*.32+j/14)%1,sd=Math.sin(j*12.9898)*43758.5453,rn=sd-Math.floor(sd);
      const x=(rn-.5)*110*(1-s)+Math.sin(t*3+j*1.7)*7*(1-s),y=-YR-84+s*78,rad=(2.6-s*1.2).toFixed(1);
      inn+='<circle cx="'+f(x)+'" cy="'+f(y)+'" r="'+rad+'" fill="'+MINT+'" opacity="'+(Math.sin(Math.PI*s)*.85).toFixed(2)+'"/>';
    }
    const si=g.querySelector('.sy-in');if(si)si.innerHTML=inn;
    /* outflow: an ordered lattice, each node tied to its neighbours */
    let out='';const pts=[];
    for(let row=0;row<3;row++)for(let col=0;col<2;col++)pts.push({x:(col?1:-1)*11,y:YR+18+row*17});
    for(let i=0;i<pts.length;i++){const a=pts[i];if(i%2===0&&pts[i+1])out+='<line x1="'+a.x+'" y1="'+a.y+'" x2="'+pts[i+1].x+'" y2="'+pts[i+1].y+'" stroke="'+AMB+'" stroke-opacity=".5"/>';if(pts[i+2])out+='<line x1="'+a.x+'" y1="'+a.y+'" x2="'+pts[i+2].x+'" y2="'+pts[i+2].y+'" stroke="'+AMB+'" stroke-opacity=".5"/>'}
    for(let i=0;i<pts.length;i++){const a=pts[i];out+='<rect x="'+(a.x-3.4)+'" y="'+(a.y-3.4)+'" width="6.8" height="6.8" rx="1.8" fill="'+AMB+'" opacity="'+(.55+.4*Math.sin(t*2.2+i*.9)).toFixed(2)+'"/>'}
    const so=g.querySelector('.sy-out');if(so)so.innerHTML=out;
    /* styling that cannot live in a stylesheet on pages without one */
    ['.sy-ob','.sy-cb'].forEach((c,i)=>{const e=g.querySelector(c);if(e){e.setAttribute('fill','none');e.setAttribute('stroke',i?AMB:MINT);e.setAttribute('stroke-width','2.6');e.setAttribute('stroke-opacity','.4');e.setAttribute('stroke-linecap','round');e.setAttribute('stroke-linejoin',i?'miter':'round')}});
    ['.sy-of','.sy-cf'].forEach((c,i)=>{const e=g.querySelector(c);if(e){e.setAttribute('fill','none');e.setAttribute('stroke',i?AMB:MINT);e.setAttribute('stroke-width','5.4');e.setAttribute('stroke-linecap','round');e.setAttribute('stroke-linejoin',i?'miter':'round')}});
  }
  let reduced=false,started=false,t0=performance.now();
  let fr=0,lastT=0;const vis=new Map();
  function frame(now){
    requestAnimationFrame(frame);
    if(now-lastT<32)return;lastT=now;fr++;const t=(now-t0)/1000;
    document.querySelectorAll('[data-sym]').forEach(g=>{
      if(fr%12===1||!vis.has(g)){const r=g.getBoundingClientRect();vis.set(g,r.width>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&!g.closest('.off'))}
      if(vis.get(g))tickOne(g,reduced?1.2:t)});
  }
  function start(){if(started)return;started=true;try{reduced=matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}requestAnimationFrame(frame)}
  start();
  return {art,glyph,start};
})();
