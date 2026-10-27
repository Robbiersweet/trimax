import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../qr-shared/',import.meta.url);
const provenance=JSON.parse(await readFile(new URL('provenance.json',root),'utf8'));
for(const [file,expected] of Object.entries(provenance.files))assert.equal(createHash('sha256').update(await readFile(new URL(file,root))).digest('hex'),expected,`Canonical module changed: ${file}`);
const runtime=await readFile(new URL('lib/maintenanceQr.ts',root),'utf8');
assert.ok(runtime.includes("MAINTENANCE_QR_ENABLED!=='enabled'"));
assert.ok(runtime.includes("process.env.VERCEL_ENV==='preview'&&process.env.NEXT_PUBLIC_SUPABASE_URL==='https://yzyfmvoswucyauogueca.supabase.co'"));
const route=await readFile(new URL('lib/maintenanceQrHandler.ts',root),'utf8');
assert.ok(route.includes('if(config){const abuse=await enforceProductionAbuse'));
assert.ok(route.includes('validateRequest({...body,address:qr.address'));
console.log(`PASS ${Object.keys(provenance.files).length} exact canonical QR modules; explicit activation, isolated-lab boundary, production abuse check and trusted location binding retained.`);

const wrapper=await readFile(new URL('../app/api/maintenance-qr/[id]/route.ts',import.meta.url),'utf8');
assert.ok(wrapper.includes('createMaintenanceQrPost(websiteSubmissionRuntime)'));
assert.ok(route.includes('integration?.client??restrictedRpc'));
assert.ok(route.includes('config.providers'));
