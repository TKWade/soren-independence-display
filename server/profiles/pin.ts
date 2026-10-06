// WebCrypto is available in Supabase Edge (Deno) and Node; no native addon.
const iterations=600_000
const encode=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')
const decode=(value:string)=>Uint8Array.from(value.match(/../g)??[],part=>parseInt(part,16))
export const validPin=(value:unknown):value is string=>typeof value==='string'&&/^\d{4,8}$/.test(value)
async function derive(pin:string,salt:Uint8Array) {
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits'])
 return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new Uint8Array(salt),iterations},key,256))
}
export async function hashPin(pin:string):Promise<string> {
 if(!validPin(pin))throw new Error('Invalid PIN format')
 const salt=crypto.getRandomValues(new Uint8Array(32))
 return `pbkdf2-sha256$${iterations}$${encode(salt)}$${encode(await derive(pin,salt))}`
}
export async function verifyPin(pin:string,hash:string):Promise<boolean> {
 if(!validPin(pin)||!/^pbkdf2-sha256\$600000\$[a-f0-9]{64}\$[a-f0-9]{64}$/.test(hash))return false
 const [, ,salt,value]=hash.split('$'),actual=await derive(pin,decode(salt)),expected=decode(value)
 let different=0;for(let i=0;i<actual.length;i++)different|=actual[i]^expected[i]
 return different===0
}
