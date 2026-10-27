/* eslint-disable @typescript-eslint/no-require-imports -- isolated TS/React regression harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function loader(stubs = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} }; cache.set(file, loadedModule);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }}).outputText;
    new Function('require', 'module', 'exports', code)((name) => {
      if (name in stubs) return stubs[name];
      if (name.includes('/components/')) return {__esModule:true, default: () => null};
      if (!name.startsWith('.')) return require(name);
      const base = path.resolve(path.dirname(file), name);
      return load([base, base+'.ts', base+'.tsx'].find(p => fs.existsSync(p)));
    }, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load;
}
const notes = loader()('src/app/lib/documentNotes.ts');
const warning = 'Priority check: T09 may need to jump ahead of E08 due Oct 5. Confirm with management before scheduling.';
const extra = ' Trimax will keep the selected existing unit behind this new request.';
const swap = 'Priority swap: T09 was placed ahead of E08 on 10/5/2026. Keep this unit behind the new urgent request unless management changes it.';
const intentional = 'Customer requests priority service.\nPlease use the north entrance.\nPlease use the north entrance.';
const contaminated = [intentional,warning,warning+extra,swap].join('\n\n');
assert.equal(notes.customerFacingNotes(contaminated), intentional);
assert.equal(notes.customerFacingNotes(null), '');
assert.equal(notes.customerFacingNotes(intentional), intentional, 'Preserve intentional repetition');
assert.equal(notes.customerFacingNotes('Priority check: owner-approved customer instruction.'), 'Priority check: owner-approved customer instruction.');
assert.equal(notes.retainedOperationalNotes(contaminated), [warning,warning+extra,swap].join('\n'));
const queue = {notes:contaminated,wall_paint_color:'White',unit_layout:'2BR'};
const original = JSON.stringify(queue);
assert.equal(notes.queueCustomerScopeNotes(queue), 'Wall paint color: White\nUnit layout: 2BR');
assert.equal(JSON.stringify(queue), original, 'Queue/history must remain unchanged');
assert.equal(notes.appendPriorityNote(notes.appendPriorityNote(intentional,warning),warning,true), intentional+'\n\n'+warning+extra);
assert.equal(notes.appendPriorityNote(intentional+'\n\n'+warning+extra,warning), intentional+'\n\n'+warning+extra);

async function main() {
  const inserts = [];
  let displayNumber = 9000;
  const supabase = {from: () => ({insert: payload => ({select: () => ({single: async () => {
    inserts.push(payload); return {data:{id:'synthetic-'+inserts.length,display_id:payload.display_id},error:null};
  }})})})};
  const split = loader({
    './supabase': {supabase}, './activityLog': {logActivity: async () => {}},
    './documentNumbers': {getNextDocumentDisplayId: async () => 'INV-'+(++displayNumber)},
  })('src/app/lib/splitInvoices.ts');
  const sourceInvoice={id:'source',displayId:'INV-8999',businessId:'business',businessSlug:'rnl-creations',clientId:'client',customerName:'Synthetic Customer',projectTitle:'Synthetic scope',issueDate:'2026-10-27',dueDate:'2026-11-26',reference:'T09',serviceAddress:'Synthetic',terms:'Net 30',notes:contaminated};
  for (const correction of [false,true]) {
    inserts.length=0;
    const source={...sourceInvoice,notes:correction?'Correction of INV-8998.\n'+contaminated:contaminated};
    await split.createSplitInvoices({sourceInvoice:source,subtotalAmount:2000,targetAmount:1300,taxRate:9.9,taxLabel:'Tax'});
    assert.equal(inserts.length,2);
    for(const row of inserts) {
      assert.ok(row.notes.includes(intentional));
      assert.doesNotMatch(row.notes,/E08|Priority check:|Priority swap:|management|scheduling/);
      assert.equal(row.amount_paid,0); assert.equal(row.status,'Draft');
      assert.equal(row.due_date,'2026-11-26');
    }
    assert.equal(source.notes,correction?'Correction of INV-8998.\n'+contaminated:contaminated);
  }
  // Execute the actual customer print component used by both preview and email
  // attachments, with synthetic data and the normal authenticated client path.
  let invoiceNotes = contaminated;
  const invoice={id:'synthetic',business_id:'business',client_id:null,display_id:'INV-9000',customer_name:'Synthetic Customer',project_title:'Synthetic scope',status:'Draft',invoice_amount:2198,amount_paid:1099,tax_mode:'taxable',tax_rate:9.9,issue_date:'2026-10-27',due_date:'2026-11-26',terms:'Net 30',reference:'T09',service_address:'Synthetic'};
  const db={from(table){const q=new Proxy({}, {get:(_,key)=>key==='then'?resolve=>resolve({data: table==='businesses'?{id:'business',name:'Synthetic Business',slug:'rnl-creations'}:table==='invoices'?{...invoice,notes:invoiceNotes}:table==='invoice_line_items'?[{id:'line',description:'Synthetic work',quantity:1,unit_price:2000,line_total:2000}]:null,error:null}):()=>q});return q;}};
  const print=loader({
    'next/headers':{headers:async()=>({get:()=>null})},
    'next/image':{__esModule:true,default:props=>React.createElement('img',{src:props.src,alt:props.alt})},
    '../../../lib/supabaseServer':{createSupabaseServerClient:async()=>db},
  })('src/app/invoices/[id]/print/page.tsx').default;
  for(const noteCase of [contaminated,intentional,'']) {
    invoiceNotes=noteCase;
    const html=renderToStaticMarkup(await print({params:Promise.resolve({id:'synthetic'}),searchParams:Promise.resolve({business:'rnl-creations'})}));
    assert.doesNotMatch(html,/E08|Priority check:|Priority swap:|management before scheduling|selected existing unit/);
    if(noteCase) assert.ok(html.includes('Please use the north entrance.'));
    assert.ok(html.includes('1,099.00'), 'Deposit/remaining balance rendering unchanged');
    assert.ok(html.includes('2,198.00'), 'Tax/total rendering unchanged');
  }
  const queueSource=fs.readFileSync('src/app/estimates/new/page.tsx','utf8');
  assert.ok(queueSource.includes('setNotes(queueCustomerScopeNotes(loadedQueueItem))'));
  const conversion=fs.readFileSync('src/app/components/ConvertEstimateToInvoiceButton.tsx','utf8');
  assert.equal((conversion.match(/notes: customerFacingNotes\(estimate.notes \?\? notes\)/g)||[]).length,3);
  const email=fs.readFileSync('src/app/api/invoices/[id]/send-email/route.ts','utf8');
  assert.ok(email.includes('createPrintPagePdfAttachment('), 'Email uses protected customer print renderer');
  console.log('PASS: Queue boundary; exact legacy warning redaction; intentional/repeated customer notes; automatic deduplication; ordinary customer print; split and correction split inserts; preserved deposits/tax/totals; email attachment renderer. No database writes.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
