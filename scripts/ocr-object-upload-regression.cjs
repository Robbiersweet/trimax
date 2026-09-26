/* eslint-disable @typescript-eslint/no-require-imports -- Binary transport failure injection, no live writes. */
const assert=require('node:assert/strict'),crypto=require('node:crypto'),sharp=require('sharp'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>deps[n],mod,mod.exports);return mod.exports;}
(async()=>{
 const canonical=load('src/app/lib/ocrCanonical.ts',{}),{uploadCanonicalObject}=load('src/app/lib/ocrCanonicalObject.ts',{'./ocrCanonical':canonical});
 const jpeg=await sharp(crypto.randomBytes(2400*2400*3),{raw:{width:2400,height:2400,channels:3}}).jpeg({quality:98}).toBuffer();
 assert(jpeg.length>3000000);const blob=new Blob([jpeg],{type:'image/jpeg'}),hash=await canonical.imageSha256(await blob.arrayBuffer());
 let stored=null,writes=0,lost=false;
 const storage={upload:async(p,b,o)=>{assert.equal(o.upsert,false);assert(b instanceof Blob);if(stored)return{error:Error('exists')};stored=b;writes++;if(lost)throw Error('lost acknowledgement');return{error:null};},download:async()=>({data:stored,error:null})};
 await uploadCanonicalObject(storage,'private-attempt-hash',blob,hash);await uploadCanonicalObject(storage,'private-attempt-hash',blob,hash);assert.equal(writes,1);
 stored=null;lost=true;await uploadCanonicalObject(storage,'private-attempt-hash',blob,hash);assert.equal(writes,2);
 // A failed metadata write leaves the uploaded bytes intact; same object is reused.
 await uploadCanonicalObject(storage,'private-attempt-hash',blob,hash);assert.equal(writes,2);
 stored=new Blob(['tampered']);await assert.rejects(uploadCanonicalObject(storage,'private-attempt-hash',blob,hash),/integrity mismatch/);
 console.log(JSON.stringify({pass:true,jpegBytes:jpeg.length,tests:['binary upload','lost acknowledgement','database failure retry','idempotency','hash mismatch rejected']}));
})().catch(e=>{console.error(e);process.exitCode=1;});
