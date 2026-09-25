import type { DaySchedule, DisplayEvent } from './calendar.ts'
export type DisplayMode = 'week' | 'first-next-then'
/** Planned only; never selectable until a renderer is implemented. */
export type PlannedDisplayMode = 'short-sequence' | 'half-day' | 'full-day' | 'two-day'
export interface ProfileDisplayPreferences {
 version: 1
 displayMode: DisplayMode
 maxVisibleItems: number
 allowNavigation: boolean
 autoAdvance: boolean
 showWho: boolean
 showWhere: boolean
 showTimes: boolean
 motionPreference: 'normal' | 'reduced' | 'none'
 audioEnabled: boolean
}
export interface DisplayPreferencesRow {id:string;household_id:string;profile_id:string;preferences:ProfileDisplayPreferences}
/** One normalized engine output, with no persistence or provider contracts. */
export interface NormalizedSchedule {days:DaySchedule[];timeZone:string}
export interface DisplayRendererProps {schedule:NormalizedSchedule;profileName:string;preferences:ProfileDisplayPreferences;now:Date;savedView?:boolean}
export interface SequenceItem {position:'FIRST'|'NEXT'|'THEN';event:DisplayEvent}
