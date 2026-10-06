import {useEffect,useState} from 'react'
import {defaultSwitchingSettings} from '../profiles/access'
import {configureProfileAccess,profileContext} from '../profiles/client'
import type {RunAction} from './Admin'
export function ProfileAccessSettings({householdId,run,readOnly=false}:{householdId:string;run:RunAction;readOnly?:boolean}) {
 const [settings,setSettings]=useState(defaultSwitchingSettings),[ready,setReady]=useState(readOnly),[failed,setFailed]=useState(false)
 useEffect(()=>{
  if(readOnly)return
  let disposed=false
  void profileContext(householdId).then(value=>{if(!disposed){setSettings(value.settings);setReady(true)}}).catch(()=>{if(!disposed)setFailed(true)})
  return()=>{disposed=true}
 },[householdId,readOnly])
 return <section aria-label="Profile Switching & Access"><h2>Profile Switching &amp; Access</h2><p>Manage each caregiver’s own PIN inside their profile.</p>
  {failed&&<p role="alert">Access settings unavailable. Apply the profile switching migration and check your connection.</p>}
  {!ready&&!failed&&<p role="status">Loading access settings…</p>}
  {ready&&<form onSubmit={event=>{
   event.preventDefault()
   void run(async()=>{await configureProfileAccess(householdId,settings);const context=await profileContext(householdId);setSettings(context.settings)})
  }}>
   <label className="check"><input type="checkbox" disabled={readOnly} checked={settings.allowChildToChildSwitching} onChange={e=>setSettings(s=>({...s,allowChildToChildSwitching:e.target.checked}))}/>Allow child-to-child switching</label>
   <label className="check"><input type="checkbox" disabled={readOnly} checked={settings.requirePinForAllProfileSwitches} onChange={e=>setSettings(s=>({...s,requirePinForAllProfileSwitches:e.target.checked}))}/>Require PIN for all profile switching</label>
   <button disabled={readOnly}>Save access settings</button>
  </form>}
 </section>
}
