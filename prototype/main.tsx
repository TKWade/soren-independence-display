import {createRoot} from 'react-dom/client'
import {DisplayBrand} from '../src/display/DisplayHeader'
import type {PrototypeLinks} from '../tests/browser/scheduling/links'
import '../tests/browser/scheduling/prototype.css'
import './landing.css'

const links:PrototypeLinks={home:'/',family:'/family/',residential:'/residential/',tasks:'/tasks/'}
const root=createRoot(document.getElementById('root')!)
const route=location.pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '')
if(route==='/tasks'){
 const {SchedulingTasks}=await import('../tests/browser/scheduling/SchedulingTasks')
 root.render(<SchedulingTasks links={links}/> )
}else if(['/family','/residential','/setup'].includes(route)){
 const {SchedulingPrototype}=await import('../tests/browser/scheduling/SchedulingPrototype')
 root.render(<SchedulingPrototype scenario={route==='/residential'?'residential':'family'} initialSetup={route==='/setup'} links={links}/> )
}else{
 root.render(<div className="sp-app"><main className="sp-landing">
  <DisplayBrand/>
  <p className="sp-muted">FICTIONAL DATA · INTERACTION STUDY</p>
  <h1>SOREN Scheduling Prototype</h1>
  <p>Explore the display, try daily schedule changes, and configure each fictional profile.</p>
  <nav aria-label="Prototype pages">
   <a href={links.family}>Family Scenario <span aria-hidden="true">→</span></a>
   <a href={links.residential}>Residential Scenario <span aria-hidden="true">→</span></a>
   <a href="/setup/">Caregiver Setup <span aria-hidden="true">→</span></a>
   <a href={links.tasks}>Usability Checklist <span aria-hidden="true">→</span></a>
  </nav>
  <p className="sp-muted">No account or real calendar connection. Use fictional information only. Changes stay in this tab and reset when you refresh or open another page.</p>
 </main></div>)
}
