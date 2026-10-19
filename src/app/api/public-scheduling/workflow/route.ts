import {productionOwner} from '@/app/lib/publicScheduling/productionOwner';
import {readBoundedJson} from '@/app/lib/publicScheduling/httpBody';
import {validateWorkflowChange} from '@/app/lib/publicScheduling/workflow';
export const runtime='nodejs';
export async function GET(request:Request){
 try{const url=new URL(request.url),owner=await productionOwner(request,url.searchParams.get('business')||'');const id=url.searchParams.get('request')||'';
  if(!(await owner.list(id)).length)throw Error();
  return Response.json(await owner.workflowContext(id),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Workflow unavailable. Sign in as an owner/admin and verify the workflow migration is installed.'},{status:403});}
}
export async function POST(request:Request){
 if(process.env.VERCEL_ENV==='preview'||process.env.SERVICE_REQUEST_WORKFLOW_ENABLED!=='enabled')return Response.json({error:'Live workflow changes are disabled in this environment.'},{status:403});
 try{const owner=await productionOwner(request,new URL(request.url).searchParams.get('business')||'');const change=validateWorkflowChange(await readBoundedJson(request,4000));
  return Response.json(await owner.workflow(change),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Action not saved. Reload the request and review client matches, appointment conflicts, and your owner access before retrying.'},{status:409});}
}
