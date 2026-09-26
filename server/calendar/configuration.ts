/** Reject invalid raw configuration before WHATWG URL parsing can normalize it. Never use for secrets. */
export function configurationUrl(value:string):URL {
 // Control characters are rejected deliberately before URL parsing normalizes them.
 // eslint-disable-next-line no-control-regex
 if(!value || value!==value.trim() || /[\s\u0000-\u001f\u007f\\]/u.test(value) || /%0[ad]/i.test(value) || /%(?![0-9a-f]{2})/i.test(value) || !/^https?:\/\//.test(value)) throw new Error('Invalid URL configuration')
 const url=new URL(value)
 const authority=value.split('/')[2]
 if(!authority || !url.hostname || authority.includes('@') || url.username || url.password || !(url.protocol==='https:' || (url.protocol==='http:' && url.hostname==='localhost'))) throw new Error('Invalid URL configuration')
 return url
}
export function validateAllowedOrigins(values:string[]):void {
 if(!values.length) throw new Error('Missing allowed origins')
 for(const value of values) if(configurationUrl(value).origin!==value) throw new Error('Invalid origin configuration')
}
export function parseAllowedOrigins(value:string):string[] {
 const origins=value.split(',')
 validateAllowedOrigins(origins)
 return origins
}
