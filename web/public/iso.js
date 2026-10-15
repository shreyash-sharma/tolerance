/* Iso: original isometric industrial illustration for Tolerance. Rounded solids, soft lighting, no straight facets. */
window.Iso=(function(){
  let n=0;const id=p=>p+(++n),f=v=>Math.round(v*10)/10;
  const U=46; /* world unit in px */
  const P=(ox,oy)=>(x,y,z)=>[ox+(x-y)*U*.866,oy+(x+y)*U*.5-z*U];
  const poly=pts=>'M'+pts.map(p=>f(p[0])+' '+f(p[1])).join('L')+'Z';
  const mix=(a,b,t)=>{const A=parseInt(a.slice(1),16),B=parseInt(b.slice(1),16),c=i=>Math.round(((A>>i)&255)*(1-t)+((B>>i)&255)*t);return '#'+[16,8,0].map(i=>c(i).toString(16).padStart(2,'0')).join('')};

  /* a rounded box: three visible faces, each gently shaded, with a soft contact shadow */
  function box(proj,x,y,z,w,d,h,col,opt={}){
    const A=proj(x,y,z+h),B=proj(x+w,y,z+h),C=proj(x+w,y+d,z+h),D=proj(x,y+d,z+h);
    const b1=proj(x+w,y,z),c1=proj(x+w,y+d,z),d1=proj(x,y+d,z);
    const top=mix(col,'#ffffff',.18),right=mix(col,'#000000',.22),left=mix(col,'#000000',.06);
    const g=id('bx'),lw=opt.round||5,line=opt.line||mix(col,'#000000',.45);
    let s='';
    if(!opt.noShadow){const sc=proj(x+w/2+.25,y+d/2+.25,0);s+='<ellipse cx="'+f(sc[0])+'" cy="'+f(sc[1]+4)+'" rx="'+f((w+d)*U*.5)+'" ry="'+f((w+d)*U*.22)+'" fill="url(#isoshade)" opacity=".7"/>'}
    s+='<defs><linearGradient id="'+g+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+mix(top,'#ffffff',.12)+'"/><stop offset="1" stop-color="'+top+'"/></linearGradient></defs>';
    s+='<path d="'+poly([D,C,c1,d1])+'" fill="'+left+'" stroke="'+left+'" stroke-width="'+lw+'" stroke-linejoin="round"/>';
    s+='<path d="'+poly([B,C,c1,b1])+'" fill="'+right+'" stroke="'+right+'" stroke-width="'+lw+'" stroke-linejoin="round"/>';
    s+='<path d="'+poly([A,B,C,D])+'" fill="url(#'+g+')" stroke="url(#'+g+')" stroke-width="'+lw+'" stroke-linejoin="round"/>';
    s+='<path d="'+poly([A,B,C,D])+'" fill="none" stroke="'+line+'" stroke-opacity=".35" stroke-width="1.2" stroke-linejoin="round"/>';
    return s;
  }
  /* a glowing strip lying on a top face */
  function strip(proj,x,y,z,w,d,col,op=.95){
    const a=proj(x,y,z),b=proj(x+w,y,z),c=proj(x+w,y+d,z),e=proj(x,y+d,z);
    return '<path d="'+poly([a,b,c,e])+'" fill="'+col+'" opacity="'+op+'" stroke="'+col+'" stroke-width="2" stroke-linejoin="round"/>';
  }
  /* a rounded cylinder-ish drum (ellipse top, body) */
  function drum(proj,x,y,z,r,h,col){
    const c0=proj(x,y,z),c1=proj(x,y,z+h),rx=r*U*.866*1.15,ry=r*U*.5*1.15;
    const g=id('dr'),body=mix(col,'#000000',.15),top=mix(col,'#ffffff',.2);
    return '<defs><linearGradient id="'+g+'" x1="0" x2="1"><stop offset="0" stop-color="'+mix(col,'#000000',.3)+'"/><stop offset=".45" stop-color="'+mix(col,'#ffffff',.08)+'"/><stop offset="1" stop-color="'+mix(col,'#000000',.35)+'"/></linearGradient></defs>'
      +'<path d="M'+f(c0[0]-rx)+' '+f(c0[1])+'L'+f(c1[0]-rx)+' '+f(c1[1])+'A'+f(rx)+' '+f(ry)+' 0 0 0 '+f(c1[0]+rx)+' '+f(c1[1])+'L'+f(c0[0]+rx)+' '+f(c0[1])+'A'+f(rx)+' '+f(ry)+' 0 0 1 '+f(c0[0]-rx)+' '+f(c0[1])+'Z" fill="url(#'+g+')"/>'
      +'<ellipse cx="'+f(c1[0])+'" cy="'+f(c1[1])+'" rx="'+f(rx)+'" ry="'+f(ry)+'" fill="'+top+'"/>';
  }
  const defs='<defs><radialGradient id="isoshade"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><radialGradient id="glR"><stop offset="0" stop-color="#e0876b" stop-opacity=".9"/><stop offset="1" stop-color="#e0876b" stop-opacity="0"/></radialGradient><radialGradient id="glA"><stop offset="0" stop-color="#ffcf86" stop-opacity=".9"/><stop offset="1" stop-color="#ffcf86" stop-opacity="0"/></radialGradient><filter id="isoblur" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="7"/></filter><filter id="isoglow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9"/></filter></defs>';
  return {U,P,box,strip,drum,mix,poly,defs,id,f};
})();
