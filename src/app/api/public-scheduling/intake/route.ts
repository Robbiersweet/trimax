import {getPublicBusiness} from '@/app/lib/publicScheduling/domain';
import {devStoreDirectory,listDevelopmentRequests} from '@/app/lib/publicScheduling/developmentStore';
import {authorizeIntake} from '@/app/lib/publicScheduling/authorization';
export const runtime='nodejs';
export async function GET(request:Request){
 const business=getPublicBusiness(new URL(request.url).searchParams.get('business')||'');
 if(!business)return Response.json({error:'Not found.'},{status:404});
 try{devStoreDirectory();}catch{return Response.json({error:'Development intake is not enabled.'},{status:503});}
 if(!await authorizeIntake(request,business.slug))return Response.json({error:'Owner or admin authorization required.'},{status:403});
 try{return Response.json({requests:await listDevelopmentRequests(business.businessId)},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Intake storage unavailable.'},{status:503});}
}
