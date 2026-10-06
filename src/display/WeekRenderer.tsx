import {WeatherCue} from '../weather/WeatherCue'
import {DisplayHeader} from './DisplayHeader'
import {StandardClock} from './StandardClock'
import {ActivityTimes} from './ActivityTimes'
import { calendarDates, calendarViewAllowed, isSubduedDay, navigateCalendar } from './calendarPresentation'
import type { CalendarView } from '../types/display'
import { PictureTile } from '../components/PictureTile'
import { summarizeDay } from '../lib/schedule'
import { useEffect, useRef, useState } from 'react'
import { DayCard } from '../components/DayCard'
import { SelectedDayTimeline } from '../components/SelectedDayTimeline'
import { dayLabels, dateKey } from '../lib/schedule'
import type { DisplayRendererProps } from '../types/display'
export function WeekRenderer({profileSwitch,weather,schedule,profileName,preferences,now:today,savedView,loadDays}:DisplayRendererProps) {
 const zone=schedule.timeZone,todayDate=dateKey(today,zone)
 const [anchor,setAnchor]=useState<string|null>(null)
 const [view,setView]=useState<CalendarView>(preferences.defaultView)
 const dates=calendarDates(preferences,today,zone,anchor??undefined,view)
 const days=loadDays?loadDays(dates):dates.map(date=>schedule.days.find(day=>day.date===date)??{id:date,date,timeZone:zone,events:[],primaryEventId:''})
 const standard=preferences.displayMode==='standard-calendar'
 const periodLabel=new Date((standard?dates[0]:todayDate)+'T12:00:00Z').toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'})
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const selectedDay = days.find((day) => day.date === selectedDate)
  const backButton = useRef<HTMLButtonElement>(null)
  const lastDayDate = useRef<string | null>(null)
  const isDetail = Boolean(selectedDay)
  useEffect(() => {
    if (isDetail) backButton.current?.focus()
    else if (lastDayDate.current) document.querySelector<HTMLButtonElement>(`[data-date="${lastDayDate.current}"]`)?.focus()
  }, [isDetail])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedDate(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  return (
    <main data-display-mode={preferences.displayMode} data-motion={preferences.motionPreference} className="calendar-shell mx-auto flex min-h-dvh max-w-[1800px] flex-col">
      <DisplayHeader profileName={profileName} compact={!standard} context={selectedDay ? dayLabels(selectedDay.date).name : view==='month'?'MY MONTH':'MY WEEK'}>
      {standard&&preferences.showClock&&<StandardClock zone={zone} format={preferences.clockFormat}/>}
      {profileSwitch}
      {selectedDay ? (
          <button ref={backButton} className="week-button" onClick={() => setSelectedDate(null)}>
            <span aria-hidden="true">←</span> {view.toUpperCase()}
          </button>
        ) : <p className="month-label">{periodLabel}</p>}
      </DisplayHeader>
      {!selectedDay&&standard&&(preferences.allowedViews.length>1||preferences.allowCalendarNavigation)&&<nav className="calendar-controls" aria-label="Calendar views and dates">
        {preferences.allowedViews.length>1&&<div>{preferences.allowedViews.map(candidate=><button key={candidate} aria-pressed={view===candidate} onClick={()=>{if(calendarViewAllowed(preferences,candidate)) setView(candidate)}}>{candidate==='week'?'Week':'Month'}</button>)}</div>}
        {preferences.allowCalendarNavigation&&<div><button onClick={()=>setAnchor(navigateCalendar(dates[0],view,-1))}>Previous</button><button onClick={()=>setAnchor(null)}>Today</button><button onClick={()=>setAnchor(navigateCalendar(dates[0],view,1))}>Next</button></div>}
      </nav>}
      {selectedDay ? (
        <SelectedDayTimeline key={selectedDay.id} day={selectedDay} now={today} preferences={preferences} weather={weather} />
      ) : (
        view==='month'?<section className="month-grid" aria-label={periodLabel}>
          {['MON','TUE','WED','THU','FRI','SAT','SUN'].map(label=><span className="month-weekday" key={label}>{label}</span>)}
          {Array.from({length:(new Date(dates[0]+'T12:00:00Z').getUTCDay()+6)%7},(_,i)=><span aria-hidden="true" key={'blank'+i}/>)}
          {days.map(day=>{const summary=summarizeDay(day);return <button key={day.date} data-date={day.date} className={`month-day ${day.date===todayDate?'is-today':''}`} aria-current={day.date===todayDate?'date':undefined} aria-label={dayLabels(day.date).displayDate+(day.date===todayDate?', Today':'')+'. Open day.'} disabled={!preferences.allowNavigation} onClick={()=>{lastDayDate.current=day.date;setSelectedDate(day.date)}}><span>{dayLabels(day.date).dayOfMonth}{day.date===todayDate?' · TODAY':''}</span>{preferences.showWeather&&day.date>=todayDate&&<WeatherCue weather={weather} date={day.date} now={today} zone={zone} detail={preferences.weatherDetail}/>} {summary&&<PictureTile item={summary.activity}/>} {preferences.showActivityTimes&&<ActivityTimes day={day} compact/>}</button>})}
        </section>:<section className="week-grid grid grid-cols-7" aria-label={standard?'Calendar week':'Yesterday, today and the next five days'}>
          {days.map((day) => (
            <DayCard key={day.date} day={day} isToday={day.date === dateKey(today, zone)}
              weather={preferences.showWeather&&day.date>=todayDate?<WeatherCue weather={weather} date={day.date} now={today} zone={zone} detail={preferences.weatherDetail}/>:undefined} showActivityTimes={preferences.showActivityTimes} subdued={isSubduedDay(day.date,todayDate,preferences)} allowNavigation={preferences.allowNavigation} showWho={preferences.showWho} showWhere={preferences.showWhere} onSelect={() => { lastDayDate.current = day.date; setSelectedDate(day.date) }} />
          ))}
        </section>
      )}
      <footer className="page-footer flex items-center justify-between gap-4">
        <span className="footer-hint">{preferences.allowNavigation ? (selectedDay ? '' : '☝ TAP A DAY') : ''}</span>
        <span className="sample-label" role="status">{savedView ? '↻ SAVED VIEW' : days.every(day => day.events.length === 0) ? 'NO PLANS' : ''}</span>
      </footer>
    </main>
  )
}
