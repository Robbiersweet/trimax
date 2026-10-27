import PropertyRequests from '../../qr-shared/property-requests/page';
import {notFound} from 'next/navigation';
export default function Page(){if(process.env.VERCEL_ENV!=='preview'||process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://yzyfmvoswucyauogueca.supabase.co')notFound();return <PropertyRequests/>;}
