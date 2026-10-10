/* eslint-disable @typescript-eslint/no-require-imports -- Read-only instrumentation of the original sampler; no inference changes. */
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),cp=require('node:child_process');
const file=path.resolve('src/app/lib/ocrDirectionSamples.ts');
let source=process.argv[4]?cp.execFileSync('git',['show',process.argv[4]+':src/app/lib/ocrDirectionSamples.ts'],{encoding:'utf8'}):fs.readFileSync(file,'utf8');
const audit={components:[],axes:[]};
source=source.replace('const w=x1-x0+1,h=y1-y0+1;',`const w=x1-x0+1,h=y1-y0+1;
 const rejected=[];if(w<2||h<2)rejected.push('minimum dimension');if(w>28||h>28)rejected.push('maximum dimension 28');if(w/h<.25||w/h>4)rejected.push('aspect ratio');if(tail<5)rejected.push('ink pixels');if(tail/(w*h)<.08||tail/(w*h)>.95)rejected.push('fill ratio');
 audit.components.push({id:audit.components.length,left:x0,top:y0,width:w,height:h,area:w*h,inkPixels:tail,aspectRatio:w/h,accepted:!rejected.length,rejected});`);
source=source.replace(/const (regions|selected)=runs.sort/,(_,name)=>`audit.axes.push({angle,bands:bands.map((b,i)=>({id:i,y:b.y,components:b.components})),runs:runs.map((cs,i)=>({id:i,components:cs}))});
 const ${name}=runs.sort`);
source=source.replace('const strips=[];',`audit.axes.at(-1).selectedRegions=regions;
 const strips=[];`);
const mod={exports:{}};
new Function('require','module','exports','audit',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(s=>require(s),mod,mod.exports,audit);
(async()=>{const result=await mod.exports.prepareDirectionSamples(fs.readFileSync(process.argv[2]));audit.result={componentCount:result.componentCount,sourceDimensions:result.sourceDimensions,axes:result.axes.map(({image,...axis})=>({...axis,bytes:image.length}))};fs.mkdirSync(process.argv[3],{recursive:true});fs.writeFileSync(path.join(process.argv[3],'sampling-audit.json'),JSON.stringify(audit,null,2));for(const a of result.axes)fs.writeFileSync(path.join(process.argv[3],`axis-${a.angle}.png`),a.image);console.log(JSON.stringify({components:audit.components.length,accepted:audit.components.filter(c=>c.accepted).length,rejections:audit.components.reduce((n,c)=>{for(const r of c.rejected)n[r]=(n[r]||0)+1;return n;},{}),axes:audit.axes.map(a=>({angle:a.angle,bands:a.bands.length,runs:a.runs.length,regions:a.selectedRegions.length})),result:audit.result}));})().catch(e=>{console.error(e);process.exitCode=1;});
