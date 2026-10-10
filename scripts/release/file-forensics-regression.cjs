/* eslint-disable @typescript-eslint/no-require-imports -- Disposable release-contract fixtures only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const c=require('./contract.cjs'),f=require('./file-forensics.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'trimax-file-contract-'));
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const write=(file,value)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),value);};
const lock={lockfileVersion:3,packages:{'node_modules/example':{version:'1.0.0',integrity:'sha512-example'}}};
const config={buildCommand:'npm run build',crons:[{path:'/example',schedule:'0 1 * * *'}]};
git('init');git('config','user.name','Regression');git('config','user.email','regression@example.invalid');git('config','core.autocrlf','false');
write('package-lock.json',JSON.stringify(lock,null,2)+'\n');write('vercel.json',JSON.stringify(config,null,2)+'\n');write('src/example.js','export const value=1;\n');write('public/sw.js','// synthetic\n');git('add','.');git('commit','-m','synthetic sealed source');
const manifest={components:{web:{commit:git('rev-parse','HEAD')}},sourceBundle:{sha256:c.digest(c.sourceHashes(root))},serviceWorker:{sha256:c.hash(Buffer.from('// synthetic\n'))}};
assert.deepEqual(c.localFailures(manifest,root),[]);assert.deepEqual(c.sourceHashes(root),c.committedSourceHashes(root));
assert(c.sourceHashes(root)['vercel.json'],'Vercel config is inside sealed source');
for(const [file,value] of [['package-lock.json',{...lock,lockfileVersion:2}],['vercel.json',{...config,buildCommand:'echo bypass'}]]){
 write(file,JSON.stringify(value,null,2)+'\n');const result=f.compare(file,root);assert.equal(result.semantic.equal,false);assert(result.semantic.changes.length);assert(result.gitDiff.includes('+'));assert(c.localFailures(manifest,root).includes('Source bundle differs from manifest'));assert.equal(c.digest(c.committedSourceHashes(root)),manifest.sourceBundle.sha256,'working mutation does not rewrite immutable baseline');git('checkout','--',file);
}
const changed=structuredClone(lock);changed.packages['node_modules/example'].version='2.0.0';write('package-lock.json',JSON.stringify(changed));assert.equal(f.compare('package-lock.json',root).semantic.changes[0].pointer,'/packages/node_modules~1example/version');assert(c.localFailures(manifest,root).length);git('checkout','--','package-lock.json');
// No npm rewrite was reproduced: no metadata exception is authorized.
write('package-lock.json',JSON.stringify({...lock,npmMetadata:'unproven rewrite'}));assert(c.localFailures(manifest,root).length);git('checkout','--','package-lock.json');
write('vercel.json',JSON.stringify(config));assert.equal(f.compare('vercel.json',root).semantic.equal,true);assert.equal(f.compare('vercel.json',root).bytesEqual,false);assert(c.localFailures(manifest,root).includes('Release worktree is dirty'),'formatting-only dirty files remain denied');git('checkout','--','vercel.json');
write('src/example.js','export const value=2;\n');assert(c.localFailures(manifest,root).length);git('checkout','--','src/example.js');
for(const file of ['package-lock.json','vercel.json']){write(file,'{}\n');git('add',file);git('commit','-m','unsealed semantic change');assert(c.localFailures(manifest,root).includes('Committed HEAD source bundle differs from manifest'));assert(c.localFailures(manifest,root).includes('Executable changes after named source revision'));}
assert.equal(f.sanitize('"password": "private"'),'"password": "[REDACTED]"');assert.equal(f.sanitize('https://user:secret@example.invalid/a'),'https://[REDACTED]@example.invalid/a');
assert.deepEqual(f.stats(Buffer.from('\ufeffa\r\nb\n')), {sha256:c.hash(Buffer.from('\ufeffa\r\nb\n')),bytes:8,crlf:1,lf:2,bom:true});
assert.throws(()=>f.compare('.env.local',root),/allowlisted/);
require('./gate-state-regression.cjs');
console.log('PASS: immutable Git baseline, dependency/config mutation, formatting policy, unproven npm rewrite denial, unrelated source, sealed committed files, diagnostics and receipt rejection');
