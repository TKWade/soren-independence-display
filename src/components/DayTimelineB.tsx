import {WeatherCue} from '../weather/WeatherCue'
import { defaultDisplayPreferences, visibleContext, formatDisplayTime } from '../display/preferences'
import type { ProfileDisplayPreferences } from '../types/display'
import { PhotoFrame } from './PhotoFrame'
import './DayTimelineB.css'
import type { DaySchedule } from '../types/calendar'
import { dateKey, dayLabels, getTimelineState } from '../lib/schedule'
import { EventContextRow } from './EventContextRow'
import { TodayBadge } from './TodayBadge'

export default function DayTimelineB({ weather, day, now, preferences=defaultDisplayPreferences() }: { weather?:import('../weather/types').HouseholdWeather; day: DaySchedule; now: Date; preferences?:ProfileDisplayPreferences }) {
  const timeline = getTimelineState(day, now)
  const layout = timeline.events.length === 1 ? 'single' : timeline.events.length === 2 ? 'pair' : 'timeline'
  const statusLabels = { now: '▶ NOW', next: '→ NEXT', past: '✓ DONE', future: '' }
  return (
    <section className="detail-panel day-variant-b" aria-label={dayLabels(day.date).name + ' timeline'}>
      <div className="day-composition" data-layout={layout}>
      <div className="detail-heading">
        <p>{dayLabels(day.date).displayDate}</p>
        {preferences.showWeather&&<WeatherCue weather={weather} date={day.date} now={now} zone={day.timeZone??weather?.forecast?.timeZone??'UTC'} detail={preferences.weatherDetail} day/>}
        {day.date === dateKey(now, day.timeZone) && <TodayBadge />}
      </div>
      {timeline.events.length === 0 && <div className="display-state" role="status">☀ NO PLANS</div>}
      <ol className="timeline" aria-label="Day in order" tabIndex={0}>
        {timeline.events.map((event, index) => {
          const status = timeline.statuses[event.id]
          const context = visibleContext(event,preferences,true)
          return (
            <li key={event.id} className={`timeline-step status-${status}`}>
              <div className="event-card" role="group" aria-current={status === 'now' ? 'step' : undefined}
                aria-label={`${event.label}, ${status}. ${preferences.showWho?event.people.map(person => person.name).join(', '):''}, ${preferences.showWhere?event.place.name:''}.`}
                >
                <span className="event-status">{statusLabels[status]}</span>
                <div className="event-body">
                  <div className="event-image"><PhotoFrame url={event.picture.photoUrl} kind={event.picture.kind} badgeKind={event.picture.badgeKind}/></div>
                  <div className="event-information">
                    <h2 className="event-title">{event.label}</h2>
                    {preferences.showTimes&&<time className="display-event-time" dateTime={event.startTime}>{formatDisplayTime(event,day.timeZone)}</time>}
                    {(context.people.length>0 || context.place) && <div className="inline-day-context">
                      {context.place&&<EventContextRow heading="WHERE" pictures={[context.place.picture]}/>}
                      {context.people.length>0&&<EventContextRow heading="WITH" pictures={context.people.map(person=>person.picture)}/>}
                    </div>}
                  </div>
                </div>
              </div>
              {index < timeline.events.length - 1 && <span className="sequence-arrow" aria-hidden="true">→</span>}
            </li>
          )
        })}
      </ol>
      </div>
    </section>
  )
}
