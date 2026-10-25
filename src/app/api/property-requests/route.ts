import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { readBoundedJson } from "../../lib/publicScheduling/httpBody";

export async function POST(request: Request) {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const production=process.env.VERCEL_ENV==="production";
 const isolated=process.env.PROPERTY_REQUEST_TEST_ADAPTER==="enabled"&&!!url&&!url.includes("gqknefosisnsjuzmhvts");
 if(process.env.PROPERTY_REQUEST_INTAKE_ENABLED!=="enabled"||(!production&&!isolated))return NextResponse.json({error:"Property request submissions are not enabled in this environment."},{status:503});
 if(!url||!key)return NextResponse.json({error:"Property requests are not configured."},{status:503});
 const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return NextResponse.json({error:"Please sign in."},{status:401});
 const client=createClient(url,key,{auth:{persistSession:false},global:{headers:{Authorization:`Bearer ${token}`}}});
 const {data:{user},error:authError}=await client.auth.getUser(token);
 if(authError||!user)return NextResponse.json({error:"Please sign in."},{status:401});
 let body;try{body=await readBoundedJson(request,12000) as {assignmentId?:unknown;key?:unknown;payload?:unknown};}catch{return NextResponse.json({error:"Invalid or oversized request."},{status:400});}
 if(!body||typeof body.assignmentId!=="string"||typeof body.key!=="string"||!body.payload)return NextResponse.json({error:"Invalid request."},{status:400});
 // Database checks actor, business, exact assignment, service and direct-Queue permission atomically.
 const {data,error}=await client.rpc("trimax_submit_property_request",{p_assignment_id:body.assignmentId,p_key:body.key,p_payload:body.payload});
 if(error)return NextResponse.json({error:"Unable to submit. Check your assignment and service details, then retry."},{status:400});
 return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
}
