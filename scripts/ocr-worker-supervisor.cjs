/* eslint-disable @typescript-eslint/no-require-imports -- Private supervised workers; no payment capability. */
const net=require('node:net'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
function supervise(spec,{fork=cp.fork,now=Date.now,schedule=setTimeout,cancel=clearTimeout,log=console.log}={}){
 let child=null,lastSeen=0,acknowledged=false,restartTimer=null,stopping=false;
 function start(){
  if(stopping)return;
  lastSeen=now();acknowledged=false;
  child=fork(spec.script,[spec.config],{cwd:spec.cwd,execArgv:['--experimental-strip-types'],windowsHide:true,stdio:['ignore',spec.out,spec.err,'ipc']});
  log(JSON.stringify({event:'started',engine:spec.engine,pid:child.pid,at:new Date(now()).toISOString()}));
  child.on('message',message=>{if(message?.kind==='alive'&&message.engine===spec.engine){lastSeen=now();acknowledged=true;}});
  child.once('exit',(code,signal)=>{child=null;log(JSON.stringify({event:'exited',engine:spec.engine,code,signal,at:new Date(now()).toISOString()}));if(!stopping)restartTimer=schedule(start,5000);});
  child.on('error',error=>log(JSON.stringify({event:'spawn-error',engine:spec.engine,error:error.message})));
 }
 function check(){if(child&&now()-lastSeen>120000){log(JSON.stringify({event:'unresponsive',engine:spec.engine,pid:child.pid}));child.kill();}}
 start();return {check,state(){return {engine:spec.engine,pid:child?.pid??null,validated:acknowledged,lastSeenAt:new Date(lastSeen).toISOString()};},stop(){stopping=true;if(restartTimer)cancel(restartTimer);child?.kill();}};
}
async function main(configRoot,logRoot){
 if(!configRoot||!logRoot)throw Error('Usage: supervisor PRIVATE_CONFIG_ROOT PRIVATE_LOG_ROOT');
 const root=path.resolve(__dirname,'..');
 for(const dir of [configRoot,logRoot])if(!path.relative(root,path.resolve(dir)).startsWith('..'))throw Error('Private configuration/logs must be outside the repository');
 fs.mkdirSync(logRoot,{recursive:true});
 // OS-owned mutex disappears on exit; stale PID files cannot block reboot recovery.
 const lock=net.createServer();
 await new Promise((resolve,reject)=>{lock.once('error',reject);lock.listen('\\\\.\\pipe\\trimax-ocr-supervisor',resolve);});
 const workers=['legacy','v2-shadow'].map(engine=>{
  const folder=engine==='legacy'?'ocr-legacy-worker':'ocr-shadow-worker';
  return supervise({engine,cwd:root,script:path.join(root,engine==='legacy'?'scripts/ocr-legacy-worker.cjs':'scripts/ocr-v2/shadow-worker.cjs'),config:path.join(configRoot,folder,'worker.json'),out:fs.openSync(path.join(logRoot,engine+'-stdout.log'),'a'),err:fs.openSync(path.join(logRoot,engine+'-stderr.log'),'a')});
 });
 const timer=setInterval(()=>{workers.forEach(worker=>worker.check());fs.writeFileSync(path.join(logRoot,'supervisor-health.json'),JSON.stringify({observedAt:new Date().toISOString(),pid:process.pid,workers:workers.map(worker=>worker.state())}));},10000);
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{clearInterval(timer);workers.forEach(worker=>worker.stop());lock.close();});
}
module.exports={supervise};
if(require.main===module)main(process.argv[2],process.argv[3]).catch(error=>{if(error.code==='EADDRINUSE')return;console.error(error.message);process.exitCode=1;});
