import {moveEventToDay,type PrototypeEvent} from './model.ts'
/** Only dedicated handles opt into dragging. Ordinary card gestures remain browser scrolling. */
export class CalendarDrag {
 state?: {event:PrototypeEvent;x:number;y:number;active:boolean;date?:string}
 begin(event:PrototypeEvent,x:number,y:number,enabled:boolean) {
  this.state=undefined
  if(!enabled||event.origin!=='local'||event.cancelled)return false
  this.state={event,x,y,active:false};return true
 }
 update(x:number,y:number,date?:string) {
  const s=this.state;if(!s)return
  if(Math.hypot(x-s.x,y-s.y)>=8)s.active=true
  s.date=s.active?date:undefined
 }
 finish(commit:boolean) {
  const s=this.state;this.state=undefined
  if(!commit||!s?.active||!s.date)return
  const moved=moveEventToDay(s.event,s.date)
  return moved===s.event?undefined:moved
 }
}
