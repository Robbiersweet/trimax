"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {remittanceDeadline} from '../lib/remittanceDeadline';
import {acquireStillAndRelease} from '../lib/cameraArtifacts';
import {FULL_STILL,photoConstructor,prepareStillReview,projectStillGuide,requestFullStill,type FractionRect,type StillArtifact} from '../lib/highResolutionStill';
type Props={onCapture:(file:File,source:'camera'|'existing',original?:StillArtifact)=>void;onCancel:()=>void;onManual:()=>void};
/** Existing live guide; only ImageCapture.takePhoto or an explicit device still supplies pixels. */
export default function RemittanceCamera({onCapture,onCancel,onManual}:Props){
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),active=useRef(true),capturing=useRef(false),guide=useRef<HTMLDivElement>(null),nativeInput=useRef<HTMLInputElement>(null),ownedUrls=useRef(new Set<string>());
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[generation,setGeneration]=useState(0),[landscape,setLandscape]=useState(false),[ratio,setRatio]=useState(4/3),[viewport,setViewport]=useState({width:0,height:0,left:0,top:0});
 const [originalFile,setOriginalFile]=useState<{file:File;url:string}|null>(null),[nativeReason,setNativeReason]=useState('');
 const snapshot=useRef<{videoWidth:number;videoHeight:number;guide:FractionRect}|null>(null);
 function stop(){stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;if(video.current)video.current.srcObject=null;}
 useEffect(()=>{
  active.current=true;let cancelled=false,expired=false;const urls=ownedUrls.current,previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';document.body.classList.add('trimax-remittance-capture-active');window.dispatchEvent(new Event('trimax-remittance-capture-mode'));
  const update=()=>{const vv=window.visualViewport,width=vv?.width??window.innerWidth,height=vv?.height??window.innerHeight;setViewport({width,height,left:vv?.offsetLeft??0,top:vv?.offsetTop??0});setLandscape(width>height);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')onCancel();};
  const hidden=()=>{if(document.hidden){stop();setReady(false);setError('Camera paused. Your captured still, if present, remains available.');}};
  update();window.addEventListener('resize',update);window.addEventListener('orientationchange',update);window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);window.addEventListener('keydown',escape);document.addEventListener('visibilitychange',hidden);
  void(async()=>{try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Live camera unavailable. Use the device camera for a still photo.');
   const pending=navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:4096},height:{ideal:2160}}});
   void pending.then(result=>{if(cancelled||expired)result.getTracks().forEach(track=>track.stop());},()=>{});
   const result=await remittanceDeadline(pending,15_000,'Live camera did not open. Retry or use the device camera.');
   if(cancelled||document.hidden){result.getTracks().forEach(track=>track.stop());return;}
   stream.current=result;const element=video.current;if(!element)throw Error('Camera preview unavailable. Retry Camera.');element.srcObject=result;
   await remittanceDeadline(element.play(),10_000,'Camera preview did not start. Retry or use the device camera.');
   if(!cancelled){setRatio(element.videoWidth/element.videoHeight||4/3);setReady(true);}
   result.getVideoTracks()[0]?.addEventListener('ended',()=>{if(!cancelled){setReady(false);}});
  }catch(reason){expired=true;if(!cancelled){stop();setNativeReason('Live guidance is unavailable. Device camera takes a still photo; no video-frame fallback is used.');setError(reason instanceof Error?`Camera unavailable: ${reason.message}. Use the device camera or retry.`:'Camera unavailable. Use the device camera.');}}})();
  return()=>{cancelled=true;active.current=false;stop();document.body.style.overflow=previousOverflow;document.body.classList.remove('trimax-remittance-capture-active');window.dispatchEvent(new Event('trimax-remittance-capture-mode'));window.removeEventListener('resize',update);window.removeEventListener('orientationchange',update);window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);window.removeEventListener('keydown',escape);document.removeEventListener('visibilitychange',hidden);urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();};
 },[generation,onCancel]);
 function openNative(){stop();setReady(false);nativeInput.current?.click();}
 async function acceptStill(file:File,method:StillArtifact['method']){
  const originalUrl=URL.createObjectURL(file);ownedUrls.current.add(originalUrl);setOriginalFile({file,url:originalUrl});
  const prepared=await prepareStillReview(file);
  if(!active.current){prepared.canvas.width=0;prepared.canvas.height=0;return;}
  const guideBox=method==='image-capture'&&snapshot.current?projectStillGuide(snapshot.current.videoWidth,snapshot.current.videoHeight,prepared.canvas.width,prepared.canvas.height,snapshot.current.guide):null;
  const artifact:StillArtifact={file,width:prepared.width,height:prepared.height,orientation:prepared.orientation,method,crop:{...FULL_STILL},guide:guideBox,videoWidth:snapshot.current?.videoWidth??0,videoHeight:snapshot.current?.videoHeight??0};
  // The guide is advisory, never a crop boundary. Forward untouched still bytes to
  // the same normalization/document-isolation/OCR path used by existing photos.
  prepared.canvas.width=0;prepared.canvas.height=0;
  setError('');onCapture(file,'camera',artifact);
 }
 async function capture(){
  if(capturing.current||!ready||!landscape)return;capturing.current=true;setBusy(true);setError('');
  try{
   const element=video.current;if(!element?.videoWidth||!element.videoHeight)throw Error('Camera not ready. Retry Camera.');
   const v=element.getBoundingClientRect(),g=guide.current?.getBoundingClientRect();if(!g||!v.width||!v.height)throw Error('Framing guide unavailable. Retry Camera.');
   snapshot.current={videoWidth:element.videoWidth,videoHeight:element.videoHeight,guide:{left:(g.left-v.left)/v.width,top:(g.top-v.top)/v.height,width:g.width/v.width,height:g.height/v.height}};
   const ctor=photoConstructor(),track=stream.current?.getVideoTracks()[0];
   if(!ctor||!track){setNativeReason('High-resolution still capture is unsupported here. Choose Open device camera for a still photo; no video frame is used.');stop();setReady(false);return;}
   const blob=await acquireStillAndRelease(()=>remittanceDeadline(requestFullStill(track,ctor),15_000,'Still capture timed out. Use the device camera.'),stop,{});
   if(!active.current)return;setReady(false);
   await acceptStill(new File([blob],`remittance-still-${Date.now()}.${blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg'}`,{type:blob.type||'image/jpeg'}),'image-capture');
  }catch(reason){if(active.current){stop();setReady(false);setNativeReason('Still capture was not completed. Use the device camera; no video frame will be substituted.');setError(reason instanceof Error?reason.message:'Capture failed. Use the device camera.');}}
  finally{capturing.current=false;if(active.current)setBusy(false);}
 }
 const nativePicker=<input ref={nativeInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Device camera still photo" className="sr-only" onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file)return;capturing.current=true;setBusy(true);void acceptStill(file,'native-camera').catch(e=>{if(active.current)setError(e instanceof Error?e.message:'Still could not be prepared. Original retained.');}).finally(()=>{capturing.current=false;if(active.current)setBusy(false);});}}/>;
 const width=Math.max(1,Math.min(viewport.width-(landscape?220:32),(viewport.height-(landscape?32:260))*ratio));
 return createPortal(<div role="dialog" aria-modal="true" aria-label="Remittance camera" className="fixed z-[2147483000] flex overflow-hidden bg-black text-white" style={{left:viewport.left,top:viewport.top,width:viewport.width||'100vw',height:viewport.height||'100dvh',flexDirection:landscape?'row':'column',padding:'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))'}}>
  {nativePicker}<button autoFocus type="button" onClick={onCancel} className="absolute left-[max(12px,env(safe-area-inset-left))] top-[max(12px,env(safe-area-inset-top))] z-10 min-h-11 rounded-xl border border-white/40 bg-black/70 px-4">Cancel</button>
  <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center"><div className="relative max-h-full max-w-full overflow-hidden" style={{width,aspectRatio:ratio}}>
   <video ref={video} muted playsInline autoPlay disablePictureInPicture className="block h-full w-full object-contain" onResize={event=>{const el=event.currentTarget;if(el.videoHeight)setRatio(el.videoWidth/el.videoHeight);}}/>
   {ready&&<div ref={guide} aria-label="Document framing guide" className="pointer-events-none absolute left-[7%] right-[7%] top-1/2 -translate-y-1/2 rounded-xl border-[3px] border-white shadow-[0_0_0_100vmax_#0006]" style={{aspectRatio:'2.6 / 1',maxHeight:'80%'}}/>}
  </div></div>
  <div className="flex shrink-0 flex-col justify-center gap-2 overflow-y-auto p-2 text-center" style={{width:landscape?196:'100%'}}>
   <p aria-live="polite" className="font-bold">{!landscape?'Rotate phone to landscape':'Place the full remittance stub inside the frame.'}</p><p className="text-xs text-zinc-200">Keep all four paper edges visible.</p>
   {error?<p role="alert" className="text-sm text-amber-200">{error}</p>:<p role="status" className="text-sm">{busy?'Capturing still…':ready?'Ready to capture a high-resolution still':nativeReason?'Choose device camera for a still photo':'Opening camera…'}</p>}
   <button type="button" disabled={!ready||!landscape||busy} onClick={()=>void capture()} className="min-h-12 rounded-full bg-white px-4 py-3 font-bold text-black disabled:opacity-40">{busy?'Capturing…':'Capture'}</button>
   {nativeReason&&<><p className="text-xs text-amber-100">{nativeReason}</p><button type="button" disabled={busy} onClick={openNative} className="min-h-11 rounded-xl border border-white/40">Open device camera — still photo</button></>}
   {originalFile&&<a href={originalFile.url} download={originalFile.file.name} className="min-h-11 rounded border px-2 py-3">Save original photo</a>}
   {error&&<button type="button" disabled={busy} onClick={()=>{setReady(false);setNativeReason('');setError('');setGeneration(x=>x+1);}} className="min-h-11 rounded-xl border border-white/40">Retry Camera</button>}
   <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-white/40 px-2 text-sm">Choose Existing Photo<input type="file" accept="image/*,.heic,.heif" className="sr-only" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file){stop();onCapture(file,'existing');}}}/></label>
   <button type="button" onClick={onManual} className="min-h-11 text-sm underline">Enter Manually</button>
  </div>
 </div>,document.body);
}
