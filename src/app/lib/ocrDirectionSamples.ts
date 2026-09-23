import sharp from 'sharp';

type Component = { left:number; top:number; width:number; height:number; pixels:number };
type Band = { components:Component[]; y:number };

/** Disposable text samples, never authoritative document crops. No recognized
 * token, vendor, invoice or expected rotation participates in sampling. */
export async function prepareDirectionSamples(input:Buffer) {
  const start=performance.now();
  const gray=await sharp(input).resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).flatten({background:'white'}).grayscale().raw().toBuffer({resolveWithObject:true});
  const {width,height}=gray.info,raw={width,height,channels:1 as const};
  const background=await sharp(gray.data,{raw}).blur(8).grayscale().raw().toBuffer();
  const mask=new Uint8Array(width*height),flat=Buffer.alloc(width*height);
  for(let i=0;i<mask.length;i++) {
    const ink=background[i]-gray.data[i];
    mask[i]=background[i]>150&&ink>8?1:0;
    flat[i]=Math.max(0,Math.min(255,245-ink*9));
  }
  const queue=new Int32Array(mask.length),components:Component[]=[];
  for(let start=0;start<mask.length;start++) {
    if(!mask[start])continue;
    let head=0,tail=1,x0=width,y0=height,x1=0,y1=0;queue[0]=start;mask[start]=0;
    while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      for(const j of [x?i-1:-1,x<width-1?i+1:-1,y?i-width:-1,y<height-1?i+width:-1])if(j>=0&&mask[j]){mask[j]=0;queue[tail++]=j;}}
    const w=x1-x0+1,h=y1-y0+1;
    if(w>=2&&h>=2&&w<=28&&h<=28&&w/h>=.25&&w/h<=4&&tail>=5&&tail/(w*h)>=.08&&tail/(w*h)<=.95)components.push({left:x0,top:y0,width:w,height:h,pixels:tail});
  }
  const axes=[];
  for(const angle of [0,90]) {
    const w=angle?height:width,h=angle?width:height;
    const cs=components.map(c=>angle?{...c,left:height-c.top-c.height,top:c.left,width:c.height,height:c.width}:c).sort((a,b)=>a.top+a.height/2-b.top-b.height/2);
    const bands:Band[]=[];
    for(const c of cs){const cy=c.top+c.height/2;let b=bands.find(b=>Math.abs(b.y-cy)<=Math.max(2,Math.min(c.height,12)*.5));if(!b){b={components:[],y:cy};bands.push(b);}b.components.push(c);b.y=b.components.reduce((s,c)=>s+c.top+c.height/2,0)/b.components.length;}
    const runs:Component[][]=[];
    for(const b of bands){let run:Component[]=[];for(const c of b.components.sort((a,b)=>a.left-b.left)){const prev=run.at(-1);if(prev&&c.left-prev.left-prev.width>Math.max(prev.height,c.height)*4){if(run.length>=8)runs.push(run);run=[];}run.push(c);}if(run.length>=8)runs.push(run);}
    const regions=runs.sort((a,b)=>b.length-a.length).map(cs=>{
      const left=Math.max(0,Math.min(...cs.map(c=>c.left))-5),top=Math.max(0,Math.min(...cs.map(c=>c.top))-5);
      return {left,top,width:Math.min(1000,w-left,Math.max(...cs.map(c=>c.left+c.width))-left+5),height:Math.min(h-top,Math.max(...cs.map(c=>c.top+c.height))-top+5),components:cs.length};
    }).filter(b=>b.height<=35&&b.width>=80).slice(0,3);
    const strips=[];const rotated=await sharp(flat,{raw}).rotate(angle).png().toBuffer();
    for(const {left,top,width,height} of regions)strips.push(await sharp(rotated).extract({left,top,width,height}).png().toBuffer());
    const outWidth=Math.max(32,...regions.map(r=>r.width+20)),outHeight=Math.max(32,regions.reduce((s,r)=>s+r.height+16,16));
    let y=16;const composite=strips.map((input,i)=>{const top=y;y+=regions[i].height+16;return{input,left:10,top}});
    const image=await sharp({create:{width:outWidth,height:outHeight,channels:3,background:'white'}}).composite(composite).png().toBuffer();
    axes.push({angle,image,regions,width:outWidth,height:outHeight});
  }
  return {axes,componentCount:components.length,sourceDimensions:{width,height},durationMs:performance.now()-start};
}
