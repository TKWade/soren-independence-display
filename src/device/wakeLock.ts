export interface ScreenLock {released:boolean;release():Promise<void>;addEventListener(type:'release',listener:()=>void):void;removeEventListener(type:'release',listener:()=>void):void}
export interface WakeHost {
 request?:()=>Promise<ScreenLock>;visible:()=>boolean;
 listen:(event:'visibilitychange'|'pagehide'|'pageshow',listener:()=>void)=>()=>void
}
/** One request in flight; release events never cause an automatic retry loop. */
export function startWakeLock(host:WakeHost) {
 if(!host.request)return ()=>{}
 let active=true,suspended=false,pending=false,held:ScreenLock|null=null
 const released=()=>{held?.removeEventListener('release',released);held=null}
 const release=()=>{const lock=held;released();if(lock)void lock.release().catch(()=>{})}
 const acquire=async()=>{
  if(!active||suspended||!host.visible()||pending||held)return
  pending=true
  try {
   const lock=await host.request!()
   if(!active||suspended||!host.visible()){await lock.release();return}
   if(!lock.released){held=lock;lock.addEventListener('release',released)}
  }catch{/* Unsupported/rejected/released by the OS: no child-facing errors or timer retries. */}
  finally{pending=false}
 }
 const visibility=()=>{if(host.visible())void acquire();else release()}
 const remove=[host.listen('visibilitychange',visibility),host.listen('pagehide',()=>{suspended=true;release()}),host.listen('pageshow',()=>{suspended=false;void acquire()})]
 void acquire()
 return ()=>{active=false;for(const unlisten of remove)unlisten();release()}
}
