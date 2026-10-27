import {GET,POST as labPost,OPTIONS,createMaintenanceQrPost} from '../../../../qr-shared/lib/maintenanceQrHandler';
import {websiteSubmissionRuntime} from '../../../../lib/submissionRuntime';
export const runtime='nodejs';
export {GET,OPTIONS};
export const POST=process.env.VERCEL_ENV==='production'?createMaintenanceQrPost(websiteSubmissionRuntime):labPost;
