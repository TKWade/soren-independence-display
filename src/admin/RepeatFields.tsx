import { useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import type { LocalRecurrence } from '../lib/recurrence'
import { recurrenceSummary } from '../lib/recurrence'
export function RepeatFields({initial,startDate}:{initial?:LocalRecurrence|null;startDate:string}) {
 const [frequency,setFrequency]=useState(initial?.frequency ?? '')
 const [interval,setInterval]=useState(initial?.interval ?? 1)
 const [weekdays,setWeekdays]=useState(initial?.weekdays ?? [Temporal.PlainDate.from(startDate).dayOfWeek])
 const [day,setDay]=useState(initial?.dayOfMonth ?? Number(startDate.slice(8)))
 const [ends,setEnds]=useState(initial?.endDate ?? '')
 const rule:LocalRecurrence={version:1,frequency:frequency as LocalRecurrence['frequency'],interval,startDate,endDate:ends||null,
  ...(frequency==='weekly'?{weekdays}:{}),...(frequency==='monthly'?{dayOfMonth:day}:{})}
 return <fieldset className="repeat-section"><legend>Repeat</legend>
  <label>Repeat<select value={frequency} onChange={e=>setFrequency(e.target.value)}><option value="">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
  {frequency && <><p>Changes apply to the entire series.</p><div className="form-grid">
   <label>Repeat every ({frequency==='daily'?'days':frequency==='weekly'?'weeks':'months'})<input type="number" min="1" max="999" required value={interval} onChange={e=>setInterval(Number(e.target.value))}/></label>
   <label>Series ends (inclusive; blank means no end)<input type="date" min={startDate} value={ends} onChange={e=>setEnds(e.target.value)}/></label>
   {frequency==='monthly' && <label>Day of month<input type="number" min="1" max="31" required value={day} onChange={e=>setDay(Number(e.target.value))}/></label>}
  </div>
  {frequency==='weekly' && <fieldset><legend>On</legend>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((name,i)=><label className="check" key={name}><input type="checkbox" checked={weekdays.includes(i+1)} onChange={e=>setWeekdays(list=>e.target.checked?[...list,i+1].sort():list.filter(d=>d!==i+1))}/>{name}</label>)}</fieldset>}
  {frequency==='monthly' && <p>Months without this day are skipped.</p>}
  <p className="repeat-summary" aria-live="polite">{recurrenceSummary(rule)}</p>
  <p>Set both event times above. For an overnight event, use the following date in “First event ends on”.</p></>}
  <input type="hidden" name="local_recurrence" value={frequency?JSON.stringify(rule):'null'}/>
 </fieldset>
}
