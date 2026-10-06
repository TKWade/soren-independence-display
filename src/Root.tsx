import {useDevicePreferences} from './hooks/useDevicePreferences'
import {launchHousehold} from './device/preferences'
import { lazy, Suspense } from 'react'
import { useSession } from './hooks/useSession'
import { useHouseholdData } from './hooks/useHouseholdData'
import { supabase } from './data/supabase'
import App from './App'
const Admin = lazy(()=>import('./admin/Admin'))
export default function Root() {
 const {session,loading}=useSession()
 const admin=window.location.pathname.startsWith('/admin')
 // Keying this subtree clears all in-memory household/schedule data on sign-out or account switch.
 return <Suspense fallback={<div className="display-state">…</div>}>
  <AuthenticatedApp key={session?.user.id ?? 'signed-out'} userId={session?.user.id} authLoading={loading} admin={admin}/>
 </Suspense>
}
function AuthenticatedApp({userId,authLoading,admin}:{userId?:string;authLoading:boolean;admin:boolean}) {
 const devicePreferences=useDevicePreferences(userId)
 const launch=launchHousehold(window.location.search,devicePreferences,admin)
 const store=useHouseholdData(userId,launch.householdId,launch.strict)
 if(admin) return <Admin userId={userId} authLoading={authLoading} store={store}/>
 if(authLoading) return <div className="display-state" role="status"><span aria-hidden="true">◷</span> WAIT</div>
 if(!supabase || !userId) return <div className="display-state" role="status"><span aria-hidden="true">☀</span> NOT READY</div>
 return <App store={store} devicePreferences={devicePreferences}/>
}
