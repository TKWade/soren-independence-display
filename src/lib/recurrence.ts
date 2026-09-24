import { Temporal } from '@js-temporal/polyfill'
import type { EventRow } from '../data/records.ts'
import { atLocalTime, localInput } from './time.ts'

/** ISO weekdays: Monday=1 … Sunday=7. End date is inclusive. */
export interface LocalRecurrence {
 version: 1
 frequency: 'daily' | 'weekly' | 'monthly'
 interval: number
 startDate: string
 endDate: string | null
 weekdays?: number[]
 dayOfMonth?: number
}
export function validateRecurrence(rule: LocalRecurrence) {
 if (rule.version !== 1 || !['daily','weekly','monthly'].includes(rule.frequency) || !Number.isSafeInteger(rule.interval) || rule.interval < 1 || rule.interval > 999) throw new Error('Choose an interval from 1 to 999.')
 const start = Temporal.PlainDate.from(rule.startDate)
 if (rule.endDate && Temporal.PlainDate.compare(Temporal.PlainDate.from(rule.endDate),start) < 0) throw new Error('Series end must be on or after its start.')
 if (rule.frequency === 'weekly' && (!rule.weekdays?.length || new Set(rule.weekdays).size !== rule.weekdays.length || rule.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7))) throw new Error('Select at least one weekday.')
 if (rule.frequency === 'monthly' && (!Number.isInteger(rule.dayOfMonth) || rule.dayOfMonth! < 1 || rule.dayOfMonth! > 31)) throw new Error('Choose a day from 1 to 31.')
}
export function recurrenceDates(rule: LocalRecurrence, from: string, through: string): string[] {
 validateRecurrence(rule)
 const first = Temporal.PlainDate.from(from), last = Temporal.PlainDate.from(through)
 if (first.until(last).days > 370) throw new Error('Request at most 371 calendar days at a time.')
 const anchor = Temporal.PlainDate.from(rule.startDate)
 const anchorMonday = anchor.subtract({days:anchor.dayOfWeek-1})
 const dates: string[] = []
 for (let day = first; Temporal.PlainDate.compare(day,last) <= 0; day = day.add({days:1})) {
  const date = day.toString()
  if (date < rule.startDate || (rule.endDate && date > rule.endDate)) continue
  const days = anchor.until(day).days
  const weeks = Math.floor(anchorMonday.until(day).days / 7)
  const months = (day.year-anchor.year)*12+day.month-anchor.month
  if ((rule.frequency === 'daily' && days % rule.interval === 0) ||
      (rule.frequency === 'weekly' && weeks % rule.interval === 0 && rule.weekdays!.includes(day.dayOfWeek)) ||
      (rule.frequency === 'monthly' && months % rule.interval === 0 && day.day === rule.dayOfMonth)) dates.push(date)
 }
 return dates
}
export interface EventOccurrence extends EventRow { seriesEventId: string; originalLocalDate?: string }
/** Identity stays attached to the original date even when a future exception moves it. */
export function resolveOccurrences(event: EventRow, from: string, through: string): EventOccurrence[] {
 if (event.all_day || event.recurrence) return [] // Provider master expansion belongs to a future adapter.
 if (!event.local_recurrence) return [{...event,seriesEventId:event.id}]
 if (event.source_kind !== 'local' || !event.end_time) throw new Error('Invalid local series.')
 const start = localInput(event.start_time,event.time_zone), end = localInput(event.end_time,event.time_zone)
 const span = Temporal.PlainDate.from(start.slice(0,10)).until(Temporal.PlainDate.from(end.slice(0,10))).days
 if (span < 0 || span > 7) throw new Error('A recurring event can span at most seven days.')
 // Include occurrences starting before the range which can overlap its first day.
 return recurrenceDates(event.local_recurrence,Temporal.PlainDate.from(from).subtract({days:span}).toString(),through).map(date => ({
  ...event, id: `${event.id}@${date}`, seriesEventId:event.id, originalLocalDate:date,
  start_time:atLocalTime(date,start.slice(11),event.time_zone,'compatible'),
  end_time:atLocalTime(Temporal.PlainDate.from(date).add({days:span}).toString(),end.slice(11),event.time_zone,'compatible'),
 })).filter(event => Date.parse(event.end_time!) > Date.parse(event.start_time))
}
const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
export function recurrenceSummary(rule: LocalRecurrence) {
 const unit = {daily:'day',weekly:'week',monthly:'month'}[rule.frequency]
 const on = rule.frequency === 'weekly' ? ` on ${(rule.weekdays ?? []).map(day=>days[day-1]).join(', ')}` : rule.frequency === 'monthly' ? ` on day ${rule.dayOfMonth}` : ''
 return `Every ${rule.interval === 1 ? unit : `${rule.interval} ${unit}s`}${on}, ${rule.startDate} — ${rule.endDate || 'no end date'}`
}
