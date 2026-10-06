import type {WeatherForecast,WeatherLocation} from '../../src/weather/types.ts'
export interface WeatherProvider {
 search(query:string):Promise<WeatherLocation[]>
 forecast(location:WeatherLocation,timeZone:string):Promise<WeatherForecast>
}
