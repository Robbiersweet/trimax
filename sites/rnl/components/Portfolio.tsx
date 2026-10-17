import Image from 'next/image';
import Link from 'next/link';
import {collections} from '../lib/projects';
import photoData from '../lib/project-photos.json';
type Photo={src:string;alt:string;width:number;height:number};
const photos=photoData as Record<string,Photo[]>;
export function ProjectHighlights(){return <div className="project-highlights">{collections.map(c=><Link href={'/gallery#'+c.id} className="project-highlight" key={c.id}><Image src={photos[c.projects[0].id][0].src} alt={photos[c.projects[0].id][0].alt} width={640} height={480} sizes="(max-width:700px) 100vw, 33vw"/><p className="eyebrow">{c.location}</p><h3>{c.label}</h3><p>{c.intro}</p><span className="card-link">Explore the projects <span aria-hidden="true">↗</span></span></Link>)}</div>}
export function ManagerWorkflow(){return <div className="manager-workflow" aria-label="How property requests move through Trimax"><div className="workflow-brand"><strong>TRIMAX</strong><span>R&L property coordination</span></div><ol>{[['01','Your property, your unit','Apartment number + work description'],['02','The details in one place','Preferred timing + request information'],['03','A reviewed plan','R&L reviews and coordinates the work']].map(([n,title,body])=><li key={n}><span aria-hidden="true">{n}</span><div><strong>{title}</strong><p>{body}</p></div></li>)}</ol><p className="workflow-caption">Workflow illustration · Scheduling is confirmed by our team.</p></div>}
