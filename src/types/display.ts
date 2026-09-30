import type { DaySchedule, DisplayEvent } from './calendar.ts'
export type DisplayMode = 'week' | 'standard-calendar' | 'first-next-then'
export type CalendarView = 'week' | 'month'
/** Planned only; never selectable until a renderer is implemented. */
export type PlannedDisplayMode = 'short-sequence' | 'half-day' | 'full-day' | 'two-day'
export interface ProfileDisplayPreferences {
 version: 1
 displayMode: DisplayMode
 allowedViews: CalendarView[]
 defaultView: CalendarView
 weekPresentation: 'rolling' | 'calendar'
 todayPosition: number
 allowCalendarNavigation: boolean
 maxVisibleItems: number
 allowNavigation: boolean
 autoAdvance: boolean
 showWho: boolean
 showWhere: boolean
 showActivityTimes:boolean
 showClock:boolean
 clockFormat:'12h'|'24h'
 showTimes: boolean
 motionPreference: 'normal' | 'reduced' | 'none'
 audioEnabled: boolean
}
export interface DisplayPreferencesRow {id:string;household_id:string;profile_id:string;preferences:ProfileDisplayPreferences}
/** One normalized engine output, with no persistence or provider contracts. */
export interface NormalizedSchedule {days:DaySchedule[];timeZone:string}
export interface DisplayRendererProps {schedule:NormalizedSchedule;profileName:string;preferences:ProfileDisplayPreferences;now:Date;savedView?:boolean;loadDays?:(dates:string[])=>DaySchedule[]}
export interface SequenceItem {position:'FIRST'|'NEXT'|'THEN';event:DisplayEvent}
