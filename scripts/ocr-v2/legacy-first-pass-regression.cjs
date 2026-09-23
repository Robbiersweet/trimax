/* eslint-disable @typescript-eslint/no-require-imports -- Test production timeout and lease with deterministic scheduling. */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),sharp=require('sharp');
const mod={exports:{}},timers=new Map();let next=0,now=0;
const source=fs.readFileSync('src/app/lib/ocrLegacyPass.ts','utf8');
new Function('require','module','exports','setTimeout','clearTimeout',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(require,mod,mod.exports,(fn,ms)=>{const id=++next;timers.set(id,{fn,at:now+ms});return id;},id=>timers.delete(id));
const {legacyRecognitionDeadline:deadline,legacyBootstrapImage:prepare,legacyWorkerSession:session}=mod.exports;
const advance=ms=>{now+=ms;for(const [id,t]of timers)if(t.at<=now){timers.delete(id);t.fn();}};
const tick=()=>Promise.resolve();
(async()=>{
 advance(10000);assert.equal(timers.size,0,'Setup has no recognition timer');
 let resolve;const near=deadline(()=>new Promise(r=>{resolve=r}),6000,'deadline');
 advance(5999);resolve('completed');assert.equal(await near,'completed');assert.equal(timers.size,0);advance(10000); // cleanup cannot retroactively timeout
 const over=deadline(()=>new Promise(()=>{}),6000,'deadline');const rejected=assert.rejects(over,/deadline/);advance(6000);await rejected;assert.equal(timers.size,0);
 console.log('PASS near-deadline completion; true deadline failure; setup/cleanup excluded');
 let created=0,terminated=0;const make=async()=>{created++;return {setParameters:async()=>{},recognize:async()=>({data:{text:'evidence'}}),terminate:async()=>{terminated++;}}};
 const healthy=session(make),direction=await healthy.direction();await direction.recognize(Buffer.alloc(0));await direction.terminate();const warm=await healthy.acquire();await warm.recognize(Buffer.alloc(0));assert.equal(created,1);assert.equal(terminated,0);assert(healthy.metrics.reused);await healthy.close();await healthy.close();assert.equal(terminated,1);
 let release;const hung=session(async()=>({...await make(),recognize:()=>new Promise(r=>{release=r})}));const old=await hung.direction();const pending=old.recognize(Buffer.alloc(0));await tick();await old.terminate();await hung.acquire();release({data:{}});await pending;await old.terminate();assert.equal(hung.metrics.created,2);await hung.close();
 const failure=session(async()=>{throw Error('initialization failed')});await assert.rejects(failure.acquire(),/initialization/);await failure.close();
 let finishInit;const late=session(()=>new Promise(r=>{finishInit=r}));const acquiring=late.acquire();await late.close();const lateWorker=await make();finishInit(lateWorker);await assert.rejects(acquiring,/closed during initialization/);
 console.log('PASS cold/warm reuse, timed-out retirement, stale completion, init failure cleanup');
 const image=await sharp({create:{width:4000,height:2000,channels:3,background:'white'}}).png().toBuffer();const reduced=await sharp(await prepare(image,true)).metadata();assert.equal(reduced.width,2600);assert.equal(reduced.height,1300);assert.equal(await prepare(image,false),image,'Later passes retain source bytes');
 const small=await sharp(image).resize(800).png().toBuffer();assert.equal((await sharp(await prepare(small,true)).metadata()).width,800);
 // Existing geometry conversion must preserve every source box after resizing.
 const route=fs.readFileSync('src/app/api/payments/extract-check-stub/route.ts','utf8');assert(route.includes('const OCR_ATTEMPT_TIMEOUT_MS = 6_000;'));
 const start=route.indexOf('function extractOcrWords('),end=route.indexOf('function wordCenterY',start),boxMod={exports:{}};
 const code=ts.transpileModule(route.slice(start,end)+'\nexports.extract=extractOcrWords;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('exports','isRecord','childArray','numberFromRecord',code)(boxMod.exports,v=>v!==null&&typeof v==='object',(o,k)=>Array.isArray(o[k])?o[k]:[],(o,k)=>typeof o[k]==='number'?o[k]:0);
 const block={blocks:[{paragraphs:[{lines:[{words:[{text:'UNKNOWN',confidence:30,bbox:{x0:60,y0:120,x1:120,y1:150}}]}]}]}]};
 const mapped=boxMod.exports.extract(block,{name:'full-document',width:4000,height:2000,bounds:{left:150,top:20}},2400,1200,{variant:'native-color',pageMode:{name:'sparse-text'}},0);
 assert.deepEqual(mapped[0].bbox,{x0:250,y0:220,x1:350,y1:270},'Word geometry maps back to full-resolution source, including crop offset');
 assert(route.includes('passTimings.length===0 && source.name==="full-document" && spec.variant==="native-color" && rotation===0'));
 console.log('PASS first-pass-only bounded resolution, aspect ratio, no upscaling, unchanged timeout and geometry mapping');
})().catch(e=>{console.error(e);process.exitCode=1});
