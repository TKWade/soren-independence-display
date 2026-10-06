import {useEffect} from 'react'
import {startWakeLock} from '../device/wakeLock'
export function useDisplayWakeLock(enabled:boolean) {
 useEffect(()=>{
  if(!enabled)return
  return startWakeLock({request:navigator.wakeLock?()=>navigator.wakeLock.request('screen'):undefined,visible:()=>document.visibilityState==='visible',listen:(event,listener)=>{
   const target=event==='visibilitychange'?document:window
   target.addEventListener(event,listener);return ()=>target.removeEventListener(event,listener)
  }})
 },[enabled])
}
