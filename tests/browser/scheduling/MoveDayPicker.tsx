import {useState} from 'react'
import {addDays,formatDate,formatTime,nearbyWeek,type PrototypeEvent} from './model'
export function MoveDayPicker({event,onMove,onBack}:{event:PrototypeEvent;onMove:(date:string)=>void;onBack:()=>void}) {
 const [anchor,setAnchor]=useState(event.date)
 const days=nearbyWeek(anchor)
 return <div className="sp-editor-form"><p>Choose a day. The saved time stays {formatTime(event.start)}–{formatTime(event.end)} ({event.end-event.start} minutes).</p>
  <nav className="sp-picker-nav" aria-label="Move destination week"><button type="button" className="sp-secondary" aria-label="Previous destination week" onClick={()=>setAnchor(addDays(anchor,-7))}>←</button><strong>{formatDate(days[0],{month:'short',year:'numeric'})}</strong><button type="button" className="sp-secondary" aria-label="Next destination week" onClick={()=>setAnchor(addDays(anchor,7))}>→</button></nav>
  <div className="sp-day-picker" aria-label="Move to another day">{days.map(date=><button type="button" key={date} className="sp-secondary" aria-pressed={date===event.date} aria-label={`Move to ${formatDate(date,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}`} onClick={()=>date!==event.date&&onMove(date)}><span>{formatDate(date,{weekday:'short'})}</span><strong>{formatDate(date,{day:'numeric'})}</strong>{date===event.date&&<small>Current</small>}</button>)}</div>
  <p className="sp-muted">Moves this saved activity only. Undo is available on the schedule.</p><footer><button type="button" className="sp-secondary" onClick={onBack}>Back to event</button></footer>
 </div>
}
