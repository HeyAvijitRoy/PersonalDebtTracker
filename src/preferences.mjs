import { moneyToCents } from "./money.mjs";
export function preferences(value={}){
 const targets=value.targets??[80,50,30];
 if(!Array.isArray(targets)||!targets.length||targets.length>12)throw new Error("Choose between 1 and 12 utilization targets.");
 const normalized=[...new Set(targets.map(target=>{const points=moneyToCents(target);if(points>10000)throw new Error("Targets must be between 0 and 100 percent.");return points/100;}))].sort((a,b)=>b-a);
 const staleDays=Number(value.staleDays??7),warningDays=Number(value.warningDays??7);
 if(!Number.isInteger(staleDays)||staleDays<1||staleDays>365||!Number.isInteger(warningDays)||warningDays<1||warningDays>90)throw new Error("Choose a valid update/reminder interval.");
 return {targets:normalized,staleDays,warningDays};
}
