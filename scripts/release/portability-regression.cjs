/* eslint-disable @typescript-eslint/no-require-imports -- Disposable Git fixture; no production changes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const c=require('./contract.cjs'),{snapshot,record}=require('./build-diagnostics.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'trimax-portability-'));
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const write=(f,b)=>{fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),b);};
git('init');git('config','user.name','Regression');git('config','user.email','regression@example.invalid');git('config','core.autocrlf','true');
write('.gitattributes','*.js text\n');write('public/sw.js','const version = 1;\n');write('src/app.js','const app = 1;\n');write('public/icon.png',Buffer.from([255,0,13,10,128]));
git('add','.');git('commit','-m','synthetic fixture');
const manifest={components:{web:{commit:git('rev-parse','HEAD')}},sourceBundle:{sha256:c.digest(c.sourceHashes(root))},serviceWorker:{sha256:c.hash(c.sourceBytes('public/sw.js',fs.readFileSync(path.join(root,'public/sw.js'))))}};
assert.deepEqual(c.localFailures(manifest,root),[]);
write('public/sw.js','const version = 1;\r\n');assert.equal(c.digest(c.sourceHashes(root)),manifest.sourceBundle.sha256,'CRLF source hashes match');git('checkout','--','public/sw.js');assert.deepEqual(c.localFailures(manifest,root),[],'Clean CRLF checkout passes');
assert.deepEqual(c.sourceBytes('public/icon.png',Buffer.from([255,0,13,10,128])),Buffer.from([255,0,13,10,128]),'binary bytes unchanged');
assert.deepEqual(c.sourceBytes('scripts/training/.gitignore',Buffer.from('cache\r\n')),Buffer.from('cache\n'),'Explicit extensionless Git ignore text normalizes');
write('public/sw.js','const version = 2;\r\n');assert(c.localFailures(manifest,root).includes('Service worker hash mismatch'));
assert.equal(snapshot(root).files[0].path,'public/sw.js');git('checkout','--','public/sw.js');
write('src/app.js','const app = 2;\n');assert(c.localFailures(manifest,root).includes('Source bundle differs from manifest'));git('checkout','--','src/app.js');
record('preinstall',root);write('src/unexpected.js','unexpected');const evidence=record('prebuild',root);assert.equal(evidence.differences[0].firstObservedStage,'prebuild');assert.equal(evidence.files[0].status,'??');assert(c.localFailures(manifest,root).includes('Release worktree is dirty'));fs.unlinkSync(path.join(root,'src/unexpected.js'));
fs.unlinkSync(path.join(root,'src/app.js'));assert(snapshot(root).files.some(f=>f.status.includes('D')));git('checkout','--','src/app.js');
fs.writeFileSync(path.join(os.tmpdir(),'trimax-external-cache-test'),'external');assert.deepEqual(c.localFailures(manifest,root),[]);
assert(c.localFailures({...manifest,sourceBundle:{sha256:'wrong'}},root).includes('Source bundle differs from manifest'));
// The existing receipt suite executes wrong-release, wrong-source and omitted-check denials.
require('./gate-state-regression.cjs');
console.log('PASS: LF/CRLF, raw binary, changed SW/source, untracked/deleted source, external cache, stage diagnostics and wrong receipt/source fail-closed');
