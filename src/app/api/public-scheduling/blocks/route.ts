import {productionOwner} from '@/app/lib/publicScheduling/productionOwner';
import {readBoundedJson} from '@/app/lib/publicScheduling/httpBody';
import {workflowWritesAllowed} from '@/app/lib/publicScheduling/workflowRuntime';
export async function POST(request:Request){
 if(!workflowWritesAllowed(request,process.env))return Response.json({error:'Live schedule changes are disabled.'},{status:403});
 try{const owner=await productionOwner(request,new URL(request.url).searchParams.get('business')||'');const value=await readBoundedJson(request,2000) as Record<string,unknown>;
 if(!value||typeof value!=='object'||typeof value.label!=='string'||value.label.length>120)throw Error();
 const removeId=value.removeId==null?null:String(value.removeId);if(removeId&&!/^[0-9a-f-]{36}$/i.test(removeId))throw Error();
 const start=typeof value.start==='string'?value.start:null,end=typeof value.end==='string'?value.end:null;
 if(!removeId&&(!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))))throw Error();
 return Response.json({id:await owner.block({start,end,label:value.label,removeId})},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Block not saved. Check owner access, time range, and existing appointments.'},{status:409});}
}

export async function GET(request:Request){try{const owner=await productionOwner(request,new URL(request.url).searchParams.get('business')||'');return Response.json(await owner.blocks(),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Schedule blocks unavailable.'},{status:403});}}
