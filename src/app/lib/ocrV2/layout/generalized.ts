import { textComponents, median } from './components.ts';
import type { TextComponent } from './types.ts';
import type { Bounds } from '../types.ts';

/** Inactive multi-document geometry experiment. Pixels only; no labels or IDs. */
export async function inspectStructuralLines(input: Buffer) {
    const a = await textComponents(input, 2400, { minimumContrast: 10 });
    const substantial = a.components.filter(c => c.height > a.height * .008 && c.width > c.height * .2 && c.width < c.height * 1.5);
    const font = median(substantial.map(c => c.height));
    const glyphs = a.components.filter(c => c.height >= font * .65 && c.height <= font * 1.8 && c.width <= c.height * 2 && c.pixels / (c.width * c.height) >= .12);
    let slope = 0, best = -Infinity;
    for (let s = -.04; s <= .0401; s += .001) {
        const bins = new Map<number, number>();
        for (const c of glyphs) {
            const y = Math.round((c.centerY - s * (c.left + c.width / 2)) / (font * .6));
            bins.set(y, (bins.get(y) ?? 0) + 1);
        }
        const score = [...bins.values()].sort((x,y)=>y-x).slice(0,12).reduce((sum,n)=>sum+n*n,0);
        if (score > best) { best = score; slope = s; }
    }
    const sorted = glyphs.map(c=>({...c, baseline:c.centerY-slope*(c.left+c.width/2)})).sort((x,y)=>x.baseline-y.baseline);
    const clusters: typeof sorted[] = [];
    for (const c of sorted) {
        const last = clusters.at(-1);
        if (last && c.baseline - median(last.map(x=>x.baseline)) <= font * .55) last.push(c);
        else clusters.push([c]);
    }
    const lines = clusters.filter(cs=>cs.length>=6).map(cs=>{
        const left=Math.min(...cs.map(c=>c.left)), right=Math.max(...cs.map(c=>c.left+c.width));
        const top=Math.min(...cs.map(c=>c.top)), bottom=Math.max(...cs.map(c=>c.top+c.height));
        const ordered=cs.slice().sort((x,y)=>x.left-y.left), words: TextComponent[][]=[];
        for(const c of ordered){const last=words.at(-1); const end=last?Math.max(...last.map(x=>x.left+x.width)):0;
            if(last && c.left-end < font*.65)last.push(c);else words.push([c]);}
        return {left,top,width:right-left,height:bottom-top,center:median(cs.map(c=>c.baseline)),font:median(cs.map(c=>c.height)),count:cs.length,
            words:words.map(ws=>({left:Math.min(...ws.map(c=>c.left)),right:Math.max(...ws.map(c=>c.left+c.width)),count:ws.length})), components:cs};
    });
    return {...a,font,slope,lines};
}

/** Experimental header-aligned layout. No document IDs, transcriptions or business data. */
export async function structuralLayout(input: Buffer) {
    const started = performance.now(), a = await inspectStructuralLines(input), f = a.font;
    const candidates = a.lines.flatMap((line, index) => {
        const ws = line.words.filter(w => w.count >= 3);
        return ws.slice(0,-3).flatMap((invoice,j) => {
            const date=ws[j+1],description=ws[j+2],amount=ws[j+3];
            const iw=invoice.right-invoice.left,dw=date.right-date.left;
            if(iw<4*f || iw>9*f || dw<2*f || dw>iw || date.left-invoice.right>4*f || date.left-invoice.right<.5*f || description.left-date.right<4*f || amount.left-description.right<8*f || description.right-description.left<iw*1.15) return [];
            const following=a.lines.slice(index+1).filter(l=>l.center-line.center<30*f);
            const body=following.filter(l=>l.left<invoice.left && l.left+l.width>amount.right && l.width>a.width*.5);
            const footer=following.find(l=>l.center>(body.at(-1)?.center??line.center) && l.left>description.right && l.width<12*f);
            return body.length && footer ? [{line,invoice,date,description,amount,body,footer,score:body.length*10+line.count}] : [];
        });
    }).sort((x,y)=>y.score-x.score);
    const h=candidates[0];
    const scale=(b:Bounds):Bounds=>({left:Math.floor(b.left*a.scaleX),top:Math.floor(b.top*a.scaleY),width:Math.ceil(b.width*a.scaleX),height:Math.ceil(b.height*a.scaleY)});
    const extent=(cs:TextComponent[],pad=2):Bounds|undefined=>{
        if(!cs.length)return undefined;
        const left=Math.max(0,Math.min(...cs.map(c=>c.left))-pad),top=Math.max(0,Math.min(...cs.map(c=>c.top))-pad);
        return scale({left,top,width:Math.min(a.width,Math.max(...cs.map(c=>c.left+c.width))+pad)-left,height:Math.min(a.height,Math.max(...cs.map(c=>c.top+c.height))+pad)-top});
    };
    const invoiceComponents=(line: typeof a.lines[number])=>{
        if(!h)return [];
        const cs=a.components.filter(c=>c.left>=h.invoice.left-f*.45 && c.left+c.width<h.date.left-f*.4 && Math.abs(c.centerY-a.slope*(c.left+c.width/2)-line.center)<f*.5).sort((x,y)=>x.left-y.left);
        const token:TextComponent[]=[];
        for(const c of cs){if(token.length && c.left-Math.max(...token.map(x=>x.left+x.width))>f*.9)break;token.push(c);}
        return token;
    };
    const rows=h?.body.map((l,i)=>({id:`row-${String(i+1).padStart(4,'0')}`,bounds:extent(l.components)!,
        invoiceRegion:extent(invoiceComponents(l)),
        amountRegion:extent(l.components.filter(c=>c.left>h.amount.left)),
        baseline:{intercept:l.center*a.scaleY,slope:a.slope*a.scaleY/a.scaleX}
    }))??[];
    return {version:'structural-layout-experiment-1',coordinateSpace:'normalized-document-color',sourceWidth:a.sourceWidth,sourceHeight:a.sourceHeight,
        rows,totalCandidateRegion:h?extent(h.footer.components):undefined,headerRegion:h?scale(h.line):undefined,
        diagnostics:{font:f,slope:a.slope,headerCandidates:candidates.length,threshold:a.threshold,durationMs:performance.now()-started,warnings:h?[]:['No supported header/body/footer structure']}};
}
