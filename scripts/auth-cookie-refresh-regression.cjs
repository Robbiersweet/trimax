/* eslint-disable @typescript-eslint/no-require-imports -- Execute the real proxy with synthetic cookie adapters, never real credentials. */
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
const compile=(file,adapter)=>{const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(adapter,mod,mod.exports);return mod.exports;};
const routes=compile('src/app/lib/publicScheduling/routes.ts',require);
async function run(){
 const originalUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,originalKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://synthetic.invalid';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-public-key';
 try{
  let calls=0,issued=0,offline=false;const responses=[];
  const next=({request}={})=>{const values=new Map();const response={request,cookies:{set:(name,value,options)=>values.set(name,{value,options}),getAll:()=>[...values].map(([name,o])=>({name,...o}))},headers:new Headers(),issued:++issued};responses.push(response);return response;};
  const proxy=compile('src/proxy.ts',name=>name==='next/server'?{NextResponse:{next}}:name==='@supabase/ssr'?{createServerClient:(_url,_key,options)=>({auth:{getClaims:async()=>{calls++;if(offline)throw new TypeError("Synthetic transport failure");assert.equal(options.cookies.getAll()[0].value,'expired-synthetic');options.cookies.setAll([{name:'session.0',value:'fresh-synthetic-0',options:{path:'/',secure:true,sameSite:'lax'}},{name:'session.1',value:'fresh-synthetic-1',options:{path:'/',secure:true,sameSite:'lax'}}],{'Cache-Control':'no-cache','Pragma':'no-cache'});return {data:{claims:{sub:'synthetic-user'}}};}}})}:name.includes('publicScheduling/routes')?routes:require(name));
  const request=path=>{const data=new Map([['session.0','expired-synthetic']]);return{nextUrl:{pathname:path},cookies:{getAll:()=>[...data].map(([name,value])=>({name,value})),set:(name,value)=>data.set(name,value)}};};
  const input=request('/admin/ocr-attempts');const result=await proxy.proxy(input);
  assert.equal(calls,1);assert.equal(result,responses.at(-1),'Return the response containing refreshed cookies');
  assert.equal(input.cookies.getAll().find(c=>c.name==='session.0').value,'fresh-synthetic-0','Server Components receive refreshed request cookies');
  assert.equal(result.cookies.getAll().length,2,'Browser receives every refreshed cookie chunk');
  assert(result.cookies.getAll().every(c=>c.options.secure&&c.options.path==='/'&&c.options.sameSite==='lax'),'Preserve SDK cookie protections');
  assert.equal(result.headers.get('Cache-Control'),'private, no-store');assert.equal(result.headers.get('Pragma'),'no-cache');
  await proxy.proxy(request('/book/rnl-creations'));assert.equal(calls,1,'Public scheduling remains outside employee auth refresh');
  offline=true;const temporary=await proxy.proxy(request('/payments'));assert.equal(temporary.cookies.getAll().length,0,'Transport outage must not clear browser cookies or redirect to login');assert.equal(temporary.headers.get('location'),null);
  const pattern=new RegExp('^'+proxy.config.matcher[0]+'$');
  for(const path of ['/payments','/invoices','/admin/ocr-attempts','/login'])assert(pattern.test(path));
  for(const path of ['/api/ocr/legacy','/_next/static/test.js','/_next/image','/sw.js','/manifest.webmanifest','/Brand/logo.png'])assert(!pattern.test(path),path);
  console.log('PASS real proxy request/browser cookie refresh, chunks/options, private cache, verified claims and public/asset/API boundary');
 }finally{if(originalUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=originalUrl;if(originalKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=originalKey;}
}
run().catch(error=>{console.error(error);process.exitCode=1});
