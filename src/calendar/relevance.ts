import type { EventRow, HouseholdData, SourceRow } from '../data/records.ts'
import type { CalendarMatchingRule, EventProfileMapping, MappingVisuals } from '../types/externalCalendar.ts'
import { atLocalTime } from '../lib/time.ts'
export const eventKey=(source:SourceRow)=>'event:'+source.external_event_id
export const seriesKey=(source:SourceRow)=>source.external_series_id?'series:'+source.external_series_id:eventKey(source)
const normalized=(value:string)=>value.trim().replace(/\s+/g,' ')
export function ruleMatches(rule:CalendarMatchingRule,event:EventRow,source:SourceRow) {
 if(!rule.enabled || (rule.calendar_id&&rule.calendar_id!==source.calendar_id)) return false
 const scope=rule.source_filter
 if(scope && ((scope.provider&&scope.provider!==source.provider)||(scope.externalCalendarId&&scope.externalCalendarId!==source.external_calendar_id))) return false
 let title=normalized(event.title),value=normalized(rule.title_value)
 if(!value) return false
 if(!rule.case_sensitive) {title=title.toLocaleLowerCase('en-US');value=value.toLocaleLowerCase('en-US')}
 return rule.title_operator==='equals'?title===value:rule.title_operator==='contains'&&title.includes(value)
}
export type Relevance = (MappingVisuals & {action:'include'|'ignore';origin:'manual'|'rule'}) | {action:'include';origin:'visual'}
function complete(decision:MappingVisuals&{action:'include'|'ignore'},data:HouseholdData) {
 return decision.action==='ignore'||(data.activities.some(a=>a.id===decision.activity_id)&&data.places.some(p=>p.id===decision.place_id)&&(!decision.caregiver_id||data.people.some(p=>p.id===decision.caregiver_id))&&(!decision.picture_person_id||data.people.some(p=>p.id===decision.picture_person_id)))
}
export function relevanceFor(data:HouseholdData,event:EventRow,source:SourceRow,profileId:string):Relevance|undefined {
 const mappings=data.integration?.mappings??[]
 const manual=mappings.find(m=>m.calendar_id===source.calendar_id&&m.profile_id===profileId&&m.group_key===eventKey(source))
  ??mappings.find(m=>m.calendar_id===source.calendar_id&&m.profile_id===profileId&&m.group_key===seriesKey(source))
 if(manual) return complete(manual,data)?{...manual,origin:'manual'}:undefined
 if(data.visuals.some(v=>v.event_id===event.id&&v.profile_id===profileId)) return {action:'include',origin:'visual'}
 const rule=[...(data.integration?.matchingRules??[])].filter(r=>r.profile_id===profileId&&ruleMatches(r,event,source)).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))[0]
 return rule&&complete(rule,data)?{...rule,origin:'rule'}:undefined
}
export function availableExternalEvents(data:HouseholdData) {
 return data.events.filter(event=>{
  if(event.source_kind!=='external'||event.external_status==='cancelled'||event.external_kind==='seriesMaster') return false
  const source=data.sources.find(s=>s.event_id===event.id)
  const calendar=data.integration?.calendars.find(c=>c.id===source?.calendar_id)
  return calendar?.enabled&&calendar.behavior==='evaluate'&&data.integration?.connections.some(c=>c.id===calendar.connection_id&&c.status==='connected')
 })
}
/** No persisted copies of automatic enrichment: rules re-evaluate deterministically, manual decisions win. */
export function prepareExternalDisplay(data:HouseholdData):HouseholdData {
 const events=data.events.filter(e=>e.source_kind==='local')
 const visuals=data.visuals.filter(v=>events.some(e=>e.id===v.event_id))
 const eventPeople=data.eventPeople.filter(p=>visuals.some(v=>v.id===p.visual_id))
 for(const event of availableExternalEvents(data)) {
  const source=data.sources.find(s=>s.event_id===event.id)!
  // Series masters never enter here; provider adapters supply resolved occurrences.
  const resolved={...event,recurrence:null,all_day:false}
  if(event.all_day) {
   if(!event.all_day_start||!event.all_day_end) continue
   resolved.start_time=atLocalTime(event.all_day_start,'00:00',data.household.time_zone,'compatible')
   resolved.end_time=atLocalTime(event.all_day_end,'00:00',data.household.time_zone,'compatible')
  }
  events.push(resolved)
  for(const profile of data.profiles.filter(p=>p.active)) {
   const decision=relevanceFor(data,event,source,profile.id)
   if(!decision||decision.action==='ignore') continue
   if(decision.origin==='visual') {
    const visual=data.visuals.find(v=>v.event_id===event.id&&v.profile_id===profile.id)!
    visuals.push(visual);eventPeople.push(...data.eventPeople.filter(p=>p.visual_id===visual.id));continue
   }
   const id=`external:${event.id}:${profile.id}`
   visuals.push({id,household_id:data.household.id,event_id:event.id,profile_id:profile.id,activity_id:decision.activity_id!,place_id:decision.place_id!,
    label_override:decision.label,visible:decision.visible,is_primary:decision.is_primary,picture_person_id:decision.picture_person_id})
   if(decision.caregiver_id) eventPeople.push({visual_id:id,person_id:decision.caregiver_id})
  }
 }
 return {...data,events,visuals,eventPeople}
}
export function calendarInbox(data:HouseholdData,includeReviewed=false) {
 const groups=new Map<string,{event:EventRow;source:SourceRow;profiles:string[];count:number}>()
 for(const event of [...availableExternalEvents(data)].sort((a,b)=>a.start_time.localeCompare(b.start_time))) {
  const source=data.sources.find(s=>s.event_id===event.id)!
  const profiles=data.profiles.filter(p=>p.active&&!relevanceFor(data,event,source,p.id)).map(p=>p.id)
  if(!includeReviewed&&!profiles.length) continue
  const key=source.calendar_id+':'+seriesKey(source)
  const prior=groups.get(key)
  if(prior) {prior.count++;prior.profiles=[...new Set([...prior.profiles,...profiles])]}
  else groups.set(key,{event,source,profiles,count:1})
 }
 return [...groups.values()]
}
export function mappingPayload(values:FormData,profileIds:string[]):Omit<EventProfileMapping,'id'|'household_id'|'calendar_id'|'group_key'|'profile_id'> & {profile_ids:string[]} {
 const action=values.get('action')==='ignore'?'ignore':'include'
 return {action,profile_ids:profileIds,activity_id:action==='include'?String(values.get('activity_id')||'')||null:null,
  place_id:action==='include'?String(values.get('place_id')||'')||null:null,caregiver_id:String(values.get('caregiver_id')||'')||null,
  picture_person_id:String(values.get('picture_person_id')||'')||null,label:String(values.get('label')||'').trim()||null,
  visible:values.get('visible')==='on',is_primary:values.get('is_primary')==='on'}
}
