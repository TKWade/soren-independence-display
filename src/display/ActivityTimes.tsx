import type { DaySchedule } from '../types/calendar'
import {activityTime,orderedActivities} from './standardTime'
export function ActivityTimes({day,compact=false}:{day:DaySchedule;compact?:boolean}) {
 const events=orderedActivities(day.events),shown=compact?events.slice(0,3):events
 return <span className="activity-times">{shown.map(event=><span className="activity-time-row" key={event.id}><span className="activity-time">{activityTime(event,day.timeZone!)}</span><span className="activity-time-title" title={event.title||event.label}>{event.label}</span></span>)}{shown.length<events.length&&<span>+{events.length-shown.length} more · open day</span>}</span>
}
