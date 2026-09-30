import {DeleteControl} from './DeleteControl'
import { SleepReview } from './SleepReview'
import { useState } from 'react'
import type { HouseholdData } from '../data/records'
import type { RunAction } from './Admin'
import { saveRecord, saveHomePreferences } from '../data/repository'
import { homePreferences, eligibleSleepCalendar } from '../calendar/homePreferences'
import type { OvernightMode } from '../calendar/homePreferences'
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
export function HomeEditor({data,run}:{data:HouseholdData;run:RunAction}) {
 const [selected,setSelected]=useState(data.profiles.find(p=>p.active)?.id??'')
 const profile=data.profiles.find(p=>p.id===selected&&p.active)
 return <section><h2>Home &amp; Sleep</h2>
  <label>Profile<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose profile</option>{data.profiles.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  {!profile?<p>Create or choose an active profile to configure bedtime and overnight plans.</p>:<ProfileHome key={profile.id+JSON.stringify(homePreferences(data,profile.id))} data={data} profileId={profile.id} run={run}/>}
 </section>
}
function ProfileHome({data,profileId,run}:{data:HouseholdData;profileId:string;run:RunAction}) {
 const preferences=homePreferences(data,profileId)
 const [mode,setMode]=useState<OvernightMode>(preferences.overnight_mode)
 const [version,setVersion]=useState(0)
 const local=preferences.overnight_mode==='local'
 return <>
 <form key={version} onSubmit={e=>{e.preventDefault();const values=new FormData(e.currentTarget);void run(async()=>{
  const weekday_bedtimes=Object.fromEntries(weekdays.flatMap((_,i)=>values.get('weekday-'+i)?[[i,String(values.get('weekday-'+i))]]:[]))
  await saveHomePreferences({household_id:data.household.id,profile_id:profileId,overnight_mode:mode,default_bedtime:String(values.get('default_bedtime'))||null,weekday_bedtimes})
  setVersion(v=>v+1)
 })}}>
  <h3>Normal bedtime</h3><p>Independent of sleep location. Set a default and optionally different times for individual weekdays.</p>
  <label>Default bedtime<input type="time" name="default_bedtime" defaultValue={preferences.default_bedtime?.slice(0,5)??''}/></label>
  <details><summary>Weekday bedtime overrides (optional)</summary>{weekdays.map((day,i)=><label key={day}>{day}<input type="time" name={'weekday-'+i} defaultValue={preferences.weekday_bedtimes[i]?.slice(0,5)??''}/></label>)}</details>
  <label>Overnight schedule source<select value={mode} onChange={e=>setMode(e.target.value as OvernightMode)}><option value="local">Local schedule</option><option value="calendar_with_local_fallback">Connected calendar + local fallback</option><option value="calendar_driven">Connected calendar-driven</option></select></label>
  <p>Changing source never deletes local rules or calendar mappings. Specific-date overrides always take priority.</p>
  <button>Save Home &amp; Sleep settings</button>
 </form>
 {mode!==preferences.overnight_mode&&<p role="status">Save to use this schedule source. The controls below show the currently saved source.</p>}
 {!local&&<><h3>Connected-calendar assignments</h3>
  {!eligibleSleepCalendar(data)?<p role="alert">No eligible connected calendar. Connect an account and enable a calendar for evaluation under Calendars. {preferences.overnight_mode==='calendar_driven'?'Without a manual date override, nights remain unresolved.':'Local fallback rules remain available.'}</p>:<p>Map overnight events in Calendar Inbox. Review below covers the next 14 nights and future cached calendar nights.</p>}
 </>}
 <SleepReview data={data} profileId={profileId}/>
 {preferences.overnight_mode==='calendar_driven'?<details><summary>Inactive local weekly schedule (preserved)</summary><p>These rules do not supply overnight locations in calendar-driven mode. Switch back to Local or fallback mode to use them again. Legacy rule bedtimes remain a compatibility fallback.</p><RuleEditor data={data} profileId={profileId} run={run} kind="weekly"/></details>:<section><h3>{local?'Weekly overnight schedule':'Weekly fallback schedule'}</h3><RuleEditor data={data} profileId={profileId} run={run} kind="weekly"/></section>}
 <section><h3>Specific-date overrides</h3><p>A date override wins regardless of the selected schedule source.</p><RuleEditor data={data} profileId={profileId} run={run} kind="date"/></section>
 </>
}
function RuleEditor({data,profileId,run,kind}:{data:HouseholdData;profileId:string;run:RunAction;kind:'weekly'|'date'}) {
 const [selected,setSelected]=useState(''),[version,setVersion]=useState(0)
 const rules=data.homeRules.filter(r=>r.profile_id===profileId&&(kind==='date'?!!r.override_date:!r.override_date))
 const rule=rules.find(r=>r.id===selected)
 return <>
 <label>Edit {kind==='weekly'?'weekly rule':'date override'}<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">New {kind==='weekly'?'weekly rule':'date override'}</option>{rules.map(r=><option key={r.id} value={r.id}>{r.override_date??weekdays[r.weekday!]} · {data.places.find(p=>p.id===r.place_id)?.name}</option>)}</select></label>
 <form key={selected+version} onSubmit={e=>{e.preventDefault();const values=new FormData(e.currentTarget);void run(async()=>{
  const weekday=kind==='weekly'?Number(values.get('weekday')):null,date=kind==='date'?String(values.get('date')):null
  const existing=rules.find(r=>r.weekday===weekday&&r.override_date===date)
  if(rule&&existing&&existing.id!==rule.id) throw new Error('Rule already exists')
  await saveRecord('home_rules',{id:rule?.id??existing?.id??crypto.randomUUID(),household_id:data.household.id,profile_id:profileId,weekday,override_date:date,
   bedtime:rule?.bedtime??existing?.bedtime??null,bedtime_override:values.get('bedtime_override')||null,place_id:values.get('place'),caregiver_id:values.get('person')||null})
  setSelected('');setVersion(v=>v+1)
 })}}><div className="form-grid">
 {kind==='weekly'?<label>Weekday<select name="weekday" defaultValue={rule?.weekday??1}>{weekdays.map((day,i)=><option key={day} value={i}>{day}</option>)}</select></label>:<label>Date<input type="date" name="date" required defaultValue={rule?.override_date??''}/></label>}
 <label>Sleep location<select name="place" required defaultValue={rule?.place_id??''}><option value="">Choose place</option>{data.places.filter(p=>p.active||p.id===rule?.place_id).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <label>Caregiver<select name="person" defaultValue={rule?.caregiver_id??''}><option value="">None</option>{data.people.filter(p=>p.active||p.id===rule?.caregiver_id).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <label>Explicit bedtime override (optional)<input type="time" name="bedtime_override" defaultValue={(rule?.bedtime_override===undefined&&kind==='date'?rule?.bedtime:rule?.bedtime_override)?.slice(0,5)??''}/></label>
 </div><p>Leave bedtime override blank to use normal profile bedtime.</p>
 {rule?.bedtime&&kind==='weekly'&&<p>Legacy bedtime {rule.bedtime.slice(0,5)} is retained as a fallback until normal profile bedtime is configured.</p>}
 <button>Save {kind==='weekly'?'weekly rule':'date override'}</button>
 {rule&&<><DeleteControl entity="home_rules" id={rule.id} householdId={data.household.id} run={run} label={kind==='date'?'Delete date override':'Delete weekly rule'} done={()=>setSelected('')}/><button type="button" className="secondary" onClick={()=>setSelected('')}>Cancel edit</button></>}
 </form></>
}
