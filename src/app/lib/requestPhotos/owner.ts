/** Owner access must use authenticated request-bound productionOwner, never intake capability. */
export async function viewRequestPhoto(requestId:string,photoId:string,dependencies:{authorizedRequest:(id:string)=>Promise<{id:string;businessId:string}|null>;find:(id:string)=>Promise<{id:string;requestId:string;businessId:string;objectKey:string;state:string}|null>;sign:(bucket:string,key:string,seconds:number)=>Promise<string>}){
 const request=await dependencies.authorizedRequest(requestId);if(!request||request.id!==requestId)throw Error('Photo not available');
 const photo=await dependencies.find(photoId);if(!photo||photo.id!==photoId||photo.requestId!==request.id||photo.businessId!==request.businessId||photo.state!=='complete'||photo.objectKey!==`${request.businessId}/${request.id}/${photo.id}.jpg`)throw Error('Photo not available');
 return dependencies.sign('request-photos-private',photo.objectKey,60);
}
