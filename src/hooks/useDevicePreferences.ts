import {useEffect,useState} from 'react'
import {browserPreferenceStorage,readDevicePreferences} from '../device/preferences'
export function useDevicePreferences(userId:string|undefined) {
 const [preferences,setPreferences]=useState(()=>readDevicePreferences(userId,browserPreferenceStorage()))
 useEffect(()=>{
  const update=()=>setPreferences(readDevicePreferences(userId,browserPreferenceStorage()))
  window.addEventListener('storage',update);window.addEventListener('device-preferences-changed',update)
  return ()=>{window.removeEventListener('storage',update);window.removeEventListener('device-preferences-changed',update)}
 },[userId])
 return preferences
}
