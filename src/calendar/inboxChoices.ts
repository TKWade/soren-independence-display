import type { EventRow, HouseholdData } from '../data/records.ts'
import { atLocalTime, dateInZone } from '../lib/time.ts'
import { calendarInbox } from './relevance.ts'

/** Presentation only: keep the group's original event/source IDs used by mapping forms. */
export function calendarInboxChoices(data:HouseholdData,includeReviewed=false,now=new Date()) {
 const zone=data.household.time_zone,today=dateInZone(now,zone)
 const instant=(event:EventRow)=>new Date(event.all_day&&event.all_day_start?atLocalTime(event.all_day_start,'00:00',zone,'compatible'):event.start_time)
 const upcoming=(event:EventRow)=>event.all_day&&event.all_day_start?event.all_day_start>=today:instant(event).getTime()>=now.getTime()
 return calendarInbox(data,includeReviewed).map(item=>{
  const ordered=[...item.occurrences].sort((a,b)=>instant(a).getTime()-instant(b).getTime()||a.id.localeCompare(b.id))
  const next=ordered.find(upcoming),display=next??ordered[ordered.length-1]
  const recurring=!!item.source.external_series_id&&item.count>1
  const date=new Intl.DateTimeFormat('en-US',{timeZone:zone,month:'short',day:'numeric',...(display.all_day?{}:{hour:'numeric',minute:'2-digit',hour12:true})}).format(instant(display))
  const timing=(recurring?(next?'Next: ':'Last: '):'')+date+(display.all_day?' · All day':'')
  const calendar=data.integration?.calendars.find(c=>c.id===item.source.calendar_id)?.name??'Calendar'
  return {...item,label:`${item.event.title||'(Untitled event)'} · ${timing} · ${calendar} · ${item.count} ${item.count===1?'occurrence':'occurrences'}`,upcoming:!!next,sortTime:instant(display).getTime()}
 }).sort((a,b)=>Number(b.upcoming)-Number(a.upcoming)||(a.upcoming?a.sortTime-b.sortTime:b.sortTime-a.sortTime)||a.event.id.localeCompare(b.event.id))
}
