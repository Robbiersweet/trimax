"use client";
import type {ApartmentTurn} from '../lib/apartmentTurn';
import {paintTypeOptions,wallPaintColorOptions,northCreekUnitLayoutOptions,turnPriorityOptions} from '../lib/queueTurnOptions';
export default function ApartmentTurnFields({value,onChange,disabled}:{value:ApartmentTurn;onChange:(value:ApartmentTurn)=>void;disabled:boolean}){
 const update=<K extends keyof ApartmentTurn>(key:K,next:ApartmentTurn[K])=>onChange({...value,[key]:next});
 return <fieldset className="schedule-fields" disabled={disabled}><legend>Apartment-turn details</legend>
  <label>Building <span className="schedule-optional">Optional, if separate from unit</span><input maxLength={100} value={value.building} onChange={e=>update('building',e.target.value)}/></label>
  <div className="schedule-grid">{(['carpet','vinyl'] as const).map(key=><label key={key}>{key==='carpet'?'Carpet':'Vinyl'}<select value={value[key]} onChange={e=>update(key,e.target.value as ApartmentTurn[typeof key])}>{['Keep','Replace','To Be Determined'].map(option=><option key={option}>{option}</option>)}</select></label>)}</div>
  <label>Paint type<select value={value.paintType} onChange={e=>update('paintType',e.target.value)}>{paintTypeOptions.map(option=><option key={option}>{option}</option>)}</select></label>
  <label>Painting scope<textarea maxLength={500} rows={2} placeholder="Rooms, walls, ceilings, trim or doors needing work" value={value.paintingScope} onChange={e=>update('paintingScope',e.target.value)}/></label>
  <label className="schedule-consent"><input type="checkbox" checked={value.smokedIn} onChange={e=>onChange({...value,smokedIn:e.target.checked,primerRequested:e.target.checked?true:value.primerRequested})}/><span>Smoke / odor treatment needed</span></label>
  <label className="schedule-consent"><input type="checkbox" checked={value.primerRequested} onChange={e=>update('primerRequested',e.target.checked)}/><span>{value.smokedIn?'Full primer requested for smoke / odor':'Primer requested'}</span></label>
  <label>Requested priority<select value={value.priority} onChange={e=>update('priority',e.target.value)}>{turnPriorityOptions.map(option=><option key={option}>{option}</option>)}</select></label><p className="schedule-hint">Priority and dates are requests for owner review. They do not move existing jobs or authorize work.</p>
  <details><summary>Paint colors, unit layout and additional requirements</summary><div className="schedule-fields">
   <label>Wall paint color<input list="turn-paint-colors" maxLength={200} value={value.wallPaintColor} onChange={e=>update('wallPaintColor',e.target.value)}/><datalist id="turn-paint-colors">{wallPaintColorOptions.map(option=><option key={option} value={option}/>)}</datalist></label>
   <label>Sherwin-Williams code <span className="schedule-optional">If known</span><input maxLength={7} pattern="SW ?[0-9]{4}" placeholder="SW 7562" value={value.paintCode} onChange={e=>update('paintCode',e.target.value.toUpperCase())}/></label>
   <label>Unit layout<select value={value.unitLayout} onChange={e=>update('unitLayout',e.target.value)}><option value="">Not provided</option>{northCreekUnitLayoutOptions.map(option=><option key={option}>{option}</option>)}</select></label>
   <label>Move-out date <span className="schedule-optional">Optional</span><input type="date" value={value.moveOutDate} onChange={e=>update('moveOutDate',e.target.value)}/></label>
   <label>Special requirements<textarea rows={3} maxLength={1000} value={value.specialRequirements} onChange={e=>update('specialRequirements',e.target.value)}/></label>
   <label className="schedule-consent"><input type="checkbox" checked={value.priorRenovation} onChange={e=>update('priorRenovation',e.target.checked)}/><span>Previously renovated</span></label>{value.priorRenovation&&<label>Prior renovation details<textarea maxLength={1000} rows={2} value={value.priorRenovationDetails} onChange={e=>update('priorRenovationDetails',e.target.value)}/></label>}
   <label className="schedule-consent"><input type="checkbox" checked={value.renovationNeeded} onChange={e=>update('renovationNeeded',e.target.checked)}/><span>Renovation work needed</span></label>{value.renovationNeeded&&<label>Renovation details<textarea maxLength={1000} rows={2} value={value.renovationNeededDetails} onChange={e=>update('renovationNeededDetails',e.target.value)}/></label>}
  </div></details>
 </fieldset>;
}
