import {createRoot} from 'react-dom/client'
if(!import.meta.env.DEV)throw new Error('Development-only scheduling prototype')
const root=createRoot(document.getElementById('root')!)
if(location.pathname.endsWith('scheduling-tasks.html')){
 const {SchedulingTasks}=await import('./scheduling/SchedulingTasks');root.render(<SchedulingTasks/>)
}else{
 const {SchedulingPrototype}=await import('./scheduling/SchedulingPrototype')
 const scenario=new URLSearchParams(location.search).get('scenario')==='residential'?'residential':'family'
 root.render(<SchedulingPrototype scenario={scenario}/>)
}
