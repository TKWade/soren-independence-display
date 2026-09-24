import { useState } from 'react'
import { CalendarAdmin } from '../../src/admin/CalendarAdmin'
import type { HouseholdData } from '../../src/data/records'
import { householdFixture, rule } from '../fixtures/externalCalendars.mjs'
import '../../src/index.css'
import '../../src/admin/admin.css'
if(!import.meta.env.DEV) throw new Error('Development fixture only')
const fixture=householdFixture()
fixture.integration.matchingRules=[{...rule,id:'sister-ignore',profile_id:'sister',action:'ignore'}]
export function CalendarAdminFixture() {
 const [message,setMessage]=useState('')
 return <main className="admin-shell"><h1>Calendar admin fixture</h1><p>Fictional, read-only data. No backend calls or saves.</p><CalendarAdmin data={fixture as unknown as HouseholdData} run={async()=>{setMessage('Save disabled in this read-only fixture.');return false}}/><p role="status">{message}</p></main>
}
