import assert from 'node:assert/strict';
import {requestPhotosEnabled} from '../lib/photoBoundary.ts';
import {createPhotoCapability} from '../../../src/app/lib/requestPhotos/clientCapability.ts';
assert.equal(requestPhotosEnabled({VERCEL_ENV:'production'}),false);assert.equal(requestPhotosEnabled({VERCEL_ENV:'preview',PUBLIC_SCHEDULING_PHOTOS_ENABLED:'enabled'}),false);assert.equal(requestPhotosEnabled({VERCEL_ENV:'production',PUBLIC_SCHEDULING_PHOTOS_ENABLED:'enabled'}),true);
const cap=await createPhotoCapability();assert.match(cap.uploadCapabilityHash,/^[a-f0-9]{64}$/);assert.notEqual(cap.secret,cap.uploadCapabilityHash);console.log('PASS separate photo flag default-off and preview-denied; browser cryptographic capability');
import {withPhotoBoundary} from '../lib/photoBoundary.ts';let calls=0;const runtime={client:{rpc:async()=>{calls++;return{data:{},error:null};}}};const args={p_payload:{uploadCapabilityHash:cap.uploadCapabilityHash}};assert.ok((await withPhotoBoundary(runtime,false).client.rpc('trimax_submit_public_service_request',args)).error);assert.equal(calls,0);assert.equal((await withPhotoBoundary(runtime,true).client.rpc('trimax_submit_public_service_request',args)).error,null);assert.equal(calls,1);console.log('PASS forged gated photo payload denied before existing submit RPC; enabled calls same RPC');
import {PHOTO_MAX_INPUT_BYTES} from '../../../src/app/lib/requestPhotos/limits.ts';
assert.equal(PHOTO_MAX_INPUT_BYTES,4*1024*1024);console.log('PASS packaged shared photo input ceiling is 4MiB');
