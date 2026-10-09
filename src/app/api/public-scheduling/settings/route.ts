import {readBoundedJson} from '@/app/lib/publicScheduling/httpBody';
import { getIntakeActor } from '@/app/lib/publicScheduling/authorization';
import { devStoreDirectory } from '@/app/lib/publicScheduling/developmentStore';
import { loadDevelopmentSettings, saveDevelopmentSettings } from '@/app/lib/publicScheduling/settings';
export const runtime='nodejs';
async function access(request:Request){try{devStoreDirectory();}catch{return null;}const slug=new URL(request.url).searchParams.get('business')||'';const actor=await getIntakeActor(request,slug);return actor?{slug,actor}:null;}
export async function GET(request:Request){const context=await access(request);if(!context)return Response.json({error:'Owner/admin development access required.'},{status:403});try{return Response.json(await loadDevelopmentSettings(context.slug),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Settings unavailable.'},{status:404});}}
export async function PUT(request:Request){const context=await access(request);if(!context)return Response.json({error:'Owner/admin development access required.'},{status:403});try{const value=await readBoundedJson(request,32000) as {expectedRevision:number;business:unknown};return Response.json(await saveDevelopmentSettings(context.slug,context.actor,value.expectedRevision,value.business),{headers:{'Cache-Control':'no-store'}});}catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to save.'},{status:409});}}
