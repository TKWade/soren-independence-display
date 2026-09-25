import { useState } from 'react'
import type { DisplayRendererProps } from '../types/display'
import { displayClock, selectRenderer } from './preferences'
import { WeekRenderer } from './WeekRenderer'
import { FirstNextThenRenderer } from './FirstNextThenRenderer'
import './display.css'
/** Pure presentation boundary. The caller keys this by profile and preferences to reset a paused clock. */
export function DisplayRenderer(props:DisplayRendererProps) {
 const [anchor]=useState(()=>({now:props.now,schedule:props.schedule}))
 const resolved={...props,schedule:props.preferences.autoAdvance?props.schedule:anchor.schedule,now:displayClock(props.now,anchor.now,props.preferences)}
 return selectRenderer(props.preferences)==='week'?<WeekRenderer {...resolved}/>:<FirstNextThenRenderer {...resolved}/>
}
