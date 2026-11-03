'use client';
/* eslint-disable @next/next/no-img-element -- Local private still review; no external image optimization. */
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {FULL_STILL,selectedStillCrop,type FractionRect,type StillArtifact} from '../lib/highResolutionStill';
type Props={canvas:HTMLCanvasElement;preview:string;original:StillArtifact;originalUrl:string;viewport:{width:number;height:number};landscape:boolean;onCancel:()=>void;onRetake:()=>void;onUse:(file:File,original:StillArtifact)=>void};
export default function StillCropReview({canvas,preview,original,originalUrl,viewport,landscape,onCancel,onRetake,onUse}:Props){
 const [crop,setCrop]=useState<FractionRect>({...FULL_STILL}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const active=useRef(true),saving=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false;canvas.width=0;canvas.height=0;};},[canvas]);
 async function confirmPhoto(){
  if(saving.current)return;saving.current=true;setBusy(true);setError('');
  try{const file=await selectedStillCrop(canvas,crop);if(active.current)onUse(file,{...original,crop:{...crop}});}
  catch(e){if(active.current)setError(e instanceof Error?e.message:'Crop failed. Original retained.');}
  finally{saving.current=false;if(active.current)setBusy(false);}
 }
 return createPortal(<div role="dialog" aria-modal="true" aria-label="Review still crop" className="fixed inset-0 z-[2147483000] flex overflow-auto bg-black p-4 text-white" style={{flexDirection:landscape?'row':'column'}}>
  <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
   <div className="relative" style={{width:Math.max(1,Math.min(viewport.width-(landscape?260:32),(viewport.height-(landscape?32:350))*(canvas.width/canvas.height))),aspectRatio:canvas.width/canvas.height}}>
    <img src={preview} alt="Full still photograph for crop review" className="block h-full w-full object-contain"/>
    {original.guide&&<div aria-label="Projected live guide suggestion" className="pointer-events-none absolute border-2 border-dashed border-sky-400" style={{left:original.guide.left*100+'%',top:original.guide.top*100+'%',width:original.guide.width*100+'%',height:original.guide.height*100+'%'}}/>}
    <div aria-label="Selected still crop" className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_100vmax_#0007]" style={{left:crop.left*100+'%',top:crop.top*100+'%',width:crop.width*100+'%',height:crop.height*100+'%'}}/>
   </div>
  </div>
  <div className="flex shrink-0 flex-col gap-2 overflow-y-auto p-2 text-sm" style={{width:landscape?228:'100%'}}>
   <p className="font-bold">Review the still photo</p>
   <p>{original.method==='image-capture'?'High-resolution camera still':'Device camera still'} · {canvas.width} × {canvas.height}</p>
   <p>Include every invoice row, the check header and total. The full original is retained.</p>
   {original.guide&&<p className="text-xs">The dashed guide assumes centered framing. Check the actual photo before using it.</p>}
   {(['left','top','right','bottom'] as const).map(edge=>{const value=edge==='left'?crop.left:edge==='top'?crop.top:edge==='right'?crop.left+crop.width:crop.top+crop.height;return <label key={edge}>Crop {edge}<input className="block w-full" aria-label={'Crop '+edge} type="range" min="0" max="100" step="1" value={Math.round(value*100)} disabled={busy} onChange={event=>{const x=Number(event.target.value)/100;setCrop(c=>{const right=c.left+c.width,bottom=c.top+c.height;if(edge==='left'){const left=Math.min(x,right-.05);return{...c,left,width:right-left};}if(edge==='right')return{...c,width:Math.max(x,c.left+.05)-c.left};if(edge==='top'){const top=Math.min(x,bottom-.05);return{...c,top,height:bottom-top};}return{...c,height:Math.max(x,c.top+.05)-c.top};});}}/></label>})}
   <button type="button" className="min-h-11 rounded border px-3" disabled={busy} onClick={()=>setCrop({...FULL_STILL})}>Use full photo</button>
   {original.guide&&<button type="button" className="min-h-11 rounded border px-3" disabled={busy} onClick={()=>setCrop({...original.guide!})}>Use guide suggestion</button>}
   <a className="min-h-11 rounded border px-3 py-3" href={originalUrl} download={original.file.name}>Save original photo</a>
   {error&&<p role="alert">{error}</p>}
   <button type="button" className="min-h-12 rounded-full bg-white px-3 font-bold text-black disabled:opacity-40" disabled={busy} onClick={()=>void confirmPhoto()}>{busy?'Preparing crop…':'Use photo and read remittance'}</button>
   <button type="button" className="min-h-11 rounded border px-3" disabled={busy} onClick={onRetake}>Retake photo</button>
   <button type="button" className="min-h-11 underline" disabled={busy} onClick={onCancel}>Cancel</button>
  </div>
 </div>,document.body);
}
