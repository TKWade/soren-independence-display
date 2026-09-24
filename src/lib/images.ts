export type ImagePreset = 'people' | 'places' | 'activities'
export interface ImagePresentation { version:1; preset:ImagePreset; x:number; y:number; zoom:number }
export const imagePresets = {
 people:{aspect:1,width:768,height:768},
 places:{aspect:4/3,width:1280,height:960},
 activities:{aspect:1,width:960,height:960},
} as const
export const maxSourceBytes = 10 * 1024 * 1024
export const supportedImageTypes = ['image/jpeg','image/png','image/webp']
export function validateImageFile(file:{size:number;type:string}) {
 if (!supportedImageTypes.includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.')
 if (file.size < 1 || file.size > maxSourceBytes) throw new Error('Choose an image up to 10 MB.')
}
export function validateImageDimensions(width:number,height:number) {
 if (!Number.isInteger(width)||!Number.isInteger(height)||width<64||height<64) throw new Error('The image must be at least 64 × 64 pixels.')
 if (width>12000||height>12000||width*height>40_000_000) throw new Error('The image is too large. Choose up to 40 megapixels and 12,000 pixels per side.')
}
export function imageSignature(bytes:Uint8Array) {
 if (bytes[0]===255&&bytes[1]===216&&bytes[2]===255) return 'image/jpeg'
 if ([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return 'image/png'
 if (String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP') return 'image/webp'
 return null
}
const finite = (value:unknown,fallback:number,min:number,max:number) => typeof value==='number'&&Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback
export function normalizePresentation(preset:ImagePreset,value?:Partial<ImagePresentation>|null):ImagePresentation {
 return {version:1,preset,x:finite(value?.x,.5,0,1),y:finite(value?.y,.5,0,1),zoom:finite(value?.zoom,1,1,3)}
}
export function cropRectangle(width:number,height:number,presentation:ImagePresentation) {
 const p=normalizePresentation(presentation.preset,presentation), aspect=imagePresets[p.preset].aspect
 const cropWidth=Math.min(width,height*aspect)/p.zoom, cropHeight=cropWidth/aspect
 return {x:(width-cropWidth)*p.x,y:(height-cropHeight)*p.y,width:cropWidth,height:cropHeight}
}
export function renditionSize(width:number,height:number,preset:ImagePreset,preview=false) {
 const target=imagePresets[preset], scale=Math.min(1,(preview?320:target.width)/width,(preview?320:target.height)/height)
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))}
}
