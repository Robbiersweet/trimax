/* eslint-disable @typescript-eslint/no-require-imports -- Isolated React regression harness. */
const assert=require('node:assert/strict');
module.exports=async function(loader,React,renderer){
 let reads=0;
 const View=loader({'../lib/ocrHistoryClient':{scanOptical:async()=>{reads++;return {images:[{label:'Final OCR input',mime:'image/jpeg',base64:'/9j/2Q==',width:100,height:200,rotation:90,exifOrientation:null,source:'still',transformation:'test'}],notes:[]};}}})('src/app/components/OpticalEvidenceView.tsx').default;
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(View,{attemptId:'test'}));});assert.equal(reads,0);assert.equal(tree.root.findAllByType('img').length,0);
 await renderer.act(async()=>{tree.root.findByType('details').props.onToggle({currentTarget:{open:true}});});assert.equal(reads,1);assert.equal(tree.root.findAllByType('img').length,1);
 await renderer.act(async()=>{tree.root.findAllByType('details')[0].props.onToggle({currentTarget:{open:false}});});assert.equal(tree.root.findAllByType('img').length,0);await renderer.act(async()=>tree.unmount());
 const {diagnosticPayload}=require('../src/app/lib/ocrHistory.ts');const p=diagnosticPayload({optical:{images:[{label:'bad',mime:'image/svg+xml',base64:'PHN2Zz4='}],notes:[]},imageDataUrl:'data:image/jpeg;base64,secret'});assert.equal(p.optical.images[0].base64,'');assert.equal(p.imageDataUrl,undefined);
 console.log('Optical UI: lazy fetch, collapsed image exclusion, inspectable image, bounded raster-only retention passed.');
};
