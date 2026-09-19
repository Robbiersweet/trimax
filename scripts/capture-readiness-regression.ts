import assert from "node:assert/strict";
import sharp from "sharp";
import { captureReadiness, measureCaptureFrame, type GateFrame, type GateMemory, type GateRect } from "../src/app/lib/captureReadiness.ts";

const guide = {x:60,y:60,width:280,height:160};
async function physicalFrame(box: GateRect, background=35): Promise<GateFrame> {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280"><rect width="100%" height="100%" fill="rgb(${background},${background},${background})"/><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="white"/>${Array.from({length:5},(_,i)=>`<text x="${box.x+5}" y="${box.y+15+i*(box.height-20)/5}" font-size="9">INV-052${i} UNIT B06 $1099.00</text>`).join("")}</svg>`;
  const {data}=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return measureCaptureFrame(new Uint8ClampedArray(data),400,280,{x:0,y:0,width:400,height:280},guide,400,280);
}
function settle(frame: GateFrame, memory: GateMemory={count:0,stable:0}) {let r=captureReadiness(frame,memory);for(let i=0;i<3;i++)r=captureReadiness(frame,memory);return r;}
for(const [label,box,expected] of [
  ["small",{x:150,y:110,width:100,height:50},"closer"],
  ["large",{x:30,y:35,width:340,height:210},"farther"],
  ["contained",{x:80,y:75,width:240,height:130},"ready"],
  ["offset",{x:130,y:75,width:240,height:130},"reposition"],
] as const) {
  const f=await physicalFrame(box),r=settle(f);
  console.log(JSON.stringify({label,measured:f.document,widthRatio:r.widthRatio,heightRatio:r.heightRatio,coverage:f.paperCoverage,blur:f.blurScore,decision:r.kind}));
  assert.equal(r.kind,expected);
}
const base=await physicalFrame({x:80,y:75,width:240,height:130});
// Bright paper backgrounds were classified as too large; now boundaries are required.
const white=await physicalFrame({x:80,y:75,width:240,height:130},255);
assert(white.paperCoverage>.94);assert.equal(settle(white).kind,"undetected");
// Rotation of both live-video rectangles preserves ratios (EXIF is not an input).
const turn=(r:GateRect):GateRect=>({x:280-r.y-r.height,y:r.x,width:r.height,height:r.width});
const portrait={...base,document:turn(base.document!),guide:turn(guide),videoWidth:280,videoHeight:400};
assert.equal(settle(portrait).kind,"ready");
assert.equal(settle(portrait).scaleScore,settle(base).scaleScore);
const turn270=(r:GateRect):GateRect=>({x:r.y,y:400-r.x-r.width,width:r.height,height:r.width});
assert.equal(settle({...base,document:turn270(base.document!),guide:turn270(guide),videoWidth:280,videoHeight:400}).kind,"ready");
// Semantic still rotations cannot change the live model. Changing live resolution resets stability.
const mem:GateMemory={count:0,stable:0};settle(base,mem);
assert.equal(captureReadiness({...base,videoWidth:800},mem).ready,false);
// A direction must persist for three samples. Opposing jitter never flips closer/farther every frame.
const jitter:GateMemory={count:0,stable:0}; const outputs=[];
for(let i=0;i<20;i++)outputs.push(captureReadiness({...base,document:{x:60,y:60,width:280*(i%2?.69:1.05),height:100}},jitter).kind);
assert(outputs.every(k=>k==="steady"));
// Once Ready, small fluctuations around 70% remain inside the exit threshold.
const stable:GateMemory={count:0,stable:0};
settle({...base,document:{x:90,y:80,width:200,height:95}},stable);
for(const ratio of [.695,.705,.69,.71]) assert.equal(captureReadiness({...base,document:{x:90,y:80,width:280*ratio,height:95}},stable).kind,"ready");
assert.equal(settle({...base,brightness:40}).ready,false);
assert.equal(settle({...base,blurScore:2}).ready,false);
assert.equal(settle({...base,document:null}).kind,"undetected");
assert.equal(settle({...base,minimumGuideShortEdge:980}).ready,false);
console.log("Capture gate pixel simulations, containment, scale, stability, rotation and quality regressions passed.");
