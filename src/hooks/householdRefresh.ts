import type {HouseholdData,HouseholdRow} from '../data/records.ts'
export interface RefreshHost {
 setInterval:(callback:()=>void,ms:number)=>unknown;clearInterval:(id:unknown)=>void;
 listen:(event:'online'|'focus'|'visibilitychange',callback:()=>void)=>()=>void;visible:()=>boolean
}
interface RefreshOptions {
 selected:string;strict:boolean;households:()=>Promise<HouseholdRow[]>;load:(household:HouseholdRow)=>Promise<HouseholdData>;
 start:()=>void;list:(rows:HouseholdRow[])=>void;select:(id:string)=>void;data:(data:HouseholdData)=>void;empty:()=>void;error:()=>void;done:()=>void
}
/** The existing single 60s refresh lifecycle, with in-flight deduplication and stale-response fencing. */
export function startHouseholdRefresh(options:RefreshOptions,host:RefreshHost) {
 let active=true,pending=false
 const refresh=async()=>{
  if(!active||pending)return
  pending=true
  await Promise.resolve()
  if(!active){pending=false;return}
  let switching=false
  options.start()
  try {
   const available=await options.households();if(!active)return
   options.list(available)
   const household=available.find(h=>h.id===options.selected)??(options.strict?undefined:available[0])
   if(!household){options.empty();return}
   if(household.id!==options.selected){switching=true;options.select(household.id);return}
   const snapshot=await options.load(household);if(active)options.data(snapshot)
  }catch{if(active)options.error()}
  finally{pending=false;if(active&&!switching)options.done()}
 }
 const tick=()=>{void refresh()}
 const timer=host.setInterval(tick,60000)
 const remove=[host.listen('online',tick),host.listen('focus',tick),host.listen('visibilitychange',()=>{if(host.visible())tick()})]
 tick()
 return {refresh:tick,dispose:()=>{active=false;host.clearInterval(timer);for(const unlisten of remove)unlisten()}}
}
