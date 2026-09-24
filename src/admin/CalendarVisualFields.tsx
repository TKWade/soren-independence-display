import type { HouseholdData } from '../data/records'
import type { MappingVisuals } from '../types/externalCalendar'
export function CalendarVisualFields({data,initial,ignore=false}:{data:HouseholdData;initial?:Partial<MappingVisuals>;ignore?:boolean}) {
 if(ignore) return <p>This decision hides the event for the selected profile(s). Other profiles are unaffected.</p>
 return <><div className="form-grid">
  <label>Activity<select name="activity_id" required defaultValue={initial?.activity_id??''}><option value="">Choose activity</option>{data.activities.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
  <label>Visual place<select name="place_id" required defaultValue={initial?.place_id??''}><option value="">Choose place</option>{data.places.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label>Person / caregiver<select name="caregiver_id" defaultValue={initial?.caregiver_id??''}><option value="">No person</option>{data.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label>Short child label<input name="label" maxLength={20} defaultValue={initial?.label??''} placeholder="Use activity label"/></label>
  <label>Picture<select name="picture_person_id" defaultValue={initial?.picture_person_id??''}><option value="">Use activity / visual place image</option>{data.people.map(p=><option key={p.id} value={p.id}>{p.name} picture</option>)}</select></label>
 </div><label className="check"><input type="checkbox" name="visible" defaultChecked={initial?.visible??true}/>Show on child display</label>
 <label className="check"><input type="checkbox" name="is_primary" defaultChecked={initial?.is_primary??false}/>Main activity in Week summary</label></>
}
