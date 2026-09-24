import { cropRectangle, imageSignature, renditionSize, validateImageDimensions, validateImageFile, type ImagePresentation } from './images'
export async function decodeImage(blob:Blob):Promise<HTMLImageElement> {
 validateImageFile(blob)
 if (imageSignature(new Uint8Array(await blob.slice(0,12).arrayBuffer()))!==blob.type) throw new Error('The image contents do not match its file type.')
 const url=URL.createObjectURL(blob)
 try {
  const image=new Image();image.src=url
  await image.decode().catch(()=>{throw new Error('This image could not be read. Choose another JPEG, PNG or WebP.')})
  validateImageDimensions(image.naturalWidth,image.naturalHeight)
  return image
 } finally {URL.revokeObjectURL(url)}
}
export function imageCanvas(image:HTMLImageElement,presentation:ImagePresentation,preview=false) {
 const crop=cropRectangle(image.naturalWidth,image.naturalHeight,presentation)
 const size=renditionSize(crop.width,crop.height,presentation.preset,preview)
 const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height
 const context=canvas.getContext('2d');if(!context) throw new Error('Image processing is unavailable.')
 context.imageSmoothingQuality='high'
 context.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,size.width,size.height)
 return canvas
}
export async function renderImage(image:HTMLImageElement,presentation:ImagePresentation) {
 return new Promise<Blob>((resolve,reject)=>imageCanvas(image,presentation).toBlob(blob=>blob?resolve(blob):reject(new Error('Image processing failed.')),'image/webp',.9))
}
