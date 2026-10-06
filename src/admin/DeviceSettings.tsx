import {useState} from 'react'
import {useDevicePreferences} from '../hooks/useDevicePreferences'
import {browserPreferenceStorage,deviceHouseholdPreference,saveDevicePreference} from '../device/preferences'
import type {ProfileRow} from '../data/records'
export function DeviceSettings({userId,householdId,profile}:{userId:string;householdId:string;profile?:ProfileRow}) {
 const preferences=useDevicePreferences(userId),saved=deviceHouseholdPreference(preferences,householdId)
 const [message,setMessage]=useState('')
 const save=(change:{profileId?:string;keepAwake?:boolean})=>{
  try{saveDevicePreference(userId,householdId,change,browserPreferenceStorage());window.dispatchEvent(new Event('device-preferences-changed'));setMessage('Saved for this account on this device.')}
  catch{setMessage('Could not save on this device. Check browser storage settings; the display link still works.')}
 }
 return <details><summary>This device</summary><section aria-label="Device display settings">
  <p>Applies only to this browser or installed app and your signed-in account.</p>
  <p>Selected display: {profile?.name??'Choose an active profile above'}</p>
  <button type="button" disabled={!profile?.active} onClick={()=>profile&&save({profileId:profile.id})}>Use this profile on this device</button>
  {profile&&preferences?.householdId===householdId&&saved?.profileId===profile.id&&<p>This profile is the saved launch display.</p>}
  <label className="check"><input type="checkbox" checked={saved?.keepAwake??false} onChange={event=>save({keepAwake:event.target.checked})}/>Keep screen awake while displaying the calendar</label>
  <p>Supported browsers only. This does not launch after reboot, override power saving, or lock the tablet into kiosk mode. A signed-in caregiver session retains caregiver access; use only a trusted device.</p>
  <p role="status">{message}</p>
 </section></details>
}
