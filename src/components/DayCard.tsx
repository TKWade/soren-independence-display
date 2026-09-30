import {ActivityTimes} from '../display/ActivityTimes'
import type { DaySchedule } from '../types/calendar'
import { dayLabels, summarizeDay } from '../lib/schedule'
import { PictureTile } from './PictureTile'
import { TodayBadge } from './TodayBadge'
interface DayCardProps {
  day: DaySchedule
  isToday: boolean
  subdued?: boolean
  showActivityTimes?:boolean
  onSelect: () => void
  allowNavigation?:boolean
  showWho?:boolean
  showWhere?:boolean
}
export function DayCard({ day, isToday, onSelect, showActivityTimes=false, subdued=false, allowNavigation=true, showWho=true, showWhere=true }: DayCardProps) {
  const labels = dayLabels(day.date)
  const summary = summarizeDay(day)
  return (
    <button className={`day-card ${isToday ? 'is-today' : ''} ${subdued?'is-subdued':''}`} data-date={day.date}
      aria-current={isToday ? 'date' : undefined}
      aria-label={`${isToday ? 'Today, ' : ''}${labels.name}, ${labels.displayDate}. ${summary?.activity.label ?? 'No plans'}.${allowNavigation?' Open day.':''}`}
      disabled={!allowNavigation} onClick={onSelect}>
      <span className="today-slot">{isToday && <TodayBadge />}</span>
      <span className="day-heading"><span className="day-name">{labels.shortName}</span><span className="day-number">{labels.dayOfMonth}</span></span>
      {showActivityTimes&&<ActivityTimes day={day}/>}
      {summary ? <span className="day-pictures">
        <PictureTile item={summary.activity} category="DO" />
        {showWho&&<span className="people-summary">{summary.people.map(person => <PictureTile key={person.id} item={person} category="WITH" />)}</span>}
        {showWhere&&(summary.sleep ? <PictureTile item={summary.sleep} category="SLEEP" /> : <span className="empty-slot">—</span>)}
      </span> : <span className="empty-slot">—</span>}
    </button>
  )
}
