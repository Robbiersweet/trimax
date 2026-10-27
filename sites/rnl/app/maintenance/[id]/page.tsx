export const dynamic='force-dynamic';
import MaintenanceRequest from '../../../qr-shared/maintenance/[id]/page';
export {metadata} from '../../../qr-shared/maintenance/[id]/page';
export default function Page({params}:{params:Promise<{id:string}>}){return <MaintenanceRequest params={params} managerLoginPath={process.env.VERCEL_ENV==='production'?'https://app.rnlcreations.com/login':'/maintenance-labels/sign-in'}/>;}
