import {startDisplayClock} from './displayClock'
import { useEffect, useState } from 'react'
/** Refresh event status every 15 seconds and immediately after the tablet wakes. */
export function useToday() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => startDisplayClock(setNow,{
    now:()=>Date.now(),setInterval:(fn,ms)=>window.setInterval(fn,ms),clearInterval:id=>window.clearInterval(id as number),
    listen:(event,fn)=>{const target=event==='focus'?window:document;target.addEventListener(event,fn);return ()=>target.removeEventListener(event,fn)}
  }),[])
  return now
}
