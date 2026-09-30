import { formatNight, overnightDates, resolveSleep, calendarOvernights } from '../calendar/homeSleep'
import { homePreferences } from '../calendar/homePreferences'
import { dateInZone } from '../lib/time'
import { SleepReview } from './SleepReview'
import { calendarInboxChoices } from '../calendar/inboxChoices'
import { useState } from 'react'
import type { HouseholdData } from '../data/records'
import type { RunAction } from './Admin'
import { calendarInbox, eventKey, seriesKey, mappingPayload, relevanceFor, isHomeSleep, availableExternalEvents } from '../calendar/relevance'
import { saveExternalMapping } from '../data/calendarRepository'
import { CalendarVisualFields } from './CalendarVisualFields'
export function CalendarInbox({data,run}:{data:HouseholdData;run:RunAction}) {
 const [reviewed,setReviewed]=useState(false),[selected,setSelected]=useState(''),[version,setVersion]=useState(0)
 const items=calendarInboxChoices(data,reviewed)
 const item=items.find(i=>i.event.id===selected)
 return <section><h2>Calendar inbox</h2><p>Unmatched events stay off the child display. One decision can cover every occurrence in a series. Calendar titles and times are read-only.</p>
  <SleepReview data={data}/>
  <label className="check"><input type="checkbox" checked={reviewed} onChange={e=>{setReviewed(e.target.checked);setSelected('')}}/>Include reviewed events (change a decision)</label>
  {!items.length&&<p>{reviewed?'No events in selected calendars.':'No unmatched events for active profiles.'}</p>}
  <label>Event or series<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose event</option>{items.map(i=><option key={i.event.id} value={i.event.id}>{i.label}</option>)}</select></label>
  {item&&<InboxForm key={selected+version} data={data} item={item} run={run} done={()=>{setSelected('');setVersion(v=>v+1)}}/>}
 </section>
}
export function InboxForm({data,item,run,done}:{data:HouseholdData;item:ReturnType<typeof calendarInbox>[number];run:RunAction;done:()=>void}) {
 const active=data.profiles.filter(p=>p.active),{event,source}=item
 const initial=active[0]?relevanceFor(data,event,source,active[0].id):undefined
 const home=initial&&isHomeSleep(initial)?initial:undefined
 const [target,setTarget]=useState(home?'home_sleep':initial?.action==='ignore'?'ignore':'activity')
 const [profiles,setProfiles]=useState(item.profiles.length?item.profiles:active.map(p=>p.id))
 const [scope,setScope]=useState(source.external_series_id?'series':'event'),[occurrenceId,setOccurrenceId]=useState(event.id)
 const [place,setPlace]=useState(home?.sleep_place_id??''),[caregiver,setCaregiver]=useState(home?.sleep_caregiver_id??'')
 const [bedtimeMode,setBedtimeMode]=useState(home?.bedtime_mode??'use_normal_bedtime'),[bedtime,setBedtime]=useState(home?.bedtime_override?.slice(0,5)??'')
 const [makeRule,setMakeRule]=useState(false),[error,setError]=useState('')
 const occurrences=availableExternalEvents(data).filter(e=>{const s=data.sources.find(s=>s.event_id===e.id);return s&&s.calendar_id===source.calendar_id&&seriesKey(s)===seriesKey(source)})
 const selectedSource=data.sources.find(s=>s.event_id===occurrenceId)??source
 const dates=[...new Set(occurrences.filter(e=>scope==='series'||e.id===occurrenceId).flatMap(e=>overnightDates(e,data.household.time_zone)))].sort()
 const today=dateInZone(new Date(),data.household.time_zone),future=dates.filter(date=>date>=today),preview=(future.length?future:dates).slice(0,12)
 const proposed=target==='home_sleep'&&place?{...data,integration:{...data.integration!,mappings:[...(data.integration?.mappings??[]).filter(m=>!(m.calendar_id===source.calendar_id&&profiles.includes(m.profile_id)&&m.group_key===(scope==='event'?eventKey(selectedSource):seriesKey(source)))),...profiles.map(profile_id=>({id:'preview:'+profile_id,household_id:data.household.id,calendar_id:source.calendar_id!,profile_id,group_key:scope==='event'?eventKey(selectedSource):seriesKey(source),target:'home_sleep' as const,action:'include' as const,sleep_place_id:place,sleep_caregiver_id:caregiver||null,bedtime_mode:bedtimeMode,bedtime_override:bedtimeMode==='explicit'?bedtime:null}))]}}:undefined
 const previewResults=proposed?profiles.flatMap(profile=>{const nights=calendarOvernights(proposed,profile);return preview.map(date=>({profile,date,result:resolveSleep(proposed,profile,date,nights)}))}):[]
 const missing=previewResults.some(({result})=>result.issue==='missing_bedtime')
 return <form onSubmit={submit=>{submit.preventDefault();const values=new FormData(submit.currentTarget)
  if(!profiles.length) {setError('Choose at least one profile.');return} setError('')
  const effect=target==='home_sleep'?{target,action:'include',profile_ids:profiles,sleep_place_id:place,sleep_caregiver_id:caregiver||null,bedtime_mode:bedtimeMode,bedtime_override:bedtimeMode==='explicit'?bedtime:null}:mappingPayload(values,profiles)
  void run(async()=>{await saveExternalMapping({household_id:data.household.id,calendar_id:source.calendar_id,group_key:scope==='event'?eventKey(selectedSource):seriesKey(source),
   ...effect,target,create_rule:target!=='home_sleep'&&makeRule,rule_title:String(values.get('rule_title')||'').trim()});done()})
 }}>
 <h3>{event.title||'(Untitled event)'}</h3><p>{event.all_day?`${formatNight(event.all_day_start!)} — ${formatNight(event.all_day_end!)} (all day; end exclusive)`:new Date(event.start_time).toLocaleString('en-US',{timeZone:data.household.time_zone})} · {event.location||'No calendar location'}</p>
 <ul>{active.map(p=>{const d=relevanceFor(data,event,source,p.id);return <li key={p.id}>{p.name}: {d?`${isHomeSleep(d)?'Home & sleep':d.action==='ignore'?'Ignored':'Activity'} (${d.origin})`:'Needs review'}</li>})}</ul>
 <fieldset><legend>Apply this decision to profile(s)</legend>{active.map(p=><label className="check" key={p.id}><input name="profiles" type="checkbox" value={p.id} checked={profiles.includes(p.id)} onChange={e=>setProfiles(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>{p.name}</label>)}
 {active.length>1&&<button type="button" className="secondary" onClick={()=>setProfiles(active.map(p=>p.id))}>{active.length===2?'Both':'All active profiles'}</button>}</fieldset>
 {source.external_series_id&&<label>Decision scope<select value={scope} onChange={e=>setScope(e.target.value)}><option value="series">Entire recurring series (including future occurrences)</option><option value="event">Only this occurrence</option></select></label>}
 {scope==='event'&&occurrences.length>1&&<label>Occurrence<select value={occurrenceId} onChange={e=>setOccurrenceId(e.target.value)}>{occurrences.map(e=><option key={e.id} value={e.id}>{e.all_day?formatNight(e.all_day_start!):new Date(e.start_time).toLocaleString('en-US',{timeZone:data.household.time_zone})}</option>)}</select></label>}
 <label>What does this calendar item represent?<select value={target} onChange={e=>setTarget(e.target.value)}><option value="activity">Activity</option><option value="home_sleep">Home &amp; sleep</option><option value="ignore">Ignore</option></select></label>
 <input type="hidden" name="action" value={target==='ignore'?'ignore':'include'}/>
 {target==='home_sleep'?<>
  {profiles.some(id=>homePreferences(data,id).overnight_mode==='local')&&<p role="status">Profiles using Local schedule retain this mapping for later, but do not use calendar overnight assignments. Change the source under Home &amp; Sleep to opt in.</p>}
  <label>Sleep place<select required value={place} onChange={e=>setPlace(e.target.value)}><option value="">Choose sleep place</option>{data.places.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label>Caregiver<select value={caregiver} onChange={e=>setCaregiver(e.target.value)}><option value="">No caregiver</option>{data.people.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label>Bedtime behavior<select value={bedtimeMode} onChange={e=>setBedtimeMode(e.target.value as typeof bedtimeMode)}><option value="use_normal_bedtime">Use normal bedtime</option><option value="explicit">Explicit bedtime override</option></select></label>
  {bedtimeMode==='explicit'&&<label>Bedtime<input type="time" required value={bedtime} onChange={e=>setBedtime(e.target.value)}/></label>}
  <p role="status">This maps calendar nights to sleep at {data.places.find(p=>p.id===place)?.name??'the selected place'} for {active.filter(p=>profiles.includes(p.id)).map(p=>p.name).join(', ')||'the selected profiles'}: {preview.map(formatNight).join(', ')}{dates.length>preview.length?' …':''}. Manual date overrides and existing occurrence-only decisions take priority over a series decision. Series decisions also apply to future synced occurrences.</p>
  {previewResults.length>0&&<ul aria-label="Resolved sleep preview">{previewResults.map(({profile,date,result})=><li key={profile+date}>{active.find(p=>p.id===profile)?.name} · {formatNight(date)}: {result.issue==='conflict'?'Conflict — review required':result.issue==='missing_bedtime'?'Normal bedtime missing':result.issue==='missing_assignment'?'No overnight assignment':result.assignment?`${data.places.find(p=>p.id===result.assignment!.place_id)?.name} · ${result.assignment.bedtime.slice(0,5)} (${result.origin==='manual'?'manual date override':result.origin==='external'?'calendar assignment':'weekly rule'})`:'No sleep assignment'}</li>)}</ul>}
  {bedtimeMode==='use_normal_bedtime'&&missing&&<p role="alert">Some covered nights have no normal bedtime. Set normal bedtime under Home &amp; Sleep or choose an explicit bedtime. Those nights cannot show a sleep card yet.</p>}
 </>:<CalendarVisualFields data={data} initial={initial&&initial.origin!=='visual'&&!isHomeSleep(initial)?initial:undefined} ignore={target==='ignore'}/>}
 {target!=='home_sleep'&&<><label className="check"><input type="checkbox" checked={makeRule} onChange={e=>setMakeRule(e.target.checked)}/>Also create a reusable title rule for these profiles in this calendar</label>
 {makeRule&&<label>Future titles containing<input name="rule_title" required maxLength={500} defaultValue={event.title}/></label>}</>}
 {error&&<p role="alert">{error}</p>}<button>Save calendar decision</button><button type="button" className="secondary" onClick={done}>Cancel</button>
 </form>
}
