export const dynamic='force-dynamic';
import MaintenanceRequest from '../../../qr-shared/maintenance/[id]/page';
export {metadata} from '../../../qr-shared/maintenance/[id]/page';
export default function Page({params}:{params:Promise<{id:string}>}){return <MaintenanceRequest params={params} managerLoginPath="/maintenance-labels/sign-in"/>;}
