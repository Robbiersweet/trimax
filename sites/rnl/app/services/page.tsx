import {PageIntro,Button,FinalCTA} from '../../components/Site';
import {Icon} from '../../components/Icons';
import {services} from '../../lib/content';
import {pageMetadata} from '../../lib/metadata';
export const metadata=pageMetadata('Services','Explore apartment turns, interior painting, carpentry, fences and home maintenance from R&L Creations.','/services');
export default function Services(){return <><PageIntro eyebrow="PRACTICAL HELP. THOUGHTFUL WORK." title="For the spaces you care about."><p>Every project starts with a need. A repair that’s overdue. A room ready for a change. A property ready for its next resident.</p></PageIntro><section className="wrap section service-list">{services.map((s,i)=><article id={s.id} key={s.id}><div className="service-index"><span>0{i+1}</span><Icon name={s.icon}/></div><div><p className="eyebrow">{s.line}</p><h2>{s.name}</h2><p>{s.description}</p><p className="examples">{s.examples}</p></div><Button>Request this service</Button></article>)}</section><FinalCTA/></>;}
