import { schedulingDevelopmentEnabled } from "../../lib/publicScheduling/reviewEnvironment";
import { isSchedulingPreview } from '../../lib/publicScheduling/reviewEnvironment';
import Image from "next/image";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { resolvePublicBusiness } from "../../lib/publicScheduling/settings";
import RequestForm from "../RequestForm";
import "../schedule.css";

const craftsmanScript = localFont({ src: "../fonts/Allura-Regular.ttf", variable: "--font-craftsman-script", weight: "400", display: "swap" });

export const dynamic="force-dynamic";
export const metadata = { title: "Request service | R&L Creations", description: "Tell us about your home project. Request a convenient time and we’ll confirm the details with you." };
export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await resolvePublicBusiness(slug);
  if (!business?.enabled) notFound();
  const rnl = business.slug === "rnl-creations";
  return <main className={`scheduling-public ${craftsmanScript.variable}`} data-brand={rnl ? "rnl" : "default"}>
    <a className="schedule-skip" href="#service-request">Skip to request form</a>
    {isSchedulingPreview() && <p role="status" className="schedule-preview-notice">REVIEW PREVIEW — Synthetic details only (@example.test). No appointment, production record, email or text will be created. Temporary requests may reset.</p>}
    <div className="schedule-hero">
      <header className="schedule-brand"><a href={`/book/${business.slug}`} aria-label={`${business.displayName} service requests`}><span>{business.displayName}<small>GENERAL CONTRACTING · HOME SERVICES</small></span></a><a className="schedule-header-link" href="#service-request">Let’s talk about your project <span aria-hidden="true">↗</span></a></header>
      <div className="schedule-hero-content">
        <p className="schedule-tagline"><span>Your home and its</span><span>appearance is our</span><span>reputation.</span></p>
        <div className="schedule-hero-copy"><h1>Schedule or<br/> Request Service<br/><span>Online</span></h1><p className="schedule-lead">From the small repairs to the next big project. Tell us what you have in mind, and we’ll help plan the next step.</p><a className="schedule-button schedule-start" href="#service-request"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="1"/><path d="M7 2v6M17 2v6M3 10h18M7 14h2M11 14h2M15 14h2M7 18h2M11 18h2"/></svg><span>Start Your Request</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 4 8 8-8 8"/></svg></a><p className="schedule-hero-note">A request, not a booking. We’ll confirm with you.</p></div>
        {rnl ? <div className="schedule-logo-window"><Image className="schedule-hero-logo" src="/branding/rnl/rnl-original-badge.png" alt="R&L Creations — General Contracting and Construction, original saw-blade and crossed-hammers badge" width={5334} height={4268} sizes="(max-width: 800px) 390px, 700px" priority/></div> : business.logoUrl && <Image className="schedule-hero-logo" src={business.logoUrl} alt={business.displayName} width={420} height={336}/>}
      </div>
      <ul className="schedule-trust" aria-label="Our approach"><li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/></svg><span>Reliable<br/>Service</span></li><li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 15-2 6 6-2L21 7l-4-4Z M14 6l4 4 M5 15l4 4"/></svg><span>Quality<br/>Work</span></li><li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 11 10-8 10 8M5 9v12h5v-7h4v7h5V9"/></svg><span>Proudly<br/>Local</span></li></ul>
    </div>
    <div className="schedule-transition"><p className="schedule-eyebrow">GET STARTED</p><h2>3 SIMPLE STEPS</h2></div><div className="schedule-layout" id="service-request"><aside className="schedule-intro"><p className="schedule-eyebrow">A FEW DETAILS. A CLEAR NEXT STEP.</p><h2>Let’s get your <br/>project started.</h2><p>Repairs, painting, finishing touches and everything that makes a home feel cared for. Start here — we’ll take it from there.</p><ol className="schedule-steps"><li><span>01</span><div><strong>Tell us about it</strong><p>Share the work and your contact details.</p></div></li><li><span>02</span><div><strong>Pick your preferences</strong><p>Let us know where and when you need us.</p></div></li><li><span>03</span><div><strong>We’ll be in touch</strong><p>We review your request before confirming a visit.</p></div></li></ol><p className="schedule-no-payment">No payment is collected here.<br/>No automatic appointment booking.</p>{(business.phone || business.email) && <p className="schedule-contact">{business.phone && <a href={`tel:${business.phone}`}>{business.phone}</a>}{business.phone && business.email && <br/>}{business.email && <a href={`mailto:${business.email}`}>{business.email}</a>}</p>}<p className="schedule-emergency">For immediate danger or an emergency, contact emergency services. This form is not monitored continuously.</p></aside><RequestForm photosEnabled={process.env.REQUEST_PHOTOS_ENABLED==='enabled'} challengeSiteKey={schedulingDevelopmentEnabled()?undefined:process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} preview={isSchedulingPreview()} business={{ slug: business.slug, displayName: business.displayName, rules: business.rules, requestTypes: business.requestTypes.map(({ id, publicLabel, active, displayOrder }) => ({ id, publicLabel, active, displayOrder })) }}/></div>
    <footer className="schedule-footer"><div><strong>{business.displayName}</strong><small>GENERAL CONTRACTING / HOME SERVICES</small></div><p className="schedule-footer-tagline">Homes. Projects. People.</p><span>Powered by Trimax</span></footer>
  </main>;
}
