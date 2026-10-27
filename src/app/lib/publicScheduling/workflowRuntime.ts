/** A preview exception for the existing disposable Auth lab only; never an auth bypass. */
export function workflowWritesAllowed(request:Request,env:Record<string,string|undefined>){
 if(env.SERVICE_REQUEST_WORKFLOW_ENABLED!=='enabled')return false;
 if(env.VERCEL_ENV!=='preview')return true; // Preserve the existing production/local boundary.
 if(env.WORKFLOW_ISOLATED_TEST_ADAPTER!=='enabled')return false;
 if(env.NEXT_PUBLIC_SUPABASE_URL!=='https://yzyfmvoswucyauogueca.supabase.co')return false;
 try{
  const configured=env.WORKFLOW_ISOLATED_TEST_ORIGIN;
  if(!configured)return false;
  const origin=new URL(configured);
  if(origin.protocol!=='https:'||origin.origin!==configured||!origin.hostname.endsWith('.vercel.app')||origin.username||origin.password)return false;
  return new URL(request.url).origin===configured&&request.headers.get('origin')===configured;
 }catch{return false;}
}
