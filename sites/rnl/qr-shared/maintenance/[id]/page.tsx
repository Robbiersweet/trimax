import {notFound} from 'next/navigation';
import {maintenanceQrContext,maintenanceQrBusiness,maintenanceQrLab} from '../../lib/maintenanceQr';
import RequestForm from '../../book/RequestForm';
import '../../book/schedule.css';
export const dynamic='force-dynamic';
export const metadata={title:'Maintenance request | R&L Creations',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function MaintenanceRequest({params,managerLoginPath="/login"}:{params:Promise<{id:string}>;managerLoginPath?:string}){
 const {id}=await params;const qr=await maintenanceQrContext(id);if(!qr)notFound();
 const business=await maintenanceQrBusiness(qr);if(!business)notFound();
 const publicBusiness={slug:business.slug,displayName:business.displayName,rules:business.rules,requestTypes:business.requestTypes.map(({id,publicLabel,active,displayOrder})=>({id,publicLabel,active,displayOrder}))};
 return <main className="scheduling-public mx-auto max-w-3xl p-4" data-brand="rnl"><h1 className="text-3xl font-bold">Request maintenance</h1>{maintenanceQrLab()&&<p role="status">Isolated QR laboratory: synthetic requests only. Nothing is sent to production or to customers.</p>}<p className="my-4">{qr.property} · Unit {qr.unit}</p><p className="my-4">This form is not monitored continuously. For an emergency, contact emergency services.</p>
  <RequestForm business={publicBusiness} challengeSiteKey={maintenanceQrLab()?undefined:process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} photosEnabled photoEndpoint="/api/request-photos" submissionEndpoint={`/api/maintenance-qr/${id}`} locationAddress={qr.address+', Unit '+qr.unit}/>
  <a className="mt-6 block underline" href={managerLoginPath+'?next='+encodeURIComponent('/property-requests?qr='+id)}>Property manager? Sign in to use your assigned permissions.</a>
 </main>;
}
