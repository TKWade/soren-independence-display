import './demo.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DisplayRenderer } from '../../src/display/DisplayRenderer'
import { defaultDisplayPreferences } from '../../src/display/preferences'
import { createMockWeek } from '../../src/data/mockWeek'
import { useToday } from '../../src/hooks/useToday'

// Fictional fixture data only. Never import Root/App, authentication, or repositories.
const preferences = { ...defaultDisplayPreferences(), showWeather: false }
function loadDays(dates: string[]) {
 return dates.flatMap(date => createMockWeek(new Date(date + 'T12:00:00')).filter(day => day.date === date))
}
export function Demo() {
 const now = useToday()
 return <DisplayRenderer profileName="Demo" preferences={preferences} now={now}
  schedule={{days:createMockWeek(now),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone}} loadDays={loadDays}/>
}
createRoot(document.getElementById('root')!).render(<StrictMode><Demo/></StrictMode>)

