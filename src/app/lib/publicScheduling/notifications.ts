export type NotificationChannel='in-app'|'email'|'sms';
export type SchedulingEvent='request_received'|'request_confirmed'|'request_rescheduled'|'request_cancelled'|'appointment_reminder'|'new_public_request'|'approval_pending'|'upcoming_work'|'unhandled_request';
export interface NotificationMessage {idempotencyKey:string;businessId:string;requestId:string;event:SchedulingEvent;channel:NotificationChannel;recipient:string;template:string;parameters:Readonly<Record<string,string>>;scheduledFor?:string;consentReference?:string}
export interface NotificationProvider {send(message:NotificationMessage):Promise<{providerReference:string}>}
export interface SmsProvider extends NotificationProvider {readonly channel:'sms'}
export interface ReminderStore {schedule(message:NotificationMessage):Promise<void>;cancel(idempotencyKey:string):Promise<void>}
/** No provider is wired. Delivery requires consent policy, verified sender, secrets,
 * retry/dead-letter handling, recipient authorization and opt-out enforcement. */
export interface IntakeAbuseProtection {check(input:{businessSlug:string;request:Request}):Promise<{allowed:boolean;reason?:string}>}
export interface PublicRequestIntegration {review(requestId:string,businessId:string):Promise<void>;convertAfterApproval(requestId:string,businessId:string):Promise<{queueItemId:string}>}
