import {createClient} from '@supabase/supabase-js';
import QRCode from 'qrcode';
export const qrIdPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export type MaintenanceQr={id:string;businessId:string;property:string;unit:string;address:string;slug:string};
export function maintenanceQrRuntime(){
 const project=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??'').hostname.split('.')[0];
 if(process.env.MAINTENANCE_QR_ENABLED!=='enabled')throw Error('QR intake disabled');
 if(process.env.VERCEL_ENV==='production'){
  if(project!=='gqknefosisnsjuzmhvts')throw Error('Wrong production project');
 }else if(project!=='yzyfmvoswucyauogueca'||process.env.MAINTENANCE_QR_LAB_PROJECT!==project)throw Error('Isolated lab required');
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function maintenanceQrContext(id:string):Promise<MaintenanceQr|null>{
 if(!qrIdPattern.test(id))return null;
 const {data,error}=await maintenanceQrRuntime().rpc('trimax_maintenance_qr_context',{p_label_id:id});
 if(error)throw Error('QR unavailable');return data as MaintenanceQr|null;
}
export function maintenanceQrUrl(id:string,origin='https://rnlcreations.com'){
 if(!qrIdPattern.test(id))throw Error('Invalid label');
 const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin)throw Error('Invalid website origin');
 return `${origin}/maintenance/${id}`;
}
export async function maintenanceQrSvg(id:string,origin?:string){
 return QRCode.toString(maintenanceQrUrl(id,origin),{type:'svg',errorCorrectionLevel:'M',margin:4,width:320,color:{dark:'#000000',light:'#ffffff'}});
}

export async function maintenanceQrBusiness(qr:MaintenanceQr){
 const {data,error}=await maintenanceQrRuntime().rpc('trimax_public_scheduling_config',{p_slug:qr.slug});
 if(error||!data||data.businessId!==qr.businessId||!data.enabled)throw Error('QR business unavailable');
 return data as import('./publicScheduling/domain').PublicBusiness;
}
export function maintenanceQrOrigins(){
 if(process.env.VERCEL_ENV==='production')return new Set(['https://rnlcreations.com','https://app.rnlcreations.com']);
 maintenanceQrRuntime();
 const origins=[process.env.MAINTENANCE_QR_LAB_WEBSITE_ORIGIN,...[process.env.VERCEL_URL,process.env.VERCEL_BRANCH_URL].filter(Boolean).map(v=>'https://'+v)].filter((v):v is string=>!!v);
 for(const origin of origins){const u=new URL(origin);if(u.protocol!=='https:'||u.origin!==origin||!u.hostname.endsWith('.vercel.app'))throw Error('Lab origin invalid');}
 return new Set(origins);
}
export function maintenanceQrLab(){
 return process.env.VERCEL_ENV==='preview'&&process.env.NEXT_PUBLIC_SUPABASE_URL==='https://yzyfmvoswucyauogueca.supabase.co'&&process.env.MAINTENANCE_QR_LAB_PROJECT==='yzyfmvoswucyauogueca'&&process.env.WORKFLOW_ISOLATED_TEST_ADAPTER==='enabled';
}
