import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {defaultDisplayPreferences} from '../src/display/preferences.ts'
const picture={id:'school',kind:'school',label:'SCHOOL'}
const person={id:'dad',name:'Dad',picture:{id:'dad',kind:'dad',label:'DAD'}}
const place={id:'campus',name:'Campus',picture:{id:'campus',kind:'home',label:'CAMPUS'}}
const event=(id,hour)=>({id,label:'SCHOOL',title:'School',picture,activity:{id:'school',picture},people:[person],place,startTime:`2026-09-23T${hour}:00:00Z`,endTime:`2026-09-23T${hour}:59:00Z`})
test('Day-B preserves ordered states and renders context once inside natural-size cards for 1, 2, many events',async()=>{
 const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-ui-refresh-tests',plugins:[react()],server:{middlewareMode:true,watch:null,hmr:false,ws:false},appType:'custom',optimizeDeps:{noDiscovery:true}})
 try {
  const {default:Day}=await server.ssrLoadModule('/src/components/DayTimelineB.tsx')
  const render=events=>renderToStaticMarkup(createElement(Day,{day:{id:'today',date:'2026-09-23',timeZone:'UTC',events},now:new Date('2026-09-23T14:30Z'),preferences:{...defaultDisplayPreferences(),showTimes:true}}))
  for(const events of [[event('now','14')],[event('now','14'),event('next','15')],[event('past','13'),event('now','14'),event('next','15'),event('future','16')]]) {
   const html=render(events)
   assert.match(html,new RegExp('class="day-composition" data-layout="'+(events.length===1?'single':events.length===2?'pair':'timeline')+'"'))
   assert.match(html, /class="detail-heading"><p>September 23<\/p><span class="today-badge">/)
   assert.equal((html.match(/class="event-card"/g)||[]).length,events.length)
   assert.equal((html.match(/>WITH</g)||[]).length,events.length)
   assert.equal((html.match(/>WHERE</g)||[]).length,events.length)
   assert.equal((html.match(/class="display-event-time"/g)||[]).length,events.length)
   assert.match(html,/aria-current="step"/);assert.match(html,/▶ NOW/)
   if(events.length>1)assert.match(html,/→ NEXT/)
   assert.doesNotMatch(html,/height:100%|h-full|event-context"/)
   assert.equal((html.match(/class="sequence-arrow"/g)||[]).length,events.length-1)
  }
  for(const [where,people] of [[false,[]],[true,[]],[false,[person]],[true,[person]],[true,[person,{...person,id:'mom',name:'Mom',picture:{id:'mom',kind:'mom',label:'MOM'}}]]]) {
   for(const showTimes of [false,true]) {
    const sample={...event('sleep','14'),label:'SLEEP',activity:{id:'sleep',picture:{id:'sleep',kind:'sleep',label:'SLEEP'}},picture:{id:'sleep',kind:'sleep',label:'SLEEP'},people,place:where?place:{...place,id:'',name:''}}
    const html=renderToStaticMarkup(createElement(Day,{day:{id:'today',date:'2026-09-23',timeZone:'UTC',events:[sample]},now:new Date('2026-09-23T14:30Z'),preferences:{...defaultDisplayPreferences(),showTimes}}))
    assert.equal((html.match(/>WHERE</g)||[]).length,where?1:0)
    assert.equal((html.match(/>WITH</g)||[]).length,people.length?1:0)
    assert.equal((html.match(/class="display-event-time"/g)||[]).length,showTimes?1:0)
    assert.equal((html.match(/class="context-person"/g)||[]).length,people.length+(where?1:0))
   }
  }
  const many=render([event('past','13'),event('now','14'),event('next','15'),event('future','16')])
  assert.deepEqual([...many.matchAll(/timeline-step status-([a-z]+)/g)].map(m=>m[1]),['past','now','next','future'])
  const {DisplayHeader}=await server.ssrLoadModule('/src/display/DisplayHeader.tsx')
  const header=renderToStaticMarkup(createElement(DisplayHeader,{profileName:'Siv',context:'Tuesday'},createElement('button',null,'Week')))
  assert.match(header,/SOREN/);assert.match(header,/Soarin’/);assert.match(header,/Siv’s Calendar/);assert.match(header,/Tuesday/)
  const compact=renderToStaticMarkup(createElement(DisplayHeader,{profileName:'Soren',context:'MY WEEK',compact:true},null))
  assert.doesNotMatch(compact,/Soarin’/)
 }finally{await server.close()}
 const css=await readFile('src/components/DayTimelineB.css','utf8')
 assert.match(css,/\.day-variant-b \.event-card \{ height: auto;/)
 assert.match(css,/max-width: 1160px; margin-inline: auto/);assert.match(css,/flex-basis: 720px; margin-inline: auto/);assert.match(css,/flex: 0 0 auto; border: 0; background: transparent/);
 assert.ok(css.includes('.day-composition:not([data-layout="single"]) .timeline-step'));
 assert.match(css,/flex: 0 0 330px/);
 assert.match(css,/align-items: flex-start/);assert.doesNotMatch(css,/height:\s*100%/)
})


test('Week summaries do not grow vertically with the viewport',async()=>{
 const base=await readFile('src/index.css','utf8'),display=await readFile('src/display/display.css','utf8')
 assert.match(base,/\.week-grid \{[^}]*flex: 0 0 auto; align-items: start;/)
 assert.match(base,/\.day-pictures \{[^}]*grid-template-rows: auto;/)
 assert.doesNotMatch(base,/grid-template-rows: repeat\(3, 1fr\)/)
 assert.match(display,/minmax\(180px, 1fr\)/)
 assert.match(display,/height: 64px; margin: var\(--space-1\)/)
})


test('rolling Week stretches only content-sized siblings; vertical Day lists leave safe bottom clearance',async()=>{
 const display=await readFile('src/display/display.css','utf8'),day=await readFile('src/components/DayTimelineB.css','utf8')
 assert.ok(display.includes('[data-display-mode="week"] .week-grid { align-items: stretch; align-content: start; grid-auto-rows: auto; }'))
 assert.ok(display.includes('[data-display-mode="week"] .week-grid .day-card { align-self: stretch; }'))
 assert.ok(day.includes('display: block; height: auto; min-height: 0; max-height: none; overflow: visible;'))
 assert.ok(day.includes('overflow-y: visible; padding-bottom: max(var(--space-6), env(safe-area-inset-bottom, 0px))'))
})
