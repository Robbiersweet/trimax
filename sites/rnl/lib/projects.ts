import {portfolio} from './portfolio';

// Homepage collection links remain stable; the gallery recognizes these hashes.
export const collections = [
  {id:'hope-church',label:'Hope Church',location:'Lake Stevens',intro:'Purpose-built spaces for a place that brings people together.',projects:portfolio.filter(p=>p.collection==='hope-church')},
  {id:'apartments',label:'Apartment renovations',location:'Interiors & unit turns',intro:'Practical improvements that help a space feel ready for its next chapter.',projects:portfolio.filter(p=>p.collection==='apartments').sort((a)=>a.id==='apartment-turns'?-1:1)},
  {id:'specialty',label:'Commercial & specialty',location:'Made for the job',intro:'Thoughtful solutions for spaces and projects with a purpose of their own.',projects:portfolio.filter(p=>p.collection==='specialty')},
];
