import assert from 'node:assert/strict';
import {customerDocumentHtml} from '../src/app/lib/communications/customerDocument.ts';
const binding={businessId:'b',clientId:'c',documentId:'d'},doc={id:'d',business_id:'b',client_id:'c',status:'Sent',project_title:'<script>bad</script>',terms:'Customer terms',tax_mode:'taxable',tax_rate:10,amount_paid:20,deposit_requested_amount:50,deposit_status:'requested'};
const lines=[{business_id:'b',invoice_id:'d',description:'Repair & paint',quantity:2,unit_price:50,line_total:100}];
const html=customerDocumentHtml('invoice',doc,lines,binding);assert.ok(html.includes('$110.00'));assert.ok(html.includes('$30.00'));assert.ok(html.includes('Deposit due'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('Repair &amp; paint'));assert.ok(html.includes('Customer terms'));
assert.throws(()=>customerDocumentHtml('invoice',{...doc,client_id:'other'},lines,binding));assert.throws(()=>customerDocumentHtml('invoice',doc,[{...lines[0],business_id:'other'}],binding));assert.throws(()=>customerDocumentHtml('invoice',doc,[{...lines[0],invoice_id:'other'}],binding));assert.throws(()=>customerDocumentHtml('invoice',{...doc,status:'Draft'},lines,binding));
const estimate=customerDocumentHtml('estimate',{...doc,estimate_amount:12.34,tax_mode:'no_tax'},[],binding);assert.ok(estimate.includes('$12.34'));assert.ok(!estimate.includes('Recorded payments'));
const discount=customerDocumentHtml('invoice',{...doc,deposit_status:'none'},[...lines,{...lines[0],description:'Discount',line_total:-10}],binding);assert.ok(discount.includes('$99.00'));assert.ok(discount.includes('$79.00'));
console.log('PASS: 15 customer-document rendering and binding assertions');
