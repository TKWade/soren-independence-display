import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {householdFixture} from './fixtures/externalCalendars.mjs'
import {calendarInbox} from '../src/calendar/relevance.ts'
test('Inbox Home sleep editor previews dates, supports dynamic Both profiles, and has no activity fields',async()=>{
 const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-home-tests',plugins:[react()],server:{middlewareMode:true,watch:null,hmr:false,ws:false},appType:'custom',optimizeDeps:{noDiscovery:true}})
 try {
  const {InboxForm}=await server.ssrLoadModule('/src/admin/CalendarInbox.tsx')
  const {SleepReview}=await server.ssrLoadModule('/src/admin/SleepReview.tsx')
  const d=householdFixture();d.homePreferences=d.profiles.map(p=>({profile_id:p.id,household_id:'h',overnight_mode:'calendar_with_local_fallback',default_bedtime:null,weekday_bedtimes:{}}));d.profiles[0].name='Alex';d.profiles[1].name='Robin'
  d.integration.mappings=[{id:'sleep',target:'home_sleep',action:'include',profile_id:'soren',household_id:'h',calendar_id:'calendar',group_key:'series:speech-series',sleep_place_id:'clinic',sleep_caregiver_id:'dad',bedtime_mode:'use_normal_bedtime',bedtime_override:null}]
  const html=renderToStaticMarkup(createElement(InboxForm,{data:d,item:calendarInbox(d,true)[0],run:async()=>false,done:()=>{}}))
  assert.match(html,/What does this calendar item represent/);assert.match(html,/Home &amp; sleep/);assert.match(html,/Both/)
  assert.match(html,/Alex/);assert.match(html,/Robin/);assert.doesNotMatch(html,/Soren|Siv/)
  assert.match(html,/Sep 23, 2026/);assert.match(html,/Use normal bedtime/);assert.match(html,/Explicit bedtime override/)
  assert.doesNotMatch(html,/name="activity_id"|name="place_id"|Future titles containing/)
  const review=renderToStaticMarkup(createElement(SleepReview,{data:d}))
  assert.match(review,/No overnight assignment|Normal bedtime is not configured/);assert.match(review,/Alex/)
 } finally {await server.close()}
})
