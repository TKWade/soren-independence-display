import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {householdFixture} from './fixtures/externalCalendars.mjs'

test('Admin presentation keeps calendar status and deletion safeguards explicit',async()=>{
 const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-admin-presentation',plugins:[react()],server:{middlewareMode:true,watch:null,hmr:false,ws:false},appType:'custom',optimizeDeps:{noDiscovery:true}})
 const oldWindow=globalThis.window
 globalThis.window={location:{search:''}}
 try {
  const {DeletionDialog}=await server.ssrLoadModule('/src/admin/DeleteControl.tsx')
  const {CalendarAdmin}=await server.ssrLoadModule('/src/admin/CalendarAdmin.tsx')
  const {DisplayBrand}=await server.ssrLoadModule('/src/display/DisplayHeader.tsx')
  const {CaregiverHeader}=await server.ssrLoadModule('/src/admin/CaregiverHeader.tsx')
  const render=(Component,props)=>renderToStaticMarkup(createElement(Component,props))
  const dialog={entity:'profiles',id:'profile',label:'Permanent delete',preview:{name:'Example',dependencies:{shared_events:4},blocked:false},typed:'',setTyped(){},close(){},confirm(){}}
  for(const [blocked,typed,disabled] of [[true,'Example',true],[false,'',true],[false,'wrong',true],[false,'Example',false]]) {
   const html=render(DeletionDialog,{...dialog,preview:{...dialog.preview,blocked},typed})
   assert.match(html,/Dependency summary/)
   assert.match(html,/shared events: 4/)
   assert.match(html,/Shared events remain for other profiles/)
   assert.match(html,/Type the profile name to confirm/)
   assert.equal(/class="danger" disabled=""/.test(html),disabled)
   assert.equal(html.includes('Deletion blocked.'),blocked)
   assert.match(html,/aria-labelledby="delete-title-profile"/)
  }
  const data=householdFixture()
  data.integration.calendars[0].sync_status='error'
  data.integration.calendars[0].last_error_category='authorization_required'
  let html=render(CalendarAdmin,{data,run:async()=>false})
  for(const text of ['Sync needs attention','Last successful sync','Last attempted sync','Reconnect account','Sync Now','Save calendar selection']) assert.ok(html.includes(text),text)
  assert.match(html,/class="admin-status sync-status admin-error" role="status"/)
  data.integration.calendars[0].enabled=false
  data.integration.calendars[0].sync_status='idle'
  html=render(CalendarAdmin,{data,run:async()=>false})
  assert.match(html,/Automatic sync inactive/)
  assert.match(html,/disabled="">Sync Now/)
  assert.match(render(CaregiverHeader,{}),/Caregiver Portal/)
  for(const compact of [true,false]) {
   const brand=render(DisplayBrand,{compact})
   assert.match(brand,/src="\/brand\/soren-logo.png"/)
   assert.match(brand,/width="1774" height="887"/)
   assert.equal((brand.match(/<img /g)||[]).length,1)
   assert.doesNotMatch(brand,/brand-tagline|<span/)
  }
  assert.match(render(CaregiverHeader,{logoSrc:'/brand/soren-logo.png'}),/alt="SOREN[^"]*"/)
 } finally {
  if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow
  await server.close()
 }
})
