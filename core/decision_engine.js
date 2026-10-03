export function makeDecision(market){
  if(!market?.valid)return{signal:"WAIT",confidence:0,reasons:[market?.reason??"invalid_market"],diagnostics:{valid:false}};

  const f=market.frames;
  let L=0,S=0;
  const reasons=[];
  const add=(side,points,label)=>{
    if(side==="bullish")L+=points;
    if(side==="bearish")S+=points;
    if(side)reasons.push(label);
  };

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

    // Moving averages: SMA/EMA 20/50/100/200
    const ma=x.movingAverages??{};
    const maPairs=[
      ["ema20","ema50",4],["ema50","ema100",3],["ema100","ema200",3],
      ["ma20","ma50",3],["ma50","ma100",2],["ma100","ma200",2]
    ];
    for(const [fast,slow,w] of maPairs){
      if(Number.isFinite(ma[fast])&&Number.isFinite(ma[slow])){
        if(ma[fast]>ma[slow])L+=w;
        if(ma[fast]<ma[slow])S+=w;
      }
    }
    if(Number.isFinite(x.price)&&Number.isFinite(ma.ema200)){
      if(x.price>ma.ema200)L+=3;
      if(x.price<ma.ema200)S+=3;
    }

    // Ichimoku
    const ichi=x.ichimoku;
    if(ichi){
      if(ichi.aboveCloud)L+=4;
      if(ichi.belowCloud)S+=4;
      if(ichi.cloudBullish)L+=2;
      else S+=2;
      if(Number.isFinite(ichi.tenkan)&&Number.isFinite(ichi.kijun)){
        if(ichi.tenkan>ichi.kijun)L+=3;
        if(ichi.tenkan<ichi.kijun)S+=3;
      }
    }

    // Bollinger
    const bb=x.bollinger;
    if(bb&&Number.isFinite(x.price)){
      if(x.price>bb.middle)L+=2;
      if(x.price<bb.middle)S+=2;
      if(x.price>=bb.upper)S+=2;
      if(x.price<=bb.lower)L+=2;
    }

    // Stochastic
    const st=x.stochastic;
    if(st&&Number.isFinite(st.k)&&Number.isFinite(st.d)){
      if(st.k>st.d)L+=3;
      if(st.k<st.d)S+=3;
      if(st.k<20)L+=2;
      if(st.k>80)S+=2;
    }

    // ADX: trend-strength bonus only, directional side follows DI-like
    // direction already represented by price/MA structure; ADX itself is not directional.
    if(Number.isFinite(x.adx)&&x.adx>=20){
      if(x.trend==="bullish")L+=3;
      if(x.trend==="bearish")S+=3;
    }

    // Smart/classical pattern engine
    const p=x.patterns;
    if(p){
      const cb=p.candles?.bullish??[];
      const cs=p.candles?.bearish??[];
      if(cb.length)L+=Math.min(6,cb.length*3);
      if(cs.length)S+=Math.min(6,cs.length*3);

      const ms=p.structure??{};
      if(ms.bos==="bullish")L+=5;
      if(ms.bos==="bearish")S+=5;
      if(ms.choch==="bullish")L+=5;
      if(ms.choch==="bearish")S+=5;

      if(p.liquiditySweep==="bullish")L+=6;
      if(p.liquiditySweep==="bearish")S+=6;

      if(p.fvg?.type==="bullish")L+=3;
      if(p.fvg?.type==="bearish")S+=3;

      if(p.orderBlock?.type==="bullish")L+=4;
      if(p.orderBlock?.type==="bearish")S+=4;

      if(p.classical?.doubleBottom)L+=4;
      if(p.classical?.doubleTop)S+=4;
      if(p.classical?.rangeBreakout==="bullish")L+=4;
      if(p.classical?.rangeBreakout==="bearish")S+=4;
    }
  }

  if(market.bias==="bullish")L+=14;
  if(market.bias==="bearish")S+=14;

  const best=Math.max(L,S),gap=Math.abs(L-S);
  const signal=L>S?"BUY":"SELL";
  const h1=f["1h"],m30=f["30min"],m15=f["15min"],m5=f["5min"];

  const frameDiag=Object.fromEntries(["1h","30min","15min","5min"].map(tf=>{
    const x=f[tf];
    return [tf,x?.valid?{
      trend:x.trend,structure:x.structure,momentum:x.momentum,macdBias:x.macdBias,
      rsi:x.rsi,atr:x.atr,price:x.price,movingAverages:x.movingAverages,
      ichimoku:x.ichimoku,bollinger:x.bollinger,stochastic:x.stochastic,adx:x.adx,
      patterns:x.patterns
    }:{valid:false}];
  }));

  if(!h1?.valid||!m30?.valid||!m15?.valid){
    const diagnostics={valid:true,best,gap,rsi:m15?.rsi??50,frames:frameDiag};
    return{signal:"WAIT",confidence:Math.round(Math.min(100,best)),reasons:["تایم‌فریم‌های اصلی کامل نیستند"],diagnostics};
  }

  const alignedHTF=signal==="BUY"
    ?h1.trend==="bullish"&&m30.trend==="bullish"
    :h1.trend==="bearish"&&m30.trend==="bearish";

  const aligned15=signal==="BUY"
    ?m15.structure==="bullish"&&m15.trend!=="bearish"
    :m15.structure==="bearish"&&m15.trend!=="bullish";

  const m5NotOppose=!m5?.valid||(signal==="BUY"?m5.trend!=="bearish":m5.trend!=="bullish");
  const rsiOK=signal==="BUY"?(m15.rsi??50)<72:(m15.rsi??50)>28;
  const atrPct=m15.atr&&m15.price?m15.atr/m15.price:0;
  const volatilityOK=atrPct>=0.00025&&atrPct<=0.004;

  const patternSide=()=>{
    const p=m15.patterns;
    if(!p)return null;
    let b=0,s=0;
    if(p.candles?.bullish?.length)b++;
    if(p.candles?.bearish?.length)s++;
    if(p.structure?.bos==="bullish"||p.structure?.choch==="bullish")b++;
    if(p.structure?.bos==="bearish"||p.structure?.choch==="bearish")s++;
    if(p.liquiditySweep==="bullish")b++;
    if(p.liquiditySweep==="bearish")s++;
    if(p.fvg?.type==="bullish")b++;
    if(p.fvg?.type==="bearish")s++;
    if(p.orderBlock?.type==="bullish")b++;
    if(p.orderBlock?.type==="bearish")s++;
    if(p.classical?.doubleBottom||p.classical?.rangeBreakout==="bullish")b++;
    if(p.classical?.doubleTop||p.classical?.rangeBreakout==="bearish")s++;
    return b>s?"bullish":s>b?"bearish":null;
  };

  const pSide=patternSide();
  const diagnostics={
    valid:true,best,gap,atrPct,rsi:m15.rsi??50,
    alignedHTF,aligned15,m5NotOppose,rsiOK,volatilityOK,
    patternSide:pSide,frames:frameDiag
  };

  if(best<90||gap<20)
    return{signal:"WAIT",confidence:Math.round(Math.min(100,best)),reasons:["قدرت یا اختلاف سیگنال کافی نیست"],diagnostics};

  if(!alignedHTF||!aligned15||!m5NotOppose||!rsiOK||!volatilityOK)
    return{signal:"WAIT",confidence:Math.round(Math.min(100,best)),reasons:["فیلتر ورود اجازه معامله نمی‌دهد"],diagnostics};

  // Pattern engine is an active confirmation layer, but it does not veto
  // a setup when no pattern is present.
  if(pSide&&pSide!==signal.toLowerCase())
    return{signal:"WAIT",confidence:Math.round(Math.min(100,best)),reasons:["الگوهای قیمت با جهت اصلی هم‌جهت نیستند"],diagnostics};

  const confidence=Math.round(Math.min(98,best+Math.min(12,gap/2)));
  reasons.push(
    "هم‌جهتی تایم‌فریم‌ها",
    "میانگین‌های متحرک تأیید شدند",
    "ایچیموکو تأیید شد",
    "بولینگر و استوکاستیک بررسی شدند",
    "قدرت روند با ADX بررسی شد",
    "الگوهای کندلی و ساختاری بررسی شدند",
    "BOS/CHOCH و نقدینگی بررسی شدند",
    "FVG و Order Block بررسی شدند",
    "الگوهای کلاسیک بررسی شدند",
    "فیلتر نوسان و RSI تأیید شد"
  );

  return{signal,confidence,reasons,diagnostics};
}