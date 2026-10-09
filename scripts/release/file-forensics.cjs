/* eslint-disable @typescript-eslint/no-require-imports -- Read-only, allowlisted build forensics. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const c=require('./contract.cjs');
const files=['package-lock.json','vercel.json'];
function stats(bytes){const s=bytes.toString('utf8');return {sha256:c.hash(bytes),bytes:bytes.length,crlf:(s.match(/\r\n/g)||[]).length,lf:(s.match(/\n/g)||[]).length,bom:bytes.subarray(0,3).equals(Buffer.from([239,187,191]))};}
function changes(a,b,p=''){if(c.canonical(a)===c.canonical(b))return [];if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){return [...new Set([...Object.keys(a),...Object.keys(b)])].sort().flatMap(k=>changes(a[k],b[k],p+'/'+k.replaceAll('~','~0').replaceAll('/','~1')));}return [{pointer:p,before:a===undefined?{absent:true}:a,after:b===undefined?{absent:true}:b}];}
// Restrict output to two requested non-secret config files. Redact credentials if
// accidentally introduced; never print environment values or arbitrary source.
function sanitize(text){return text.replace(/(https?:\/\/)[^\s/@"']+:[^\s/@"']+@/gi,'$1[REDACTED]@').replace(/([?&](?:token|key|secret|password|credential|signature)=)[^&\s"']+/gi,'$1[REDACTED]').replace(/("[^"\n]*(?:secret|password|token|authorization|api[_-]?key|credential)[^"\n]*"\s*:\s*")[^"\n]*(")/gi,'$1[REDACTED]$2');}
function compare(file,cwd=c.root){if(!files.includes(file))throw Error('File not allowlisted');const committed=cp.execFileSync('git',['show','HEAD:'+file],{cwd,maxBuffer:20000000,stdio:['ignore','pipe','pipe']});const working=fs.readFileSync(path.join(cwd,file));let semantic;
 try{const a=JSON.parse(committed.toString('utf8').replace(/^\uFEFF/,'')),b=JSON.parse(working.toString('utf8').replace(/^\uFEFF/,''));semantic={equal:c.canonical(a)===c.canonical(b),changes:changes(a,b)};}catch(error){semantic={equal:false,parseError:error.name};}
 const diff=cp.execFileSync('git',['diff','HEAD','--no-ext-diff','--no-textconv','--no-color','--',file],{cwd,encoding:'utf8',maxBuffer:20000000});
 const raw={path:file,gitBlob:c.git(['rev-parse','HEAD:'+file],cwd),attributes:c.git(['check-attr','-a','--',file],cwd),committed:stats(committed),working:stats(working),bytesEqual:committed.equals(working),semantic,gitDiff:diff};
 const cleanValue=(value,key='')=>/secret|password|token|authorization|api[_-]?key|credential/i.test(key)?'[REDACTED]':typeof value==='string'?sanitize(value):Array.isArray(value)?value.map(v=>cleanValue(v)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,cleanValue(v,k)])):value;
 const safe=cleanValue(raw);safe.semantic.changes=(semantic.changes||[]).map(change=>/secret|password|token|authorization|api[_-]?key|credential/i.test(change.pointer)?{pointer:change.pointer,before:'[REDACTED]',after:'[REDACTED]'}:cleanValue(change));return {...safe,sanitized:JSON.stringify(safe)!==JSON.stringify(raw)};}
function snapshot(cwd=c.root){return {head:c.git(['rev-parse','HEAD'],cwd),node:process.version,npmUserAgent:process.env.npm_config_user_agent||null,baseline:'committed HEAD blobs; working copy observed after tools may have run',files:files.map(f=>compare(f,cwd))};}
if(require.main===module)console.log(JSON.stringify(snapshot(),null,2));
module.exports={stats,changes,sanitize,compare,snapshot};
