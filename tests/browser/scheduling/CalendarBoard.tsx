import {useEffect,useRef,useState,type PointerEvent} from 'react'
import {Art} from './Shared'
import {CalendarDrag} from './calendarInteraction'
import {formatDate,formatTime,TODAY,type PrototypeData,type PrototypeEvent} from './model'
const calendarClock=()=>performance.now()
interface Props {data:PrototypeData;dates:string[];events:PrototypeEvent[];editing:boolean;review:boolean;compact:boolean;month:boolean;monthDate:string;selected:string[];onSelect:(id:string)=>void;onDay:(date:string)=>void;onEvent:(e:PrototypeEvent)=>void;onAdd:(date:string)=>void;onMove:(event:PrototypeEvent)=>void;onMovePick:(event:PrototypeEvent)=>void}
export function CalendarBoard({data,dates,events,editing,review,compact,month,monthDate,selected,onSelect,onDay,onEvent,onAdd,onMove,onMovePick}:Props) {
 const board=useRef<HTMLDivElement>(null),drag=useRef(new CalendarDrag()),pointer=useRef<number|undefined>(undefined),suppress=useRef(0)
 const [wide,setWide]=useState(()=>window.matchMedia('(min-width:900px)').matches),[target,setTarget]=useState<string>(),[dragging,setDragging]=useState<string>()
 function cancel(){drag.current.finish(false);pointer.current=undefined;setTarget(undefined);setDragging(undefined)}
 useEffect(()=>{
  const media=window.matchMedia('(min-width:900px)'),change=()=>{cancel();setWide(media.matches)},escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&pointer.current!==undefined){e.preventDefault();suppress.current=calendarClock()+800;cancel()}}
  media.addEventListener('change',change);window.addEventListener('keydown',escape);window.addEventListener('blur',cancel)
  return()=>{media.removeEventListener('change',change);window.removeEventListener('keydown',escape);window.removeEventListener('blur',cancel)}
 },[])
 function begin(e:PointerEvent,event:PrototypeEvent){
  if(e.button!==0||!editing||review)return
  suppress.current=0
  if(!drag.current.begin(event,e.clientX,e.clientY,wide))return
  e.preventDefault();pointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId)
 }
 function track(e:PointerEvent){
  if(e.pointerId!==pointer.current)return
  const date=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('.sp-calendar-day[data-date]')?.dataset.date
  drag.current.update(e.clientX,e.clientY,date&&dates.includes(date)?date:undefined)
  if(drag.current.state?.active){suppress.current=calendarClock()+800;setDragging(drag.current.state.event.id);setTarget(drag.current.state.date)}
 }
 function finish(e:PointerEvent){
  if(e.pointerId!==pointer.current)return
  track(e);const moved=drag.current.finish(true);pointer.current=undefined;setTarget(undefined);setDragging(undefined)
  if(board.current?.hasPointerCapture(e.pointerId))board.current.releasePointerCapture(e.pointerId)
  if(moved)onMove(moved)
 }
 return <div className="sp-calendar-wrap">
  {month&&<div className="sp-weekday-headings" aria-hidden="true">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><span key={d}>{d}</span>)}</div>}
  {editing&&!review&&<p className="sp-calendar-move-hint">{wide?'Drag ⠿ to another day, or tap it to choose a day. Times stay the same.':month?'Open a date, tap an activity, then Move to another day. Swipe normally to scroll.':'Tap an activity, then Move to another day. Swipe normally to scroll.'}</p>}
  <div ref={board} className="sp-calendar" data-compact={compact} data-review={review} data-month={month} data-count={Math.min(7,dates.length)} aria-label={month?'Month calendar':'Schedule calendar'} onPointerMove={track} onPointerUp={finish} onPointerCancel={()=>{suppress.current=calendarClock()+800;cancel()}} onLostPointerCapture={()=>{if(pointer.current!==undefined)cancel()}}>
  {dates.map(date=>{const day=events.filter(e=>e.date===date),pending=day.filter(e=>e.review==='pending');return <section data-date={date} data-drop-target={target===date} className={`sp-calendar-day${date===TODAY?' is-today':''}${month&&!date.startsWith(monthDate.slice(0,7))?' is-outside-month':''}`} key={date}>
   <header><button className="sp-day-link" onClick={()=>onDay(date)} aria-label={`Open ${formatDate(date,{weekday:'long',month:'long',day:'numeric'})}`}><span>{date===TODAY?'TODAY':formatDate(date,{weekday:'short'})}</span><strong>{formatDate(date,{day:'numeric'})}</strong><small>{formatDate(date,{month:'short'})}</small></button>{editing&&!review&&<button className="sp-calendar-add" aria-label={`Add activity on ${date}`} onClick={()=>onAdd(date)}>＋</button>}</header>
   <div className="sp-calendar-events">{day.map(e=>{const a=data.activities.find(a=>a.id===e.activityId)!;return <div className={`sp-calendar-event${e.review==='pending'?' sp-unreviewed':''}${dragging===e.id?' is-dragging':''}`} key={e.id} data-event-id={e.id}>
    {review&&e.review==='pending'&&<label className="sp-import-select"><input type="checkbox" aria-label={`Select ${e.title}, ${formatDate(e.date)}, ${formatTime(e.start)}`} checked={selected.includes(e.id)} onChange={()=>onSelect(e.id)}/></label>}
    <button className="sp-calendar-face" onClick={()=>editing?onEvent(e):onDay(date)} aria-label={`${e.review==='pending'?'Review imported ':''}${e.title??a.name}, ${formatTime(e.start)}, ${formatDate(date)}`}><Art kind={a.kind}/><span><strong>{e.review==='pending'?e.title:a.name.toUpperCase()}</strong><time>{formatTime(e.start)}</time>{editing&&e.origin==='imported'&&<small className="sp-import-badge">{e.review==='pending'?'Imported · review':'Imported'}</small>}</span></button>
    {editing&&!review&&e.origin==='local'&&wide&&<button type="button" className="sp-calendar-grip" aria-label={`Move ${a.name} from ${formatDate(date)} to another day`} title="Drag to another day, or tap to choose" onPointerDown={event=>begin(event,e)} onClick={()=>{if(calendarClock()<suppress.current)return;onMovePick(e)}}>⠿</button>}
   </div>})}</div>
   {month&&<button className="sp-month-summary" aria-label={`Open ${formatDate(date)}: ${day.length} activities${pending.length?`, ${pending.length} imported`:''}`} onClick={()=>onDay(date)}><span>{day.length||'—'}</span>{day[0]&&<Art kind={data.activities.find(a=>a.id===day[0].activityId)!.kind}/>} {!!pending.length&&<span className="sp-import-dot" aria-hidden="true"/>}</button>}
   {!day.length&&<p className="sp-empty-day">{review?'No imports':'No plans'}</p>}
   {review&&pending.length>0&&<small className="sp-pending-count">{pending.length} to review</small>}
  </section>})}
  </div>
  {month&&editing&&review&&<fieldset className="sp-month-review-list"><legend>Imported events this month</legend>{events.filter(e=>dates.includes(e.date)&&e.review==='pending').map(e=><div key={e.id}><label><input type="checkbox" aria-label={`Select mobile ${e.title}, ${formatDate(e.date)}, ${formatTime(e.start)}`} checked={selected.includes(e.id)} onChange={()=>onSelect(e.id)}/><span>{e.title}<small>{formatDate(e.date)} · {formatTime(e.start)}</small></span></label><button className="sp-secondary" onClick={()=>onEvent(e)}>Review</button></div>)}</fieldset>}
  {dragging&&<div className="sp-drag-preview"><div role="status"><strong>{target?`Move to ${formatDate(target)}`:'Choose a day column'}</strong><span>Time and duration stay the same</span></div><button onClick={()=>{suppress.current=calendarClock()+800;cancel()}}>Cancel move</button></div>}
 </div>
}
