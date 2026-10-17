'use client';

import Image from 'next/image';
import {useEffect,useRef,useState} from 'react';
import {filters,portfolio,type Category,type PortfolioProject} from '../lib/portfolio';
import {Icon} from './Icons';

export default function ProjectGallery(){
  const [category,setCategory]=useState<Category>('All Projects');
  const [collection,setCollection]=useState('');
  const [active,setActive]=useState<PortfolioProject|null>(null);
  const [index,setIndex]=useState(0);
  const dialog=useRef<HTMLDialogElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  const opener=useRef<HTMLButtonElement|null>(null);

  useEffect(()=>{
    const syncHash=()=>{
      const hash=window.location.hash.slice(1);
      setCollection(['hope-church','apartments','specialty'].includes(hash)?hash:'');
    };
    syncHash();
    window.addEventListener('hashchange',syncHash);
    return()=>window.removeEventListener('hashchange',syncHash);
  },[]);

  useEffect(()=>{
    if(!active)return;
    const modal=dialog.current;
    const overflow=document.body.style.overflow;
    modal?.showModal();
    document.body.style.overflow='hidden';
    closeButton.current?.focus();
    return()=>{
      modal?.close();
      document.body.style.overflow=overflow;
      opener.current?.focus({preventScroll:true});
    };
  },[active]);

  const visible=portfolio.filter(p=>(category==='All Projects'||p.tags.includes(category))&&(!collection||p.collection===collection));
  const photo=active?.photos[index];
  const move=(direction:number)=>{if(active)setIndex(i=>(i+direction+active.photos.length)%active.photos.length);};

  return <>
    <section className="work-browser" id="projects" aria-label="Project portfolio">
      <div className="work-filters" role="group" aria-label="Filter projects">
        {filters.map(filter=><button key={filter.name} type="button" aria-pressed={!collection&&category===filter.name} onClick={()=>{setCategory(filter.name);setCollection('');}}><Icon name={filter.icon}/>{filter.name}</button>)}
      </div>
      <p className="work-count" role="status">{visible.length} projects <span>·</span> {collection==='hope-church'?'Hope Church':collection==='apartments'?'Apartment renovations':collection==='specialty'?'Commercial & specialty':category} <span>·</span> Select a project to explore</p>
      <div className="work-grid">
        {visible.map(project=><article className="work-card" key={project.id} id={project.id}>
          <button type="button" className="work-card-button" aria-label={'View '+project.title+' photos'} aria-haspopup="dialog" onClick={event=>{opener.current=event.currentTarget;setIndex(project.comparison?1:0);setActive(project);}}>
            <div className={'work-cover'+(project.comparison?' is-comparison':'')+(project.paired?' is-paired':'')}>
              {(project.comparison||project.paired?project.photos.slice(0,2):project.photos.slice(0,1)).map((item,i)=><div className="work-cover-frame" key={item.src}>
                <Image src={item.cover||item.src} alt={item.alt} fill sizes="(max-width:600px) 100vw, (max-width:1050px) 50vw, 25vw"/>
                {project.comparison&&<span className={'work-photo-label '+(i===1?'after':'')}>{item.label}</span>}
              </div>)}
              <span className="work-photo-count">{project.photos.length} {project.photos.length===1?'photo':'photos'}</span>
            </div>
            <div className="work-card-copy"><p className="work-category">{project.category}</p><h2>{project.title}</h2><p className="work-description">{project.description}</p><span className="work-card-arrow" aria-hidden="true"><Icon name="arrow"/></span></div>
          </button>
        </article>)}
      </div>
    </section>

    <dialog className="work-lightbox" ref={dialog} aria-labelledby="photo-project-title" aria-describedby="photo-caption" onClose={()=>setActive(null)} onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close();}} onKeyDown={event=>{
      if(event.key==='Tab'){
        const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'));
        const first=controls[0];
        const last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
      if(event.key==='ArrowRight'){event.preventDefault();move(1);}
      if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}
      if(event.key==='Home'){event.preventDefault();setIndex(0);}
      if(event.key==='End'&&active){event.preventDefault();setIndex(active.photos.length-1);}
    }}>
      {active&&photo&&<div className="work-lightbox-content">
        <div className="work-lightbox-heading"><div><p className="work-category">{active.category}</p><h2 id="photo-project-title">{active.title}</h2></div><button type="button" className="work-close" ref={closeButton} onClick={()=>dialog.current?.close()} aria-label="Close photo viewer">×</button></div>
        <div className="work-photo-stage">
          <Image key={photo.src} src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} sizes="(max-width:700px) 94vw, 1000px" loading="eager"/>
          {photo.label&&<span className={'work-photo-label '+(photo.label==='After'?'after':'')}>{photo.label}</span>}
        </div>
        <div className="work-viewer-controls">
          <button type="button" onClick={()=>move(-1)} disabled={active.photos.length===1} aria-label="Previous photo">←</button>
          <div aria-live="polite" aria-atomic="true"><p id="photo-caption">{photo.alt}</p><span>{index+1} / {active.photos.length}</span></div>
          <button type="button" onClick={()=>move(1)} disabled={active.photos.length===1} aria-label="Next photo">→</button>
        </div>
        {active.photos.length>1&&<div className="work-thumbnails" role="group" aria-label="Choose a photograph">{active.photos.map((item,i)=><button type="button" key={item.src} aria-label={'Photo '+(i+1)+': '+item.alt} aria-pressed={index===i} onClick={()=>setIndex(i)}><Image src={item.src} alt="" width={100} height={75} sizes="80px"/>{item.label&&<span>{item.label}</span>}</button>)}</div>}
        <p className="work-viewer-hint">Use the arrows to browse · Esc to close <a href={photo.src} target="_blank" rel="noreferrer">Open full image ↗</a></p>
      </div>}
    </dialog>
  </>;
}
