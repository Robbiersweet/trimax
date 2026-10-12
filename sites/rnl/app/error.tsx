'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <section className="wrap section"><h1>We couldn’t load this page.</h1><p>Please try again. A page error does not confirm a service request.</p><button className="button" onClick={reset}>Try again</button></section>;}
