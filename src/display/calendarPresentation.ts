import { Temporal } from '@js-temporal/polyfill'
import { addDays, dateInZone, mondayFor } from '../lib/time.ts'
import type { CalendarView, ProfileDisplayPreferences } from '../types/display.ts'
export function calendarDates(preferences:ProfileDisplayPreferences,now:Date,zone:string,anchor?:string,view:CalendarView=preferences.defaultView) {
 const today=dateInZone(now,zone),rolling=preferences.weekPresentation==='rolling'
 const date=Temporal.PlainDate.from(rolling?today:anchor??today)
 const start=rolling?addDays(today,1-preferences.todayPosition):view==='month'?date.with({day:1}).toString():mondayFor(date.toString())
 const count=!rolling&&view==='month'?date.daysInMonth:7
 return Array.from({length:count},(_,i)=>addDays(start,i))
}
export function navigateCalendar(anchor:string,view:CalendarView,direction:-1|1) {
 return Temporal.PlainDate.from(anchor).add(view==='month'?{months:direction}:{days:direction*7}).toString()
}
export function calendarViewAllowed(preferences:ProfileDisplayPreferences,view:CalendarView) {return preferences.allowedViews.includes(view)&&!(preferences.weekPresentation==='rolling'&&view!=='week')}
export function isSubduedDay(date:string,today:string,preferences:ProfileDisplayPreferences) {return preferences.weekPresentation==='rolling'&&date<today}
