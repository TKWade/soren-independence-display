import { useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { RepeatFields } from './RepeatFields'
import { validateRecurrence, type LocalRecurrence } from '../lib/recurrence'
import type { HouseholdData } from '../data/records'
import type { RunAction } from './Admin'
import { removeRecord, saveEvent } from '../data/repository'
import { atLocalTime, dateInZone, localInput } from '../lib/time'
export function ScheduleEditor({data,run}:{data:HouseholdData;run:RunAction}) {
 const [selected,setSelected]=useState('')
 const [version,setVersion]=useState(0)
 const [startDate,setStartDate]=useState('')
 const [error,setError]=useState('')
 const event=data.events.find(row=>row.id===selected)
 const visuals=data.visuals.filter(row=>row.event_id===selected)
 const visual=visuals[0]
 const zone=data.household.time_zone
 const isLinked=event?.source_kind==='external'
 const start=event ? localInput(event.start_time,zone) : dateInZone(new Date(),zone)+'T08:00'
 const end=event?.end_time ? localInput(event.end_time,zone) : ''
 const personIds=data.eventPeople.filter(row=>visuals.some(v=>v.id===row.visual_id)).map(row=>row.person_id)
 return <section><h2>Schedule</h2><p>Times are in {zone}. Visual choices here apply to every selected profile. Linked calendar events are read-only until the integration milestone.</p>
  <label>Edit event<select value={selected} onChange={e=>{setSelected(e.target.value);setStartDate('');setError('')}}><option value="">New event</option>{[...data.events].sort((a,b)=>a.start_time.localeCompare(b.start_time)).map(row=><option key={row.id} value={row.id}>{localInput(row.start_time,zone).replace('T',' ')} · {row.title}{row.source_kind==='external'?' (linked)':''}</option>)}</select></label>
  <form key={selected+version} onSubmit={e=>{
   e.preventDefault();const values=new FormData(e.currentTarget)
   setError('')
   const rule=JSON.parse(String(values.get('local_recurrence'))) as LocalRecurrence|null
   try {
    if(rule) {validateRecurrence(rule);if(!values.get('end')) throw new Error('Recurring events need an end time.')} 
    if(!values.getAll('profiles').length) throw new Error('Select at least one profile.')
    const date=String(values.get('date')), endDate=String(values.get('end_date'))||date
    const startInstant=atLocalTime(date,String(values.get('start')),zone)
    if(values.get('end')) {
     const endInstant=atLocalTime(endDate,String(values.get('end')),zone)
     if(Date.parse(endInstant)<=Date.parse(startInstant)) throw new Error('Event end must be later than its start.')
     if(rule && Temporal.PlainDate.from(date).until(Temporal.PlainDate.from(endDate)).days>7) throw new Error('Each recurring event can span at most seven days.')
    }
   } catch(caught) {setError(caught instanceof Error?caught.message:'Check recurrence settings.');return}
   void run(async()=>{
    if(isLinked) throw new Error('Linked event')
    const date=String(values.get('date'))
    const endDate=String(values.get('end_date'))||date
    const startTime=atLocalTime(date,String(values.get('start')),zone)
    const endTime=values.get('end') ? atLocalTime(endDate,String(values.get('end')),zone) : null
    if(endTime && Date.parse(endTime)<=Date.parse(startTime)) throw new Error('End must be later')
    if(values.getAll('profiles').length===0) throw new Error('Select a profile')
    await saveEvent({id:event?.id,household_id:data.household.id,title:String(values.get('title')).trim(),
     start_time:startTime,end_time:endTime,time_zone:zone,local_recurrence:rule,activity_id:values.get('activity'),place_id:values.get('place'),
     profile_ids:values.getAll('profiles'),person_ids:values.getAll('people'),label_override:values.get('label'),
     visible:values.get('visible')==='on',is_primary:values.get('primary')==='on',picture_person_id:values.get('picture_person')||null})
    setSelected('');setStartDate('');setVersion(value=>value+1)
   })
  }}>
   <fieldset disabled={isLinked}>
    <div className="form-grid"><label>Title<input name="title" required maxLength={160} defaultValue={event?.title}/></label>
     <label>Starts (series anchor)<input type="date" name="date" required value={startDate||start.slice(0,10)} onChange={e=>setStartDate(e.target.value)}/></label>
     <label>Start<input type="time" name="start" required defaultValue={start.slice(11,16)}/></label>
     <label>End (optional)<input type="time" name="end" defaultValue={end.slice(11,16)}/></label>
     <label>First event ends on (blank = same day)<input type="date" name="end_date" defaultValue={end.slice(0,10)}/></label>
     <label>Activity<select name="activity" required defaultValue={visual?.activity_id ?? ''}><option value="">Choose activity</option>{data.activities.filter(a=>a.active||a.id===visual?.activity_id).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
     <label>Place<select name="place" required defaultValue={visual?.place_id ?? ''}><option value="">Choose place</option>{data.places.filter(p=>p.active||p.id===visual?.place_id).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
     <label>Child label override (optional)<input name="label" maxLength={20} defaultValue={visual?.label_override ?? ''}/></label>
     <label>Use person picture (e.g. pickup)<select name="picture_person" defaultValue={visual?.picture_person_id ?? ''}><option value="">Use activity/place picture</option>{data.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    </div>
    <RepeatFields initial={event?.local_recurrence} startDate={startDate||start.slice(0,10)}/>
    {error && <p role="alert">{error}</p>}
    <fieldset><legend>Profiles (at least one)</legend>{data.profiles.filter(p=>p.active||visuals.some(v=>v.profile_id===p.id)).map(p=><label className="check" key={p.id}><input name="profiles" type="checkbox" value={p.id} defaultChecked={event ? visuals.some(v=>v.profile_id===p.id) : data.profiles.length===1}/>{p.name}</label>)}</fieldset>
    <fieldset><legend>People involved</legend>{data.people.filter(p=>p.active||personIds.includes(p.id)).map(p=><label className="check" key={p.id}><input name="people" type="checkbox" value={p.id} defaultChecked={personIds.includes(p.id)}/>{p.name}</label>)}</fieldset>
    <label className="check"><input name="visible" type="checkbox" defaultChecked={visual?.visible ?? true}/>Show on child display</label>
    <label className="check"><input name="primary" type="checkbox" defaultChecked={visual?.is_primary ?? false}/>Main activity for the Week summary</label>
    <button>Save event</button>
    {event && <button type="button" className="danger" onClick={()=>{if(window.confirm('Delete this event or entire series for all profiles?')) void run(async()=>{await removeRecord('calendar_events',event.id,data.household.id);setSelected('');setStartDate('');setError('')},'Event deleted.')}}>Delete event</button>}
   </fieldset>
   {event && <button type="button" className="secondary" onClick={()=>{setSelected('');setStartDate('');setError('')}}>Cancel edit</button>}
  </form>
 </section>
}
