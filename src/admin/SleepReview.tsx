import type { HouseholdData } from '../data/records'
import { formatNight, sleepReviewIssues } from '../calendar/homeSleep'
export function SleepReview({data,profileId}:{data:HouseholdData;profileId?:string}) {
 const issues=sleepReviewIssues(data,new Date(),profileId)
 if(!issues.length) return null
 return <section className="warning-panel" aria-label="Sleep assignments needing review"><h3>Sleep assignments need review</h3><p>These dates have no sleep card until resolved. Configure the overnight plan or bedtime, or add a manual specific-date override.</p>
 <ul>{issues.map(issue=><li key={issue.profile.id+issue.date}><strong>{issue.profile.name} · {formatNight(issue.date)}: {issue.issue==='conflict'?'Conflicting calendar assignments':issue.issue==='missing_assignment'?'No overnight assignment':'Normal bedtime is not configured'}</strong>
 <ul>{issue.candidates.map(({event,mapping})=><li key={event.id}>{event.title||'(Untitled event)'} · {data.places.find(p=>p.id===mapping.sleep_place_id)?.name} · {data.people.find(p=>p.id===mapping.sleep_caregiver_id)?.name??'No caregiver'}</li>)}</ul></li>)}</ul></section>
}
