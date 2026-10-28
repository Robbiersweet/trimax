import MaintenanceLabels from '../../qr-shared/maintenance-labels/MaintenanceLabels';
import './labels.css';
import {notFound} from 'next/navigation';
export const metadata={title:'Maintenance labels | TriMax',robots:{index:false,follow:false}};
export default function Labels(){if(process.env.VERCEL_ENV!=='preview'||process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://yzyfmvoswucyauogueca.supabase.co')notFound();return <div className="maintenance-labels-wrap"><MaintenanceLabels loginHref="/maintenance-labels/sign-in"/></div>;}
