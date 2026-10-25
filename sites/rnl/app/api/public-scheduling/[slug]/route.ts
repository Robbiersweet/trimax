import {productionSubmission} from '../../../../.shared/lib/publicScheduling/productionHandler.ts';
import {websiteSubmissionRuntime} from '../../../../lib/submissionRuntime.ts';
import {isolatedLabRequest} from '../../../../lib/isolatedLabBoundary.ts';
import {isolatedLabRuntime} from '../../../../lib/isolatedLabRuntime.ts';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{slug:string}>}){
  const lab=isolatedLabRequest(request);
  if(lab){const {slug}=await context.params;if(slug!==lab.slug)return Response.json({error:'Not found.'},{status:404});
    const headers=new Headers(request.headers);headers.set('x-turnstile-token','isolated-lab-synthetic');
    return productionSubmission(new Request(request,{headers}),slug,isolatedLabRuntime);
  }
  if(process.env.VERCEL_ENV!=='production')return Response.json({error:'Website review only. Submissions are disabled; no request has been sent.'},{status:503,headers:{'Cache-Control':'no-store'}});
  const {slug}=await context.params;
  if(slug!=='rnl-creations')return Response.json({error:'Not found.'},{status:404});
  if(process.env.PUBLIC_SCHEDULING_PRODUCTION_ENABLED!=='enabled')return Response.json({error:'Online scheduling requests are coming soon. Please contact R&L directly.'},{status:503,headers:{'Cache-Control':'no-store'}});
  return productionSubmission(request,slug,websiteSubmissionRuntime);
}
