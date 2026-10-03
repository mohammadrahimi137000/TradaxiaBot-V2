export function calculateRisk(decision,market){
  if(!market?.valid||decision.signal==="WAIT")return{active:false,entry:market?.price??null,stopLoss:null,takeProfits:[]};
  const f=market.frames["15min"]?.valid?market.frames["15min"]:market.frames["5min"],
        entry=market.price,
        a=f.atr??Math.max(entry*.001,1),
        distance=Math.max(a*1.55,entry*.0008),
        buffer=a*.25,
        sl=decision.signal==="BUY"?entry-distance-buffer:entry+distance+buffer,
        rr=[0.8,1.5,2.3],
        takeProfits=rr.map((r,i)=>({label:"TP"+(i+1),price:decision.signal==="BUY"?entry+distance*r:entry-distance*r,rr:r}));
  return{active:true,entry,stopLoss:sl,takeProfits,riskReward:2.3};
}
