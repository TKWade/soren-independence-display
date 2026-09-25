import type { DisplayRendererProps } from '../types/display'
import { selectSequence, visibleContext, formatDisplayTime } from './preferences'
import { PictureTile } from '../components/PictureTile'
import { PhotoFrame } from '../components/PhotoFrame'
export function FirstNextThenRenderer({schedule,preferences,now,savedView}:DisplayRendererProps) {
 const items=selectSequence(schedule,now,preferences.maxVisibleItems)
 return <main className="immediate-shell" data-display-mode="first-next-then" data-motion={preferences.motionPreference} aria-label="First, next, then">
  {items.length===0?<div className="display-state" role="status"><span aria-hidden="true">☀</span>NO PLANS</div>:<ol className="immediate-sequence" style={{gridTemplateColumns:`repeat(${items.length}, minmax(0, 1fr))`}}>
   {items.map(({position,event})=>{
    const context=visibleContext(event,preferences)
    return <li key={event.id} className="immediate-card" data-event-id={event.id}>
     <h1 className="immediate-position">{position}</h1>
     <PictureTile item={event.picture}/>
     {preferences.showTimes&&<time dateTime={event.startTime} className="display-event-time">{formatDisplayTime(event,schedule.timeZone)}</time>}
     {(context.people.length>0||context.place)&&<div className="immediate-context">
      {context.people.length>0&&<div><h2>WHO</h2><div className="immediate-people">{context.people.map(person=><div key={person.id}><PhotoFrame url={person.picture.photoUrl} kind={person.picture.kind} badgeKind={person.picture.badgeKind}/><span>{person.picture.label}</span></div>)}</div></div>}
      {context.place&&<div><h2>WHERE</h2><PhotoFrame url={context.place.picture.photoUrl} kind={context.place.picture.kind} badgeKind={context.place.picture.badgeKind}/><span>{context.place.picture.label}</span></div>}
     </div>}
    </li>
   })}
  </ol>}
  {savedView&&<p className="sample-label" role="status">↻ SAVED VIEW</p>}
 </main>
}
