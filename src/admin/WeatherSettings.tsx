import {useToday} from '../hooks/useToday'
import {useState} from 'react'
import type {HouseholdData} from '../data/records'
import type {WeatherLocation,TemperatureUnit} from '../weather/types'
import type {RunAction} from './Admin'
import {client} from '../data/supabase'
async function action(householdId:string,action:string,values:Record<string,unknown>={}) {
 const {data,error}=await client().functions.invoke('weather-actions',{body:{householdId,action,...values}})
 if(error||data?.error)throw new Error('Weather unavailable')
 return data
}
export function WeatherSettings({data,run,searchLocation=async(hid,query)=>(await action(hid,'search',{query})).locations}:{data:HouseholdData;run:RunAction;searchLocation?:(hid:string,query:string)=>Promise<WeatherLocation[]>}) {
 const now=useToday()
 const weather=data.weather
 const [enabled,setEnabled]=useState(weather?.enabled??false),[unit,setUnit]=useState<TemperatureUnit>(weather?.temperature_unit??'fahrenheit')
 const [location,setLocation]=useState<WeatherLocation|null>(weather?.location??null),[query,setQuery]=useState(''),[results,setResults]=useState<WeatherLocation[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const search=async()=>{setBusy(true);setMessage('');try{const locations=await searchLocation(data.household.id,query);setResults(locations);if(!locations.length)setMessage('No locations found. Try a city name or ZIP.')}catch{setMessage('Location lookup unavailable. Try again.')}finally{setBusy(false)}}
 const updated=weather?.last_success_at?Math.max(0,Math.floor((now.getTime()-Date.parse(weather.last_success_at))/60000)):null
 return <details className="weather-settings"><summary>Household settings · Weather</summary><section><h2>Weather</h2>
 <p>Shared by all household displays. Location: {weather?.location?.label??'Not set'}</p>
 <p role="status">{!weather?.enabled?'Disabled':updated===null?'Waiting for first forecast':`Updated ${updated} minutes ago`}{weather?.enabled&&weather.refresh_failed?' · Refresh unavailable; keeping the last forecast.':''}</p>
 <form onSubmit={e=>{e.preventDefault();setBusy(true);void run(async()=>{const result=await action(data.household.id,'configure',{settings:{enabled,location,temperature_unit:unit}});setMessage(result.failed?'Settings saved. Forecast unavailable; try Refresh weather later.':'Settings saved.')}).finally(()=>setBusy(false))}}>
 <label className="check"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Enable household weather</label>
 <label>Weather location<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Salina, KS / ZIP / city" maxLength={120}/></label>
 <button type="button" className="secondary" disabled={busy||query.trim().length<2} onClick={()=>void search()}>Find / change location</button>
 {results.length>0&&<fieldset><legend>Select a location</legend>{results.map((place,i)=><label className="check" key={i}><input type="radio" name="weather-location" checked={location===place} onChange={()=>setLocation(place)}/>{place.label}</label>)}</fieldset>}
 <p>Selected: {location?.label??'Choose a location above'}</p>
 <label>Temperature units<select value={unit} onChange={e=>setUnit(e.target.value as TemperatureUnit)}><option value="fahrenheit">Fahrenheit</option><option value="celsius">Celsius</option></select></label>
 <button disabled={busy||(enabled&&!location)}>Save weather settings</button>
 <button type="button" className="secondary" disabled={busy||!weather?.enabled} onClick={()=>{setBusy(true);void run(async()=>{const r=await action(data.household.id,'refresh');setMessage(r.failed?'Refresh unavailable. Last forecast retained.':r.processed?'Weather refreshed.':'A refresh is already running or was just completed.')},'Weather request complete.').finally(()=>setBusy(false))}}>Refresh weather</button>
 </form><p role="status">{message}</p><p className="help">Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Location data by GeoNames. Forecasts are simplified for the display.</p>
 </section></details>
}
