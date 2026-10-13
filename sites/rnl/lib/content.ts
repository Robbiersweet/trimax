export const site={name:'R&L Creations',origin:'https://rnlcreations.com',tagline:'Your home and its appearance is our reputation.',phone:'(425) 350-4898',phoneHref:'+14253504898',email:'Robbie@RNLCreations.com',serviceArea:'Tell us where your project is located. We’ll confirm whether we can help before making arrangements.'};
export const navigation=[['Home','/'],['Services','/services'],['Our work','/gallery'],['About','/about'],['Property managers','/property-managers'],['Contact','/contact']] as const;
export const services=[
  {id:'apartment-turns',name:'Apartment turns',line:'Ready for the next chapter.',description:'Painting, repairs and finishing touches between residents. Tell us about the unit, scope and timing so we can plan the work together.',examples:'Move-out repairs · Paint refreshes · Finish details',icon:'key'},
  {id:'painting',name:'Interior painting',line:'A fresh start for your space.',description:'Refresh a room, prepare a rental or bring a more finished feel to your home. We’ll review surfaces, preparation and the result you have in mind.',examples:'Walls & ceilings · Trim · Interior refreshes',icon:'paint'},
  {id:'carpentry',name:'Carpentry & repairs',line:'It’s all in the details.',description:'From worn trim to everyday repairs, give the small things the attention they deserve. Share the details so we can discuss a practical approach.',examples:'Trim repairs · Doors · Finish work',icon:'tools'},
  {id:'fences',name:'Fence work',line:'Good work, inside and out.',description:'Need help with a fence repair or a new fence project? Tell us about the location, existing condition and what you’d like to change.',examples:'Fence repairs · Gates · Project requests',icon:'fence'},
  {id:'maintenance',name:'Home maintenance',line:'Take care of the to-do list.',description:'Bring your repair and maintenance list together in one request. We’ll review the scope and help you work out the next steps.',examples:'General repairs · Handyman projects · Property care',icon:'home'},
  {id:'property-care',name:'Property-manager support',line:'One clear place to start.',description:'A straightforward way to request unit repairs, painting and recurring property work. Include property and unit details so nothing gets lost in translation.',examples:'Multifamily work · Repair coordination · Recurring requests',icon:'building'}
] as const;
// Populate only with approved photographs of actual R&L work, with permission.
export type GalleryItem={id:string;category:string;title:string;src:string|null;alt:string;width:number;height:number};
export const gallery:GalleryItem[]=[
 {id:'fence',category:'Fences',title:'Outdoor spaces',src:null,alt:'',width:1200,height:900},
 {id:'turn',category:'Apartment turns',title:'Ready for what’s next',src:null,alt:'',width:1200,height:900},
 {id:'paint',category:'Painting',title:'A fresh finish',src:null,alt:'',width:1200,height:900},
 {id:'carpentry',category:'Carpentry',title:'Details that matter',src:null,alt:'',width:1200,height:900},
 {id:'repair',category:'Repairs',title:'Everyday improvements',src:null,alt:'',width:1200,height:900},
 {id:'custom',category:'Custom work',title:'Made for your space',src:null,alt:'',width:1200,height:900}
];
