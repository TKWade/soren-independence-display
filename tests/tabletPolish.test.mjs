import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {calendarDates} from '../src/display/calendarPresentation.ts'
import {defaultDisplayPreferences} from '../src/display/preferences.ts'

test('Month includes its final date for 28/30/31 days and six-row calendars',()=>{
 const preferences=defaultDisplayPreferences('standard-calendar')
 for(const [date,count,rows] of [['2027-02-15',28,4],['2026-04-15',30,5],['2026-12-15',31,5],['2026-08-15',31,6]]) {
  const days=calendarDates(preferences,new Date(date+'T12:00Z'),'America/Chicago',undefined,'month')
  assert.equal(days.length,count)
  assert.equal(days.at(-1),date.slice(0,7)+'-'+count)
  const offset=(new Date(days[0]+'T12:00Z').getUTCDay()+6)%7
  assert.equal(Math.ceil((offset+days.length)/7),rows)
 }
})

test('Month/Admin document flow and multi-event recognition sizing stay scoped',async()=>{
 const [root,admin,display,day]=await Promise.all(['src/index.css','src/admin/admin.css','src/display/display.css','src/components/DayTimelineB.css'].map(p=>readFile(p,'utf8')))
 assert.match(root,/body:has\(\.admin-shell, \.month-grid\), #root:has\(\.admin-shell, \.month-grid\) \{ height: auto; max-height: none; overflow: visible;/)
 assert.match(admin,/\.admin-shell \{ min-height: 100dvh; height: auto; max-height: none; overflow: visible;/)
 assert.match(display,/\.month-grid \{ height: auto; max-height: none; overflow: visible;/)
 assert.match(display,/padding-bottom: max\(var\(--space-6\), env\(safe-area-inset-bottom, 0px\)\)/)
 assert.match(day,/day-composition:not\(\[data-layout="single"\]\) \{ --context-image-size: clamp\(64px, 5vw, 72px\)/)
 assert.match(day,/--context-image-size: clamp\(48px, 12vw, 56px\)/)
})

// The generic .admin-shell a.secondary rule formerly beat the toolbar margin reset.
test('toolbar reset overrides link margins and gives every control a common height',async()=>{
 const css=await readFile('src/admin/admin.css','utf8')
 assert.match(css,/\.admin-shell \.admin-toolbar :is\(select, button, a\.secondary\) \{ height: 48px; min-height: 48px; margin: 0; \}/)
})
