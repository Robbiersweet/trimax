import assert from 'node:assert/strict';
import {websiteSubmissionRuntime} from '../lib/submissionRuntime.ts';
import {POST} from '../app/api/public-scheduling/[slug]/route.ts';
const names=['SCHEDULING_TRANSPORT','VERCEL','VERCEL_ENV','PUBLIC_SCHEDULING_PRODUCTION_ENABLED'];
const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
const originalFetch=globalThis.fetch;
let network=0;
globalThis.fetch=async()=>{network++;throw Error('NETWORK_FORBIDDEN');};
try{
 process.env.VERCEL='1';process.env.VERCEL_ENV='production';process.env.PUBLIC_SCHEDULING_PRODUCTION_ENABLED='enabled';
 const request=()=>new Request('https://rnlcreations.com/api/public-scheduling/rnl-creations',{method:'POST'});
 process.env.SCHEDULING_TRANSPORT='direct-postgres';
 assert.throws(()=>websiteSubmissionRuntime(),/DIRECT_RELEASE_NOT_APPROVED/);
 assert.equal((await POST(request(),{params:Promise.resolve({slug:'rnl-creations'})})).status,503);
 process.env.SCHEDULING_TRANSPORT='typo';
 assert.throws(()=>websiteSubmissionRuntime(),/UNKNOWN_SCHEDULING_TRANSPORT/);
 assert.equal((await POST(request(),{params:Promise.resolve({slug:'rnl-creations'})})).status,503);
 delete process.env.PUBLIC_SCHEDULING_PRODUCTION_ENABLED;
 assert.equal((await POST(request(),{params:Promise.resolve({slug:'rnl-creations'})})).status,503);
 assert.equal(network,0);
 console.log('PASS actual website route: disabled direct selection, unknown transport, activation guard, zero network and no JWT fallback');
}finally{globalThis.fetch=originalFetch;for(const [name,value]of Object.entries(previous)){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
