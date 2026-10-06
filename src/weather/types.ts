export type WeatherCondition = 'sunny'|'partly-cloudy'|'cloudy'|'rain'|'storm'|'snow'|'fog'|'windy'
export type TemperatureUnit = 'fahrenheit'|'celsius'
export interface WeatherLocation {label:string;latitude:number;longitude:number}
/** Temperatures are always Celsius in storage; conversion is presentation-only. */
export interface DailyWeather {date:string;condition:WeatherCondition;high:number;low:number;precipitationProbability:number|null}
export interface CurrentWeather {date:string;temperature:number;condition:WeatherCondition}
export interface WeatherForecast {timeZone:string;fetchedAt:string;current:CurrentWeather;daily:DailyWeather[]}
export interface HouseholdWeather {
 household_id:string;enabled:boolean;location:WeatherLocation|null;temperature_unit:TemperatureUnit;
 revision:number;forecast:WeatherForecast|null;last_attempt_at:string|null;last_success_at:string|null;refresh_failed:boolean
}
