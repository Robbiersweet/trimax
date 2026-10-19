/* Operator-only production provisioning; never print provider responses or credentials. */
const PROJECT='https://gqknefosisnsjuzmhvts.supabase.co';
async function provision(env,send=fetch){
 if(env.TRIMAX_PROVISION_REQUEST_SCHEDULER!=='approved-once')return 'disabled';
 if(env.VERCEL!=='1'||env.VERCEL_ENV!=='production'||env.NEXT_PUBLIC_SUPABASE_URL!==PROJECT)throw Error('Provisioning environment rejected');
 if(!env.CRON_SECRET||env.CRON_SECRET.length<=20||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Provisioning configuration unavailable');
 const call=async(value)=>{
  const response=await send(PROJECT+'/rest/v1/rpc/trimax_provision_request_scheduler',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},
   body:JSON.stringify({p_secret:value})
  });
  if(!response.ok)throw Error('Provisioning request failed');
  return response.json();
 };
 try{
  if(await call(null)!=='ready')throw Error('Provisioning preflight rejected');
  const status=await call(env.CRON_SECRET);
  if(status!=='stored'&&status!=='matched')throw Error('Provisioning verification rejected');
  return 'verified';
 }catch{throw Error('Scheduler provisioning failed; inspect configuration without displaying request bodies');}
}
if(require.main===module)provision(process.env).then(status=>console.log('Scheduler credential provisioning: '+status)).catch(()=>{console.error('Scheduler credential provisioning failed; no credential details recorded');process.exitCode=1;});
module.exports={provision};
