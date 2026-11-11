/* eslint-disable @typescript-eslint/no-require-imports -- Disconnected synthetic PostgreSQL test transport. */
const cp=require('node:child_process');
const quote=v=>v===null||v===undefined?'null':typeof v==='number'?String(v):typeof v==='boolean'?(v?'true':'false'):"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
async function sql(text){return new Promise((resolve,reject)=>{const child=cp.spawn('wsl.exe',['-d','Ubuntu','-u','root','--','docker','exec','-i','--user','100:101','trimax-hardening-pg-20261102','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h','/tmp','-U','postgres','-d','trimax_financial_test'],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('exit',code=>code===0?resolve(out.trim()):reject(Object.assign(Error(err.trim()),{code:err.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]})));child.stdin.end(text);});}
module.exports={sql,quote};

async function initialize(){
 const fs=require('node:fs'),path=require('node:path');
 const inspection=cp.execFileSync('wsl.exe',['-d','Ubuntu','-u','root','--','docker','inspect','trimax-hardening-pg-20261102'],{encoding:'utf8',windowsHide:true});
 const container=JSON.parse(inspection)[0];
 if(container.HostConfig.NetworkMode!=='none'||Object.keys(container.NetworkSettings.Ports??{}).length||container.Image!=='sha256:c282d393ae56fd165b7ada2ddbac55e582a601b86f3840aa2bbc112e43d3a570')throw Error('Disconnected pinned synthetic PostgreSQL container required');
 if(await sql('select current_database()')!=='trimax_financial_test')throw Error('Synthetic database mismatch');
 await sql('drop schema public cascade;drop schema auth cascade;create schema public;');
 await sql(fs.readFileSync(path.join(__dirname,'fixtures/atomic-remittance-schema.sql'),'utf8'));
 await sql(fs.readFileSync(path.join(__dirname,'../supabase/sql/2026-11-02-atomic-remittance-posting.sql'),'utf8'));
 await sql(fs.readFileSync(path.join(__dirname,'../supabase/sql/2026-11-10-unknown-historical-receipt-date.sql'),'utf8'));
}
module.exports.initialize=initialize;
