import { useState } from 'react'
import type { DaySchedule } from '../types/calendar'
import { dateKey, dayLabels, getTimelineState } from '../lib/schedule'
import { PictureTile } from './PictureTile'
import { TodayBadge } from './TodayBadge'

export function DayTimeline({ day, now }: { day: DaySchedule; now: Date }) {
  const timeline = getTimelineState(day, now)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = timeline.events.find(event => event.id === selectedId)
  const statusLabels = { now: '▶ NOW', next: '→ NEXT', past: '✓', future: '' }
  return (
    <section className="detail-panel" aria-label={dayLabels(day.date).name + ' timeline'}>
      <div className="detail-heading flex items-center justify-between">
        <p>{dayLabels(day.date).displayDate}</p>
        {day.date === dateKey(now) && <TodayBadge />}
      </div>
      <ol className="timeline" aria-label="Day in order">
        {timeline.events.map((event, index) => {
          const status = timeline.statuses[event.id]
          return (
            <li key={event.id} className={`timeline-step status-${status}`}>
              <button className="event-card" aria-current={status === 'now' ? 'step' : undefined}
                aria-expanded={selectedId === event.id} aria-controls="event-context"
                aria-label={`${event.label}, ${status}. ${event.people.map(person => person.name).join(', ')}, ${event.place.name}. Show pictures.`}
                onClick={() => setSelectedId(selectedId === event.id ? null : event.id)}>
                <span className="event-status">{statusLabels[status] || <span aria-hidden="true">{index + 1}</span>}</span>
                <PictureTile item={event.picture} />
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
