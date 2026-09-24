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
 const store=useHouseholdData(userId)
 if(admin) return <Admin userId={userId} authLoading={authLoading} store={store}/>
 if(authLoading) return <div className="display-state" role="status"><span aria-hidden="true">◷</span> WAIT</div>
 if(!supabase || !userId) return <div className="display-state" role="status"><span aria-hidden="true">☀</span> NOT READY</div>
 return <App store={store}/>
}
