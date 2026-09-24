import { useState } from 'react'
import type { HouseholdData } from '../data/records'
import type { RunAction } from './Admin'
import { setCalendarSelection, requestCalendarAction } from '../data/calendarRepository'
import { CalendarRules } from './CalendarRules'
import { CalendarInbox } from './CalendarInbox'
export function CalendarAdmin({data,run}:{data:HouseholdData;run:RunAction}) {
 const [tab,setTab]=useState('connections')
 return <><nav aria-label="Calendar tools">{['connections','inbox','rules'].map(name=><button key={name} aria-current={tab===name?'page':undefined} onClick={()=>setTab(name)}>{name==='connections'?'Calendar connections':name==='inbox'?'Calendar inbox':'Matching rules'}</button>)}</nav>
 {tab==='inbox'?<CalendarInbox data={data} run={run}/>:tab==='rules'?<CalendarRules data={data} run={run}/>:<section>
 <h2>Calendar connections</h2><p>Your family calendar owns titles, times, recurrence and cancellations. This app only reads scheduling and adds visual choices. Nothing here changes provider events.</p>
 <p>Google and Microsoft authorization is not enabled in this milestone. No live provider adapters are installed yet. Existing server-provisioned connections and cached calendars appear below.</p>
 <button disabled>Connect Google (coming next)</button><button disabled>Connect Microsoft (coming next)</button>
 {!data.integration?.connections.length&&<p>No calendar connections yet.</p>}
 {data.integration?.connections.map(connection=><section key={connection.id}><h3>{connection.label} · {connection.provider==='google'?'Google':'Microsoft'}</h3><p>Status: {connection.status.replaceAll('_',' ')}</p>
 <button disabled={connection.status!=='connected'} onClick={()=>void run(()=>requestCalendarAction(data.household.id,'listCalendars',connection.id),'Calendars refreshed.')}>Refresh available calendars</button>
 {data.integration?.calendars.filter(c=>c.connection_id===connection.id).map(calendar=><form key={calendar.id+calendar.enabled+calendar.behavior} onSubmit={e=>{e.preventDefault();const values=new FormData(e.currentTarget);void run(()=>setCalendarSelection(calendar.id,data.household.id,values.get('enabled')==='on',values.get('behavior') as 'evaluate'|'ignore'))}}>
 <h4>{calendar.name}</h4><div className="form-grid"><label className="check"><input name="enabled" type="checkbox" defaultChecked={calendar.enabled}/>Enabled for import</label><label>Default behavior<select name="behavior" defaultValue={calendar.behavior}><option value="evaluate">Include and evaluate events</option><option value="ignore">Ignore calendar</option></select></label></div>
 <p>Last synced: {calendar.last_synced_at?new Date(calendar.last_synced_at).toLocaleString():'Never'}{calendar.sync_status==='error'?' · Sync needs attention':''}</p><button>Save calendar selection</button><button type="button" disabled={!calendar.enabled||calendar.behavior==='ignore'||connection.status!=='connected'} onClick={()=>void run(()=>requestCalendarAction(data.household.id,'sync',calendar.id),'Calendar synchronized.')}>Sync calendar</button>
 </form>)}
 </section>)}
 </section>}</>
}
