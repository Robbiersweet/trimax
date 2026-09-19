// Live-video framing only. Still-image/EXIF/OCR coordinates never enter this model.
export type GateRect = { x: number; y: number; width: number; height: number };
export type GateFrame = {
  document: GateRect | null;
  guide: GateRect;
  videoWidth: number;
  videoHeight: number;
  brightness: number;
  contrast: number;
  blurScore: number;
  paperCoverage: number; // Diagnostic only: white pixels are not document scale.
  minimumGuideShortEdge?: number;
};
export type GateKind = "ready" | "closer" | "farther" | "reposition" | "steady" | "undetected";
export type GateMemory = { previous?: GateFrame; direction?: GateKind; pending?: GateKind; count: number; stable: number };
export type GateDecision = {
  ready: boolean; kind: GateKind; message: string; reason: string;
  frame: GateFrame; widthRatio: number | null; heightRatio: number | null;
  contained: boolean; scaleScore: number | null; stabilityScore: number;
  orientation: string; coordinateSystem: "native-video";
};
export const gateThresholds = { minScale: 0.7, minEnter: 0.67, minExit: 0.73, maxEnter: 1.04, maxExit: 1, containmentTolerance: 0.015, maxMotion: 0.03, stableFrames: 2, guidanceFrames: 3 };
const messages: Record<GateKind, string> = {
  ready: "Ready", closer: "Move closer", farther: "Move farther away - show the full remittance",
  reposition: "Reposition - fit the document inside the guide", steady: "Hold steady / improve detection",
  undetected: "Unable to detect document - use a darker background",
};

export function captureReadiness(frame: GateFrame, memory: GateMemory): GateDecision {
  const { document: box, guide } = frame;
  const valid = guide.width > 0 && guide.height > 0 && frame.videoWidth > 0 && frame.videoHeight > 0;
  const widthRatio = box && valid ? box.width / guide.width : null;
  const heightRatio = box && valid ? box.height / guide.height : null;
  const scale = widthRatio == null || heightRatio == null ? null : Math.max(widthRatio, heightRatio);
  const t = gateThresholds;
  const contained = Boolean(box && valid && box.x >= guide.x - guide.width * t.containmentTolerance && box.y >= guide.y - guide.height * t.containmentTolerance && box.x + box.width <= guide.x + guide.width * (1 + t.containmentTolerance) && box.y + box.height <= guide.y + guide.height * (1 + t.containmentTolerance));
  const previous = memory.previous;
  const sameGeometry = previous && previous.videoWidth === frame.videoWidth && previous.videoHeight === frame.videoHeight && JSON.stringify(previous.guide) === JSON.stringify(guide);
  if (!sameGeometry) { memory.stable = 0; memory.direction = undefined; memory.pending = undefined; memory.count = 0; }
  const old = sameGeometry ? previous?.document : null;
  const motion = box && old ? Math.max(Math.abs(box.x-old.x)/guide.width, Math.abs(box.y-old.y)/guide.height, Math.abs(box.width-old.width)/guide.width, Math.abs(box.height-old.height)/guide.height) : 1;
  memory.stable = motion <= t.maxMotion ? memory.stable + 1 : 0;
  let kind: GateKind = "undetected", reason = "No bounded document detected in live video";
  if (box && valid && scale != null) {
    // Oversize cannot be fixed by translating the document; otherwise containment wins.
    if (scale > (memory.direction === "farther" ? t.maxExit : t.maxEnter)) { kind = "farther"; reason = "Document exceeds guide size"; }
    else if (!contained) { kind = "reposition"; reason = "Document extends outside guide"; }
    else if (scale < (memory.direction === "closer" ? t.minExit : memory.direction === "ready" ? t.minEnter : t.minScale)) { kind = "closer"; reason = "Document occupies too little of guide"; }
    else if (Math.min(guide.width,guide.height) < (frame.minimumGuideShortEdge ?? 0)) { kind = "steady"; reason = "Capture stub separately - full check and stub resolution is insufficient"; }
    else if (frame.brightness < 72 || frame.contrast < 20 || frame.blurScore < 7.5) { kind = "steady"; reason = frame.brightness < 72 ? "More light needed" : frame.contrast < 20 ? "Improve document/background contrast" : "Image is blurry"; }
    else { kind = "ready"; reason = "Document contained, scale and image quality acceptable"; }
  }
  memory.count = memory.pending === kind ? memory.count + 1 : 1;
  memory.pending = kind;
  if (memory.count >= t.guidanceFrames) memory.direction = kind;
  const rawKind = kind;
  if (kind === "ready" && (memory.stable < t.stableFrames || memory.count < t.guidanceFrames)) { kind = "steady"; reason = "Waiting for stable document bounds"; }
  else if (kind !== "ready" && memory.count < t.guidanceFrames) { kind = "steady"; reason = `Confirming framing: ${reason}`; }
  memory.previous = frame;
  return { ready: kind === "ready" && rawKind === "ready", kind, message: kind === "steady" && rawKind === "steady" ? `${messages[kind]} - ${reason}` : messages[kind], reason, frame,
    widthRatio, heightRatio, contained, scaleScore: scale, stabilityScore: Math.max(0, 1-motion),
    orientation: frame.videoWidth >= frame.videoHeight ? "landscape live video (text orientation unknown)" : "portrait live video (text orientation unknown)", coordinateSystem: "native-video" };
}

