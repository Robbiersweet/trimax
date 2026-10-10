/* eslint-disable @typescript-eslint/no-require-imports -- Generic evidence handoff; no frozen answers. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {selectObservedIdentity}=require('../../src/app/lib/ocrV2/recognition/identityHandoff.ts');
const i={authority:'authoritative',value:'cedar valley',candidates:[{stem:'cedar valley',observedText:'cedar valley apartmen'}]};
assert.equal(selectObservedIdentity(i,'Cedar Valley Apartmen'),'cedar valley');
assert.equal(selectObservedIdentity(i,'CEDARVALLEY'),'cedar valley');
assert.equal(selectObservedIdentity(i,'Cedar Hill Apartmen'),null);
assert.equal(selectObservedIdentity(i,'Cedar Valley Estates'),null);
assert.equal(selectObservedIdentity({...i,authority:'unknown'},null),null);
const {ocrRuntimeCache}=require('../../src/app/lib/ocrRuntimeCache.ts');
assert(!path.resolve(ocrRuntimeCache()).startsWith(process.cwd()+path.sep));
const source=fs.readFileSync('src/app/lib/ocrV2/recognition/semanticMoney.ts','utf8');
assert(source.includes('totalLocalization.bounds ?? (footer ?'),'Selected field bounds must not be overwritten by a narrower line detector');
// Exercise the actual footer candidate expression across scale and edge variance.
const expression=(source.match(/const footerCandidates = ([\s\S]*?) : \[\];/)[1]+' : []').replace(/bounds!/g,'bounds');
const run=new Function('complete','structure','last','rowHeight','regions','font','amountLeft','amountRight','right','return '+expression);
for(const scale of [.5,1,3]){const regions=[{bounds:{left:100*scale,width:100*scale}}],right=b=>b.left+b.width;
 const evaluate=(left,top,width)=>run(true,{scaleX:scale,scaleY:scale,lines:[{left,top,width,height:10}]},100*scale,20*scale,regions,10*scale,100*scale,200*scale,right);
 assert.equal(evaluate(99.7,110,100).length,1);assert.equal(evaluate(40,110,100).length,0);assert.equal(evaluate(100,95,100).length,0);assert.equal(evaluate(100,210,100).length,0);
}
console.log('Identity equivalence/conflict, selected-total bounds, scale-invariant footer ownership, and external cache PASS');
