import { useState } from 'react'
import type { HouseholdData } from '../data/records'
import type { CalendarMatchingRule } from '../types/externalCalendar'
import type { RunAction } from './Admin'
import { CalendarVisualFields } from './CalendarVisualFields'
import { mappingPayload } from '../calendar/relevance'
import { saveMatchingRule, deleteMatchingRule } from '../data/calendarRepository'
export function CalendarRules({data,run}:{data:HouseholdData;run:RunAction}) {
 const [selected,setSelected]=useState(''),[version,setVersion]=useState(0)
 const rules=data.integration?.matchingRules??[]
 return <section><h2>Matching rules</h2><p>Rules propose visual choices per profile. Manual event or series decisions take precedence. Higher priority wins; equal priorities use a stable rule ID. Changes apply to cached and future matching events.</p>
  <label>Edit rule<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">New rule</option>{rules.map(r=><option key={r.id} value={r.id}>{r.name} · {data.profiles.find(p=>p.id===r.profile_id)?.name}{r.enabled?'':' (disabled)'}</option>)}</select></label>
  <RuleForm key={selected+version} rule={rules.find(r=>r.id===selected)} data={data} run={run} done={()=>{setSelected('');setVersion(v=>v+1)}}/>
 </section>
}
function RuleForm({rule,data,run,done}:{rule?:CalendarMatchingRule;data:HouseholdData;run:RunAction;done:()=>void}) {
 const [action,setAction]=useState(rule?.action??'include')
 return <form onSubmit={event=>{event.preventDefault();const v=new FormData(event.currentTarget);const {profile_ids: _profiles,...visual}=mappingPayload(v,[])
  void run(async()=>{await saveMatchingRule({id:rule?.id??crypto.randomUUID(),household_id:data.household.id,...visual,
   profile_id:String(v.get('profile')),name:String(v.get('name')).trim(),enabled:v.get('enabled')==='on',priority:Number(v.get('priority')),
   title_operator:v.get('operator') as 'equals'|'contains',title_value:String(v.get('title')).trim(),case_sensitive:v.get('case')==='on',
   calendar_id:String(v.get('calendar'))||null,source_filter:rule?.source_filter??null});done()})
 }}><div className="form-grid">
  <label>Rule name<input name="name" required maxLength={100} defaultValue={rule?.name}/></label>
  <label>Profile<select name="profile" required defaultValue={rule?.profile_id??''}><option value="">Choose profile</option>{data.profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label>Calendar<select name="calendar" defaultValue={rule?.calendar_id??''}><option value="">All selected calendars</option>{data.integration?.calendars.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <label>Title matching<select name="operator" defaultValue={rule?.title_operator??'contains'}><option value="contains">Contains</option><option value="equals">Equals</option></select></label>
  <label>Title text<input name="title" required maxLength={500} defaultValue={rule?.title_value}/></label>
  <label>Priority<input name="priority" type="number" required min="-10000" max="10000" defaultValue={rule?.priority??0}/></label>
  <label>Then<select name="action" value={action} onChange={e=>setAction(e.target.value as 'include'|'ignore')}><option value="include">Apply to this profile</option><option value="ignore">Ignore for this profile</option></select></label>
 </div>
 <label className="check"><input type="checkbox" name="case" defaultChecked={rule?.case_sensitive??false}/>Case-sensitive title match</label>
 <label className="check"><input type="checkbox" name="enabled" defaultChecked={rule?.enabled??true}/>Rule enabled</label>
 <CalendarVisualFields data={data} initial={rule} ignore={action==='ignore'}/>
 <button>Save rule</button>{rule&&<><button type="button" className="secondary" onClick={done}>Cancel edit</button><button type="button" className="danger" onClick={()=>{if(confirm('Delete this matching rule? Events without another decision will return to the inbox.')) void run(async()=>{await deleteMatchingRule(rule.id,data.household.id);done()})}}>Delete rule</button></>}
 </form>
}
