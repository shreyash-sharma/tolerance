/* Sim: a tiny deterministic plant model for the Tolerance brochure game.
   It is labelled "simulated" everywhere it is shown. Outcomes follow the inputs; nothing here is scripted to succeed. */
window.Sim=(function(){
  const T=0.55;                                   /* weld resistance threshold, milliohm */
  const BAND={p:[2.4,3.0],d:[40,70]};             /* allowed correction band: laser power kW, dwell ms */
  const OPT={p:2.7,d:55};                         /* best setting inside the band (unknown to the player) */
  function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}

  /* one lot: 16 cells in two modules, one pack. Cell index 5 (shown as cell 6) has the drifting weld. */
  function lot(seed){
    const r=rng(seed||7),cells=[];
    for(let i=0;i<16;i++){let R=.42+(r()-.5)*.04;if(i===5)R=.78;if(i===4)R=.52;if(i===6)R=.53;cells.push({i,mod:i<8?'A':'B',R:+R.toFixed(3)})}
    return {cells,bad:5,T,units:{lot:19,modA:10,cell:1}};  /* units = cells + modules + pack that would be held */
  }
  /* is a correction allowed by policy? returns {ok, why} */
  function check(p,d){
    if(p<BAND.p[0])return {ok:false,why:'Laser power '+p.toFixed(2)+' kW is below the allowed '+BAND.p[0].toFixed(2)+' kW.'};
    if(p>BAND.p[1])return {ok:false,why:'Laser power '+p.toFixed(2)+' kW is above the allowed '+BAND.p[1].toFixed(2)+' kW.'};
    if(d<BAND.d[0])return {ok:false,why:'Dwell '+d+' ms is below the allowed '+BAND.d[0]+' ms.'};
    if(d>BAND.d[1])return {ok:false,why:'Dwell '+d+' ms is above the allowed '+BAND.d[1]+' ms.'};
    return {ok:true};
  }
  /* measured weld resistance after the correction and the observation window */
  function after(p,d){
    const dist=Math.hypot((p-OPT.p)/.6,(d-OPT.d)/30);
    return +(0.40+0.30*dist).toFixed(3);
  }
  function retest(lotState,p,d){
    const R=after(p,d);
    return {R,pass:R<=T,cells:lotState.cells.map(c=>c.i===lotState.bad?{...c,R}:c)};
  }
  /* level 5: a supplier delay. Every figure is a plain number the player can read. */
  const plan={
    need:16,stock:10,delayHours:8,dueHours:6,
    options:{
      A:{name:'Wait for the supplier',onTime:0,late:16,policy:'ok',note:'All 16 arrive 2 h after the due time.'},
      B:{name:'Ship 10 now, 6 later',onTime:10,late:6,policy:'ok',note:'10 on time. 6 follow when the delayed delivery lands.'},
      C:{name:'Pull 6 Grade B cells from the buffer',onTime:16,late:0,policy:'deny',note:'Grade B cells are not allowed on this order.'},
      D:{name:'Re-prioritize: borrow 6 cells from ORD-18',onTime:16,late:0,policy:'ok',note:'ORD-18 is not due for 20 h, so it can wait for the delivery.'}
    },
    rank:['D','B','A']                            /* the Core ranks allowed options only */
  };
  const clockStr=m=>String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(Math.round(m%60)).padStart(2,'0');
  return {T,BAND,OPT,lot,check,after,retest,plan,clockStr,rng};
})();
