export function makeDecision(market){
  if(!market?.valid)return{signal:"WAIT",confidence:0,reasons:[market?.reason??"invalid_market"],diagnostics:{valid:false}};
  const f=market.frames;
  let L=0,S=0;
  const reasons=[];
  for(const tf of ["1h","30min","15min","5min"]){
    const x=f[tf];
    if(!x?.valid)continue;
    const trendWeight=tf==="1h"?24:tf==="30min"?18:tf==="15min"?22:10;
    const structureWeight=tf==="15min"?16:7;
    if(x.trend==="bullish")L+=trendWeight;
    if(x.trend==="bearish")S+=trendWeight;
    if(x.structure==="bullish")L+=structureWeight;
    if(x.structure==="bearish")S+=structureWeight;
    if(x.momentum>0)L+=6;
    if(x.momentum<0)S+=6;
    if(x.macdBias>0)L+=5;
    if(x.macdBias<0)S+=5;
  }
  if(market.bias==="bullish")L+=14;
  if(market.bias==="bearish")S+=14;

  const best=Math.max(L,S),gap=Math.abs(L-S);
  let signal=L>S?"BUY":"SELL";
  const h1=f["1h"],m30=f["30min"],m15=f["15min"],m5=f["5min"];
  const diagnostics={valid:true,best,gap,atrPct,rsi:m15.rsi??50,alignedHTF,aligned15,m5NotOppose,rsiOK,volatilityOK};
  if(!h1?.valid||!m30?.valid||!m15?.valid)return{signal:"WAIT",confidence:Math.round(Math.min(100,best)),reasons:["تایم‌فریم‌های اصلی کامل نیستند"],diagnostics};

  const alignedHTF=(signal==="BUY"?h1.trend==="bullish"&&m30.trend==="bullish":h1.trend==="bearish"&&m30.trend==="bearish");
  const aligned15=signal==="BUY"?m15.structure==="bullish"&&m15.trend!=="bearish":m15.structure==="bearish"&&m15.trend!=="bullish";
  const m5NotOppose=!m5?.valid||(signal==="BUY"?m5.trend!=="bearish":m5.trend!=="bullish");
  const rsiOK=signal==="BUY"?(m15.rsi??50)<72:(m15.rsi??50)>28;
  const atrPct=m15.atr&&m15.price?m15.atr/m15.price:0;
  const volatilityOK=atrPct>=0.00025&&atrPct<=0.004;

  if(best<72||gap<18)return{signal:"WAIT",confidence:Math.round(Math.min(100,best)),reasons:["قدرت یا اختلاف سیگنال کافی نیست"],diagnostics};
  if(!alignedHTF||!aligned15||!m5NotOppose||!rsiOK||!volatilityOK)return{signal:"WAIT",confidence:Math.round(Math.min(100,best)),reasons:["فیلتر ورود اجازه معامله نمی‌دهد"],diagnostics};

  const confidence=Math.round(Math.min(98,best+Math.min(12,gap/2)));
  reasons.push("هم‌جهتی تایم‌فریم‌ها","ساختار 15 دقیقه‌ای تأیید شد","فیلتر نوسان و RSI تأیید شد");
  return{signal,confidence,reasons,diagnostics};
}
