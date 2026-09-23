import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { directionEvidence } from './ocrFaint.ts';
import { prepareDirectionSamples } from './ocrDirectionSamples.ts';

export type DirectionWorker = Pick<Worker,'recognize'|'setParameters'|'terminate'>;
type Costs = { initializationMs:number; configurationMs:number; imageProcessingMs:number; recognitionMs:number; cleanupMs:number; scoringMs:number };
type Observation = {
  rotation:number; started:boolean; recognitionStarted:boolean;
  status:'completed'|'timed-out'|'errored'; durationMs:number; score:number;
  credible:boolean; words:number; unique:number; lines:number; rawText:string;
  signals:{headers:number;money:number;dates:number}; error?:string;
  sampleDimensions?:{width:number;height:number}; costs:Costs;
};
const costs=():Costs=>({initializationMs:0,configurationMs:0,imageProcessingMs:0,recognitionMs:0,cleanupMs:0,scoringMs:0});
class DirectionTimeout extends Error {}
async function bounded<T>(promise:Promise<T>,ms:number,message:string){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new DirectionTimeout(message)),ms);})]);}finally{clearTimeout(timer);}}

/** Shared optical preparation only. No invoice resolution or payment decisions.
 * V2 retains its page-preview inputs and complete-comparison acceptance contract.
 * Legacy samples bounded text bands to avoid segmenting the photographed desk. */
export async function selectDocumentDirection(input:Buffer,options:{sampling:'text-bands'|'page-preview';requireAll?:boolean},factory?:()=>Promise<DirectionWorker>){
  const start=performance.now(),startedAt=new Date().toISOString(),timings=costs();
  const measured=async<T>(key:keyof Costs,fn:()=>Promise<T>,local?:Costs)=>{const t=performance.now();try{return await fn();}finally{const ms=performance.now()-t;timings[key]+=ms;if(local)local[key]+=ms;}};
  const prepared=await measured('imageProcessingMs',async()=>{
    if(options.sampling==='text-bands')return prepareDirectionSamples(input);
    const image=await sharp(input).resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).png().toBuffer();
    const meta=await sharp(image).metadata();
    return {axes:[{angle:0,image,regions:[],width:meta.width!,height:meta.height!}],componentCount:null,sourceDimensions:{width:meta.width!,height:meta.height!}};
  });
  const cachePath=join(tmpdir(),'trimax-v2-tesseract');await mkdir(cachePath,{recursive:true});
  const make=factory??(()=>createWorker('eng',OEM.LSTM_ONLY,{cachePath,gzip:true,logger:()=>undefined}));
  let worker:DirectionWorker|undefined,workersCreated=0,initializationError:string|undefined;
  const observations:Observation[]=[];
  async function release(local?:Costs){const old=worker;worker=undefined;if(old)await measured('cleanupMs',()=>old.terminate().catch(()=>undefined),local);}
  try{
    for(const rotation of [0,90,180,270]){
      const begin=performance.now();
      const o:Observation={rotation,started:true,recognitionStarted:false,status:'errored',durationMs:0,score:0,credible:false,words:0,unique:0,lines:0,rawText:'',signals:{headers:0,money:0,dates:0},costs:costs()};
      try{
        if(initializationError)throw Error(initializationError);
        if(!worker){
          let expired=false;
          try{
            worker=await measured('initializationMs',()=>bounded(make().then(async w=>{if(expired)await w.terminate().catch(()=>undefined);return w;}),5000,'Orientation worker initialization exceeded 5 seconds'),o.costs);workersCreated++;
            await measured('configurationMs',()=>bounded(worker!.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT,user_defined_dpi:'300'}),5000,'Orientation worker configuration exceeded 5 seconds'),o.costs);
          }catch(error){expired=true;initializationError=error instanceof Error?error.message:String(error);throw error;}
        }
        const sample=options.sampling==='text-bands'?prepared.axes[rotation%180===0?0:1]:prepared.axes[0];
        const turn=options.sampling==='text-bands'?(rotation>=180?180:0):rotation;
        const image=await measured('imageProcessingMs',()=>sharp(sample.image).rotate(turn).png().toBuffer(),o.costs);
        o.sampleDimensions={width:turn%180?sample.height:sample.width,height:turn%180?sample.width:sample.height};
        o.recognitionStarted=true;
        const result=await measured('recognitionMs',()=>bounded(worker!.recognize(image,{}, {text:true,blocks:true}),2000,'Orientation observation exceeded 2 seconds'),o.costs);
        await measured('scoringMs',async()=>{
          Object.assign(o,directionEvidence(result.data));o.rawText=result.data.text;
          o.signals={headers:(o.rawText.match(/\b(invoice|amount|date|total|property|account|description|check)\b/gi)??[]).length,money:(o.rawText.match(/\b\d[\d,]*\.\d{2}\b/g)??[]).length,dates:(o.rawText.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g)??[]).length};
        },o.costs);
        o.status='completed';
      }catch(error){o.status=error instanceof DirectionTimeout?'timed-out':'errored';o.error=error instanceof Error?error.message:String(error);await release(o.costs);}
      finally{o.durationMs=performance.now()-begin;observations.push(o);}
    }
  }finally{await release();}
  const ranked=observations.filter(o=>o.status==='completed'&&o.credible).sort((a,b)=>b.score-a.score);
  const complete=!options.requireAll||observations.every(o=>o.status==='completed');
  const certain=complete&&ranked.length>0&&(!ranked[1]||ranked[1].score<ranked[0].score*.9);
  return {startedAt,orientationProbeStarted:true,candidateBudgetMs:2000,rotation:certain?ranked[0].rotation:null,certain,observations,timings,workersCreated,durationMs:performance.now()-start,
    sampling:{method:options.sampling,componentCount:prepared.componentCount,sourceDimensions:prepared.sourceDimensions,axes:prepared.axes.map(a=>({angle:a.angle,regions:a.regions,width:a.width,height:a.height}))}};
}
