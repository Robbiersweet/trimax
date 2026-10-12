/* eslint-disable @typescript-eslint/no-require-imports -- Execute the actual TSX with the installed TypeScript compiler. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ts=require('typescript'),React=require('react'),{create,act}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const filename=path.resolve('src/app/book/TurnstileChallenge.tsx');
const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const loaded=new Module(filename,module);loaded.filename=filename;loaded.paths=module.paths;loaded._compile(compiled,filename);
const Challenge=loaded.exports.default;
(async()=>{
 let options,removed=0,rendered=0,tokens=[];
 const api={render:(_node,value)=>{options=value;return String(++rendered);},remove:()=>removed++};
 global.window={turnstile:api};let root;
 await act(async()=>{root=create(React.createElement(Challenge,{siteKey:'site',onToken:t=>tokens.push(t)}),{createNodeMock:()=>({})});});
 assert.equal(rendered,1);assert.equal(options.action,'public-scheduling');
 await act(async()=>options.callback('verified'));assert.equal(tokens.at(-1),'verified');
 await act(async()=>options['expired-callback']());assert.equal(tokens.at(-1),'');
 const stale=options;
 await act(async()=>root.root.findByType('button').props.onClick());assert.equal(rendered,2);assert.equal(removed,1);
 await act(async()=>stale.callback('late'));assert.notEqual(tokens.at(-1),'late');
 await act(async()=>root.unmount());assert.equal(removed,2);
 global.window={};let script,loads=0;
 global.document={createElement:()=>({remove(){}}),head:{appendChild:s=>{script=s;loads++;}}};
 await act(async()=>{root=create(React.createElement(Challenge,{siteKey:'site',onToken:t=>tokens.push(t)}),{createNodeMock:()=>({})});});
 await act(async()=>script.onerror());assert.equal(root.root.findAllByType('button').length,1);
 await act(async()=>root.root.findByType('button').props.onClick());assert.equal(loads,2,'failed loader can be retried without clearing form');
 global.window.turnstile=api;await act(async()=>script.onload());assert.equal(rendered,3);
 await act(async()=>root.unmount());
 console.log('Turnstile widget expiry/retry/stale-callback/unmount regression PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
