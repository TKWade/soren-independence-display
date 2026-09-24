import { useState } from 'react'
import type { HouseholdData } from '../data/records'
import type { RunAction } from './Admin'
import { saveRecord } from '../data/repository'
export function ProfileEditor({data,run}:{data:HouseholdData;run:RunAction}) {
 const [selected,setSelected]=useState('')
 const [version,setVersion]=useState(0)
 const profile=data.profiles.find(p=>p.id===selected)
 return <section><h2>Display profiles</h2><label>Edit profile<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">New profile</option>{data.profiles.map(p=><option key={p.id} value={p.id}>{p.name}{p.active?'':' (inactive)'}</option>)}</select></label>
  <form key={selected+version} onSubmit={e=>{e.preventDefault();const values=new FormData(e.currentTarget);void run(async()=>{
   await saveRecord('profiles',{id:profile?.id ?? crypto.randomUUID(),household_id:data.household.id,name:String(values.get('name')).trim(),active:values.get('active')==='on'})
   setSelected('');setVersion(v=>v+1)
  })}}><label>Name<input name="name" defaultValue={profile?.name} maxLength={100} required/></label><label className="check"><input type="checkbox" name="active" defaultChecked={profile?.active ?? true}/>Active</label><button>Save profile</button></form>
  <ul>{data.profiles.filter(p=>p.active).map(p=><li key={p.id}><a href={'/?household='+data.household.id+'&profile='+p.id}>Open {p.name}’s display</a></li>)}</ul>
 </section>
}
