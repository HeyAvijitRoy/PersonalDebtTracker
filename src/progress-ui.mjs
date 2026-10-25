import { allHistory } from "./history.mjs";
import { progressData } from "./progress.mjs";
import { localDate } from "./observations.mjs";
import { element,money } from "./account-tools.mjs";

const svgNS="http://www.w3.org/2000/svg";
function svgElement(tag,attributes,text){const node=document.createElementNS(svgNS,tag);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));if(text!=null)node.textContent=text;return node;}
export function drawChart(container,rows,{title,format=value=>money(value),value=row=>row.value}={}){
 container.replaceChildren();container.append(element("h3",title,"font-semibold"));
 if(!rows.length){container.append(element("p","No observations available.","tracker-help"));return;}
 const width=760,height=260,pad=55;const values=rows.map(value);const max=Math.max(1,...values),min=Math.min(0,...values);
 container.append(element('p',`Scale: ${format(min)} to ${format(max)}`,'tracker-help'));
 const times=rows.map(row=>Date.parse(row.key??row.date+"T00:00:00Z"));const first=Math.min(...times),last=Math.max(...times);
 const x=index=>last===first?width/2:pad+(times[index]-first)/(last-first)*(width-pad*2);
 const y=index=>height-pad-(values[index]-min)/(max-min)*(height-pad*2);
 const svg=svgElement("svg",{viewBox:`0 0 ${width} ${height}`,role:"img","aria-label":`${title}. Recorded observations; dashed connections are visual guides only.`});
 svg.append(svgElement("title",{},title),svgElement("line",{x1:pad,y1:height-pad,x2:width-pad,y2:height-pad,stroke:"currentColor",opacity:.4}));
 if(rows.length>1)svg.append(svgElement("polyline",{points:rows.map((_,i)=>`${x(i)},${y(i)}`).join(" "),fill:"none",stroke:"#0284c7","stroke-width":2,"stroke-dasharray":"5 5","vector-effect":"non-scaling-stroke"}));
 rows.forEach((row,index)=>{const dot=svgElement("circle",{cx:x(index),cy:y(index),r:6,fill:"#0284c7",tabindex:0,"aria-label":`${row.date}: ${format(values[index])}. ${row.description??""}`});dot.append(svgElement("title",{},`${row.date}: ${format(values[index])} ${row.description??""}`));svg.append(dot);});
 container.append(svg);
 const dates=element('div',null,'flex justify-between text-xs mt-2');dates.append(element('span',rows[0].date),element('span',rows.at(-1).date));container.append(dates);
}
export class ProgressPage {
 constructor({getStore,getCards}){
  Object.assign(this,{getStore,getCards});this.cache=new Map();this.sequence=0;
  for(const id of ['progress-account','progress-period','progress-from','progress-through'])document.getElementById(id)?.addEventListener('change',()=>this.refresh());
  document.getElementById('progress-refresh')?.addEventListener('click',()=>{this.cache.clear();this.refresh();});
  window.addEventListener('hashchange',()=>this.route());this.route();
 }
 clear(){this.sequence++;this.cache.clear();for(const id of ['progress-results','progress-account'])document.getElementById(id)?.replaceChildren();for(const id of ['progress-from','progress-through']){const input=document.getElementById(id);if(input)input.value='';}}
 route(){const active=location.hash==='#progress';document.getElementById('dashboard-view')?.classList.toggle('hidden',active);document.getElementById('progress-view')?.classList.toggle('hidden',!active);if(active)this.refresh();}
 async refresh(){
  if(location.hash!=='#progress')return;
  const store=this.getStore(),container=document.getElementById('progress-results');if(!store||!container)return;
  const sequence=++this.sequence;const cards=this.getCards().filter(card=>!card.deletedAt);
  const select=document.getElementById('progress-account'),selected=select.value;select.replaceChildren();
  const all=element('option','All comparable accounts');all.value='';select.append(all);for(const card of cards){const option=element('option',card.name);option.value=card.id;select.append(option);}select.value=cards.some(c=>c.id===selected)?selected:'';
  const period=document.getElementById('progress-period').value,today=localDate();let from=null,to=today;
  if(period==='month')from=today.slice(0,8)+'01';if(period==='30'){const date=new Date();date.setDate(date.getDate()-29);from=localDate(date);}
  if(period==='custom'){from=document.getElementById('progress-from').value||null;to=document.getElementById('progress-through').value||today;}
  if(from&&from>to){container.textContent='Start date must not be after the end date.';return;}
  container.textContent='Loading encrypted observation history...';
  try{
   const chosen=select.value?cards.filter(card=>card.id===select.value):cards;const groups=[];
   for(const card of chosen){const key=`${card.id}:${card._revision}`;let events=this.cache.get(key);if(!events){events=await allHistory(store,card.id);this.cache.set(key,events);}store.active();groups.push({id:card.id,account:card,events});}
   if(sequence!==this.sequence||store!==this.getStore())return;
   this.render(container,progressData(groups,{from,to}),groups,to);
  }catch{if(sequence===this.sequence&&store===this.getStore())container.textContent='History unavailable. Reconnect and retry; missing data is not shown as zero.';}
 }
 render(container,data,groups,to){
  container.replaceChildren();
  container.append(element('p',`${data.coverage} of ${data.total} accounts have comparable observations. This view follows currently tracked accounts; additions/removals do not count as spending or balance reduction.`, 'tracker-help'));
  if(!data.points.length){container.append(element('p','No comparable history in this range. Record current values on an account to establish a baseline.'));return;}
  const kpis=element('div',null,'tracker-fields');
  const delta=data.change;for(const [label,value]of [['Starting estimated balance',money(data.points[0].amountCents/100)],['Latest comparable estimated balance',money(data.points.at(-1).amountCents/100)],['Balance change',!delta?'Another observation is needed':delta.direction==='unchanged'?'No change':`${delta.direction==='reduction'?'Reduced':'Increased'} by ${money(Math.abs(delta.changeCents)/100)}${delta.percentage==null?'':` (${Math.abs(delta.percentage).toFixed(1)}%)`}`]]){const tile=element('div',null,'tracker-kpi');tile.append(element('p',label,'tracker-help'),element('p',value,'text-lg font-semibold'));kpis.append(tile);}container.append(kpis);
  container.append(element('p',`Comparable window starts ${data.startDate}. Totals combine latest-known observations with mixed dates, not exact daily balances. Dashed lines are visual guides, not interpolated transactions.${data.provisional?' Latest values include provisional adjustments.':''}`,'tracker-help'));
  const chart=element('div',null,'tracker-chart');drawChart(chart,data.points,{title:'Estimated balance over recorded observations',value:row=>row.amountCents/100});container.append(chart);
  const table=element('table',null,'tracker-table');const head=element('tr');for(const name of ['Observed date','Estimated balance','Context'])head.append(element('th',name));const thead=element('thead');thead.append(head);table.append(thead);const tbody=element('tbody');
  for(const point of data.points){const row=element('tr');row.append(element('td',point.date),element('td',money(point.amountCents/100)),element('td',point.description+(point.provisional?' (provisional)':'')));tbody.append(row);}table.append(tbody);const details=element('details',null,'tracker-details');details.append(element('summary','Observation table (accessible chart alternative)'),table);container.append(details);
  const bars=element('div');bars.append(element('h3','Latest recorded balance by account','font-semibold'));const max=Math.max(1,...groups.map(group=>group.account.balance));for(const group of groups){const row=element('div',null,'tracker-history-row');row.append(element('p',`${group.account.name}: ${money(group.account.balance)} | observed ${group.account.effectiveDate??'date unknown'}`));const track=element('div',null,'tracker-bar');const fill=element('div');fill.style.width=`${group.account.balance/max*100}%`;track.append(fill);row.append(track);bars.append(row);}container.append(bars);
  if(data.cohort.length===1){const samples=data.cohort[0].samples.filter(row=>row.account.effectiveDate>=data.startDate&&row.account.effectiveDate<=to);const utilization=element('div',null,'tracker-chart'),limits=element('div',null,'tracker-chart');const rows=samples.map(row=>({date:row.account.effectiveDate,key:row.account.effectiveDate+'T'+row.event.recordedAt.slice(11),account:row.account}));drawChart(utilization,rows.filter(row=>row.account.creditLimit>0),{title:'Estimated utilization',value:row=>row.account.balance/row.account.creditLimit*100,format:n=>`${n.toFixed(1)}%`});drawChart(limits,rows,{title:'Credit-limit observations',value:row=>row.account.creditLimit});container.append(utilization,limits);}
  const milestones=element('div');milestones.append(element('h3','Milestones in this comparison','font-semibold'));for(const milestone of data.milestones)milestones.append(element('p',`${milestone.date}: ${milestone.text}`,'tracker-milestone'));if(!data.milestones.length)milestones.append(element('p','No milestones recorded for this comparison yet.','tracker-help'));container.append(milestones);
 }
}
