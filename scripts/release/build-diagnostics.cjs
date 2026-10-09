/* eslint-disable @typescript-eslint/no-require-imports -- Filename/hash-only build evidence; no file contents or environment values. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const c=require('./contract.cjs');
function snapshot(cwd=c.root){
 const raw=cp.execFileSync('git',['status','--porcelain=v1','-z','--untracked-files=all'],{cwd,encoding:'utf8'});
 const entries=raw.split('\0'),files=[];
 for(let i=0;i<entries.length;i++){const entry=entries[i];if(!entry)continue;const status=entry.slice(0,2),file=entry.slice(3);files.push({status,path:file,...(/[RC]/.test(status)?{originalPath:entries[++i]}:{})});}
 const bytes=fs.readFileSync(path.join(cwd,'public/sw.js'));
 return {head:c.git(['rev-parse','HEAD'],cwd),files,serviceWorker:{rawSha256:c.hash(bytes),canonicalSha256:c.hash(c.sourceBytes('public/sw.js',bytes)),bytes:bytes.length,crlf:(bytes.toString().match(/\r\n/g)||[]).length,lf:(bytes.toString().match(/\n/g)||[]).length,bom:bytes.subarray(0,3).equals(Buffer.from([239,187,191]))}};
}
const evidencePath=cwd=>path.join(os.tmpdir(),'trimax-build-diagnostics',c.hash(path.resolve(cwd))+'.json');
function record(stage,cwd=c.root){const current=snapshot(cwd),file=evidencePath(cwd);let prior=[];
 try{prior=JSON.parse(fs.readFileSync(file,'utf8'));}catch{ /* No earlier snapshot is explicitly unknown. */ }
 if(stage==='preinstall'||prior[0]?.head!==current.head)prior=[];
 const entry={stage,observedAt:new Date().toISOString(),...current};prior.push(entry);
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(prior,null,2));
 const initial=prior[0];return {...entry,initialStage:initial.stage,initialCheckoutState:initial.stage==='preinstall'?'observed at npm preinstall (not before npm)':'unverified',differences:current.files.map(f=>({...f,firstObservedStage:prior.find(p=>p.files.some(x=>x.path===f.path&&x.status===f.status))?.stage})),evidenceFile:file};
}
if(require.main===module)console.log(JSON.stringify(record(process.argv[2]||'manual')));
module.exports={snapshot,record};
