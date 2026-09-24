import { inlineDayContext } from '../lib/dayVariant'
import { PhotoFrame } from './PhotoFrame'
import './DayTimelineB.css'
import { useState } from 'react'
import type { DaySchedule } from '../types/calendar'
import { dateKey, dayLabels, getTimelineState } from '../lib/schedule'
import { PictureTile } from './PictureTile'
import { TodayBadge } from './TodayBadge'

export default function DayTimelineB({ day, now }: { day: DaySchedule; now: Date }) {
  const timeline = getTimelineState(day, now)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = timeline.events.find(event => event.id === selectedId)
  const statusLabels = { now: '▶ NOW', next: '→ NEXT', past: '✓', future: '' }
  return (
    <section className="detail-panel day-variant-b" aria-label={dayLabels(day.date).name + ' timeline'}>
      <div className="detail-heading flex items-center justify-between">
        <p>{dayLabels(day.date).displayDate}</p>
        {day.date === dateKey(now, day.timeZone) && <TodayBadge />}
      </div>
      {timeline.events.length === 0 && <div className="display-state" role="status">☀ NO PLANS</div>}
      <ol className="timeline" aria-label="Day in order">
        {timeline.events.map((event, index) => {
          const status = timeline.statuses[event.id]
          const context = inlineDayContext(event)
          return (
            <li key={event.id} className={`timeline-step status-${status}`}>
              <button className="event-card" aria-current={status === 'now' ? 'step' : undefined}
                aria-expanded={selectedId === event.id} aria-controls="event-context"
                aria-label={`${event.label}, ${status}. ${event.people.map(person => person.name).join(', ')}, ${event.place.name}. Show pictures.`}
                onClick={() => setSelectedId(selectedId === event.id ? null : event.id)}>
                <span className="event-status">{statusLabels[status]}</span>
                <PictureTile item={event.picture} />
                {(context.people.length>0 || context.place) && <span className="inline-day-context">
                  {context.people.length>0 && <span className="inline-context-group"><span className="inline-context-heading">WHO</span><span className="inline-context-people">
                    {context.people.map(person=><span className="inline-context-item" key={person.id}><PhotoFrame url={person.picture.photoUrl} kind={person.picture.kind} badgeKind={person.picture.badgeKind}/><span className="inline-context-label">{person.picture.label}</span></span>)}
                  </span></span>}
                  {context.place && <span className="inline-context-group"><span className="inline-context-heading">WHERE</span><span className="inline-context-item"><PhotoFrame url={context.place.picture.photoUrl} kind={context.place.picture.kind} badgeKind={context.place.picture.badgeKind}/><span className="inline-context-label">{context.place.picture.label}</span></span></span>}
                </span>}
              </button>
              {index < timeline.events.length - 1 && <span className="sequence-arrow" aria-hidden="true">→</span>}
            </li>
          )
        })}
      </ol>
      <div id="event-context" className="event-context">
        {selected && <>
          {selected.people.map(person => <PictureTile key={person.id} item={person.picture} category="WITH" />)}
          <PictureTile item={(selected.sleepLocation ?? selected.place).picture} category={selected.sleepLocation ? 'SLEEP' : 'WHERE'} />
        </>}
      </div>
    </section>
  )
}
