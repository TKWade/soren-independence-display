import { normalizeWeek } from './lib/persistentSchedule'
import type { useHouseholdData } from './hooks/useHouseholdData'
import { useToday } from './hooks/useToday'
import { DisplayRenderer } from './display/DisplayRenderer'
import { parseDisplayPreferences } from './display/preferences'
export default function App({store}:{store:ReturnType<typeof useHouseholdData>}) {
 const today=useToday()
 const profileId=new URLSearchParams(window.location.search).get('profile')??store.data?.profiles.find(profile=>profile.active)?.id??''
 const profile=store.data?.profiles.find(item=>item.id===profileId&&item.active)
 let days:ReturnType<typeof normalizeWeek>=[],preferences= parseDisplayPreferences(undefined),invalidData=false
 try {
  if(store.data) days=normalizeWeek(store.data,profileId,today)
  preferences=parseDisplayPreferences(store.data?.displayPreferences?.find(row=>row.profile_id===profileId)?.preferences)
 } catch {invalidData=true}
 if(!store.data||invalidData) return <div className="display-state" role="status"><span aria-hidden="true">{store.loading?'◷':'☀'}</span>{store.loading?'WAIT':store.error||invalidData?'TRY AGAIN':'NO PLANS'}{(store.error||invalidData)&&<button aria-label="Try again" onClick={store.refresh}>↻</button>}</div>
 if(!profile) return <div className="display-state" role="status"><span aria-hidden="true">☀</span> NO PLANS</div>
 return <DisplayRenderer key={profileId+JSON.stringify(preferences)} schedule={{days,timeZone:store.data.household.time_zone}} profileName={profile.name} preferences={preferences} now={today} savedView={store.error}/>
}
