import {schedulingVisualFixtureEnabled} from '../../lib/publicScheduling/reviewEnvironment';
import {notFound} from 'next/navigation';
import {getPublicBusiness} from '../../lib/publicScheduling/domain';
import DemoWorkspace from './workspace';
export const dynamic='force-dynamic';
export default function SchedulingVisualFixture(){
 if(!schedulingVisualFixtureEnabled())notFound();
 return <DemoWorkspace business={getPublicBusiness('rnl-creations')!}/>;
}
