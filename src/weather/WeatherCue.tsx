import type {WeatherCondition,HouseholdWeather} from './types'
import {weatherForDate,weatherLabels,temperature} from './presentation'
import './weather.css'
/** Shared flat SVG artwork, independent of provider codes. */
export function WeatherIcon({condition}:{condition:WeatherCondition}) {
 const sun=condition==='sunny'||condition==='partly-cloudy'
 return <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" fill="none" stroke="#173d50" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
 {sun&&<g transform={condition==='partly-cloudy'?'translate(-5 -7)':undefined}><circle cx="26" cy="25" r="11" fill="#f6ca51"/>{[[26,5,26,9],[26,41,26,45],[6,25,10,25],[42,25,46,25],[12,11,15,14],[37,36,40,39],[12,39,15,36],[37,14,40,11]].map((p,i)=><path key={i} d={`M${p[0]} ${p[1]}L${p[2]} ${p[3]}`}/>)}</g>}
 {!['sunny','windy'].includes(condition)&&<path d="M15 40a10 10 0 0 1 0-20 15 15 0 0 1 29-1 11 11 0 0 1 5 21Z" fill="#dcebf0"/>}
 {condition==='rain'&&<path d="m20 47-3 7m16-7-3 7m16-7-3 7" stroke="#267da5"/>}
 {condition==='storm'&&<path d="m33 36-9 14h10l-5 10 16-18H34l6-6" fill="#f6ca51"/>}
 {condition==='snow'&&<path d="M20 47v10m-4-8 8 6m0-6-8 6m27-8v10m-4-8 8 6m0-6-8 6"/>}
 {condition==='fog'&&<path d="M10 48h44M16 56h33"/>}
 {condition==='windy'&&<path d="M7 24h35c14 0 14-18 3-16M7 34h45M7 44h28c14 0 14 15 3 14"/>}
 </svg>
}
export function WeatherCue({weather,date,now,zone,detail='simple',day=false}:{weather?:HouseholdWeather;date:string;now:Date;zone:string;detail?:'simple'|'standard';day?:boolean}) {
 const value=weatherForDate(weather,date,now,zone);if(!value)return null
 const {daily,current,unit}=value,condition=day&&current?current.condition:daily.condition
 const main=temperature(day&&current?current.temperature:daily.high,unit)
 return <span className="weather-cue" data-detail={detail} role="img" aria-label={`${weatherLabels[condition]}, ${day&&current?'currently':'high'} ${main} ${unit}${detail==='standard'?`, low ${temperature(daily.low,unit)}`:''}`}>
  <WeatherIcon condition={condition}/><span>{detail==='standard'&&<span className="weather-condition">{weatherLabels[condition]} </span>}<strong>{main}</strong>{detail==='standard'&&<span className="weather-range"> H {temperature(daily.high,unit)} / L {temperature(daily.low,unit)}</span>}</span>
 </span>
}
