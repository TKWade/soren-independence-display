import { useState } from 'react'
import type { HouseholdData, ProfileRow } from '../data/records'
import type { DisplayMode, ProfileDisplayPreferences } from '../types/display'
import type { RunAction } from './Admin'
import { saveDisplayProfile } from '../data/repository'
import { defaultDisplayPreferences, parseDisplayPreferences } from '../display/preferences'
function ProfileForm({data,profile,run,onSaved}:{data:HouseholdData;profile?:ProfileRow;run:RunAction;onSaved:()=>void}) {
 const [preferences,setPreferences]=useState(()=>parseDisplayPreferences(data.displayPreferences?.find(row=>row.profile_id===profile?.id)?.preferences))
 const update=<K extends keyof ProfileDisplayPreferences>(key:K,value:ProfileDisplayPreferences[K])=>setPreferences(p=>({...p,[key]:value}))
 const checks:[keyof Pick<ProfileDisplayPreferences,'allowNavigation'|'autoAdvance'|'showWho'|'showWhere'|'showTimes'|'audioEnabled'>,string][]=[
  ['allowNavigation','Allow opening day and picture details'],['autoAdvance','Move forward automatically as the day progresses'],['showWho','Show who will be there'],['showWhere','Show where activities happen'],['showTimes','Show activity start times'],['audioEnabled','Allow audio cues (no audio cues are available yet)']]
 return <form onSubmit={e=>{e.preventDefault();const values=new FormData(e.currentTarget);void run(async()=>{
  await saveDisplayProfile({id:profile?.id??crypto.randomUUID(),household_id:data.household.id,name:String(values.get('name')).trim(),active:values.get('active')==='on',preferences:parseDisplayPreferences(preferences)})
  onSaved()
 })}}>
  <label>Name<input name="name" defaultValue={profile?.name} maxLength={100} required/></label><label className="check"><input type="checkbox" name="active" defaultChecked={profile?.active??true}/>Active</label>
  <section aria-label="Display and interaction"><h3>Display &amp; Interaction</h3>
   <label>Display Mode<select value={preferences.displayMode} onChange={e=>setPreferences(defaultDisplayPreferences(e.target.value as DisplayMode))}><option value="week">Week / Detailed</option><option value="first-next-then">First / Next / Then</option></select></label>
   <p>One schedule, shown in the way that works best for this person. Changing modes starts with that mode’s recommended settings.</p>
   <details><summary>Advanced display preferences</summary>
    {preferences.displayMode==='first-next-then'?<><label>Maximum activities shown<select value={Math.min(3,preferences.maxVisibleItems)} onChange={e=>update('maxVisibleItems',Number(e.target.value))}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label><p>This view stays on one screen, without day navigation.</p></>:<p>Week always shows all seven days and the full Day timeline.</p>}
    {checks.map(([key,label])=><label className="check" key={key}><input type="checkbox" checked={preferences[key]} onChange={e=>update(key,e.target.checked)}/>{label}</label>)}
    <p>Turning automatic progress off holds the view until it is reopened or these preferences are changed.</p>
    <label>Motion<select value={preferences.motionPreference} onChange={e=>update('motionPreference',e.target.value as ProfileDisplayPreferences['motionPreference'])}><option value="normal">Normal</option><option value="reduced">Reduced</option><option value="none">None</option></select></label>
   </details>
  </section><button>Save profile</button>
 </form>
}
export function ProfileEditor({data,run}:{data:HouseholdData;run:RunAction}) {
 const [selected,setSelected]=useState(''),[version,setVersion]=useState(0)
 const profile=data.profiles.find(p=>p.id===selected)
 return <section><h2>Display profiles</h2><label>Edit profile<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">New profile</option>{data.profiles.map(p=><option key={p.id} value={p.id}>{p.name}{p.active?'':' (inactive)'}</option>)}</select></label>
  <ProfileForm key={selected+version} data={data} profile={profile} run={run} onSaved={()=>{setSelected('');setVersion(v=>v+1)}}/>
  <ul>{data.profiles.filter(p=>p.active).map(p=><li key={p.id}><a href={'/?household='+data.household.id+'&profile='+p.id}>Open {p.name}’s display</a></li>)}</ul>
 </section>
}
