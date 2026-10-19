import {notFound} from 'next/navigation';
import WorkflowPreview from './preview';
export const dynamic='force-dynamic';
export default function Page(){
 if(process.env.SERVICE_REQUEST_PREVIEW!=='enabled'||(process.env.VERCEL_ENV!=='preview'&&process.env.NODE_ENV!=='development'))notFound();
 return <WorkflowPreview/>;
}
