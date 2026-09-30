import { useEffect, useState } from 'react'
import {clockText,startMinuteClock} from './standardTime'
export function StandardClock({zone,format}:{zone:string;format:'12h'|'24h'}) {
 const [now,setNow]=useState(()=>new Date())
 useEffect(()=>startMinuteClock(setNow,{now:Date.now,set:(fn,delay)=>window.setTimeout(fn,delay),clear:id=>window.clearTimeout(id as number),listen:fn=>{window.addEventListener('focus',fn);document.addEventListener('visibilitychange',fn);return()=>{window.removeEventListener('focus',fn);document.removeEventListener('visibilitychange',fn)}}}),[])
 return <time className="standard-clock" dateTime={now.toISOString()} aria-label={'Current household time: '+clockText(now,zone,format)}>{clockText(now,zone,format)}</time>
}
