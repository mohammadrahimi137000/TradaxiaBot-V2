// Key Level Engine
// Ported from the production bot's levels logic for V2 backtesting.
// Historical-only diagnostics: level quality, zones, reactions and blocking.

function median(values){
  const a=values.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length)return 0;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function calculateATR(c,n=14){
  if(!Array.isArray(c)||c.length<n+1)return 0;
  let sum=0;
  for(let i=c.length-n;i<c.length;i++){
    const x=c[i],p=c[i-1];
    sum+=Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close));
  }
  return sum/n;
}
function directionFromPrice(center,x,forward){
  const start=Number(x.close);if(!Number.isFinite(start))return 0;
  let best=0;
  for(const bar of forward){
    if(center<=start)best=Math.max(best,Number(bar.high)-start);
    else best=Math.max(best,start-Number(bar.low));
  }
  return Math.max(0,best);
}
export function detectKeyLevels(c,context={}){
  const atr=Number.isFinite(context.atr)?context.atr:(calculateATR(c,14)||0.001);
  const price=c.at(-1)?.close;
  if(!Number.isFinite(price))return{all:[],nearestSupport:null,nearestResistance:null,blocked:{buy:false,sell:false}};
  const interval=String(context.interval||"").toLowerCase();
  const historySize=(interval==="1min"||interval==="1m")?500:(interval==="1h"||interval==="1hour"||interval==="60min")?250:350;
  const from=Math.max(0,c.length-historySize),recent=c.slice(from);
  const tolerance=Math.max(atr*.30,price*.00008);
  const zoneProfile=interval==="1min"||interval==="1m"?{minAtr:.45,maxAtr:1.50,paddingAtr:.22}:interval==="5min"||interval==="5m"?{minAtr:.55,maxAtr:1.80,paddingAtr:.28}:interval==="15min"||interval==="15m"?{minAtr:.70,maxAtr:2.20,paddingAtr:.35}:interval==="1h"||interval==="1hour"||interval==="60min"?{minAtr:.90,maxAtr:2.60,paddingAtr:.45}:{minAtr:.60,maxAtr:2.00,paddingAtr:.30};
  const zonePadding=Math.max(atr*zoneProfile.paddingAtr,price*.00004);
  const raw=[],add=(pricePoint,source,weight,direction=null,meta={})=>{if(Number.isFinite(Number(pricePoint)))raw.push({price:Number(pricePoint),source,weight,direction,...meta});};

  for(const x of(context.liquidity||[])){if(!x||!Number.isFinite(Number(x.center)))continue;const direction=x.center<price?"support":"resistance";add(x.center,"Liquidity",Number(x.score)>=70?7:5,direction,{liquidityType:x.type,touches:x.touches,age:x.age});}
  const roundStep=price>=3000?5:price>=100?1:.1;
  if(roundStep>0){const base=Math.round(price/roundStep)*roundStep;for(const k of[-2,-1,0,1,2]){const level=base+k*roundStep;if(Math.abs(level-price)<=atr*3.5)add(level,"Round Number",1.5,level<price?"support":"resistance");}}
  for(const x of(context.fvg||[])){if(!x||x.status==="filled")continue;const direction=x.type==="bullish"?"support":"resistance";add(x.low,"FVG",9,direction,{zoneLow:x.low,zoneHigh:x.high,age:Number(x.age)||0,fresh:x.status==="fresh"});add(x.high,"FVG",9,direction,{zoneLow:x.low,zoneHigh:x.high,age:Number(x.age)||0,fresh:x.status==="fresh"});}
  for(const x of(context.orderBlocks||[])){if(!x||x.status==="filled"||x.structureAligned===false)continue;const direction=x.type==="bullish"?"support":"resistance";add(x.low,"Order Block",11,direction,{zoneLow:x.low,zoneHigh:x.high,age:Number(x.age)||0,fresh:x.status==="fresh"});add(x.high,"Order Block",11,direction,{zoneLow:x.low,zoneHigh:x.high,age:Number(x.age)||0,fresh:x.status==="fresh"});}
  const structure=context.structure||{};
  add(structure.swingHigh,"Swing High",12,"resistance");add(structure.previousSwingHigh,"Previous Swing High",9,"resistance");add(structure.swingLow,"Swing Low",12,"support");add(structure.previousSwingLow,"Previous Swing Low",9,"support");
  for(let i=from;i<c.length;i++){const x=c[i];add(x.open,"Body",1.8,null,{index:i});add(x.close,"Body",1.8,null,{index:i});add(x.high,"Wick",.8,null,{index:i});add(x.low,"Wick",.8,null,{index:i});}
  raw.sort((a,b)=>a.price-b.price);
  const clusters=[];
  for(const point of raw){
    let cluster=null,bestDistance=Infinity;
    for(const candidate of clusters){const distance=Math.abs(point.price-candidate.center);if(distance<=tolerance&&distance<bestDistance){cluster=candidate;bestDistance=distance;}}
    if(!cluster){cluster={values:[],points:[],sources:{},weight:0,minPrice:point.price,maxPrice:point.price,center:point.price};clusters.push(cluster);}
    cluster.values.push(point.price);cluster.points.push(point);cluster.sources[point.source]=(cluster.sources[point.source]||0)+1;cluster.weight+=point.weight;cluster.minPrice=Math.min(cluster.minPrice,point.price);cluster.maxPrice=Math.max(cluster.maxPrice,point.price);
    const totalWeight=cluster.points.reduce((sum,item)=>sum+item.weight,0);
    cluster.center=cluster.points.reduce((sum,item)=>sum+item.price*item.weight,0)/Math.max(totalWeight,.000001);
  }
  const medianVolume=median(recent.map(x=>Number(x.volume)).filter(v=>Number.isFinite(v)&&v>0).slice(-80));
  const levels=clusters.map(cluster=>{
    const center=cluster.center,bodyTouches=cluster.sources.Body||0,wickTouches=cluster.sources.Wick||0,fvgCount=cluster.sources.FVG||0,obCount=cluster.sources["Order Block"]||0,swingCount=(cluster.sources["Swing High"]||0)+(cluster.sources["Previous Swing High"]||0)+(cluster.sources["Swing Low"]||0)+(cluster.sources["Previous Swing Low"]||0),touches=bodyTouches+wickTouches;
    const indices=cluster.points.filter(p=>Number.isInteger(p.index)).map(p=>p.index).sort((a,b)=>a-b);let independentTouches=0,lastTouch=-9999;for(const idx of indices){if(idx-lastTouch>=4){independentTouches++;lastTouch=idx;}}
    const zoneLow=Math.max(0,Math.min(cluster.minPrice,center-zonePadding)),zoneHigh=Math.max(zoneLow,Math.max(cluster.maxPrice,center+zonePadding));
    let rejection=0,reaction=0,displacement=0,relativeVolumeHits=0,reactionStrength=0,maxReactionAtr=0,liquiditySweep=0;
    for(let i=from;i<c.length;i++){
      const x=c[i];if(x.high<zoneLow||x.low>zoneHigh)continue;
      const range=Math.max(x.high-x.low,.000001),body=Math.abs(x.close-x.open),upperWick=x.high-Math.max(x.open,x.close),lowerWick=Math.min(x.open,x.close)-x.low;
      if(upperWick/range>=.45||lowerWick/range>=.45)rejection++;
      if(body/range>=.60)displacement++;
      if(Number.isFinite(medianVolume)&&Number(x.volume)>medianVolume*1.35)relativeVolumeHits++;
      const next=c[i+1];if(next){if(x.close<=zoneHigh&&next.close>zoneHigh)reaction++;if(x.close>=zoneLow&&next.close<zoneLow)reaction++;}
      const lookAhead=Math.min(c.length-1,i+12),forward=c.slice(i+1,lookAhead+1);if(forward.length){const bestMove=directionFromPrice(center,x,forward),reactionAtr=bestMove/Math.max(atr,.000001);if(reactionAtr>maxReactionAtr)maxReactionAtr=reactionAtr;reactionStrength+=Math.min(2.5,Math.max(0,reactionAtr));}
    }
    const direction=center<price?"support":center>price?"resistance":"inside";
    for(let i=from;i<c.length;i++){const x=c[i];if(direction==="support"&&x.low<zoneLow&&x.close>zoneHigh)liquiditySweep++;if(direction==="resistance"&&x.high>zoneHigh&&x.close<zoneLow)liquiditySweep++;}
    const ages=cluster.points.map(p=>Number.isInteger(p.index)?c.length-1-p.index:Number(p.age)).filter(v=>Number.isFinite(v));const age=ages.length?Math.min(...ages):9999,freshnessScore=age<=20?8:age<=60?5:age<=150?2:0;
    const sourceTypes=[obCount>0,fvgCount>0,swingCount>0,independentTouches>=2,rejection>=2].filter(Boolean).length;
    const confluenceScore=sourceTypes>=4?10:sourceTypes===3?7:sourceTypes===2?4:0;
    const touchScore=Math.min(20,independentTouches*4+Math.min(4,touches)),structureScore=Math.min(25,obCount*8+fvgCount*6+swingCount*7),reactionQualityScore=Math.min(12,reaction*1.5+Math.min(6,maxReactionAtr*2.5)),reactionScore=Math.min(10,reaction*2),rejectionScore=Math.min(8,rejection*1.5),displacementScore=Math.min(6,displacement*1.5),volumeScore=Math.min(5,relativeVolumeHits),sweepScore=Math.min(8,liquiditySweep*4);
    const distanceAtr=Math.abs(price-center)/Math.max(atr,.000001),proximityScore=distanceAtr>=.5&&distanceAtr<=3.5?6:distanceAtr<.5?1:3;
    const qualityScore=Math.min(100,Math.round(8+touchScore+structureScore+reactionScore+reactionQualityScore+rejectionScore+displacementScore+volumeScore+sweepScore+freshnessScore+confluenceScore)),relevanceFactor=proximityScore>=6?1:proximityScore<=1?.55:.78,score=Math.min(100,Math.round(qualityScore*relevanceFactor));
    const maxWidth=Math.max(atr*zoneProfile.maxAtr,tolerance*2),minWidth=Math.max(atr*zoneProfile.minAtr,price*.00008),observedWidth=Math.max(zoneHigh-zoneLow,atr*.08),boundedWidth=Math.min(Math.max(observedWidth,minWidth),maxWidth),low=center-boundedWidth/2,high=center+boundedWidth/2;
    return{center:Number(center.toFixed(2)),low:Number(low.toFixed(2)),high:Number(high.toFixed(2)),width:Number(boundedWidth.toFixed(2)),score,qualityScore,relevanceFactor,finalScore:score,direction,age,touches,independentTouches,bodyTouches,wickTouches,rejectionCount:rejection,reactionCount:reaction,reactionStrength:Number(reactionStrength.toFixed(2)),maxReactionAtr:Number(maxReactionAtr.toFixed(2)),displacementCount:displacement,relativeVolumeHits,liquiditySweepCount:liquiditySweep,confluenceSources:sourceTypes,confluenceDetail:{orderBlock:obCount>0,fvg:fvgCount>0,swing:swingCount>0,repeatedReaction:independentTouches>=2,rejection:rejection>=2,liquiditySweep:liquiditySweep>0},sources:Object.keys(cluster.sources).filter(key=>cluster.sources[key]>0)};
  }).filter(x=>x.score>=45&&x.direction!=="inside");
  const supports=levels.filter(x=>x.direction==="support").sort((a,b)=>b.center-a.center),resistances=levels.filter(x=>x.direction==="resistance").sort((a,b)=>a.center-b.center);
  const selectStrongest=items=>items.filter(level=>!level.breakout||level.retest).sort((a,b)=>{const scoreDiff=b.score-a.score;if(scoreDiff!==0)return scoreDiff;const da=Math.abs(price-a.center)/Math.max(atr,.000001),db=Math.abs(price-b.center)/Math.max(atr,.000001);return da-db;})[0]||null;
  const nearestSupport=selectStrongest(supports),nearestResistance=selectStrongest(resistances);
  const proximity=Math.max(atr*.85,.01),buyBlocked=!!nearestResistance&&nearestResistance.score>=65&&price<=nearestResistance.high&&nearestResistance.center-price<=proximity,sellBlocked=!!nearestSupport&&nearestSupport.score>=65&&price>=nearestSupport.low&&price-nearestSupport.center<=proximity;
  const levelStrength=level=>{if(!level)return null;const score=Number(level.score)||0;return score>=80?"strong":score>=65?"moderate":"weak";};
  const supportResistanceIndicator={support:nearestSupport?{center:nearestSupport.center,low:nearestSupport.low,high:nearestSupport.high,score:nearestSupport.score,strength:levelStrength(nearestSupport),distanceAtr:Number((Math.abs(price-nearestSupport.center)/Math.max(atr,.000001)).toFixed(2)),state:nearestSupport.state||"unknown",mtfConfluence:nearestSupport.mtfConfluence||0}:null,resistance:nearestResistance?{center:nearestResistance.center,low:nearestResistance.low,high:nearestResistance.high,score:nearestResistance.score,strength:levelStrength(nearestResistance),distanceAtr:Number((Math.abs(nearestResistance.center-price)/Math.max(atr,.000001)).toFixed(2)),state:nearestResistance.state||"unknown",mtfConfluence:nearestResistance.mtfConfluence||0}:null,blocked:{buy:buyBlocked,sell:sellBlocked}};
  return{all:levels.sort((a,b)=>b.score-a.score).slice(0,30),nearestSupport,nearestResistance,proximityAtr:.85,blocked:{buy:buyBlocked,sell:sellBlocked},supportResistanceIndicator,reason:buyBlocked?"مقاومت معتبر نزدیک قیمت":sellBlocked?"حمایت معتبر نزدیک قیمت":null};
}