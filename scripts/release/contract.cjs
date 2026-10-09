/* eslint-disable @typescript-eslint/no-require-imports -- Shared release tooling, never OCR inference. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const digest=x=>hash(canonical(x));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const root=path.resolve(__dirname,'../..');
const git=(args,cwd=root)=>cp.execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true}).trim();
const sourcePaths=['src','scripts','supabase','public','package.json','package-lock.json','next.config.ts','tsconfig.json','proxy.ts','eslint.config.mjs'];
// Explicit text contract: only UTF-8 source formats normalize CRLF. Binary assets
// and model bytes are never decoded as text. BOMs and lone CR remain significant.
const textExtensions=new Set(['.cjs','.css','.js','.json','.md','.mjs','.py','.sql','.svg','.ts','.tsx']);
function sourceBytes(file,bytes){if(!textExtensions.has(path.extname(file)))return bytes;
 const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
 return Buffer.from(text.replace(/\r\n/g,'\n'),'utf8');}
function sourceHashes(cwd=root){const files=git(['ls-files','--',...sourcePaths],cwd).split('\n').filter(Boolean);return Object.fromEntries(files.map(f=>[f,hash(sourceBytes(f,fs.readFileSync(path.join(cwd,f))))]));}
function localFailures(manifest,cwd=root){const errors=[];if(git(['status','--porcelain','--untracked-files=all'],cwd))errors.push('Release worktree is dirty');
 if(!/^[a-f0-9]{40}$/.test(manifest.components.web.commit||''))errors.push('Unsealed component revision');
 for(const [name,c] of Object.entries(manifest.components))if(c.commit!==manifest.components.web.commit)errors.push(name+' revision differs from common executable revision');
 if(digest(sourceHashes(cwd))!==manifest.sourceBundle.sha256)errors.push('Source bundle differs from manifest');
 if(hash(sourceBytes('public/sw.js',fs.readFileSync(path.join(cwd,'public/sw.js'))))!==manifest.serviceWorker.sha256)errors.push('Service worker hash mismatch');
 // Metadata-only sealing commits are permitted. Executable files must be byte-identical to the named commit.
 if(/^[a-f0-9]{40}$/.test(manifest.components.web.commit||''))try{if(git(['diff',manifest.components.web.commit,'HEAD','--',...sourcePaths],cwd))errors.push('Executable changes after named source revision');}catch{errors.push('Named revision unavailable');}
 return errors;
}
function compareDatabase(expected,actual,engine,businessId){const errors=[];if(!actual||actual.businessId!==businessId||actual.engine!==engine||actual.credentialScope!=='ocr-only')errors.push('Credential scope not attested');
 for(const kind of ['schema','rpc','triggers','policies','grants'])if(expected.fingerprints[kind]?.sha256!==actual?.fingerprints?.[kind]?.sha256)errors.push('Database '+kind+' fingerprint mismatch');
 if(digest(expected.flags)!==digest(actual?.flags))errors.push('Production feature flags differ');return errors;}
function verifyModels(manifest,engine,config){const errors=[];for(const m of manifest.models.filter(m=>m.engines.includes(engine))){try{let actual;
 if(m.runtime==='wsl'){const output=cp.execFileSync('wsl',['-d',config.wslDistribution||'Ubuntu','--','sha256sum',m.path],{encoding:'utf8',timeout:30000,windowsHide:true});actual=output.trim().split(/\s+/)[0];}
 else{const file=m.path==='RUNTIME_CACHE/eng.traineddata'?path.join(require('node:os').tmpdir(),'trimax-ocr','tesseract-js-7','eng','eng.traineddata'):m.path;actual=hash(fs.readFileSync(file));}
 if(actual!==m.sha256)errors.push('Model hash mismatch: '+m.name);
 }catch{errors.push('Model unavailable: '+m.name);}}return errors;}
function verifyRuntimeSources(manifest,engine,config){const errors=[];
 for(const [name,expected] of Object.entries(manifest.runtimeSources.node)){try{const base=path.join(root,'node_modules',name),files={};const visit=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())visit(file);else if(e.isFile())files[path.relative(base,file).replaceAll('\\','/')]=hash(fs.readFileSync(file));}};visit(base);if(digest(files)!==digest(expected.files))errors.push('Node OCR dependency source mismatch: '+name);}catch{errors.push('Node OCR dependency unavailable: '+name);}}
 if(engine==='v2-shadow')try{const script="import json,pathlib,hashlib,subprocess,sys\nitems=[]\nfor root in json.loads(sys.argv[1]):\n p=pathlib.Path(root)\n files={str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(p.rglob('*')) if f.is_file() and '.git' not in f.parts and '__pycache__' not in f.parts and f.suffix in ('.py','.yaml','.yml','.json','.txt')}\n def git(*a): return subprocess.check_output(['git','-C',root,*a],text=True).strip()\n items.append({'path':root,'commit':git('rev-parse','HEAD'),'status':git('status','--porcelain'),'sourceHashes':files})\nprint(json.dumps(items))";
 const actual=JSON.parse(cp.execFileSync('wsl',['-d',config.wslDistribution,'--',config.python,'-c',script,JSON.stringify(manifest.runtimeSources.wsl.map(r=>r.path))],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:10000000}));
 if(digest(actual)!==digest(manifest.runtimeSources.wsl)||actual.some(r=>r.status))errors.push('WSL recognizer repository revision/source drift');}catch{errors.push('WSL recognizer source attestation unavailable');}
 if(digest({node:manifest.runtimeSources.node,wsl:manifest.runtimeSources.wsl})!==manifest.runtimeSources.sha256)errors.push('Runtime source bundle definition changed');return errors;
}
function validateLocalRuntime(config,engine){const manifest=read(path.join(root,'release/trimax-release-manifest.json'));const errors=localFailures(manifest);
 const safeConfig=Object.fromEntries(Object.entries(config).filter(([key])=>!['anonKey','workerKey','releaseAttestation'].includes(key)));
 if(digest(safeConfig)!==manifest.workerConfiguration.configHashes?.[engine])errors.push('Worker configuration differs from frozen manifest');
 if(process.version!==manifest.workerConfiguration.nodeVersion)errors.push('Node version mismatch');
 for(const key of manifest.workerConfiguration.requiredUnsetEnvironment||[])if(process.env[key])errors.push('Untracked runtime environment override: '+key);
 if(config.supabaseUrl!==`https://${manifest.supabaseProjectId}.supabase.co`)errors.push('Supabase project mismatch');
 if(config.businessId!==manifest.workerConfiguration.businessId)errors.push('Worker business scope mismatch');
 if(!config.workerKey||!config.anonKey)errors.push('Restricted credential missing');
 if(!config.anonKey?.startsWith('sb_publishable_'))try{const role=JSON.parse(Buffer.from(config.anonKey.split('.')[1],'base64url').toString()).role;if(role!=='anon')errors.push('Worker API key must be anon, never service_role');}catch{errors.push('Worker API key is neither a publishable key nor an anon JWT');}
 if(engine==='v2-shadow'&&(config.python!==manifest.workerConfiguration.python||config.wslDistribution!==manifest.workerConfiguration.wslDistribution))errors.push('Recognizer runtime configuration mismatch');
 errors.push(...verifyModels(manifest,engine,config));
 errors.push(...verifyRuntimeSources(manifest,engine,config));
 if(engine==='v2-shadow')try{const actual=JSON.parse(cp.execFileSync('wsl',['-d',config.wslDistribution,'--',config.python,'-c',"import importlib.metadata as m,json,sys; print(json.dumps({'python':sys.version.split()[0],'packages':{n:m.version(n) for n in ['torch','rapidocr','onnxruntime','transformers']}}))"],{encoding:'utf8',windowsHide:true,timeout:30000}));if(actual.python!==manifest.workerConfiguration.pythonVersion||digest(actual.packages)!==digest(manifest.workerConfiguration.packages))errors.push('Python/model package versions differ');}catch{errors.push('Python/model package versions unavailable');}
 if(digest(manifest.models)!==manifest.modelBundle.sha256)errors.push('Model bundle definition changed');
 if(errors.length)throw Error('RUNTIME DRIFT DETECTED: '+errors.join('; '));
 return manifest;
}
async function validateStartup(config,engine){const manifest=validateLocalRuntime(config,engine);
 const response=await fetch(config.supabaseUrl+'/rest/v1/rpc/trimax_release_runtime',{method:'POST',headers:{apikey:config.anonKey,'Content-Type':'application/json'},body:JSON.stringify({p_business:config.businessId,p_key:config.workerKey,p_engine:engine}),signal:AbortSignal.timeout(15000)});
 if(!response.ok){const detail=await response.json().catch(()=>({}));const error=Error('RUNTIME DRIFT DETECTED: read-only database/credential attestation unavailable (HTTP '+response.status+')');
  if(response.status===404&&detail.code==='PGRST202')error.code='DEPLOYMENT_PREREQUISITE';throw error;}
 const observed=await response.json();const remoteErrors=compareDatabase(manifest.database,observed,engine,config.businessId);if(remoteErrors.length)throw Error('RUNTIME DRIFT DETECTED: '+remoteErrors.join('; '));
 return Object.freeze({releaseId:manifest.releaseId,engine,sourceCommit:manifest.components.web.commit,sourceBundle:manifest.sourceBundle.sha256,modelBundle:manifest.modelBundle.sha256,runtimeSources:manifest.runtimeSources.sha256,databaseFingerprint:manifest.database.fingerprints.schema.sha256,validatedAt:new Date().toISOString(),paymentWriteCapability:false});
}
function scoreDocument(expected,observed){const failures=[];const truth=expected.truth;const token=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(observed.sourceImageHash!==expected.canonicalSha256)failures.push('Canonical source mismatch');
 if(observed.paymentCanApply!==false)failures.push('Shadow payment authority changed');
 const rows=observed.document?.rows||[];if(rows.length!==expected.expectedPhysicalRows)failures.push('Physical row count changed');
 rows.forEach((row,i)=>{const t=truth.rows[i];if(!t){failures.push('Extra row');return;}if(row.fusion?.confidence?.confidentlySelected&&token(row.fusion.topCandidate)!==token(t.invoiceNumber))failures.push('Wrong accepted invoice row '+i);
 const values=[...new Set((row.amounts||[]).map(a=>a.cents))];if(values.some(x=>x!==t.amountCents))failures.push('Wrong accepted amount row '+i);});
 const total=observed.document?.header?.total?.amount;if(total!=null&&Math.round(total*100)!==truth.authoritativeTotalCents)failures.push('Wrong accepted total');
 for(const key of ['checkNumber','checkDate','payor'])if(truth[key]!=null&&observed.document?.header?.[key]!=null&&observed.document.header[key]!==truth[key])failures.push('Wrong accepted '+key);
 if(observed.residual?.evidence){const r=observed.residual.evidence;const i=rows.findIndex(row=>row.rowId===r.rowId);if(i<0||r.derivedAmount!==truth.rows[i]?.amountCents)failures.push('Wrong derived amount');}
 const ids=observed.resolver?.automaticInvoiceIds||[];if(new Set(ids).size!==ids.length)failures.push('Duplicate invoice IDs');
 if(ids.length&&ids.some((id,i)=>!truth.rows[i]?.invoiceRecordId||id!==truth.rows[i].invoiceRecordId))failures.push('Wrong or unverifiable automatic invoice IDs');
 const automatic=observed.resolver?.status==='automatic';
 if(expected.expectation==='AUTOMATICALLY_RESOLVE'&&!automatic)failures.push('Previously automatic document now requires review');
 if(expected.expectation==='SAFELY_REQUIRE_REVIEW'&&automatic)failures.push('Frozen review-only document promoted without acceptance review');
 if(automatic&&(total==null||observed.arithmeticReconciliation?.difference!==0||ids.length!==truth.rows.length||observed.reviewBlockers?.length))failures.push('Automatic document lacks complete safe evidence');
 return failures;
}
module.exports={root,read,hash,digest,canonical,git,sourcePaths,sourceBytes,sourceHashes,localFailures,compareDatabase,verifyModels,verifyRuntimeSources,validateLocalRuntime,validateStartup,scoreDocument};
