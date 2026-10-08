import {moveEvent, snap, TODAY, NOW, type PrototypeEvent} from './model.ts'

export const HOLD_MS = 500
export const HOLD_TOLERANCE = 8
export function initialTimelineMinute(date:string, events:PrototypeEvent[]) {
 if(!events.length)return 9*60
 return Math.max(0, date===TODAY ? NOW-30 : Math.min(...events.map(e=>e.start))-15)
}
export function visibleTimelineMinute(start:number,end:number,canvasTop:number,toolbarBottom:number,pixelsPerMinute:number) {
 return Math.max(start,Math.min(end-15,snap(start+(Math.max(0,toolbarBottom)+24-canvasTop)/pixelsPerMinute)))
}
export function edgeScrollDelta(y:number,toolbarBottom:number,height:number,elapsedMs:number) {
 const top=Math.max(48,toolbarBottom+48),bottom=height-64
 const direction=y<top ? -Math.min(1,(top-y)/48) : y>bottom ? Math.min(1,(y-bottom)/48) : 0
 return direction*360*Math.min(32,elapsedMs)/1000
}
/** Gesture state is isolated from DOM input so swipe/hold/cancel rules can be tested. */
export class TimelineGesture {
 state?: {event:PrototypeEvent;phase:'waiting'|'moving';x:number;y:number;scroll:number;since:number;resize:boolean;preview:PrototypeEvent}
 begin(event:PrototypeEvent,x:number,y:number,scroll:number,now:number,immediate=false,resize=false) {
  if(event.origin!=='local')return false
  this.state={event,phase:immediate?'moving':'waiting',x,y,scroll,since:now,resize,preview:event}
  return true
 }
 activate(now:number) {
  if(this.state?.phase!=='waiting'||now-this.state.since<HOLD_MS)return false
  this.state.phase='moving';return true
 }
 update(x:number,y:number,scroll:number,pixelsPerMinute:number) {
  const s=this.state;if(!s)return
  if(s.phase==='waiting'){
   if(Math.hypot(x-s.x,y-s.y)>HOLD_TOLERANCE||Math.abs(scroll-s.scroll)>HOLD_TOLERANCE)this.state=undefined
  }else s.preview=moveEvent(s.event,(y+scroll-s.y-s.scroll)/pixelsPerMinute,s.resize)
 }
 finish(commit:boolean) {
  const s=this.state;this.state=undefined
  return commit&&s?.phase==='moving'&&(s.preview.start!==s.event.start||s.preview.end!==s.event.end)?s.preview:undefined
 }
}
