import { useState } from 'react'
import type { HouseholdData } from '../data/records'
import type { RunAction } from './Admin'
import { calendarInbox, eventKey, seriesKey, mappingPayload, relevanceFor } from '../calendar/relevance'
import { saveExternalMapping } from '../data/calendarRepository'
import { CalendarVisualFields } from './CalendarVisualFields'
export function CalendarInbox({data,run}:{data:HouseholdData;run:RunAction}) {
 const [reviewed,setReviewed]=useState(false),[selected,setSelected]=useState(''),[version,setVersion]=useState(0)
 const items=calendarInbox(data,reviewed)
 const item=items.find(i=>i.event.id===selected)
 return <section><h2>Calendar inbox</h2><p>Unmatched events stay off the child display. One decision can cover every occurrence in a series. Calendar titles and times are read-only.</p>
  <label className="check"><input type="checkbox" checked={reviewed} onChange={e=>{setReviewed(e.target.checked);setSelected('')}}/>Include reviewed events (change a decision)</label>
  {!items.length&&<p>{reviewed?'No events in selected calendars.':'No unmatched events for active profiles.'}</p>}
  <label>Event or series<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose event</option>{items.map(i=><option key={i.event.id} value={i.event.id}>{i.event.title||'(Untitled event)'} · {data.integration?.calendars.find(c=>c.id===i.source.calendar_id)?.name} · {i.count} cached occurrence(s)</option>)}</select></label>
  {item&&<InboxForm key={selected+version} data={data} item={item} run={run} done={()=>{setSelected('');setVersion(v=>v+1)}}/>}
 </section>
}
function InboxForm({data,item,run,done}:{data:HouseholdData;item:ReturnType<typeof calendarInbox>[number];run:RunAction;done:()=>void}) {
 const [action,setAction]=useState('include'),[makeRule,setMakeRule]=useState(false),[error,setError]=useState('')
 const {event,source}=item
 const firstProfile=data.profiles.find(p=>p.active)
 const initial=firstProfile?relevanceFor(data,event,source,firstProfile.id):undefined
 return <form onSubmit={submit=>{submit.preventDefault();const values=new FormData(submit.currentTarget);const profiles=values.getAll('profiles').map(String)
  if(!profiles.length) {setError('Choose at least one profile.');return} setError('')
  void run(async()=>{await saveExternalMapping({household_id:data.household.id,calendar_id:source.calendar_id,group_key:values.get('scope')==='event'?eventKey(source):seriesKey(source),
   ...mappingPayload(values,profiles),create_rule:makeRule,rule_title:String(values.get('rule_title')||'').trim()});done()})
 }}>
 <h3>{event.title||'(Untitled event)'}</h3><p>{event.all_day?`${event.all_day_start} — ${event.all_day_end} (all day; end exclusive)`:new Date(event.start_time).toLocaleString('en-US',{timeZone:data.household.time_zone})} · {event.location||'No calendar location'}</p>
 <ul>{data.profiles.filter(p=>p.active).map(p=>{const d=relevanceFor(data,event,source,p.id);return <li key={p.id}>{p.name}: {d?`${d.action==='ignore'?'Ignored':'Applies'} (${d.origin})`:'Needs review'}</li>})}</ul>
 <fieldset><legend>Apply this decision to profile(s)</legend>{data.profiles.filter(p=>p.active).map(p=><label className="check" key={p.id}><input name="profiles" type="checkbox" value={p.id} defaultChecked={item.profiles.includes(p.id)}/>{p.name}</label>)}</fieldset>
 {source.external_series_id&&<label>Decision scope<select name="scope" defaultValue="series"><option value="series">Entire recurring series (including future occurrences)</option><option value="event">Only this occurrence</option></select></label>}
 <label>Decision<select name="action" value={action} onChange={e=>setAction(e.target.value)}><option value="include">Applies to selected profiles</option><option value="ignore">Ignore for selected profiles</option></select></label>
 <CalendarVisualFields data={data} initial={initial&&initial.origin!=='visual'?initial:undefined} ignore={action==='ignore'}/>
 <label className="check"><input type="checkbox" checked={makeRule} onChange={e=>setMakeRule(e.target.checked)}/>Also create a reusable title rule for these profiles in this calendar</label>
 {makeRule&&<label>Future titles containing<input name="rule_title" required maxLength={500} defaultValue={event.title}/></label>}
 {error&&<p role="alert">{error}</p>}<button>Save visual decision</button><button type="button" className="secondary" onClick={done}>Cancel</button>
 </form>
}
