import {WeatherSettings} from '../../src/admin/WeatherSettings'
import {ProfileAccessSettings} from '../../src/admin/ProfileAccessSettings'
import {fixtureWeather} from './weather-fixture'
import { CaregiverToolbar } from '../../src/admin/CaregiverToolbar'
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
if(new URLSearchParams(location.search).has('stress')) {
 fixture.integration.calendars=Array.from({length:6},(_,i)=>({...fixture.integration.calendars[0],id:'calendar-'+i,external_calendar_id:'fictional-'+i,name:['Family appointments','School and after-school activities','Therapy visits','Caregiver availability','Sports and recreation','Final calendar — weekend and holiday plans'][i]}))
}
function auditDocumentScroll() {
 const doc=document.scrollingElement!
 window.scrollTo({top:doc.scrollHeight,behavior:'instant'})
 requestAnimationFrame(()=>{
  const selectors='html,body,#root,.admin-shell,.admin-workspace,.admin-workspace section,.admin-workspace form,.form-grid,.image-editor,.image-editor-layout,.image-editor-controls,.danger-zone'
  const elements=[...document.querySelectorAll<HTMLElement>(selectors)]
  const rows=elements.map(element=>{
   const style=getComputedStyle(element),rect=element.getBoundingClientRect()
   return {element:element.tagName+'#'+element.id+'.'+element.className,height:style.height,minHeight:style.minHeight,maxHeight:style.maxHeight,overflow:style.overflow,overflowY:style.overflowY,position:style.position,display:style.display,contain:style.contain,containerType:style.containerType,contentVisibility:style.contentVisibility,transform:style.transform,flex:style.flex,gridRows:style.gridTemplateRows,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight,top:rect.top,bottom:rect.bottom}
  })
  const controls=[...document.querySelectorAll<HTMLElement>('.admin-workspace button,.admin-workspace input,.admin-workspace select')].filter(e=>e.getClientRects().length)
  const last=controls.at(-1)?.getBoundingClientRect()
  console.info('Admin scroll audit '+JSON.stringify({viewport:[innerWidth,innerHeight],visualHeight:visualViewport?.height,document:doc.scrollHeight,body:document.body.scrollHeight,root:document.getElementById('root')?.scrollHeight,shell:document.querySelector('.admin-shell')?.scrollHeight,workspace:document.querySelector('.admin-workspace')?.scrollHeight,scrollY,lastControl:last?{top:last.top,bottom:last.bottom,fullyVisible:last.top>=0&&last.bottom<=innerHeight}:null,rows}))
 })
}

fixture.integration.matchingRules=[{...rule,id:'sister-ignore',profile_id:'sister',action:'ignore'}]
export function CalendarAdminFixture() {
 const [message,setMessage]=useState('')
 const [dialogOpen,setDialogOpen]=useState(false)
 const [typed,setTyped]=useState('')
 const [tab,setTab]=useState('calendars')
 const [householdId,setHouseholdId]=useState('h')
 const households=[fixture.household,{...fixture.household,id:'other',name:'Other household'},{...fixture.household,id:'empty',name:'Empty household'}]
 const data={...fixture,weather:fixtureWeather(new Date(),fixture.household.time_zone),household:households.find(h=>h.id===householdId)!,profiles:householdId==='empty'?[]:householdId==='other'?[{id:'only',name:'Alex',active:true}]:[...fixture.profiles,{id:'archived',name:'Archived example',active:false}]} as unknown as HouseholdData
 const run=async()=>{setMessage('Save disabled in this read-only fixture.');return false}
 return <main className="admin-shell"><CaregiverHeader logoSrc={new URLSearchParams(window.location.search).has('logoFallback')?'/brand/missing-test-logo.png':undefined}><button className="quiet" disabled>Sign out</button></CaregiverHeader>
 <p className="info-panel">Fictional, read-only data. No backend calls or saves.</p><button className="secondary" onClick={auditDocumentScroll}>Audit document scroll</button>
 <CaregiverToolbar households={households} householdId={data.household.id} profiles={data.profiles} loading={false} onHouseholdChange={setHouseholdId} onRefresh={()=>setMessage('Read-only fixture refreshed.')}/>
 <WeatherSettings data={data} run={run} searchLocation={async()=>[{label:'Salina, Kansas, United States',latitude:38.84,longitude:-97.61}]}/><nav aria-label="Caregiver sections">{['profiles','people','places','activities','schedule','home','calendars'].map(name=><button key={name} aria-current={tab===name?'page':undefined} onClick={()=>setTab(name)}>{name==='home'?'HOME & SLEEP':name.toUpperCase()}</button>)}</nav>
 <fieldset className="admin-workspace" key={householdId}>{tab==='profiles'?<><ProfileAccessSettings householdId={householdId} run={run} readOnly/><ProfileEditor data={data} run={run} readOnly/></>:tab==='home'?<HomeEditor data={data} run={run}/>:tab==='schedule'?<ScheduleEditor data={data} run={run}/>:tab==='calendars'?<CalendarAdmin data={data} run={run}/>:<LibraryEditor key={tab} kind={tab as 'people'|'places'|'activities'} data={data} run={run}/>}</fieldset>
 <button className="secondary" onClick={()=>{setTyped('');setDialogOpen(true)}}>Preview deletion dialog (fictional)</button>
 {dialogOpen&&<DeletionDialog entity="profiles" id="fixture" label="Permanent delete" preview={{name:'Example profile',blocked:true,dependencies:{shared_event_visuals:24,home_rules:7,event_mappings:12}}} typed={typed} setTyped={setTyped} close={()=>setDialogOpen(false)} confirm={()=>{}}/>}
 <p role="status">{message}</p></main>
}
