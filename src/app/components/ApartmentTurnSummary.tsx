import {apartmentTurnEntries,validateApartmentTurn} from '../lib/apartmentTurn';
export default function ApartmentTurnSummary({value}:{value:unknown}){
 const result=validateApartmentTurn(value);if(!result.ok)return null;
 return <section aria-label="Submitted apartment-turn details"><h3>Submitted apartment-turn details</h3><dl className="owner-details schedule-summary">{apartmentTurnEntries(result.value).map(([label,text])=><div key={label}><dt>{label}</dt><dd className="whitespace-pre-wrap">{text}</dd></div>)}</dl></section>;
}
