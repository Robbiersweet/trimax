// Build-time packaging only. Canonical scheduling source is never forked or edited.
import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const site=resolve(dirname(fileURLToPath(import.meta.url)),'..'), root=resolve(site,'../..');
const files=['lib/communications/consent.ts','book/RequestForm.tsx','book/RequestPhotos.tsx','lib/requestPhotos/clientCapability.ts','lib/requestPhotos/limits.ts','book/TurnstileChallenge.tsx','book/schedule.css','book/fonts/Allura-Regular.ttf','book/fonts/OFL-Allura.txt',...['transportSelection','domain','productionRuntime','productionHandler','productionService','productionAdapter','providers','diagnostics','abuseProtection','httpBody'].map(n=>`lib/publicScheduling/${n}.ts`)];
const manifest={};
for(const file of files){const source=resolve(root,'src/app',file), target=resolve(site,'.shared',file);await mkdir(dirname(target),{recursive:true});await copyFile(source,target);manifest[file]=createHash('sha256').update(await readFile(source)).digest('hex');}
for(const name of ['rnl-original-badge.png','workshop-preview.png']){const target=resolve(site,'public/branding/rnl',name);await mkdir(dirname(target),{recursive:true});await copyFile(resolve(root,'public/branding/rnl',name),target);}
await writeFile(resolve(site,'.shared/provenance.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Packaged ${files.length} unchanged shared scheduling files and two approved brand assets.`);
