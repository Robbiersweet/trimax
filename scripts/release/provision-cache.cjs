/* eslint-disable @typescript-eslint/no-require-imports -- Explicit verified model-cache provisioning; no download or production process changes. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {read,hash,root}=require('./contract.cjs');
const manifest=read(path.join(root,'release/trimax-release-manifest.json'));
const expected=[...new Set(manifest.models.filter(m=>m.path==='RUNTIME_CACHE/eng.traineddata').map(m=>m.sha256))];
if(expected.length!==1||!process.argv[2])throw Error('Supply the pinned English traineddata file; one unambiguous hash is required');
const bytes=fs.readFileSync(process.argv[2]);if(hash(bytes)!==expected[0])throw Error('Model source SHA-256 mismatch');
const directory=path.join(os.tmpdir(),'trimax-ocr','tesseract-js-7','eng'),file=path.join(directory,'eng.traineddata');
if(path.resolve(directory).startsWith(root+path.sep))throw Error('Runtime cache cannot be inside source');
fs.mkdirSync(directory,{recursive:true});
if(fs.existsSync(file)&&hash(fs.readFileSync(file))!==expected[0])throw Error('Existing cache differs; refusing silent replacement');
if(!fs.existsSync(file))fs.writeFileSync(file,bytes,{flag:'wx'});
console.log(JSON.stringify({path:file,sha256:hash(fs.readFileSync(file)),status:'verified'}));
