import Image from 'next/image';
import Link from 'next/link';
import ProjectGallery from '../../components/ProjectGallery';
import {Icon} from '../../components/Icons';
import {pageMetadata} from '../../lib/metadata';
import './portfolio.css';

export const metadata=pageMetadata('Our Work','Custom carpentry at Hope Church in Lake Stevens, apartment renovations and specialty projects by R&L Creations.','/gallery');

export default function Gallery(){return <div className="work-page">
  <section className="work-hero">
    <Image src="/branding/rnl/workshop-preview.png" alt="" fill preload sizes="100vw"/>
    <div className="work-hero-content"><p className="work-eyebrow">OUR WORK</p><h1>REAL PROJECTS.<br/><em>REAL RESULTS.</em></h1><p>From custom carpentry and remodels to specialty finishes and unique builds.<br className="work-desktop-break"/> Explore our work for churches, property managers, homeowners and local businesses.</p></div>
    <p className="work-signature" aria-hidden="true">Quality Work.<br/>Built to Last.</p>
  </section>
  <ProjectGallery/>
  <section className="work-closing" aria-label="Start your project">
    <div className="work-value"><Icon name="shield"/><div><h2>Quality<br/>craftsmanship</h2><p>Care in every detail.</p></div></div>
    <div className="work-value"><Icon name="home"/><div><h2>Work for<br/>our community</h2><p>Churches, homes and local businesses.</p></div></div>
    <div className="work-value"><Icon name="tools"/><div><h2>Diverse<br/>project experience</h2><p>From repairs to custom builds.</p></div></div>
    <div className="work-cta"><h2>Have a project in mind?</h2><p>Let’s make it happen.</p><Link href="/schedule">Schedule a Project <Icon name="arrow"/></Link></div>
  </section>
</div>;}
