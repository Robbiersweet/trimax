/* eslint-disable @typescript-eslint/no-require-imports -- Browser acceptance of the actual camera component with synthetic pixels; no production requests. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const ts=require('typescript'),webpack=require('next/dist/compiled/webpack/webpack').webpack;
const root=process.cwd();
async function run(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trimax-camera-rebuild-'));
 const compile=(source)=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 fs.writeFileSync(path.join(temp,'deadline.js'),compile(fs.readFileSync('src/app/lib/remittanceDeadline.ts','utf8')));
 fs.writeFileSync(path.join(temp,'camera.js'),compile(fs.readFileSync('src/app/components/RemittanceCamera.tsx','utf8')).replace('../lib/remittanceDeadline','./deadline'));
 fs.writeFileSync(path.join(temp,'optical.js'),compile(fs.readFileSync('src/app/lib/ocrOptical.ts','utf8')));
 fs.writeFileSync(path.join(temp,'browser-optical.js'),compile(fs.readFileSync('src/app/lib/ocrOpticalBrowser.ts','utf8')).replace('./ocrOptical','./optical'));
 fs.writeFileSync(path.join(temp,'entry.js'),`const React=require('react'),{createRoot}=require('react-dom/client'),Camera=require('./camera').default;
 window.normalizeImage=require('./browser-optical').normalizePhysicalStill;
 window.cameraRoot=createRoot(document.getElementById('root'));
 const close=()=>{window.cancelled=true;window.cameraRoot.render(null)};
 window.openCamera=()=>window.cameraRoot.render(React.createElement(Camera,{onCancel:close,onManual:()=>{window.manual=true;close()},onCapture:async(file,source)=>{window.captured={source,bytes:file.size};close();const image=await createImageBitmap(file);window.captured.width=image.width;window.captured.height=image.height;image.close();}}));window.openCamera();`);
 await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,target:'web',entry:path.join(temp,'entry.js'),output:{path:temp,filename:'bundle.js'},resolve:{modules:[path.join(root,'node_modules'),'node_modules']},optimization:{minimize:false}},(err,stats)=>err||stats.hasErrors()?reject(err??Error(stats.toString({all:false,errors:true}))):resolve()));
 const css=await require('postcss')([require('@tailwindcss/postcss')({base:root})]).process('@import "tailwindcss";',{from:path.join(root,'camera-harness.css')});
 fs.writeFileSync(path.join(temp,'style.css'),css.css);
 const server=http.createServer((req,res)=>{const name=req.url==='/bundle.js'?'bundle.js':req.url==='/style.css'?'style.css':null;if(name){res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(path.join(temp,name)));}else{res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await require('puppeteer-core').launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
 const failures=[];
 try{
  let page;
  let mode='normal';
  async function open(nextMode='normal',width=844,height=390){mode=nextMode;if(page)await page.close();page=await browser.newPage();page.on('pageerror',error=>failures.push(error.message));await page.setViewport({width,height,isMobile:true,hasTouch:true});await page.evaluateOnNewDocument(testMode=>{
    window.stopped=0;window.requests=[];const timer=window.setTimeout.bind(window);if(testMode!=='normal')window.setTimeout=(fn,ms,...args)=>timer(fn,ms>=8000?500:ms,...args);
    const canvas=document.createElement('canvas');canvas.width=2560;canvas.height=1440;const ctx=canvas.getContext('2d');ctx.fillStyle='#555';ctx.fillRect(0,0,2560,1440);ctx.fillStyle='#fff';ctx.fillRect(250,430,2060,580);ctx.fillStyle='#111';ctx.font='bold 68px sans-serif';ctx.fillText('REMITTANCE — ALL FOUR EDGES',350,620);
    const makeStream=()=>{const stream=canvas.captureStream(10);setInterval(()=>{ctx.fillRect(0,0,2,2)},100);stream.getTracks().forEach(track=>{const stop=track.stop.bind(track);track.stop=()=>{window.stopped++;stop()}});return stream;};
    Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>testMode==='denied'?Promise.reject(new DOMException('denied','NotAllowedError')):testMode==='late'?new Promise(resolve=>{window.grantLate=()=>resolve(makeStream())}):testMode==='permission-hang'?new Promise(()=>{}):Promise.resolve(makeStream())},configurable:true});
    if(testMode==='play-hang')HTMLMediaElement.prototype.play=()=>new Promise(()=>{});
    if(testMode==='blob-hang')HTMLCanvasElement.prototype.toBlob=()=>{};
  },mode);await page.goto('http://127.0.0.1:'+server.address().port);}
  await open('normal',390,844);await page.waitForFunction(()=>document.body.innerText.includes('Ready to capture'));
  assert(await page.$eval('button',()=>document.body.innerText.includes('Rotate phone to landscape')));
  assert(await page.$$eval('button',buttons=>buttons.find(b=>b.textContent==='Capture').disabled));
  await page.setViewport({width:844,height:390,isMobile:true,hasTouch:true});
  await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Capture').disabled);
  const geometry=await page.evaluate(()=>{const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return {video:rect(document.querySelector('video')),guide:rect(document.querySelector('[aria-label="Document framing guide"]')),buttons:Array.from(document.querySelectorAll('button,label')).map(rect)}});
  assert(geometry.guide.x>=geometry.video.x&&geometry.guide.right<=geometry.video.right&&geometry.guide.y>=geometry.video.y&&geometry.guide.bottom<=geometry.video.bottom);
  for(const button of geometry.buttons){assert(button.y>=0&&button.bottom<=390&&button.x>=0&&button.right<=844,JSON.stringify(button));assert(button.height>=44);}
  await page.screenshot({path:path.join(temp,'landscape.png')});
  await page.evaluate(()=>{const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Capture');button.click();button.click()});
  await page.waitForFunction(()=>window.captured?.width);const captured=await page.evaluate(()=>({captured:window.captured,stopped:window.stopped}));assert.equal(captured.captured.width,2560);assert.equal(captured.captured.height,1440);assert.equal(captured.captured.source,'camera');assert(captured.stopped>=1);
  for(const scenario of ['denied','permission-hang','play-hang','blob-hang']){
   await open(scenario);if(scenario==='blob-hang'){await page.waitForFunction(()=>document.body.innerText.includes('Ready to capture'));await page.evaluate(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Capture').click());}
   await page.waitForSelector('[role="alert"]');assert(await page.$eval('[role="alert"]',el=>el.textContent.length>15));assert(await page.$$eval('button',buttons=>buttons.some(b=>b.textContent==='Retry Camera')));
   assert(await page.$$eval('button',buttons=>buttons.some(b=>b.textContent==='Enter Manually')));
  }
  await open('late');await page.waitForSelector('video');await page.evaluate(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Cancel').click());await page.evaluate(()=>window.grantLate());await page.waitForFunction(()=>window.stopped>=1);assert.equal(await page.$('video'),null);
  await open();await page.waitForFunction(()=>document.body.innerText.includes('Ready to capture'));await page.evaluate(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Enter Manually').click());assert(await page.evaluate(()=>window.manual));assert(await page.evaluate(()=>window.stopped>=1));
  const sharp=require('sharp');
  const corners=Buffer.from('<svg width="640" height="400"><rect width="320" height="200" fill="red"/><rect x="320" width="320" height="200" fill="lime"/><rect y="200" width="320" height="200" fill="blue"/><rect x="320" y="200" width="320" height="200" fill="yellow"/></svg>');
  for(let orientation=1;orientation<=8;orientation++){
   const input=await sharp(corners).withMetadata({orientation}).jpeg({quality:100}).toBuffer();
   const normalized=await page.evaluate(async base64=>{const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const result=await window.normalizeImage(new File([bytes],'exif.jpg',{type:'image/jpeg'}));return {data:btoa(String.fromCharCode(...new Uint8Array(await result.file.arrayBuffer()))),metadata:result.metadata};},input.toString('base64'));
   const actual=Buffer.from(normalized.data,'base64'),metadata=await sharp(actual).metadata();assert.equal(metadata.orientation,undefined);
   const expected=await sharp(input).rotate().removeAlpha().raw().toBuffer({resolveWithObject:true});const result=await sharp(actual).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(result.info.width,expected.info.width);assert.equal(result.info.height,expected.info.height);
   for(const [x,y]of [[20,20],[result.info.width-20,20],[20,result.info.height-20],[result.info.width-20,result.info.height-20]])for(let channel=0;channel<3;channel++){const index=(y*result.info.width+x)*3+channel;assert(Math.abs(result.data[index]-expected.data[index])<12,'EXIF '+orientation+' corner mismatch');}
  }
  assert.deepEqual(failures,[]);console.log(JSON.stringify({status:'PASS',cases:['portrait capture blocked','landscape guide inside live pixels','touch controls in viewport','full resolution capture','double tap guarded','permission denial','permission timeout','preview timeout','encoding timeout','late permission stream released','cancel cleanup','manual entry','all eight EXIF transforms preserve corners and dimensions'],screenshot:path.join(temp,'landscape.png')}));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1});
