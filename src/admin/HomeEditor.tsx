import { useState } from 'react'
import type { HouseholdData } from '../data/records'
import type { RunAction } from './Admin'
import { removeRecord, saveRecord } from '../data/repository'
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
export function HomeEditor({data,run}:{data:HouseholdData;run:RunAction}) {
 const [selected,setSelected]=useState('')
 const [mode,setMode]=useState('weekly')
 const [version,setVersion]=useState(0)
 const rule=data.homeRules.find(r=>r.id===selected)
 return <section><h2>Home & sleep</h2><p>A date override takes priority over the repeating weekday. Delete an override to use the weekly plan again.</p>
  <label>Edit rule<select value={selected} onChange={e=>{const row=data.homeRules.find(r=>r.id===e.target.value);setSelected(e.target.value);setMode(row?.override_date?'date':'weekly')}}><option value="">New rule</option>{data.homeRules.map(r=><option key={r.id} value={r.id}>{data.profiles.find(p=>p.id===r.profile_id)?.name} · {r.override_date ?? weekdays[r.weekday!]} · {data.places.find(p=>p.id===r.place_id)?.name}</option>)}</select></label>
  <form key={selected+version} onSubmit={e=>{
   e.preventDefault();const values=new FormData(e.currentTarget)
   void run(async()=>{
    const profile=String(values.get('profile'));const weekday=mode==='weekly'?Number(values.get('weekday')):null
    const date=mode==='date'?String(values.get('date')):null
    // Save over the existing slot rather than creating duplicate recurring rules.
    const existing=data.homeRules.find(r=>r.profile_id===profile && r.weekday===weekday && r.override_date===date)
    if(rule && existing && existing.id!==rule.id) throw new Error('Rule already exists')
    await saveRecord('home_rules',{id:rule?.id ?? existing?.id ?? crypto.randomUUID(),household_id:data.household.id,
     profile_id:profile,weekday,override_date:date,bedtime:values.get('bedtime'),place_id:values.get('place'),caregiver_id:values.get('person')||null})
    setSelected('');setVersion(v=>v+1)
   })
  }}><div className="form-grid">
   <label>Profile<select name="profile" required defaultValue={rule?.profile_id ?? ''}><option value="">Choose profile</option>{data.profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label>Rule type<select value={mode} onChange={e=>setMode(e.target.value)}><option value="weekly">Repeating weekday</option><option value="date">Specific date override</option></select></label>
   {mode==='weekly'?<label>Weekday<select name="weekday" defaultValue={rule?.weekday ?? 1}>{weekdays.map((day,index)=><option value={index} key={day}>{day}</option>)}</select></label>:<label>Date<input type="date" name="date" defaultValue={rule?.override_date ?? ''} required/></label>}
   <label>Bedtime<input type="time" name="bedtime" required defaultValue={rule?.bedtime.slice(0,5) ?? '19:30'}/></label>
   <label>Sleep location<select name="place" required defaultValue={rule?.place_id ?? ''}><option value="">Choose place</option>{data.places.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label>Caregiver<select name="person" defaultValue={rule?.caregiver_id ?? ''}><option value="">None</option>{data.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  </div><button>Save sleep rule</button>
  {rule && <><button type="button" className="danger" onClick={()=>{if(window.confirm('Delete this sleep rule?')) void run(async()=>{await removeRecord('home_rules',rule.id,data.household.id);setSelected('')},'Rule deleted.')}}>Delete rule</button><button type="button" className="secondary" onClick={()=>setSelected('')}>Cancel edit</button></>}
  </form>
 </section>
}
