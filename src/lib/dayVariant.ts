import type { DisplayEvent } from '../types/calendar.ts'
export function selectDayVariant(search: string, development: boolean): 'a' | 'b' {
 return development && new URLSearchParams(search).get('dayVariant') === 'a' ? 'a' : 'b'
}
/** Only omit context that is absent or already explicitly pictured by the activity. */
export function inlineDayContext(event: DisplayEvent) {
 const sleeping = !!event.sleepLocation || event.activity.picture.kind === 'sleep'
 const people = sleeping ? [] : event.people.filter((person,index,list) =>
  person.id.trim() && person.picture.label.trim() &&
  person.picture.id !== event.picture.id && list.findIndex(p=>p.id===person.id)===index)
 const place = event.sleepLocation ?? event.place
 return {people, place: place?.id.trim() && place.name.trim() && place.picture.label.trim() ? place : undefined}
}
