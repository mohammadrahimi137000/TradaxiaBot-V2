function body(c){return Math.abs(c.close-c.open)}
function bullish(c){return c.close>c.open}
function bearish(c){return c.close<c.open}

export function detectEngulfing(candles){
  if(!Array.isArray(candles)||candles.length<2)return{pattern:"NONE",bias:0};
  const a=candles[candles.length-2],b=candles[candles.length-1];
  if(!a||!b)return{pattern:"NONE",bias:0};
  const aHigh=Math.max(a.open,a.close),aLow=Math.min(a.open,a.close);
  const bHigh=Math.max(b.open,b.close),bLow=Math.min(b.open,b.close);
  const engulf=bHigh>=aHigh&&bLow<=aLow&&body(b)>=body(a);
  if(!engulf)return{pattern:"NONE",bias:0};
  if(bearish(a)&&bullish(b))return{pattern:"BULLISH_ENGULFING",bias:1};
  if(bullish(a)&&bearish(b))return{pattern:"BEARISH_ENGULFING",bias:-1};
  return{pattern:"NONE",bias:0};
}