// Find the largest connected paper region in the visible video, including OUTSIDE
// the guide. A guide-only crop cannot establish document containment.
export function measureCaptureFrame(pixels: Uint8ClampedArray, width: number, height: number, visible: GateRect, guide: GateRect, videoWidth: number, videoHeight: number): GateFrame {
  const n = width * height, gray = new Float32Array(n), mask = new Uint8Array(n);
  let total = 0, squared = 0, hits = 0, samples = 0, edges = 0, edgeCount = 0;
  for (let i = 0; i < n; i++) {
    const r=pixels[i*4], g=pixels[i*4+1], b=pixels[i*4+2];
    gray[i]=r*.299+g*.587+b*.114;
    mask[i]=((gray[i]>145 && Math.max(r,g,b)-Math.min(r,g,b)<72)||gray[i]>198)?1:0;
  }
  const inGuide = (x: number, y: number) => {
    const vx=visible.x+x*visible.width/width, vy=visible.y+y*visible.height/height;
    return vx>=guide.x && vy>=guide.y && vx<=guide.x+guide.width && vy<=guide.y+guide.height;
  };
  for(let y=1;y<height-1;y++) for(let x=1;x<width-1;x++) if(inGuide(x,y)) {
    const i=y*width+x, v=gray[i]; total+=v; squared+=v*v; hits+=mask[i]; samples++;
    edges+=Math.abs(gray[i-width]+gray[i+width]+gray[i-1]+gray[i+1]-v*4); edgeCount++;
  }
  const queue=new Int32Array(n); let best: GateRect|null=null, bestArea=0;
  for(let start=0;start<n;start++) {
    if(mask[start]!==1)continue;
    let head=0,tail=1,minX=width,minY=height,maxX=0,maxY=0, overlap=0;
    queue[0]=start;mask[start]=2;
    while(head<tail) {
      const i=queue[head++],x=i%width,y=Math.floor(i/width);
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(inGuide(x,y))overlap++;
      for(const j of [x>0?i-1:-1,x<width-1?i+1:-1,y>0?i-width:-1,y<height-1?i+width:-1]) if(j>=0 && mask[j]===1){mask[j]=2;queue[tail++]=j;}
    }
    const area=(maxX-minX+1)*(maxY-minY+1);
    // Frame-filling white surfaces have no observable document boundary.
    if(overlap>bestArea && tail>=n*.01 && tail/area>.45 && minX>0 && minY>0 && maxX<width-1 && maxY<height-1) {
      bestArea=overlap; best={x:visible.x+minX*visible.width/width,y:visible.y+minY*visible.height/height,width:(maxX-minX+1)*visible.width/width,height:(maxY-minY+1)*visible.height/height};
    }
  }
  const brightness=total/Math.max(1,samples);
  return {document:best,guide,videoWidth,videoHeight,brightness,contrast:Math.sqrt(Math.max(0,squared/Math.max(1,samples)-brightness*brightness)),blurScore:edges/Math.max(1,edgeCount),paperCoverage:hits/Math.max(1,samples)};
}
