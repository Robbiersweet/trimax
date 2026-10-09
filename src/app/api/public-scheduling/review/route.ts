import {readBoundedJson} from '@/app/lib/publicScheduling/httpBody';
import { getPublicBusiness } from '@/app/lib/publicScheduling/domain';
import { getIntakeActor } from '@/app/lib/publicScheduling/authorization';
import { devStoreDirectory } from '@/app/lib/publicScheduling/developmentStore';
import { updateDevelopmentRequest } from '@/app/lib/publicScheduling/ownerWorkflow';
export const runtime='nodejs';
export async function PATCH(request:Request){
  try{devStoreDirectory();}catch{return Response.json({error:'Development workflow unavailable.'},{status:503});}
  const slug=new URL(request.url).searchParams.get('business')||'',business=getPublicBusiness(slug);
  if(!business)return Response.json({error:'Not found.'},{status:404});
  const actor=await getIntakeActor(request,slug);if(!actor)return Response.json({error:'Owner/admin required.'},{status:403});
  try{const value=await readBoundedJson(request,8000);const result=await updateDevelopmentRequest(business.businessId,actor,value);return Response.json({request:result},{headers:{'Cache-Control':'no-store'}});}catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to save.'},{status:409});}
}
