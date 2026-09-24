import { useEffect, useRef, useState } from 'react'
import { DayCard } from './components/DayCard'
import { SelectedDayTimeline } from './components/SelectedDayTimeline'
import { dayLabels } from './lib/schedule'
import { dateKey } from './lib/schedule'
import { normalizeWeek } from './lib/persistentSchedule'
import type { useHouseholdData } from './hooks/useHouseholdData'
import { useToday } from './hooks/useToday'

export default function App({ store }: { store: ReturnType<typeof useHouseholdData> }) {
  const today = useToday()
  const profileId = new URLSearchParams(window.location.search).get('profile') ?? store.data?.profiles.find(profile => profile.active)?.id ?? ''
  const profile = store.data?.profiles.find(item => item.id === profileId && item.active)
  let days: ReturnType<typeof normalizeWeek> = []
  let invalidData = false
  try { days = store.data ? normalizeWeek(store.data, profileId, today) : [] } catch { invalidData = true }
  const zone = store.data?.household.time_zone
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
  if (!store.data || invalidData) return <div className="display-state" role="status"><span aria-hidden="true">{store.loading ? '◷' : '☀'}</span>{store.loading ? 'WAIT' : store.error || invalidData ? 'TRY AGAIN' : 'NO PLANS'}{(store.error || invalidData) && <button aria-label="Try again" onClick={store.refresh}>↻</button>}</div>
  if (!profile) return <div className="display-state" role="status"><span aria-hidden="true">☀</span> NO PLANS</div>
  return (
    <main className="calendar-shell mx-auto flex min-h-dvh max-w-[1800px] flex-col">
      <header className="page-header flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="brand-mark" aria-hidden="true">☀</div>
          <div><p className="eyebrow">{profile.name.toUpperCase()}’S CALENDAR</p><h1>{selectedDay ? dayLabels(selectedDay.date).name : 'MY WEEK'}</h1></div>
        </div>
        {selectedDay ? (
          <button ref={backButton} className="week-button" onClick={() => setSelectedDate(null)}>
            <span aria-hidden="true">←</span> WEEK
          </button>
        ) : <p className="month-label">{today.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: zone })}</p>}
      </header>
      {selectedDay ? (
        <SelectedDayTimeline key={selectedDay.id} day={selectedDay} now={today} />
      ) : (
        <section className="week-grid grid grid-cols-7" aria-label="This week">
          {days.map((day) => (
            <DayCard key={day.date} day={day} isToday={day.date === dateKey(today, zone)}
              onSelect={() => { lastDayDate.current = day.date; setSelectedDate(day.date) }} />
          ))}
        </section>
      )}
      <footer className="page-footer flex items-center justify-between gap-4">
        <span className="footer-hint">{selectedDay ? '☝ TAP A PICTURE' : '☝ TAP A DAY'}</span>
        <span className="sample-label" role="status">{store.error ? '↻ SAVED VIEW' : days.every(day => day.events.length === 0) ? 'NO PLANS' : ''}</span>
      </footer>
    </main>
  )
}
