/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the real login form with isolated auth adapters. */
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react'),renderer=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
function compile(file,resolve=require){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(resolve,mod,mod.exports);return mod.exports;}
const returns=compile('src/app/lib/loginReturn.ts');
async function login(next){
 const navigations=[];let marked=false;
 global.window={location:{replace:url=>navigations.push(url)}};
 const params=new URLSearchParams({business:'rnl-creations',...(next?{next}:{})});
 const wrapper=({children})=>React.createElement('div',null,children);
 const Page=compile('src/app/login/page.tsx',name=>{
  if(name==='next/navigation')return{useSearchParams:()=>params};
  if(name==='next/link')return{default:wrapper};
  if(name==='../lib/loginReturn')return returns;
  if(name==='../lib/supabase')return{supabase:{auth:{signInWithPassword:async()=>({data:{session:{user:{id:'fixture'}}},error:null})}}};
  if(name==='../lib/sessionSecurity')return{sessionSecurityMessage:()=>null,startSecureBrowserSession:()=>{marked=true;}};
  if(name==='../lib/workspaceAccess')return{loadWorkspaceAccess:async()=>[],preferredWorkspaceSlug:()=> 'rnl-creations'};
  if(name==='../components/InputField')return{default:props=>React.createElement('input',props)};
  if(name==='../components/Button')return{default:props=>React.createElement('button',props)};
  if(name.startsWith('../components/'))return{default:wrapper};
  return require(name);
 }).default;
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(Page));});
 const inputs=tree.root.findAllByType('input');
 await renderer.act(async()=>{inputs[0].props.onChange('owner@example.invalid');inputs[1].props.onChange('fixture-only');});
 await renderer.act(async()=>{await tree.root.findByType('form').props.onSubmit({preventDefault(){}});});
 assert(marked,'Secure browser marker still required');assert.equal(navigations.length,1);
 await renderer.act(async()=>tree.unmount());return navigations[0];
}
(async()=>{
 const target='/admin/service-requests?business=rnl-creations&request=c27947e5-168e-4876-8110-620f8662a190';
 assert.equal(await login(target),target);
 assert.equal(await login(null),'/?business=rnl-creations');
 assert.equal(await login('//attacker.invalid'),'/?business=rnl-creations');
 console.log('Actual login submit preserves notification destination; ordinary login and external-target rejection PASS.');
})().catch(error=>{console.error(error);process.exitCode=1;});
