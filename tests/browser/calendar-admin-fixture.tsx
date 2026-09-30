import { DeletionDialog } from '../../src/admin/DeleteControl'
import { useState } from 'react'
import { ProfileEditor } from '../../src/admin/ProfileEditor'
import { LibraryEditor } from '../../src/admin/LibraryEditor'
import { HomeEditor } from '../../src/admin/HomeEditor'
import { ScheduleEditor } from '../../src/admin/ScheduleEditor'
import { CaregiverHeader } from '../../src/admin/CaregiverHeader'
import { CalendarAdmin } from '../../src/admin/CalendarAdmin'
import type { HouseholdData } from '../../src/data/records'
import { householdFixture, rule } from '../fixtures/externalCalendars.mjs'
import '../../src/index.css'
import '../../src/admin/admin.css'
if(!import.meta.env.DEV) throw new Error('Development fixture only')
const fixture=householdFixture()
fixture.integration.matchingRules=[{...rule,id:'sister-ignore',profile_id:'sister',action:'ignore'}]
export function CalendarAdminFixture() {
 const [message,setMessage]=useState('')
 const [dialogOpen,setDialogOpen]=useState(false)
 const [typed,setTyped]=useState('')
 const [tab,setTab]=useState('calendars')
 const data=fixture as unknown as HouseholdData
 const run=async()=>{setMessage('Save disabled in this read-only fixture.');return false}
 return <main className="admin-shell"><CaregiverHeader><button className="quiet" disabled>Sign out</button></CaregiverHeader>
 <p className="info-panel">Fictional, read-only data. No backend calls or saves.</p>
 <div className="admin-toolbar"><label>Household<select><option>Test household</option></select></label><a className="secondary" href="/tests/browser/index.html?view=rolling">Open display</a><button className="secondary" onClick={()=>setMessage('Read-only fixture refreshed.')}>Refresh</button></div>
 <nav aria-label="Caregiver sections">{['profiles','people','places','activities','schedule','home','calendars'].map(name=><button key={name} aria-current={tab===name?'page':undefined} onClick={()=>setTab(name)}>{name==='home'?'HOME & SLEEP':name.toUpperCase()}</button>)}</nav>
 {tab==='profiles'?<ProfileEditor data={data} run={run}/>:tab==='home'?<HomeEditor data={data} run={run}/>:tab==='schedule'?<ScheduleEditor data={data} run={run}/>:tab==='calendars'?<CalendarAdmin data={data} run={run}/>:<LibraryEditor key={tab} kind={tab as 'people'|'places'|'activities'} data={data} run={run}/>}
 <button className="secondary" onClick={()=>{setTyped('');setDialogOpen(true)}}>Preview deletion dialog (fictional)</button>
 {dialogOpen&&<DeletionDialog entity="profiles" id="fixture" label="Permanent delete" preview={{name:'Example profile',blocked:true,dependencies:{shared_event_visuals:24,home_rules:7,event_mappings:12}}} typed={typed} setTyped={setTyped} close={()=>setDialogOpen(false)} confirm={()=>{}}/>}
 <p role="status">{message}</p></main>
}
