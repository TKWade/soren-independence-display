import {selectDeviceProfile,deviceHouseholdPreference,type DevicePreferences} from './device/preferences'
import {useDisplayWakeLock} from './hooks/useDisplayWakeLock'
import { scheduleForDates } from './lib/scheduleForDates'
import { normalizeWeek } from './lib/persistentSchedule'
import type { useHouseholdData } from './hooks/useHouseholdData'
import { useToday } from './hooks/useToday'
import { DisplayRenderer } from './display/DisplayRenderer'
import { parseDisplayPreferences } from './display/preferences'
import {ProfileDisplayAccess} from './profiles/ProfileDisplayAccess'
import type {HouseholdData,ProfileRow} from './data/records'
import type {ReactNode} from 'react'
export default function App({store,devicePreferences=null}:{store:ReturnType<typeof useHouseholdData>;devicePreferences?:DevicePreferences|null}) {
 const today=useToday()
 const profile=store.data?selectDeviceProfile(window.location.search,devicePreferences,store.data.household.id,store.data.profiles):undefined
 useDisplayWakeLock(Boolean(store.data&&deviceHouseholdPreference(devicePreferences,store.data.household.id)?.keepAwake))
 if(!store.data&&!store.loading&&!store.error) return <DisplaySelectionRequired/>
 if(!store.data)return <div className="display-state" role="status">{store.loading?'WAIT':'TRY AGAIN'}<button aria-label="Try again" onClick={store.refresh}>↻</button></div>
 return <ProfileDisplayAccess key={store.data.household.id} data={store.data} requested={profile}>{(selected,trigger)=><ProfileSchedule data={store.data!} profile={selected} today={today} savedView={store.error} trigger={trigger}/>}</ProfileDisplayAccess>
}
/** Presentation only; App always supplies a server-authorized profile through ProfileDisplayAccess. */
export function ProfileSchedule({data,profile,today,savedView,trigger}:{data:HouseholdData;profile:ProfileRow;today:Date;savedView:boolean;trigger:ReactNode}) {
 const profileId=profile.id
 let days:ReturnType<typeof normalizeWeek>=[],preferences= parseDisplayPreferences(undefined),invalidData=false
 try {
  days=normalizeWeek(data,profileId,today)
  preferences=parseDisplayPreferences(data.displayPreferences?.find(row=>row.profile_id===profileId)?.preferences)
 } catch {invalidData=true}
 if(invalidData)return <div className="display-state" role="status">TRY AGAIN</div>
 return <DisplayRenderer profileSwitch={preferences.showProfileSwitching!==false?trigger:undefined} weather={data.weather} key={profileId+JSON.stringify(preferences)} schedule={{days,timeZone:data.household.time_zone}} profileName={profile.name} preferences={preferences} now={today} savedView={savedView} loadDays={dates=>scheduleForDates(data,profileId,dates)}/>
}

function DisplaySelectionRequired() {
 return <div className="display-state" role="status"><span aria-hidden="true">☀</span><p>Choose a display</p><a href="/admin">Caregiver setup</a></div>
}
