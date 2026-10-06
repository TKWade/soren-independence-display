import type {HouseholdWeather,TemperatureUnit} from './types.ts'
export const weatherLabels={sunny:'SUNNY','partly-cloudy':'PARTLY CLOUDY',cloudy:'CLOUDY',rain:'RAIN',storm:'STORM',snow:'SNOW',fog:'FOG',windy:'WINDY'}
export function temperature(value:number,unit:TemperatureUnit) {return Math.round(unit==='fahrenheit'?value*9/5+32:value)+'°'}
export function weatherForDate(weather:HouseholdWeather|undefined,date:string,now:Date,zone:string) {
 if(!weather?.enabled||!weather.location||!weather.forecast||weather.forecast.timeZone!==zone) return null
 const age=now.getTime()-Date.parse(weather.forecast.fetchedAt)
 if(!Number.isFinite(age)||age< -300000||age>24*60*60*1000) return null
 const daily=weather.forecast.daily.find(d=>d.date===date)
 if(!daily) return null
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
 const current=age<=60*60*1000&&date===today&&weather.forecast.current.date===date?weather.forecast.current:undefined
 return {daily,current,unit:weather.temperature_unit,stale:weather.refresh_failed||age>60*60*1000}
}
