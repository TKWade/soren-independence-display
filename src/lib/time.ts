import { Temporal } from '@js-temporal/polyfill'
export function dateInZone(now: Date, zone: string) {
 return Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(zone).toPlainDate().toString()
}
export function atLocalTime(date: string, time: string, zone: string, disambiguation: 'reject' | 'compatible' = 'reject') {
 return Temporal.PlainDate.from(date).toPlainDateTime(Temporal.PlainTime.from(time))
  .toZonedDateTime(zone, { disambiguation }).toInstant().toString()
}
export function addDays(date: string, count: number) { return Temporal.PlainDate.from(date).add({ days: count }).toString() }
export function mondayFor(date: string) {
 const day = Temporal.PlainDate.from(date)
 return day.subtract({ days: day.dayOfWeek - 1 }).toString()
}
export function localInput(instant: string, zone: string) {
 return Temporal.Instant.from(instant).toZonedDateTimeISO(zone).toPlainDateTime().toString({ smallestUnit: 'minute' })
}
