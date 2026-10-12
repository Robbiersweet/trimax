// OFFLINE ONLY. Never deploy the project signing secret to the scheduling app.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
const [project,secretFile,outputFile]=process.argv.slice(2);
if(!/^[a-z]{20}$/.test(project??'')||!secretFile||!outputFile)throw Error('Usage: node scripts/provision-scheduling-token.mjs PROJECT_REF SIGNING_SECRET_FILE OUTPUT_FILE');
const secret=readFileSync(secretFile,'utf8').trim();
if(secret.length<32)throw Error('Signing secret invalid');
const now=Math.floor(Date.now()/1000),encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const body=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'trimax_scheduling_intake',iss:'supabase',ref:project,iat:now,exp:now+7*86400});
const token=body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
writeFileSync(outputFile,token,{flag:'wx',mode:0o600});
console.log('Restricted token written to the requested private file; expires in seven days. No secret printed. Validate scope before installation.');
