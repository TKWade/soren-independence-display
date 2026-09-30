import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {householdFixture} from './fixtures/externalCalendars.mjs'
test('Home & Sleep UI is local-first, profile-specific, with explicit calendar configuration and inactive weekly controls',async()=>{
 const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-home-preferences-tests',plugins:[react()],server:{middlewareMode:true,watch:null,hmr:false,ws:false},appType:'custom',optimizeDeps:{noDiscovery:true}})
 try {
  const {HomeEditor}=await server.ssrLoadModule('/src/admin/HomeEditor.tsx')
  const d=householdFixture();delete d.integration
  const render=()=>renderToStaticMarkup(createElement(HomeEditor,{data:d,run:async()=>false}))
  const local=render();assert.match(local,/Normal bedtime/);assert.match(local,/Default bedtime/);assert.match(local,/Weekday bedtime overrides/)
  assert.match(local,/<h3>Weekly overnight schedule/);assert.match(local,/<h3>Specific-date overrides/)
  assert.doesNotMatch(local,/<h3>Connected-calendar assignments|No eligible connected calendar|Inactive local weekly schedule/)
  d.homePreferences=[{profile_id:'soren',household_id:'h',overnight_mode:'calendar_driven',default_bedtime:'20:00',weekday_bedtimes:{}}]
  const calendar=render();assert.match(calendar,/No eligible connected calendar/);assert.match(calendar,/<details><summary>Inactive local weekly schedule/);assert.doesNotMatch(calendar,/<h3>Weekly overnight schedule/)
  d.homePreferences[0].overnight_mode='calendar_with_local_fallback'
  const fallback=render();assert.match(fallback,/<h3>Weekly fallback schedule/);assert.match(fallback,/No eligible connected calendar/)
  d.integration=householdFixture().integration
  assert.doesNotMatch(render(),/No eligible connected calendar/)
 } finally {await server.close()}
})
