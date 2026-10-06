import {createRoot} from 'react-dom/client'
import {useState} from 'react'
import {DisplayRenderer} from '../../src/display/DisplayRenderer'
import {CaregiverToolbar} from '../../src/admin/CaregiverToolbar'
import {defaultDisplayPreferences} from '../../src/display/preferences'
import {createMockWeek} from '../../src/data/mockWeek'
import {fixtureWeather} from './weather-fixture'
import {dateKey} from '../../src/lib/schedule'
import {useDevicePreferences} from '../../src/hooks/useDevicePreferences'
import {selectDeviceProfile} from '../../src/device/preferences'
import '../../src/index.css'
import '../../src/admin/admin.css'
if(!import.meta.env.DEV)throw new Error('Development fixture only')
const userId='wall-readiness-fictional-account',household={id:'fictional-household',name:'Fictional household',time_zone:'America/Chicago'}
const profiles=[{id:'fictional-child',household_id:household.id,name:'Soren',active:true},{id:'fictional-sibling',household_id:household.id,name:'Sibling',active:true}]
const start=new Date('2026-10-01T04:59:55Z')
export function Fixture(){
 const [now,setNow]=useState(start),[revision,setRevision]=useState(0),[offline,setOffline]=useState(false),[loading,setLoading]=useState(false),[showSettings,setShowSettings]=useState(true)
 const prefs=useDevicePreferences(userId),selected=selectDeviceProfile('',prefs,household.id,profiles)
 const days=createMockWeek(now).map(day=>({...day,timeZone:household.time_zone,events:day.events.map(event=>({...event,label:revision?'UPDATED':event.label}))}))
 const weather=fixtureWeather(now,household.time_zone)
 if(weather.forecast)weather.forecast.daily=weather.forecast.daily.map(day=>({...day,high:revision?30:20}))
 return <><aside className="admin-shell" style={{minHeight:0,padding:12}}><p>Development-only fictional data. Device settings save only fictional IDs in this browser. No backend or authentication calls.</p>
 <button onClick={()=>setShowSettings(!showSettings)}>Toggle fixture controls</button>
 <button onClick={()=>setNow(new Date('2026-10-01T05:00:10Z'))}>Resume after midnight</button>
 <button onClick={()=>setLoading(true)}>Begin pending refresh</button>
 <button onClick={()=>{setLoading(false);setOffline(true)}}>Fail refresh</button>
 <button onClick={()=>{setLoading(false);setOffline(false);setRevision(r=>r+1)}}>Complete refresh / reconnect</button>
 <p role="status">{loading?'Refreshing':offline?'Offline, retaining current data':'Ready'} · {dateKey(now,household.time_zone)}</p>
 {showSettings&&<CaregiverToolbar userId={userId} households={[household]} householdId={household.id} profiles={profiles} onHouseholdChange={()=>{}} onRefresh={()=>setRevision(r=>r+1)} loading={loading}/>}
 <p>Resolved device launch: {selected?.name??'Caregiver selection required'}</p></aside>
 <DisplayRenderer profileName="Soren" preferences={defaultDisplayPreferences()} schedule={{days,timeZone:household.time_zone}} weather={weather} now={now} savedView={offline}/></>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
