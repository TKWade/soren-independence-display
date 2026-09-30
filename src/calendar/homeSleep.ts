import { homePreferences, normalBedtime } from './homePreferences.ts'
import type { EventRow, HomeRuleRow, HouseholdData } from '../data/records.ts'
import type { HomeSleepMapping } from '../types/externalCalendar.ts'
import { addDays, dateInZone } from '../lib/time.ts'
import { availableExternalEvents, isHomeSleep, relevanceFor } from './relevance.ts'

export function resolveHomeRule(rules:HomeRuleRow[],profileId:string,date:string) {
 const candidates=rules.filter(rule=>rule.profile_id===profileId)
 return candidates.find(rule=>rule.override_date===date)??candidates.find(rule=>rule.override_date===null&&rule.weekday===new Date(date+'T12:00:00Z').getUTCDay())
}
/** Provider all-day end is exclusive. Timed events own only their local start-date night. */
export function overnightDates(event:EventRow,zone:string):string[] {
 if(!event.all_day) return [dateInZone(new Date(event.start_time),zone)]
 if(!event.all_day_start||!event.all_day_end) return []
 const dates:string[]=[]
 for(let date=event.all_day_start;date<event.all_day_end;date=addDays(date,1)) dates.push(date)
 return dates
}
export interface OvernightCandidate {event:EventRow;mapping:HomeSleepMapping}
export function calendarOvernights(data:HouseholdData,profileId:string) {
 const nights=new Map<string,OvernightCandidate[]>()
 if(!data.profiles.some(p=>p.id===profileId&&p.active)) return nights
 for(const event of availableExternalEvents(data)) {
  const source=data.sources.find(s=>s.event_id===event.id)!
  const mapping=relevanceFor(data,event,source,profileId)
  if(!mapping||!isHomeSleep(mapping)) continue
  for(const date of overnightDates(event,data.household.time_zone)) nights.set(date,[...(nights.get(date)??[]),{event,mapping}])
 }
 return nights
}
export interface SleepAssignment {place_id:string;caregiver_id:string|null;bedtime:string}
export interface SleepResolution {assignment?:SleepAssignment;origin?:'manual'|'external'|'weekly';issue?:'conflict'|'missing_bedtime'|'missing_assignment';candidates:OvernightCandidate[]}
export function resolveSleep(data:HouseholdData,profileId:string,date:string,nights=calendarOvernights(data,profileId)):SleepResolution {
 const mode=homePreferences(data,profileId).overnight_mode
 const normal=resolveHomeRule(data.homeRules,profileId,date),candidates=mode==='local'?[]:nights.get(date)??[]
 const finish=(place_id:string,caregiver_id:string|null,explicit:string|null|undefined,origin:'manual'|'external'|'weekly'):SleepResolution=>{
  const bedtime=normalBedtime(data,profileId,date,explicit)
  return bedtime?{assignment:{place_id,caregiver_id,bedtime},origin,candidates}:{issue:'missing_bedtime',origin,candidates}
 }
 // Legacy date overrides remain explicit until upgraded; migrated rows have bedtime_override.
 if(normal?.override_date) return finish(normal.place_id,normal.caregiver_id,normal.bedtime_override===undefined?normal.bedtime:normal.bedtime_override,'manual')
 if(!candidates.length) {
  if(mode!=='calendar_driven'&&normal) return finish(normal.place_id,normal.caregiver_id,normal.bedtime_override,'weekly')
  return {issue:'missing_assignment',candidates}
 }
 const assignments=candidates.map(({mapping})=>({place_id:mapping.sleep_place_id,caregiver_id:mapping.sleep_caregiver_id,bedtime:normalBedtime(data,profileId,date,mapping.bedtime_mode==='explicit'?mapping.bedtime_override:null)}))
 if(new Set(assignments.map(a=>JSON.stringify({...a,bedtime:a.bedtime?.length===5?a.bedtime+':00':a.bedtime}))).size>1) return {issue:'conflict',candidates}
 const assignment=assignments[0]
 if(!assignment.bedtime) return {issue:'missing_bedtime',candidates}
 return {assignment:{...assignment,bedtime:assignment.bedtime},origin:'external',candidates}
}
/** Review a concrete upcoming window, plus cached calendar dates, including missing calendar-driven nights. */
export function sleepReviewIssues(data:HouseholdData,now=new Date(),profileId?:string) {
 const today=dateInZone(now,data.household.time_zone)
 return data.profiles.filter(p=>p.active&&(!profileId||p.id===profileId)).flatMap(profile=>{
  const nights=calendarOvernights(data,profile.id)
  const dates=new Set([...Array.from({length:14},(_,i)=>addDays(today,i)),...(homePreferences(data,profile.id).overnight_mode==='local'?[]:[...nights.keys()].filter(date=>date>=today))])
  return [...dates].sort().flatMap(date=>{const result=resolveSleep(data,profile.id,date,nights);return result.issue?[{profile,date,...result}]:[]})
 })
}
export function formatNight(date:string) {return new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}
