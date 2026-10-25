export type Milestone='needs_information'|'request_received'|'approved'|'appointment_scheduled'|'appointment_rescheduled'|'appointment_cancelled'|'reminder_24h'|'reminder_1h'|'estimate_sent'|'invoice_sent'|'payment_received'|'payment_reminder';
export function smsBody(kind:Milestone,brand:string,when:string|null,link:string|null):string {
 const texts:Record<Milestone,string>={needs_information:'We need additional information about your service request. Use the private link to reply.',request_received:'We received your service request. Review is pending; no appointment is confirmed.',approved:'Your request is accepted. We will contact you about next steps.',appointment_scheduled:`Your appointment is confirmed${when?` for ${when}`:''}.`,appointment_rescheduled:`Your appointment was rescheduled${when?` to ${when}`:''}.`,appointment_cancelled:'Your appointment was cancelled. Contact us to arrange another time.',reminder_24h:`Reminder: your appointment is ${when||'tomorrow'}.`,reminder_1h:`Reminder: your appointment is ${when||'in one hour'}.`,estimate_sent:'Your estimate is ready to review.',invoice_sent:'Your invoice is ready to review.',payment_received:'Thank you. Your payment has been recorded.',payment_reminder:'A payment reminder is available.'};
 if(!texts[kind])throw Error('unsupported_sms_event');
 return `${brand.slice(0,80)}: ${texts[kind]}${link?` ${link}`:''} Reply STOP to opt out.`;
}
export function estimatedSegments(text:string){
 const gsm=/^[\x20-\x7e\n\r£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà]*$/.test(text);
 const units=gsm?text.length+(text.match(/[\^{}\\\[\]~|€]/g)?.length||0):text.length;
 return units<=(gsm?160:70)?1:Math.ceil(units/(gsm?153:67));
}
