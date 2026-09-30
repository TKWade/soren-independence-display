import type { DisplayEvent } from '../types/calendar.ts'
export function clockText(now:Date,zone:string,format:'12h'|'24h'='12h') {return new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit',hourCycle:format==='24h'?'h23':'h12'}).format(now)}
export function activityTime(event:DisplayEvent,zone:string) {return event.allDay?'All day':clockText(new Date(event.startTime),zone)}
export function orderedActivities(events:DisplayEvent[]) {return [...events].filter(e=>!e.sleepLocation).sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime)||a.id.localeCompare(b.id))}
export function startMinuteClock(update:(now:Date)=>void,host:{now:()=>number;set:(fn:()=>void,delay:number)=>unknown;clear:(id:unknown)=>void;listen:(fn:()=>void)=>()=>void}) {
 let timer:unknown
 const tick=()=>{host.clear(timer);const now=host.now();update(new Date(now));timer=host.set(tick,60000-now%60000)}
 tick();const unlisten=host.listen(tick)
 return ()=>{host.clear(timer);unlisten()}
}
