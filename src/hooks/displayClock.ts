/** The existing display clock cadence, independently testable across sleep/resume. */
export function startDisplayClock(update:(now:Date)=>void,host:{now:()=>number;setInterval:(fn:()=>void,ms:number)=>unknown;clearInterval:(id:unknown)=>void;listen:(event:'focus'|'visibilitychange',fn:()=>void)=>()=>void}) {
 const refresh=()=>update(new Date(host.now()))
 const timer=host.setInterval(refresh,15000)
 const remove=[host.listen('focus',refresh),host.listen('visibilitychange',refresh)]
 return ()=>{host.clearInterval(timer);for(const unlisten of remove)unlisten()}
}
