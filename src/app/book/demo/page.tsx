import {notFound} from 'next/navigation';
import {getPublicBusiness} from '../../lib/publicScheduling/domain';
import DemoWorkspace from './workspace';
export const dynamic='force-dynamic';
export default function SchedulingVisualFixture(){
 if(process.env.NODE_ENV==='production'||process.env.PUBLIC_SCHEDULING_VISUAL_FIXTURE!=='enabled')notFound();
 return <DemoWorkspace business={getPublicBusiness('rnl-creations')!}/>;
}
