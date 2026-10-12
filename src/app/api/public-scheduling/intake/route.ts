import {schedulingDevelopmentEnabled} from '@/app/lib/publicScheduling/reviewEnvironment';
import {productionOwner} from '@/app/lib/publicScheduling/productionOwner';
import {getPublicBusiness} from '@/app/lib/publicScheduling/domain';
import {devStoreDirectory,listDevelopmentRequests} from '@/app/lib/publicScheduling/developmentStore';
import {authorizeIntake} from '@/app/lib/publicScheduling/authorization';
export const runtime='nodejs';
export async function GET(request:Request){
 if(!schedulingDevelopmentEnabled()){try{const owner=await productionOwner(request,new URL(request.url).searchParams.get('business')||'');return Response.json({requests:await owner.list()},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Owner access or storage unavailable.'},{status:403});}}
 const business=getPublicBusiness(new URL(request.url).searchParams.get('business')||'');
 if(!business)return Response.json({error:'Not found.'},{status:404});
 try{devStoreDirectory();}catch{return Response.json({error:'Development intake is not enabled.'},{status:503});}
 if(!await authorizeIntake(request,business.slug))return Response.json({error:'Owner or admin authorization required.'},{status:403});
 try{return Response.json({requests:await listDevelopmentRequests(business.businessId)},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Intake storage unavailable.'},{status:503});}
}
