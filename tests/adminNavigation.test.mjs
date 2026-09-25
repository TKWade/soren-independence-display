import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { householdFixture } from './fixtures/externalCalendars.mjs'

test('Admin starts in Profiles with ordered neutral navigation; OAuth returns still open Calendars',async()=>{
 const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-admin-tests',plugins:[{
  name:'offline-admin-test',enforce:'pre',
  load(id) { if(id.replaceAll('\\','/').endsWith('/src/data/supabase.ts')) return 'export const supabase={}; export function client(){throw new Error("Network forbidden in Admin render test")}' },
 },react()],server:{middlewareMode:true,watch:null,hmr:false,ws:false},appType:'custom',optimizeDeps:{noDiscovery:true}})
 const oldWindow=globalThis.window
 try {
  globalThis.window={location:{search:''}}
  const {default:Admin}=await server.ssrLoadModule('/src/admin/Admin.tsx')
  const data=householdFixture()
  const props={userId:'caregiver',authLoading:false,store:{data,list:[data.household],selected:'h',loading:false,error:null,refresh(){},setSelected(){}}}
  const markup=renderToStaticMarkup(createElement(Admin,props))
  const navigation=markup.match(/<nav aria-label="Caregiver sections">(.*?)<\/nav>/)[1]
  assert.deepEqual([...navigation.matchAll(/>([A-Z]+)<\/button>/g)].map(m=>m[1]),['PROFILES','PEOPLE','PLACES','ACTIVITIES','SCHEDULE','CALENDARS'])
  assert.match(navigation,/aria-current="page">PROFILES/)
  assert.equal((markup.match(/<h2>Display profiles<\/h2>/g)||[]).length,1)
  assert.match(markup,/Display &amp; Interaction/)
  assert.match(markup,/Open display/)
  assert.doesNotMatch(markup,/Open child display|<h2>Home|<h2>Schedule|<h2>Calendar connections/)
  globalThis.window.location.search='?googleCalendar=connected'
  const callback=renderToStaticMarkup(createElement(Admin,props))
  assert.match(callback,/aria-current="page">CALENDARS/)
  assert.match(callback,/<h2>Calendar connections/)
  assert.doesNotMatch(callback,/<h2>Display profiles/)
 } finally {
  if(oldWindow===undefined) delete globalThis.window
  else globalThis.window=oldWindow
  await server.close()
 }
})
