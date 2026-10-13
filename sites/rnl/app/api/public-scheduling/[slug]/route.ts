import {productionSubmission} from '../../../../.shared/lib/publicScheduling/productionHandler.ts';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{slug:string}>}){
  if(process.env.VERCEL_ENV!=='production')return Response.json({error:'Website review only. Submissions are disabled; no request has been sent.'},{status:503,headers:{'Cache-Control':'no-store'}});
  const {slug}=await context.params;
  if(slug!=='rnl-creations')return Response.json({error:'Not found.'},{status:404});
  if(process.env.PUBLIC_SCHEDULING_PRODUCTION_ENABLED!=='enabled')return Response.json({error:'Online scheduling requests are coming soon. Please contact R&L directly.'},{status:503,headers:{'Cache-Control':'no-store'}});
  return productionSubmission(request,slug);
}
