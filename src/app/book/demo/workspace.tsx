"use client";
import OwnerWorkspace from '../../admin/service-requests/components/OwnerWorkspace';
import type {PublicBusiness,PublicServiceRequest} from '../../lib/publicScheduling/domain';
import {useState} from 'react';
export default function DemoWorkspace({business}:{business:PublicBusiness}){
 const [data,setData]=useState<PublicServiceRequest[]>([
 {id:'11111111-1111-4111-8111-111111111111',businessId:business.businessId,businessSlug:business.slug,reference:'DEMO-8A23C9',customerName:'Jamie Taylor',phone:'555-010-2400',email:'jamie@example.test',preferredContact:'email',address:'100 Example Lane\nSample City, WA 98000',description:'Repair two interior doors and replace damaged trim in the entryway.',preferredDate:'2026-10-15',timeWindowId:'morning',flexibility:'preferred',urgency:'routine',notes:'Please contact me before arriving.',consent:true,requestTypeId:'repair',status:'pending_confirmation',source:'public-web',internalNotes:'',confirmationStatus:'unconfirmed',notificationStatus:'not_configured',submittedAt:'2026-10-09T16:00:00Z',revision:0,activity:[]},
 {id:'22222222-2222-4222-8222-222222222222',businessId:business.businessId,businessSlug:business.slug,reference:'DEMO-71D042',customerName:'Alex Morgan',phone:'555-010-3600',email:'alex@example.test',preferredContact:'phone',address:'200 Example Avenue',description:'Painting estimate for a small apartment after move-out.',preferredDate:'2026-10-16',timeWindowId:'afternoon',flexibility:'flexible',urgency:'soon',notes:'',consent:true,requestTypeId:'painting',status:'reviewing',source:'public-web',internalNotes:'',confirmationStatus:'unconfirmed',notificationStatus:'not_configured',submittedAt:'2026-10-09T14:30:00Z',revision:0,activity:[]}
 ]);
 // This harness only updates synthetic memory. It cannot call authenticated APIs,
 // read the development store, or bypass authorization for a real request.
 return <OwnerWorkspace demo requests={data} settings={{revision:0,business}} saveReview={async change=>{const item=data.find(r=>r.id===change.requestId)!;const next={...item,status:change.status,revision:(item.revision??0)+1,activity:[...(item.activity??[]),{id:change.mutationId,at:new Date().toISOString(),actor:'demo-owner',event:'review_updated',from:item.status,to:change.status,note:change.note}]};setData(data.map(r=>r.id===next.id?next:r));return next;}} saveSettings={async settings=>({...settings,revision:settings.revision+1})}/>;
}
