import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
export const runtime='nodejs';
export const maxDuration=15;
async function handle(request:Request, enqueue:boolean){
 const authorization=request.headers.get('authorization');
 if(!authorization)return NextResponse.json({error:'Sign in required'},{status:401});
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:authorization},fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})},auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const body=enqueue?await request.json():{attemptId:new URL(request.url).searchParams.get('attemptId')};
  if(typeof body.attemptId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.attemptId))return NextResponse.json({error:'Invalid attempt'},{status:400});
  const {data,error}=await client.rpc(enqueue?'trimax_enqueue_ocr_legacy':'trimax_ocr_legacy_status',{p_attempt:body.attemptId,...(enqueue?{p_input:{documentType:body.documentType,retryStrategy:body.retryStrategy,diagnosticReplay:body.diagnosticReplay===true}}:{})});
  if(error)return NextResponse.json({error:error.message,retriable:true},{status:503});
  return NextResponse.json(data,{status:enqueue?202:200,headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Processing status temporarily unavailable. Your saved capture is retained.',retriable:true},{status:503});}
}
export async function POST(request:Request){return handle(request,true);}
export async function GET(request:Request){return handle(request,false);}
