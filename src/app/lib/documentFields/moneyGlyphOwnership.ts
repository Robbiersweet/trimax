import type {Bounds} from '../ocrV2/types.ts';
type Component={left:number;top:number;width:number;height:number;pixels:number};
/** Refine only the vertical ownership of an already localized money field.
 * Connected glyphs exclude long rules before recognition; no OCR value or sum
 * participates. Preserve the entire horizontal field and punctuation margin. */
export function glyphOwnedMoneyBounds(owner:Bounds,components:Component[],scaleX:number,scaleY:number,font:number){
 const inside=components.map(c=>({...c,left:c.left*scaleX,top:c.top*scaleY,width:c.width*scaleX,height:c.height*scaleY})).filter(c=>c.left>=owner.left&&c.left+c.width<=owner.left+owner.width&&c.top>=owner.top&&c.top+c.height<=owner.top+owner.height&&c.pixels>=3);
 const glyphs=inside.filter(c=>c.height>=font*.15&&c.height<=font*1.8&&c.width<=c.height*5);
 if(glyphs.length<4)return owner;
 const heights=glyphs.map(c=>c.height).sort((a,b)=>a-b),height=heights[Math.floor(heights.length*.7)],major=glyphs.filter(c=>c.height>=height*.5);
 if(major.length<3)return owner;
 const centers=major.map(c=>c.top+c.height/2),center=centers.sort((a,b)=>a-b)[Math.floor(centers.length/2)];
 if(major.some(c=>Math.abs(c.top+c.height/2-center)>height*.75))return owner;
 const all=glyphs.filter(c=>c.top+c.height>=center-height&&c.top<=center+height);
 if(Math.max(...all.map(c=>c.left+c.width))-Math.min(...all.map(c=>c.left))<owner.width*.5)return owner;
 const pad=Math.max(2,Math.ceil(height*.1)),top=Math.max(owner.top,Math.floor(Math.min(...all.map(c=>c.top))-pad)),bottom=Math.min(owner.top+owner.height,Math.ceil(Math.max(...all.map(c=>c.top+c.height))+pad));
 if(bottom<=top||bottom-top>=owner.height*.95)return owner;
 // Tiny punctuation or a short minus sign is data, even when excluded from
 // the font estimate. If its ownership would change, keep the original field.
 if(inside.some(c=>c.width<=font*.8&&c.height<=font*.4&&(c.top<top||c.top+c.height>bottom)))return owner;
 return {...owner,top,height:bottom-top};
}
