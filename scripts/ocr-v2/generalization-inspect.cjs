/* eslint-disable @typescript-eslint/no-require-imports -- Offline development diagnostics, no holdout access. */
const fs=require('fs'),path=require('path');
const {inspectStructuralLines}=require('../../src/app/lib/ocrV2/layout/generalized.ts');
(async()=>{const root=process.argv[2];for(const id of ['A','D','check2715','check2721','check2734','check2743']){
const input=fs.readFileSync(path.join(root,'optics',id,'document.png'));
const a=await inspectStructuralLines(input);
fs.writeFileSync(path.join(root,'optics',id,'generalization-components.json'),JSON.stringify(a));
console.log(JSON.stringify({id,width:a.width,height:a.height,font:a.font,slope:a.slope,lines:a.lines.map(r=>({...r,components:undefined}))}));
}})();
