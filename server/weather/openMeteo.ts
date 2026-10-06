import {WeatherDiagnosticError,weatherStage} from './diagnostics.ts'
import type {WeatherProvider} from './provider.ts'
import type {WeatherCondition,WeatherForecast,WeatherLocation} from '../../src/weather/types.ts'
export function condition(code:number):WeatherCondition {
 if(code===0)return 'sunny';if(code===1||code===2)return 'partly-cloudy';if(code===3)return 'cloudy'
 if(code===45||code===48)return 'fog';if([71,73,75,77,85,86].includes(code))return 'snow'
 if([95,96,99].includes(code))return 'storm';if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return 'rain'
 throw new WeatherDiagnosticError('forecast_normalization','unsupported_weather_condition')
}
const number=(v:unknown)=>{if(typeof v!=='number'||!Number.isFinite(v))throw new WeatherDiagnosticError('forecast_normalization','invalid_weather_number');return v}
const date=(v:unknown)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))throw new WeatherDiagnosticError('forecast_normalization','invalid_weather_date');return v}
export function normalizeForecast(raw:unknown,timeZone:string,now=new Date()):WeatherForecast {
 const p=raw as {current:{time:string;temperature_2m:number;weather_code:number};daily:{time:string[];weather_code:number[];temperature_2m_max:number[];temperature_2m_min:number[];precipitation_probability_max:number[]}}
 const d=p.daily
 if(!Array.isArray(d.time)||d.time.length<6||d.time.length>16)throw new WeatherDiagnosticError('forecast_normalization','invalid_forecast_horizon')
 return {timeZone,fetchedAt:now.toISOString(),current:{date:date(p.current.time.slice(0,10)),temperature:number(p.current.temperature_2m),condition:condition(number(p.current.weather_code))},daily:d.time.map((day,i)=>({date:date(day),condition:condition(number(d.weather_code[i])),high:number(d.temperature_2m_max[i]),low:number(d.temperature_2m_min[i]),precipitationProbability:d.precipitation_probability_max?.[i]==null?null:number(d.precipitation_probability_max[i])}))}
}
export class OpenMeteoProvider implements WeatherProvider {
 private apiKey:string
 private request:typeof fetch
 constructor(apiKey='',request:typeof fetch=fetch){this.apiKey=apiKey;this.request=request}
 private async get(url:URL) {
  try {
   const response=await this.request(url,{signal:AbortSignal.timeout(10000)})
   if(!response.ok)throw new WeatherDiagnosticError('provider_forecast','provider_unavailable')
   return await response.json()
  }catch(error){
   if(error instanceof WeatherDiagnosticError)throw error
   throw new WeatherDiagnosticError('provider_forecast',error instanceof Error&&error.name==='TimeoutError'?'timeout':'provider_unavailable')
  }
 }
 async search(query:string):Promise<WeatherLocation[]> {
  // Preserve region qualifiers: the provider supports city, state and postal-code searches.
  const url=new URL(this.apiKey?'https://customer-geocoding-api.open-meteo.com/v1/search':'https://geocoding-api.open-meteo.com/v1/search');url.search=new URLSearchParams({name:query,count:'10',language:'en',format:'json'}).toString()
  if(this.apiKey)url.searchParams.set('apikey',this.apiKey)
  const raw=await this.get(url) as {results?:{name:string;admin1?:string;country?:string;latitude:number;longitude:number}[]}
  return (raw.results??[]).map(r=>({label:[r.name,r.admin1,r.country].filter(Boolean).join(', '),latitude:number(r.latitude),longitude:number(r.longitude)}))
 }
 async forecast(location:WeatherLocation,timeZone:string) {
  const url=new URL(this.apiKey?'https://customer-api.open-meteo.com/v1/forecast':'https://api.open-meteo.com/v1/forecast')
  url.search=new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),timezone:timeZone,temperature_unit:'celsius',forecast_days:'7',current:'temperature_2m,weather_code',daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'}).toString()
  if(this.apiKey)url.searchParams.set('apikey',this.apiKey)
  const raw=await this.get(url)
  return weatherStage('forecast_normalization','unknown',async()=>normalizeForecast(raw,timeZone))
 }
}
