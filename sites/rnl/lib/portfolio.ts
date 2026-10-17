import photoData from './project-photos.json';

export type Photo = {src:string; alt:string; width:number; height:number; label?:string; cover?:string};
export const filters = [
  {name:'All Projects', icon:'tools'},
  {name:'Custom Carpentry', icon:'tools'},
  {name:'Commercial', icon:'building'},
  {name:'Apartment Renovations', icon:'home'},
  {name:'Specialty Finishes', icon:'paint'},
  {name:'Plumbing & Utility', icon:'key'},
  {name:'Custom Builds', icon:'fence'},
] as const;
export type Category = typeof filters[number]['name'];
export type PortfolioProject = {
  id:string; title:string; category:string; description:string; collection:string;
  tags:Category[]; photos:Photo[]; comparison?:boolean; paired?:boolean;
};
const photos = photoData as Record<string,Photo[]>;
export const portfolio:PortfolioProject[] = [
  {id:'sound-booth',title:'Hope Church Sound Booth',category:'Custom Carpentry',collection:'hope-church',tags:['Custom Carpentry','Commercial','Custom Builds'],description:'Custom construction, from wall framing to the finished sanctuary sound booth.',photos:photos['sound-booth']},
  {id:'coffee-bar',title:'Hope Church Coffee Bar',category:'Custom Woodworking',collection:'hope-church',tags:['Custom Carpentry','Commercial','Custom Builds'],description:'Custom hospitality cabinetry with a finished wood countertop and decorative front.',photos:photos['coffee-bar']},
  {id:'fireplace',title:'Fireplace Resurfacing',category:'Specialty Finishes',collection:'apartments',tags:['Specialty Finishes','Apartment Renovations'],description:'An original beige surround and hearth, refinished with a bold black marble effect.',photos:photos.fireplace,comparison:true},
  {id:'sliding-partition',title:'Five-Panel Sliding Partitions',category:'Custom Carpentry',collection:'hope-church',tags:['Custom Carpentry','Commercial','Custom Builds'],description:'Wood-framed translucent panels that slide and stack to open the church space.',photos:photos['sliding-partition']},
  {id:'church-entry',title:'Entrance Doors & Security',category:'Commercial Improvements',collection:'hope-church',tags:['Commercial','Custom Carpentry'],description:'Hope Church entrance doors with installed push bars, closers and exit hardware.',photos:photos['church-entry']},
  {id:'threshold',title:'Entrance Threshold Restoration',category:'Specialty Finishes',collection:'hope-church',tags:['Commercial','Specialty Finishes'],description:'Worn wood, carefully sanded and refinished to reveal its natural grain.',photos:photos.threshold,comparison:true},
  {id:'apartment-turns',title:'Apartment Renovations',category:'Apartment Renovations',collection:'apartments',tags:['Apartment Renovations','Specialty Finishes'],description:'Finished kitchens, bathrooms, flooring and painted interiors from apartment projects.',photos:photos['apartment-turns']},
  {id:'trailer-plumbing',title:'Shaved-Ice Trailer Plumbing',category:'Plumbing & Utility',collection:'specialty',tags:['Plumbing & Utility','Commercial','Custom Builds'],description:'Sink drainage, a water heater and pump installation for a mobile shaved-ice trailer.',photos:photos['trailer-plumbing'],paired:true},
];
