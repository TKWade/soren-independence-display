import type {HouseholdWeather,WeatherCondition} from '../../src/weather/types'
import {dateKey} from '../../src/lib/schedule'
export function fixtureWeather(now:Date,zone:string):HouseholdWeather {
 const conditions:WeatherCondition[]=['sunny','partly-cloudy','cloudy','rain','storm','snow','fog']
 return {household_id:'h',enabled:true,location:{label:'Salina, Kansas, United States',latitude:38.84,longitude:-97.61},temperature_unit:'fahrenheit',revision:1,last_attempt_at:now.toISOString(),last_success_at:now.toISOString(),refresh_failed:false,
 forecast:{timeZone:zone,fetchedAt:now.toISOString(),current:{date:dateKey(now,zone),condition:'sunny',temperature:22},daily:Array.from({length:7},(_,i)=>({date:dateKey(new Date(now.getTime()+i*86400000),zone),condition:conditions[i],high:26-i,low:14-i,precipitationProbability:0}))}}
}
