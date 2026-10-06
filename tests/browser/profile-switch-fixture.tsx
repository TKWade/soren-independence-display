import {createRoot} from 'react-dom/client'
import {useState} from 'react'
import {ProfileChooser,ProfileSwitchButton} from '../../src/profiles/ProfileChooser'
import {authorizedProfiles,defaultSwitchingSettings,requiresPin,type ChooserProfile} from '../../src/profiles/access'
import {DisplayRenderer} from '../../src/display/DisplayRenderer'
import {defaultDisplayPreferences} from '../../src/display/preferences'
import {normalizeWeek} from '../../src/lib/persistentSchedule'
import {householdFixture,decision} from '../fixtures/externalCalendars.mjs'
import {ProfileAccessSettings} from '../../src/admin/ProfileAccessSettings'
import '../../src/index.css'
if(!import.meta.env.DEV)throw new Error('Development fixture only')
const now=new Date('2026-09-23T14:30:00Z'),data=householdFixture()
const profiles:ChooserProfile[]=[
 {id:'soren',name:'Demo Child',role:'child',active:true,photoUrl:'/icons/icon-192.png'},
 {id:'sister',name:'Demo Sibling',role:'sibling',active:true,avatar:'flower'},
 {id:'adult',name:'Demo Caregiver',role:'caregiver',active:true},
 {id:'adult2',name:'Second Caregiver',role:'caregiver',active:true,avatar:'star'},
 {id:'other',name:'Alex With A Longer Profile Name',role:'other',active:true,photoUrl:'/missing-fictional-photo.png',avatar:'sun'},
 {id:'another',name:'Taylor Lane',role:'other',active:true},
 {id:'inactive',name:'Inactive',role:'child',active:false},
 {id:'unauthorized',name:'Unauthorized',role:'child',active:true},
]
data.integration.mappings=profiles.map(profile=>({...decision,id:'mapping-'+profile.id,profile_id:profile.id}))
export function Fixture(){
 const [current,setCurrent]=useState(profiles[0]),[open,setOpen]=useState(false),[settings,setSettings]=useState(defaultSwitchingSettings),[hasPin,setHasPin]=useState(true),[forceChange,setForceChange]=useState(false),[incorrect,setIncorrect]=useState(false)
 const preferences=defaultDisplayPreferences(current.id==='adult'?'standard-calendar':current.id==='sister'?'first-next-then':'week')
 const allowed=authorizedProfiles(profiles,{householdId:'h',allowedProfileIds:profiles.filter(p=>p.id!=='unauthorized').map(p=>p.id),defaultProfileId:'soren',scope:'trusted-caregiver-display'})
 const run=async()=>false
 return <>
  <div className="fixture-profile-controls" style={{padding:8,font:'12px system-ui',background:'white',display:'flex',gap:12,flexWrap:'wrap'}}>
   <span>Fictional UI simulation. No authentication or backend calls. Any 4–8 digits succeed unless failure mode is selected.</span>
   <label><input type="checkbox" checked={!settings.allowChildToChildSwitching} onChange={e=>setSettings(s=>({...s,allowChildToChildSwitching:!e.target.checked}))}/>Lock child switching</label>
   <label><input type="checkbox" checked={settings.requirePinForAllProfileSwitches} onChange={e=>setSettings(s=>({...s,requirePinForAllProfileSwitches:e.target.checked}))}/>Lock all</label>
   <label><input type="checkbox" checked={!hasPin} onChange={e=>setHasPin(!e.target.checked)}/>No PIN</label>
   <label><input type="checkbox" checked={forceChange} onChange={e=>setForceChange(e.target.checked)}/>Required change</label>
   <label><input type="checkbox" checked={incorrect} onChange={e=>setIncorrect(e.target.checked)}/>Incorrect + backoff</label>
  </div>
  <DisplayRenderer key={current.id} schedule={{days:normalizeWeek(data,current.id,now),timeZone:data.household.time_zone}} profileName={current.name} now={now} preferences={preferences} profileSwitch={<ProfileSwitchButton profile={current} onClick={()=>setOpen(true)}/>}/>
  {open&&<ProfileChooser profiles={allowed} current={current} settings={settings} caregivers={{adult:{configured:hasPin,changeRequired:forceChange},adult2:{configured:hasPin,changeRequired:false}}} onClose={()=>setOpen(false)} onSelected={profile=>{
   setCurrent(profile);setOpen(false);const query=new URLSearchParams(location.search);query.set('profile',profile.id);history.pushState(null,'','?'+query)
  }} authorize={async id=>requiresPin(profiles.find(p=>p.id===id)!,current,settings)?{allowed:false,reason:hasPin?'pin_required':'pin_not_configured'}:{allowed:true}} verify={async(_id,_pin,cid)=>incorrect?{allowed:false,reason:'incorrect',retryAfter:5}:forceChange&&cid==='adult'?{allowed:false,reason:'change_required',changeToken:'fictional-ui-token'}:{allowed:true}} changePin={async()=>({allowed:true})}/>}
  {new URLSearchParams(location.search).has('adminSettings')&&<main className="admin-shell"><ProfileAccessSettings householdId="h" run={run} readOnly/></main>}
 </>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
