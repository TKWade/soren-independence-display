import {useState} from 'react'
import {ProfileAvatar} from '../../../src/profiles/ProfileChooser'
import {Sheet} from './Shared'
import {AVATARS,HORIZONS,updatePrototypeProfile,type Horizon,type PrototypeData} from './model'

export function CaregiverSetup({data,onSave,onClose}:{data:PrototypeData;onSave:(next:PrototypeData,id:string)=>void;onClose:()=>void}) {
 const [selected,setSelected]=useState<string>(),[name,setName]=useState(''),[avatar,setAvatar]=useState('sun'),[visibility,setVisibility]=useState<Horizon>(7),[notice,setNotice]=useState('')
 const people=[...data.profiles,data.caregiver],person=people.find(p=>p.id===selected)
 const edit=(id:string)=>{const p=people.find(p=>p.id===id)!;setSelected(id);setName(p.name);setAvatar(p.avatar);setVisibility(data.profiles.find(p=>p.id===id)?.visibility??7);setNotice('')}
 return <Sheet title="Caregiver Setup" onClose={onClose}>{person?<form className="sp-editor-form sp-setup-form" onSubmit={e=>{e.preventDefault();const next=updatePrototypeProfile(data,person.id,name,avatar,visibility);if(next===data)return;onSave(next,person.id);setNotice(`${name.trim()} saved in this fictional session.`);setSelected(undefined)}}>
  <button type="button" className="sp-secondary sp-setup-back" onClick={()=>setSelected(undefined)}>← Profiles</button>
  <h3>Edit {person.name}</h3><label>Name<input value={name} onChange={e=>setName(e.target.value)} required maxLength={40}/></label>
  <fieldset><legend>Avatar</legend><div className="sp-avatar-options">{AVATARS.map(a=><button type="button" key={a} aria-label={`${a} avatar`} aria-pressed={avatar===a} onClick={()=>setAvatar(a)}><ProfileAvatar profile={{...person,name,avatar:a}}/><span>{a}</span></button>)}</div></fieldset>
  {person.id!==data.caregiver.id?<label>How much schedule should this person see?<select value={String(visibility)} onChange={e=>setVisibility(e.target.value==='month'?'month':Number(e.target.value) as Horizon)}>{HORIZONS.map(h=><option key={h.value} value={h.value}>{h.label}</option>)}</select></label>:<p className="sp-muted">Caregiver identity for this fictional setup. Daily schedule changes stay in Caregiver Tools.</p>}
  <footer><button type="button" className="sp-secondary" onClick={()=>setSelected(undefined)}>Cancel</button><button disabled={!name.trim()}>Save profile</button></footer>
 </form>:<div className="sp-editor-form sp-setup-list"><p>Choose a name, avatar and how much schedule each person sees.</p><p className="sp-muted">Fictional profiles only. Settings stay in this tab until reload. Use Caregiver Tools for daily schedule changes.</p>
  {people.map(p=><article key={p.id} className="sp-setup-profile"><ProfileAvatar profile={p}/><div><h3>{p.name}</h3><p>{p.id===data.caregiver.id?'Caregiver':HORIZONS.find(h=>h.value===data.profiles.find(profile=>profile.id===p.id)?.visibility)?.label}</p></div><button className="sp-secondary" aria-label={`Edit ${p.name} profile`} onClick={()=>edit(p.id)}>Edit</button></article>)}
  <p role="status">{notice}</p><footer><button onClick={onClose}>Back to schedule</button></footer>
 </div>}</Sheet>
}
