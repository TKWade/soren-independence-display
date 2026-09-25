import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DisplayRenderer } from '../../src/display/DisplayRenderer'
import { defaultDisplayPreferences } from '../../src/display/preferences'
import { createMockWeek } from '../../src/data/mockWeek'
import { ProfileEditor } from '../../src/admin/ProfileEditor'
import { householdFixture } from '../fixtures/externalCalendars.mjs'
import type { HouseholdData } from '../../src/data/records'
import '../../src/index.css'
import '../../src/admin/admin.css'
if(!import.meta.env.DEV) throw new Error('Development fixture only')
const params=new URLSearchParams(location.search),initial=new Date(2026,8,23,15,45)
const schedule={days:createMockWeek(initial),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone}
const preferences={...defaultDisplayPreferences(params.get('mode')==='week'?'week':'first-next-then'),...(params.has('context')?{showWho:true,showWhere:true}:{}),autoAdvance:!params.has('paused'),...(params.has('locked')?{allowNavigation:false}:{}),motionPreference:'none' as const}
export function Fixture() {
 const [now,setNow]=useState(initial)
 useEffect(()=>{const advance=(event:MessageEvent)=>{if(event.origin===location.origin&&event.data==='fixture-advance') setNow(value=>new Date(value.getTime()+3600000))};window.addEventListener('message',advance);return()=>window.removeEventListener('message',advance)},[])
 if(params.has('admin')) return <main className="admin-shell"><ProfileEditor data={householdFixture() as unknown as HouseholdData} run={async()=>false}/></main>
 return <DisplayRenderer schedule={schedule} preferences={preferences} now={now} profileName="Soren"/>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
