export type Project = {id:string; title:string; description:string; detail:string; image:null|string; alt:string};
export const collections = [
{id:'hope-church',label:'Hope Church',location:'Lake Stevens',intro:'Purpose-built spaces for a place that brings people together.',projects:[
{id:'sound-booth',title:'A sound booth, built from the floor up',description:'Custom sound booth construction, from floor framing through the finished installation.',detail:'Framing · Custom carpentry · Finish work',image:null,alt:''},
{id:'sliding-partition',title:'Five panels. A more flexible space.',description:'A five-panel sliding partition system combining wood frames and translucent panels.',detail:'Custom woodwork · Sliding partitions',image:null,alt:''},
{id:'coffee-bar',title:'A welcoming place to gather',description:'A custom-built coffee bar and hospitality cabinetry for the church.',detail:'Cabinetry · Hospitality spaces',image:null,alt:''},
{id:'church-entry',title:'Care at the entrance',description:'Main entrance door installation and associated security hardware, alongside door threshold refinishing.',detail:'Doors · Hardware · Refinishing',image:null,alt:''}]},
{id:'apartments',label:'Apartment renovations',location:'Interiors & unit turns',intro:'Practical improvements that help a space feel ready for its next chapter.',projects:[
{id:'apartment-turns',title:'Fresh finishes for the next resident',description:'Interior painting, apartment turns, flooring and finish work, with attention to the details throughout the unit.',detail:'Painting · Flooring · Finish work',image:null,alt:''},
{id:'cabinet-upgrades',title:'A new chapter for existing cabinets',description:'Cabinet refinishing and upgrades as part of apartment renovation work.',detail:'Cabinet refinishing · Interior upgrades',image:null,alt:''},
{id:'fireplace',title:'From beige to a bold focal point',description:'A fireplace resurfacing project transformed a beige finish into a black marble-effect surface.',detail:'Surface refinishing · Marble-effect finish',image:null,alt:''}]},
{id:'specialty',label:'Commercial & specialty',location:'Made for the job',intro:'Thoughtful solutions for spaces and projects with a purpose of their own.',projects:[
{id:'trailer-plumbing',title:'Behind the counter, on the road',description:'Plumbing work for a mobile shaved-ice trailer.',detail:'Mobile business · Specialty installation',image:null,alt:''}]}
] satisfies {id:string;label:string;location:string;intro:string;projects:Project[]}[];
