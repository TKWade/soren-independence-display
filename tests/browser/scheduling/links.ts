/** Navigation is supplied by the isolated host; local fixture URLs remain supported. */
export interface PrototypeLinks {family:string;residential:string;tasks:string;home?:string}
export const fixtureLinks:PrototypeLinks={
 family:'./scheduling-prototype.html?scenario=family',
 residential:'./scheduling-prototype.html?scenario=residential',
 tasks:'./scheduling-tasks.html',
}
