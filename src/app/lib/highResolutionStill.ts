import {jpegOrientation,orientationTransform} from './ocrOptical';
export type FractionRect={left:number;top:number;width:number;height:number};
export type StillArtifact={file:File;width:number;height:number;orientation:number|null;method:'image-capture'|'native-camera';crop:FractionRect;guide:FractionRect|null;videoWidth:number;videoHeight:number};
type PhotoDevice={takePhoto:(settings?:{imageWidth:number;imageHeight:number})=>Promise<Blob>;getPhotoCapabilities?:()=>Promise<{imageWidth?:{max:number};imageHeight?:{max:number}}>};
export type PhotoConstructor=new(track:MediaStreamTrack)=>PhotoDevice;
export function photoConstructor():PhotoConstructor|null {
 const ctor=(window as typeof window&{ImageCapture?:PhotoConstructor}).ImageCapture;
 return typeof ctor==='function'?ctor:null;
}
export const FULL_STILL:FractionRect={left:0,top:0,width:1,height:1};
export function validCrop(crop:FractionRect):boolean {
 return Object.values(crop).every(Number.isFinite)&&crop.left>=0&&crop.top>=0&&crop.width>0&&crop.height>0&&crop.left+crop.width<=1.000001&&crop.top+crop.height<=1.000001;
}
/** Centered sensor-aspect projection, shown only as a suggestion. Still review
 * is mandatory: browser APIs do not promise identical photo/video field of view. */
export function projectStillGuide(videoWidth:number,videoHeight:number,stillWidth:number,stillHeight:number,guide:FractionRect):FractionRect|null {
 if(![videoWidth,videoHeight,stillWidth,stillHeight].every(n=>Number.isFinite(n)&&n>0)||!validCrop(guide))return null;
 if((videoWidth>videoHeight)!==(stillWidth>stillHeight))return null;
 const videoAspect=videoWidth/videoHeight,stillAspect=stillWidth/stillHeight;
 const visibleWidth=stillAspect>videoAspect?videoAspect/stillAspect:1;
 const visibleHeight=stillAspect<videoAspect?stillAspect/videoAspect:1;
 return {left:(1-visibleWidth)/2+guide.left*visibleWidth,top:(1-visibleHeight)/2+guide.top*visibleHeight,width:guide.width*visibleWidth,height:guide.height*visibleHeight};
}
export async function requestFullStill(track:MediaStreamTrack,ctor:PhotoConstructor):Promise<Blob> {
 const device=new ctor(track);
 if(typeof device.takePhoto!=='function')throw Error('High-resolution still capture is unavailable. Use the device camera.');
 // August 29 ImageCapture.takePhoto acquisition, with the highest advertised
 // still dimensions where the API supplies them. Never acquire a video canvas.
 const capabilities=await device.getPhotoCapabilities?.();
 const width=capabilities?.imageWidth?.max,height=capabilities?.imageHeight?.max;
 const settings=width&&height&&Number.isFinite(width)&&Number.isFinite(height)?{imageWidth:width,imageHeight:height}:undefined;
 const blob=await device.takePhoto(settings);
 if(!blob.size)throw Error('The camera returned an empty still. Use the device camera.');
 return blob;
}
export async function prepareStillReview(file:File) {
 if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('Keep this original photo. Choose a JPEG, PNG or WebP still for secure upload.');
 if(file.size>8_000_000)throw Error('This original exceeds the secure upload limit. Save it and choose a smaller still file; video capture will not be substituted.');
 const bytes=new Uint8Array(await file.arrayBuffer()),info=jpegOrientation(bytes),o=info.orientation??1;
 if(info.offset!==null)new DataView(bytes.buffer).setUint16(info.offset,1,info.littleEndian);
 const url=URL.createObjectURL(new Blob([bytes],{type:file.type}));
 try {
  const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const value=new Image();value.onload=()=>resolve(value);value.onerror=()=>reject(Error('Still photo could not be decoded. The original is retained.'));value.src=url;});
  const width=image.naturalWidth,height=image.naturalHeight;
  if(!width||!height||width*height>48_000_000)throw Error('Still dimensions exceed the supported image limit. Save the original and choose another still.');
  const canvas=document.createElement('canvas');canvas.width=o>=5?height:width;canvas.height=o>=5?width:height;
  const context=canvas.getContext('2d');if(!context)throw Error('Still review canvas unavailable.');
  context.setTransform(...orientationTransform(o,width,height));context.drawImage(image,0,0);
  return {canvas,width,height,orientation:info.orientation};
 }finally{URL.revokeObjectURL(url);}
}
export async function selectedStillCrop(canvas:HTMLCanvasElement,crop:FractionRect):Promise<File> {
 if(!validCrop(crop))throw Error('Crop must stay inside the original still.');
 const left=Math.floor(crop.left*canvas.width),top=Math.floor(crop.top*canvas.height);
 const width=Math.min(canvas.width-left,Math.max(1,Math.round(crop.width*canvas.width))),height=Math.min(canvas.height-top,Math.max(1,Math.round(crop.height*canvas.height)));
 const output=document.createElement('canvas');output.width=width;output.height=height;
 const context=output.getContext('2d');if(!context)throw Error('Crop canvas unavailable.');
 context.drawImage(canvas,left,top,width,height,0,0,width,height);
 // Review/crop is lossless. The existing OCR preparation owns JPEG normalization.
 const blob=await new Promise<Blob>((resolve,reject)=>output.toBlob(b=>b?resolve(b):reject(Error('Could not prepare crop. Original retained.')),'image/png'));
 output.width=0;output.height=0;
 return new File([blob],`remittance-still-crop-${Date.now()}.png`,{type:'image/png'});
}
