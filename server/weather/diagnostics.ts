const stages = ['household_lookup','provider_forecast','forecast_normalization','finish_refresh'] as const
const categories = ['household_unavailable','provider_unavailable','timeout','invalid_forecast_horizon','invalid_weather_number','invalid_weather_date','unsupported_weather_condition','database_finish_failed','unknown'] as const
export type WeatherStage = typeof stages[number]
export type WeatherCategory = typeof categories[number]
/** Contains only controlled metadata; never attach the original exception or response. */
export class WeatherDiagnosticError extends Error {
 readonly stage:WeatherStage
 readonly category:WeatherCategory
 constructor(stage:WeatherStage,category:WeatherCategory) {
  super(category==='provider_unavailable'?'Weather provider unavailable':'Weather refresh unavailable')
  this.name='WeatherDiagnosticError';this.stage=stage;this.category=category
 }
}
export async function weatherStage<T>(stage:WeatherStage,fallback:WeatherCategory,work:()=>Promise<T>):Promise<T> {
 try{return await work()}catch(error){
  if(error instanceof WeatherDiagnosticError)throw error
  throw new WeatherDiagnosticError(stage,fallback)
 }
}
export function logWeatherFailure(error:unknown) {
 // Runtime allowlists also protect against malformed/forged error metadata.
 const stage=error instanceof WeatherDiagnosticError&&stages.includes(error.stage)?error.stage:'provider_forecast'
 const category=error instanceof WeatherDiagnosticError&&categories.includes(error.category)?error.category:'unknown'
 console.error(JSON.stringify({event:'weather_refresh_failed',stage,category}))
}
