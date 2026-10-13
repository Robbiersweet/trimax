import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const site=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=resolve(site,'../..');
const read=p=>readFile(resolve(site,p),'utf8');
let checks=0;function check(ok,label){assert.ok(ok,label);checks++;console.log('PASS '+label);}
const provenance=JSON.parse(await read('.shared/provenance.json'));
for(const [file,hash] of Object.entries(provenance)){check(createHash('sha256').update(await readFile(resolve(root,'src/app',file))).digest('hex')===hash,`shared source unchanged: ${file}`);}
const handler=await read('app/api/public-scheduling/[slug]/route.ts');
check(handler.indexOf("VERCEL_ENV!=='production'")<handler.indexOf('await context.params'),'preview closes before config/RPC work');
check(handler.includes('return productionSubmission(request,slug)'),'production uses existing security boundary');
const {POST}=await import('../app/api/public-scheduling/[slug]/route.ts');
const previous=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
let touched=false;const params={then(){touched=true;throw Error('must not touch production in preview');}};
const response=await POST(new Request('https://preview.example.test/api/public-scheduling/rnl-creations',{method:'POST'}),{params});
check(response.status===503&&!touched,'preview submission cannot reach slug lookup or production providers');
process.env.VERCEL_ENV='production';
check((await POST(new Request('https://rnlcreations.com/api/public-scheduling/private',{method:'POST'}),{params:Promise.resolve({slug:'private'})})).status===404,'other business slugs denied');
const previousEnabled=process.env.PUBLIC_SCHEDULING_PRODUCTION_ENABLED;
delete process.env.PUBLIC_SCHEDULING_PRODUCTION_ENABLED;
check((await POST(new Request('https://rnlcreations.com/api/public-scheduling/rnl-creations',{method:'POST'}),{params:Promise.resolve({slug:'rnl-creations'})})).status===503,'production intake disabled without provider access');
if(previousEnabled!==undefined)process.env.PUBLIC_SCHEDULING_PRODUCTION_ENABLED=previousEnabled;
if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;
const scheduling=await read('lib/scheduling.ts');check(scheduling.includes("import 'server-only'"),'server-only configuration boundary');
check(scheduling.includes('const publicBusiness:PublicPageBusiness=')&&!scheduling.includes('businessId:'),'explicit public DTO excludes business IDs');
check((await read('app/schedule/page.tsx')).includes("import RequestForm from '../../.shared/book/RequestForm'"),'single existing form reused');
const apiEntries=await readdir(resolve(site,'app/api/public-scheduling'));check(apiEntries.length===1&&apiEntries[0]==='[slug]','no status, owner, conversion or manager API mounted');
const clientFiles=['components/Header.tsx','.shared/book/RequestForm.tsx','.shared/book/TurnstileChallenge.tsx'];
for(const file of clientFiles){const source=await read(file);for(const secret of ['TURNSTILE_SECRET_KEY','UPSTASH_REDIS_REST_TOKEN','SCHEDULING_FINGERPRINT_SECRET','SCHEDULING_INTAKE_JWT'])check(!source.includes(secret),`${file} excludes ${secret}`);}
const routes=['','services','gallery','about','property-managers','schedule','contact','privacy','request-terms'];
const base=process.env.RNL_TEST_URL||'http://localhost:3108';
for(const path of routes){const r=await fetch(`${base}/${path}`),html=await r.text();check(r.status===200,`route /${path}`);check(html.includes('rel="canonical"')&&html.includes('property="og:title"'),`SEO /${path}`);check(!/app\.rnlcreations\.com|Powered by Trimax|dev:rnl-creations/.test(html),`public isolation /${path}`);}
for(const path of ['/admin','/invoices','/queue','/payments','/jobs','/clients','/login','/api/public-scheduling/status','/api/public-scheduling/intake','/api/public-scheduling/review'])check([404,405].includes((await fetch(base+path)).status),`internal path unavailable ${path}`);
check((await fetch(base+'/not-a-page')).status===404,'404 response');
const production=process.env.RNL_TEST_PRODUCTION==='1';
const robots=await (await fetch(base+'/robots.txt')).text();
check(robots.includes(production?'Allow: /':'Disallow: /'),'environment robots policy');
if(production){const html=await (await fetch(base+'/schedule')).text();check(html.includes('Online scheduling requests are coming soon.')&&!html.includes('<form'),'production coming-soon page has no active form');check(html.includes('tel:+14253504898')&&html.includes('mailto:Robbie@RNLCreations.com'),'disabled page approved contact alternatives');check((await fetch(base+'/api/public-scheduling/rnl-creations',{method:'POST'})).status===503,'live disabled server intake');}
check((await (await fetch(base+'/sitemap.xml')).text()).includes('https://rnlcreations.com/schedule'),'clean scheduling canonical in sitemap');
check((await fetch(base+'/opengraph-image')).headers.get('content-type')?.includes('image/png'),'Open Graph image');
const redirect=await fetch(base+'/book/rnl-creations',{redirect:'manual'});check(redirect.status===308&&redirect.headers.get('location')==='/schedule','old form receipt link stays on public host');
console.log(`PASS ${checks} website boundary/routing/security/SEO checks`);
