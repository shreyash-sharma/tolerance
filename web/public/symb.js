/* Symbiosis diagram: the factory (host), Tolerance (the compiler layer) and the people (authority), in one loop. */
(function(){
 const lane=(d,cls,id)=>'<path id="'+id+'" d="'+d+'" class="slane '+cls+'"/>';
 const dot=(id,c,dur,rev)=>'<circle r="3.6" fill="'+c+'"><animateMotion dur="'+dur+'s" repeatCount="indefinite" '+(rev?'keyPoints="1;0" keyTimes="0;1" calcMode="linear" ':'')+'><mpath href="#'+id+'"/></animateMotion></circle>';
 const lab=(id,t)=>'<text class="slbl" dy="-7"><textPath href="#'+id+'" startOffset="50%" text-anchor="middle">'+t+'</textPath></text>';
 const node=(x,y,w,h,title,sub,icon,tx)=>'<g transform="translate('+x+' '+y+')"><rect x="'+(-w/2)+'" y="'+(-h/2)+'" width="'+w+'" height="'+h+'" rx="22" fill="#10211e" stroke="#e4b977" stroke-opacity=".55"/>'+icon+'<text x="'+(-w/2+(tx||62))+'" y="-3" class="snode">'+title+'</text><text x="'+(-w/2+(tx||62))+'" y="15" class="ssub">'+sub+'</text></g>';
 const iFactory='<g transform="translate(-60 0)"><path d="M-18 6L0 16L18 6V-8L0 2L-18 -8Z" fill="#5f7b6e" stroke="#9bbbab" stroke-linejoin="round"/><path d="M0 2V16M-18 -8L0 -18L18 -8" fill="none" stroke="#cfe6d6" stroke-linejoin="round"/></g>';
 const iCore='<g transform="translate(-60 0)">'+Symbiont.glyph()+'</g>';
 const iPeople='<g transform="translate(-78 0)"><circle cx="-8" cy="-8" r="7" fill="#e9e5d8"/><path d="M-20 14Q-8 0 4 14" fill="#e9e5d8"/><circle cx="12" cy="-6" r="6" fill="#c7d3c4"/><path d="M2 14Q12 2 24 14" fill="#c7d3c4"/></g>';
 const P={a:'M150 292C250 214 400 214 490 292',b:'M490 352C400 432 250 432 150 352',c:'M538 282C552 178 458 112 392 92',d:'M356 108C436 140 500 206 506 284',e:'M262 98C166 126 108 214 108 282'};
 const s=lane(P.a,'a','la')+lane(P.b,'b','lb')+lane(P.c,'b','lc')+lane(P.d,'a','ld')+lane(P.e,'h','le')
  +dot('la','#ffd391',3.4)+dot('lb','#9fe6bf',3.8,1)+dot('lc','#9fe6bf',3.2)+dot('ld','#ffd391',3,1)
  +lab('la','SOURCES · SIGNALS')+lab('lb','PROPOSALS · MEASURED OUTCOMES')+lab('lc','FINDINGS + EVIDENCE')+lab('ld','APPROVALS · CORRECTIONS')+lab('le','AUTHORITY STAYS WITH PEOPLE')
  +node(110,322,200,86,'THE FACTORY','the host',iFactory)
  +node(530,322,200,86,'TOLERANCE','the compiler layer',iCore)
  +node(320,62,230,76,'PEOPLE','keep the final say',iPeople,92)
  +'<g transform="translate(320 318)" text-anchor="middle"><text class="slbl" y="-4" style="fill:#e4b977">VERIFIED OUTCOMES</text><text class="ssub" y="12">make both sides better</text></g>';
 const el=document.getElementById('symArt');if(el)el.innerHTML=s;
})();
