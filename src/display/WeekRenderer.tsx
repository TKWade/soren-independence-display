import { useEffect, useRef, useState } from 'react'
import { DayCard } from '../components/DayCard'
import { SelectedDayTimeline } from '../components/SelectedDayTimeline'
import { dayLabels, dateKey } from '../lib/schedule'
import type { DisplayRendererProps } from '../types/display'
export function WeekRenderer({schedule,profileName,preferences,now:today,savedView}:DisplayRendererProps) {
 const days=schedule.days,zone=schedule.timeZone
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
    <main data-display-mode="week" data-motion={preferences.motionPreference} className="calendar-shell mx-auto flex min-h-dvh max-w-[1800px] flex-col">
      <header className="page-header flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="brand-mark" aria-hidden="true">☀</div>
          <div><p className="eyebrow">{profileName.toUpperCase()}’S CALENDAR</p><h1>{selectedDay ? dayLabels(selectedDay.date).name : 'MY WEEK'}</h1></div>
        </div>
        {selectedDay ? (
          <button ref={backButton} className="week-button" onClick={() => setSelectedDate(null)}>
            <span aria-hidden="true">←</span> WEEK
          </button>
        ) : <p className="month-label">{today.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: zone })}</p>}
      </header>
      {selectedDay ? (
        <SelectedDayTimeline key={selectedDay.id} day={selectedDay} now={today} preferences={preferences} />
      ) : (
        <section className="week-grid grid grid-cols-7" aria-label="This week">
          {days.map((day) => (
            <DayCard key={day.date} day={day} isToday={day.date === dateKey(today, zone)}
              allowNavigation={preferences.allowNavigation} showWho={preferences.showWho} showWhere={preferences.showWhere} onSelect={() => { lastDayDate.current = day.date; setSelectedDate(day.date) }} />
          ))}
        </section>
      )}
      <footer className="page-footer flex items-center justify-between gap-4">
        <span className="footer-hint">{preferences.allowNavigation ? (selectedDay ? '☝ TAP A PICTURE' : '☝ TAP A DAY') : ''}</span>
        <span className="sample-label" role="status">{savedView ? '↻ SAVED VIEW' : days.every(day => day.events.length === 0) ? 'NO PLANS' : ''}</span>
      </footer>
    </main>
  )
}
