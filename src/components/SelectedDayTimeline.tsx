import { lazy, Suspense } from 'react'
import type { DaySchedule } from '../types/calendar'
import type { ProfileDisplayPreferences } from '../types/display'
import DayTimelineB from './DayTimelineB'
import { selectDayVariant } from '../lib/dayVariant'
const DevelopmentFallback = import.meta.env.DEV
 ? lazy(()=>import('./DayTimeline').then(module=>({default:module.DayTimeline})))
 : null
export function SelectedDayTimeline(props:{day:DaySchedule;now:Date;preferences?:ProfileDisplayPreferences}) {
 if (DevelopmentFallback && selectDayVariant(window.location.search,import.meta.env.DEV)==='a') {
  return <Suspense fallback={<DayTimelineB {...props}/>}><DevelopmentFallback {...props}/></Suspense>
 }
 return <DayTimelineB {...props}/>
}
