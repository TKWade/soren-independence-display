import { useId, useState } from 'react'
import type { HouseholdRow, ProfileRow } from '../data/records'
export function CaregiverToolbar({households,householdId,profiles,onHouseholdChange,onRefresh,loading}:{households:HouseholdRow[];householdId:string;profiles:ProfileRow[];onHouseholdChange:(id:string)=>void;onRefresh:()=>void;loading:boolean}) {
 const [selection,setSelection]=useState({householdId,profileId:''})
 const active=profiles.filter(profile=>profile.active)
 const selected=active.find(profile=>selection.householdId===householdId&&profile.id===selection.profileId)??active[0]
 const helpId=useId()
 return <div className="admin-toolbar">
  <label className="toolbar-household">Household<select value={householdId} onChange={event=>{setSelection({householdId:event.target.value,profileId:''});onHouseholdChange(event.target.value)}}>{households.map(h=><option value={h.id} key={h.id}>{h.name}</option>)}</select></label>
  <div className="toolbar-display"><label>Display<select value={selected?.id??''} disabled={!active.length} aria-describedby={!active.length?helpId:undefined} onChange={event=>setSelection({householdId,profileId:event.target.value})}>{!active.length&&<option value="">No active profiles</option>}{active.map(profile=><option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
   {selected?<a className="secondary" href={'/?household='+householdId+'&profile='+selected.id} aria-label={'Open '+selected.name+'’s display'}>Open</a>:<button className="secondary" disabled aria-describedby={helpId}>Open</button>}
  </div>
  <button className="secondary toolbar-refresh" onClick={onRefresh} disabled={loading}>Refresh</button>
   {!active.length&&<p id={helpId} className="toolbar-help">{loading?'Loading profiles…':'Create or activate a profile to open a display.'}</p>}
 </div>
}
