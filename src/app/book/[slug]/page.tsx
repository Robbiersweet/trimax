import Image from "next/image";
import { notFound } from "next/navigation";
import { resolvePublicBusiness } from "../../lib/publicScheduling/settings";
import RequestForm from "../RequestForm";
import "../schedule.css";

export const metadata = { title: "Request service | Trimax", description: "Tell us what you need and request a convenient time. Your team will confirm the details." };
export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await resolvePublicBusiness(slug);
  if (!business?.enabled) notFound();
  return <main className="scheduling-public" data-accent={business.accent ?? "forest"}>
    <header className="schedule-brand"><a href={`/book/${business.slug}`} aria-label={`${business.displayName} service requests`}>{business.logoUrl?<Image src={business.logoUrl} alt="" width={48} height={48}/>:<span className="schedule-monogram" aria-hidden="true">↗</span>}<span>{business.displayName}<small>HOME & PROPERTY SERVICES</small></span></a><span className="schedule-secure">A simpler way to get it done</span></header>
    <div className="schedule-layout"><aside className="schedule-intro"><p className="schedule-eyebrow">YOUR NEXT PROJECT STARTS HERE</p><h1>A little help.<br/>A better space.</h1><p className="schedule-lead">Schedule or request service, on your time.</p><p>{business.description}</p><div className="schedule-preferred"><span aria-hidden="true">✓</span><p><strong>Start online. Skip the back-and-forth.</strong><br/>This is our preferred way to receive work requests. Share the details once and we’ll take it from there.</p></div><ol className="schedule-steps"><li><span>01</span><div><strong>Tell us what you need</strong><p>A few details help us plan the right visit.</p></div></li><li><span>02</span><div><strong>Request a time</strong><p>Choose a day and window that work for you.</p></div></li><li><span>03</span><div><strong>We’ll confirm with you</strong><p>Your request is reviewed before a visit is booked.</p></div></li></ol>{(business.phone||business.email)&&<p className="schedule-contact">{business.phone&&<a href={`tel:${business.phone}`}>{business.phone}</a>}{business.phone&&business.email&&<br/>}{business.email&&<a href={`mailto:${business.email}`}>{business.email}</a>}</p>}<p className="schedule-emergency">For immediate danger or an emergency, contact emergency services. This form is not monitored continuously.</p></aside><RequestForm business={{ slug: business.slug, displayName: business.displayName, rules: business.rules, requestTypes: business.requestTypes.map(({ id, publicLabel, active, displayOrder }) => ({ id, publicLabel, active, displayOrder })) }}/></div>
    <footer className="schedule-footer"><span>{business.displayName}</span><span>Thoughtful service, from the first request.</span><span>Powered by Trimax</span></footer>
  </main>;
}


