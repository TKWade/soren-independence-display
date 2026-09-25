import type { DisplayMode, ProfileDisplayPreferences, NormalizedSchedule, SequenceItem } from '../types/display.ts'
import { dateKey, getTimelineState } from '../lib/schedule.ts'
import { inlineDayContext } from '../lib/dayVariant.ts'
import type { DisplayEvent } from '../types/calendar.ts'
export function defaultDisplayPreferences(mode:DisplayMode='week'):ProfileDisplayPreferences {
 return {version:1,displayMode:mode,maxVisibleItems:mode==='week'?7:3,allowNavigation:mode==='week',autoAdvance:true,showWho:mode==='week',showWhere:mode==='week',showTimes:false,motionPreference:'normal',audioEnabled:false}
}
/** Missing rows mean the approved Week defaults. Invalid persisted settings fail explicitly. */
export function parseDisplayPreferences(value:unknown):ProfileDisplayPreferences {
 if(value===undefined||value===null) return defaultDisplayPreferences()
 if(typeof value!=='object'||Array.isArray(value)) throw new Error('Invalid display preferences')
 const p=value as Record<string,unknown>
 if(p.version!==1||!['week','first-next-then'].includes(String(p.displayMode))||!Number.isInteger(p.maxVisibleItems)||Number(p.maxVisibleItems)<1||Number(p.maxVisibleItems)>7||!['normal','reduced','none'].includes(String(p.motionPreference))) throw new Error('Invalid display preferences')
 for(const key of ['allowNavigation','autoAdvance','showWho','showWhere','showTimes','audioEnabled']) if(typeof p[key]!=='boolean') throw new Error('Invalid display preference: '+key)
 return {...defaultDisplayPreferences(p.displayMode as DisplayMode),...p} as ProfileDisplayPreferences
}
export function selectRenderer(preferences:ProfileDisplayPreferences):DisplayMode {return preferences.displayMode}
export function selectSequence(schedule:NormalizedSchedule,now:Date,maxVisibleItems=3):SequenceItem[] {
 const day=schedule.days.find(day=>day.date===dateKey(now,schedule.timeZone))
 if(!day) return []
 const timeline=getTimelineState(day,now)
 return timeline.events.filter(event=>timeline.statuses[event.id]!=='past').slice(0,Math.max(1,Math.min(3,maxVisibleItems))).map((event,index)=>({position:(['FIRST','NEXT','THEN'] as const)[index],event}))
}
export function visibleContext(event:DisplayEvent,preferences:ProfileDisplayPreferences) {
 const context=inlineDayContext(event)
 return {people:preferences.showWho?context.people:[],place:preferences.showWhere?context.place:undefined}
}
export function displayClock(now:Date,anchor:Date,preferences:ProfileDisplayPreferences) {return preferences.autoAdvance?now:anchor}
export function formatDisplayTime(event:DisplayEvent,zone?:string) {return new Date(event.startTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:zone})}
