import {WeatherSettings} from './WeatherSettings'
import {ProfileAccessSettings} from './ProfileAccessSettings'
import { CaregiverToolbar } from './CaregiverToolbar'
import { CaregiverHeader } from './CaregiverHeader'
import { CalendarAdmin } from './CalendarAdmin'
import { useState } from 'react'
import { client, supabase } from '../data/supabase'
import { createHousehold, seedHousehold } from '../data/repository'
import type { useHouseholdData } from '../hooks/useHouseholdData'
import { mondayFor, dateInZone } from '../lib/time'
import { LibraryEditor } from './LibraryEditor'
import { ScheduleEditor } from './ScheduleEditor'
import { HomeEditor } from './HomeEditor'
import { ProfileEditor } from './ProfileEditor'
import './admin.css'

export type RunAction = (action: () => Promise<unknown>, success?: string) => Promise<boolean>
export default function Admin({userId,authLoading,store}:{userId?:string;authLoading:boolean;store:ReturnType<typeof useHouseholdData>}) {
 const [tab,setTab]=useState<'profiles'|'people'|'places'|'activities'|'schedule'|'home'|'calendars'>(()=>new URLSearchParams(window.location.search).has('googleCalendar')?'calendars':'profiles')
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const [failed,setFailed]=useState(false)
 const run: RunAction = async(action,success='Saved.') => {
  setBusy(true);setMessage('');setFailed(false)
  try { await action();store.refresh();setMessage(success);return true }
  catch { setFailed(true);setMessage('Could not save. Check your connection, required fields, and household access, then try again.');return false }
  finally {setBusy(false)}
 }
 if(!supabase) return <main className="admin-shell"><h1>Caregiver setup</h1><p>Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local, apply the database migrations, and restart Vite.</p><p>Use a publishable key, never a service-role key. See docs/supabase-setup.md.</p></main>
 if(authLoading) return <main className="admin-shell" role="status">Loading…</main>
 if(!userId) return <main className="admin-shell"><h1>Caregiver sign in</h1><p>Use the caregiver account created in Supabase Authentication.</p>
  <form onSubmit={event=>{event.preventDefault();const values=new FormData(event.currentTarget);void run(async()=>{
   const {error}=await client().auth.signInWithPassword({email:String(values.get('email')),password:String(values.get('password'))})
   if(error) throw error
  },'Signed in.')}}>
   <label>Email<input name="email" type="email" autoComplete="username" required/></label>
   <label>Password<input name="password" type="password" autoComplete="current-password" required/></label>
   <button disabled={busy}>Sign in</button>
  </form><p role="status">{failed ? 'Sign-in failed. Check your credentials and connection.' : message}</p></main>
 return <main className="admin-shell">
  <CaregiverHeader><button className="quiet" disabled={busy} onClick={()=>void run(async()=>{
   // A local sign-out clears the display and cached auth even if the server is offline.
   const {error}=await client().auth.signOut({scope:'local'});if(error) throw error
  },'Signed out.')}>Sign out</button></CaregiverHeader>
  {store.list.length>0 && <CaregiverToolbar userId={userId} households={store.list} householdId={store.selected} profiles={store.data?.household.id===store.selected?store.data.profiles:[]} onHouseholdChange={store.setSelected} onRefresh={store.refresh} loading={store.loading}/>}
  {(store.error || failed) && <p role="alert" className="admin-error">{failed ? message : 'Unable to refresh data. Previously loaded records may be out of date.'}</p>}
  {!failed && message && <p className="admin-status success" role="status">{message}</p>}
  {store.loading && <p role="status">Loading…</p>}
  {!store.loading && !store.error && !store.list.length && <section><h2>Create your household</h2><form onSubmit={event=>{
   event.preventDefault();const values=new FormData(event.currentTarget);void run(async()=>{
    const id=await createHousehold(String(values.get('name')),String(values.get('zone')));store.setSelected(id)
   })
  }}><label>Household name<input name="name" maxLength={100} required/></label><label>Timezone (IANA)<input name="zone" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone} required/></label><button disabled={busy}>Create household</button></form></section>}
  {store.data && <div key={store.data.household.id}>
   <WeatherSettings key={store.data.household.id+String(store.data.weather?.revision)} data={store.data} run={run}/>
   <nav aria-label="Caregiver sections">{(['profiles','people','places','activities','schedule','home','calendars'] as const).map(name=><button key={name} aria-current={name===tab?'page':undefined} onClick={()=>{setTab(name);setMessage('')}}>{name==='home'?'HOME & SLEEP':name.toUpperCase()}</button>)}</nav>
   <fieldset className="admin-workspace" disabled={busy}>
    {tab==='profiles'&&<ProfileAccessSettings key={store.data.household.id} householdId={store.data.household.id} run={run}/>}
    {tab==='profiles' ? <ProfileEditor data={store.data} run={run}/> : tab==='calendars' ? <CalendarAdmin data={store.data} run={run}/> : tab==='home' ? <HomeEditor data={store.data} run={run}/> : tab==='schedule' ? <ScheduleEditor data={store.data} run={run}/> : <LibraryEditor key={tab} kind={tab} data={store.data} run={run}/>}
   </fieldset>
   {store.data.profiles.length===0 && <section><h2>Getting started</h2><p>Create profiles under Profiles and add your libraries, or load fictional sample data into an empty household.</p>
    <button disabled={busy} onClick={()=>void run(()=>seedHousehold(store.selected,mondayFor(dateInZone(new Date(),store.data!.household.time_zone))),'Sample week saved.')}>Load sample week</button></section>}
  </div>}
 </main>
}
