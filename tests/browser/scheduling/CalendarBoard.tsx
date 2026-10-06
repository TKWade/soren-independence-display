import {Art} from './Shared'
import {formatDate,formatTime,TODAY,type PrototypeData,type PrototypeEvent} from './model'
interface Props {data:PrototypeData;dates:string[];events:PrototypeEvent[];editing:boolean;review:boolean;compact:boolean;selected:string[];onSelect:(id:string)=>void;onDay:(date:string)=>void;onEvent:(e:PrototypeEvent)=>void;onAdd:(date:string)=>void}
export function CalendarBoard({data,dates,events,editing,review,compact,selected,onSelect,onDay,onEvent,onAdd}:Props) {
 return <div className="sp-calendar" data-compact={compact} data-review={review} aria-label="Schedule calendar">
  {dates.map(date=>{const day=events.filter(e=>e.date===date),pending=day.filter(e=>e.review==='pending');return <section className={`sp-calendar-day${date===TODAY?' is-today':''}`} key={date}>
   <header><button className="sp-day-link" onClick={()=>onDay(date)} aria-label={`Open ${formatDate(date,{weekday:'long',month:'long',day:'numeric'})}`}><span>{date===TODAY?'TODAY':formatDate(date,{weekday:'short'})}</span><strong>{formatDate(date,{day:'numeric'})}</strong><small>{formatDate(date,{month:'short'})}</small></button>{editing&&!review&&<button className="sp-calendar-add" aria-label={`Add activity on ${date}`} onClick={()=>onAdd(date)}>＋</button>}</header>
   <div className="sp-calendar-events">{day.map(e=>{const a=data.activities.find(a=>a.id===e.activityId)!;return <div className={`sp-calendar-event${e.review==='pending'?' sp-unreviewed':''}`} key={e.id}>
    {review&&e.review==='pending'&&<label className="sp-import-select"><input type="checkbox" aria-label={`Select ${e.title}, ${formatDate(e.date)}, ${formatTime(e.start)}`} checked={selected.includes(e.id)} onChange={()=>onSelect(e.id)}/></label>}
    <button onClick={()=>editing?onEvent(e):onDay(date)} aria-label={`${e.review==='pending'?'Review imported ':''}${e.title??a.name}, ${formatTime(e.start)}, ${formatDate(date)}`}><Art kind={a.kind}/><span><strong>{e.review==='pending'?e.title:a.name.toUpperCase()}</strong><time>{formatTime(e.start)}</time>{editing&&e.origin==='imported'&&<small className="sp-import-badge">{e.review==='pending'?'Imported · review':'Imported'}</small>}</span></button>
   </div>})}</div>
   {!day.length&&<p className="sp-empty-day">{review?'No imports':'No plans'}</p>}
   {review&&pending.length>0&&<small className="sp-pending-count">{pending.length} to review</small>}
  </section>})}
 </div>
}
