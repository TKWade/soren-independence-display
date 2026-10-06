import { useCallback, useEffect, useRef, useState } from 'react'
import { households, loadHousehold } from '../data/repository'
import type { HouseholdData, HouseholdRow } from '../data/records'
import {startHouseholdRefresh} from './householdRefresh'
export function useHouseholdData(userId: string | undefined,initialHousehold?:string,strict=false) {
 const [list,setList] = useState<HouseholdRow[]>([])
 const [selected,setSelected] = useState(() => initialHousehold??new URLSearchParams(window.location.search).get('household')??'')
 const [data,setData] = useState<HouseholdData | null>(null)
 const [loading,setLoading] = useState(true)
 const [error,setError] = useState(false)
 const refreshRef=useRef<()=>void>(()=>{})
 const refresh=useCallback(()=>refreshRef.current(),[])
 useEffect(()=>{
  if(!userId)return
  const lifecycle=startHouseholdRefresh({selected,strict,households,load:loadHousehold,
   start:()=>{setLoading(true);setError(false)},list:setList,select:setSelected,
   data:snapshot=>{setData(previous=>({...snapshot,weather:snapshot.weather??(previous?.household.id===snapshot.household.id?previous.weather:undefined)}));setError(false)},
   empty:()=>setData(null),error:()=>setError(true),done:()=>setLoading(false)
  },{setInterval:(callback,ms)=>window.setInterval(callback,ms),clearInterval:id=>window.clearInterval(id as number),visible:()=>document.visibilityState==='visible',listen:(event,callback)=>{
   const target=event==='visibilitychange'?document:window
   target.addEventListener(event,callback);return ()=>target.removeEventListener(event,callback)
  }})
  refreshRef.current=lifecycle.refresh
  return ()=>{refreshRef.current=()=>{};lifecycle.dispose()}
 },[userId,selected,strict])
 return {list:userId?list:[],selected,setSelected,data:userId&&data?.household.id===selected?data:null,loading:userId?loading:false,error:userId?error:false,refresh}
}
