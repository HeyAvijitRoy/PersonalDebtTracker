import { comparePayoff } from './payoff.mjs';
import { element,money } from './account-tools.mjs';
import { localDate } from './observations.mjs';
const title=strategy=>strategy==='avalanche'?'Debt Avalanche':'Debt Snowball';
export class PayoffPlan {
 constructor({getCards}){
  this.getCards=getCards;this.baseline=new Map();this.fingerprint='';
  document.getElementById('sim-run').addEventListener('click',()=>this.compare());
  document.getElementById('simulator').addEventListener('input',event=>{
   if(event.target.dataset.baselineId)this.baseline.set(event.target.dataset.baselineId,event.target.value);
   this.updateMode();this.invalidate();
  });
  this.updateMode();
 }
 updateMode(){
  const deadline=document.getElementById('sim-mode').value==='deadline';
  document.getElementById('sim-budget-field').classList.toggle('hidden',deadline);
  document.getElementById('sim-months-field').classList.toggle('hidden',!deadline);
  document.getElementById('sim-baseline-fields').classList.toggle('hidden',!document.getElementById('sim-baseline-enabled').checked);
 }
 invalidate(message='Choose a monthly budget or target months, then compare both strategies.'){document.getElementById('sim-output').replaceChildren(element('p',message,'tracker-help'));}
 clear(){
  this.baseline.clear();this.fingerprint='';
  for(const id of ['sim-budget','sim-months'])document.getElementById(id).value='';
  document.getElementById('sim-mode').value='budget';document.getElementById('sim-baseline-enabled').checked=false;
  document.getElementById('sim-baseline-fields').replaceChildren();document.getElementById('optimizer-availability').textContent='';
  document.getElementById('optimizer').open=false;this.updateMode();this.invalidate();
 }
 refresh(){
  const cards=this.getCards(),fingerprint=JSON.stringify([localDate(),cards.map(card=>[card.id,card.name,card.balance,card.apr,card.rateBasis,card.promotion,card._revision])]);
  const promotions=cards.filter(card=>card.promotion?.type==='zero'&&(!card.promotion.endDate||card.promotion.endDate>=localDate()));
  document.getElementById('optimizer-availability').textContent=promotions.length?`${promotions.length} recorded 0% promotion${promotions.length===1?'':'s'}`:'Optional planning tool';
  if(this.fingerprint===fingerprint)return;
  const changed=Boolean(this.fingerprint);this.fingerprint=fingerprint;
  const fields=document.getElementById('sim-baseline-fields');fields.replaceChildren();
  const active=cards.filter(card=>card.balance>0&&!card.deletedAt),ids=new Set(active.map(card=>card.id));
  for(const id of this.baseline.keys())if(!ids.has(id))this.baseline.delete(id);
  for(const card of active){
   const label=element('label',`${card.name} — planned baseline / month ($)`),input=element('input');input.type='number';input.min='0';input.step='0.01';input.inputMode='decimal';input.className='tracker-input';input.dataset.baselineId=card.id;input.value=this.baseline.get(card.id)??'';label.append(input);fields.append(label);
  }
  if(!active.length)fields.append(element('p','No outstanding balances.','tracker-help'));
  this.invalidate(changed?'Account inputs changed. Compare again to update the projections.':undefined);
 }
 compare(){
  const out=document.getElementById('sim-output');out.replaceChildren();
  try{
   const mode=document.getElementById('sim-mode').value,baseline=document.getElementById('sim-baseline-enabled').checked?Object.fromEntries([...this.baseline].map(([id,value])=>[id,value||0])):{};
   const data=comparePayoff(this.getCards(),{mode,budget:document.getElementById('sim-budget').value,months:Number(document.getElementById('sim-months').value),baseline});
   const warnings=element('p',`${data.accounts} accounts included, including any archived or issuer-closed debt. ${data.hasBaseline?'Entered baselines are paid first; the remainder follows the selected priority.':'No baseline payments entered: this illustrative allocation can assign $0 to other cards.'}`,'tracker-help');out.append(warnings);
   if(this.getCards().some(card=>card.promotion))out.append(element('p','Promotional terms are recorded. This fixed-rate scenario keeps entered APRs unchanged even after promotion expiry; actual interest could be higher. Deferred-interest balances require a different model.','tracker-status'));
   const grid=element('div',null,'payoff-comparison');
   for(const strategy of ['avalanche','snowball']){
    const plan=data[strategy],tile=element('article',null,'tracker-kpi');tile.dataset.strategy=strategy;tile.append(element('h3',title(strategy),'text-lg font-semibold'));
    if(!plan.paid){tile.append(element('p',plan.error,'text-rose-700 dark:text-rose-300 mt-3'));grid.append(tile);continue;}
    const date=new Date();date.setDate(1);date.setMonth(date.getMonth()+plan.months);
    const entries=[['Combined monthly budget',money(plan.budgetCents/100)],['Estimated interest',money(plan.interestCents/100)],['Total principal + interest',money(plan.totalPaidCents/100)],['Payoff time',`${plan.months} month${plan.months===1?'':'s'} · ${date.toLocaleDateString('en-US',{month:'long',year:'numeric'})}`],['Final monthly payment',money(plan.finalPaymentCents/100)],['First account cleared',plan.payoffOrder.length?`${plan.payoffOrder[0].name} · month ${plan.payoffOrder[0].month}`:'None']];
    const list=element('dl',null,'payoff-metrics');for(const [label,value]of entries)list.append(element('dt',label),element('dd',value));tile.append(list);
    const order=element('details',null,'tracker-details');order.append(element('summary','Account payoff order'));for(const row of plan.payoffOrder)order.append(element('p',`${row.name}: month ${row.month}; interest ${money(row.interestCents/100)}`,'tracker-help'));tile.append(order);grid.append(tile);
   }
   out.append(grid);
   if(data.interestDifferenceCents!==null){
    const difference=data.interestDifferenceCents;
    const text=difference===0?'Both strategies have the same estimated interest.':difference>0?`Avalanche estimates ${money(difference/100)} less interest than Snowball.`:`Snowball estimates ${money(-difference/100)} less interest than Avalanche.`;
    out.append(element('p',text+(mode==='deadline'?' Each strategy uses its own estimated monthly budget to meet the same deadline.':' Both use the same combined monthly budget.'),'tracker-status'));
   }
   if(data.avalanche.paid&&data.snowball.paid)this.chart(out,data);
  }catch(error){const message=element('p',error.message,'tracker-status');message.setAttribute('role','alert');out.append(message);}
 }
 chart(out,data){
  const container=element('div',null,'tracker-chart');container.append(element('h3','Projected remaining balance','font-semibold'),element('p','Blue: Avalanche · Violet: Snowball. Modeled monthly balances, not recorded history.','tracker-help'));
  const width=760,height=260,pad=28,max=Math.max(...data.avalanche.schedule.map(row=>row.balanceCents),...data.snowball.schedule.map(row=>row.balanceCents)),months=Math.max(data.avalanche.months,data.snowball.months),ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','Projected Avalanche and Snowball balances. Monthly values are available in the table below.');
  const add=(tag,attrs,text)=>{const node=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));if(text)node.textContent=text;svg.append(node);};
  add('line',{x1:pad,y1:height-pad,x2:width-pad,y2:height-pad,stroke:'currentColor',opacity:.4});
  container.append(element('p',`Estimated balance range: $0 to ${money(max/100)}`,'tracker-help'));
  for(const [strategy,color]of [['avalanche','#0284c7'],['snowball','#8b5cf6']])add('polyline',{points:data[strategy].schedule.map(row=>`${pad+row.month/months*(width-2*pad)},${height-pad-row.balanceCents/max*(height-2*pad)}`).join(' '),fill:'none',stroke:color,'stroke-width':2,'vector-effect':'non-scaling-stroke',...(strategy==='snowball'?{'stroke-dasharray':'6 4'}:{})});
  container.append(svg);const axis=element('div',null,'flex justify-between text-xs mt-2');axis.append(element('span','Month 0'),element('span',`Month ${months}`));container.append(axis);out.append(container);
  const details=element('details',null,'tracker-details'),wrap=element('div',null,'table-scroll'),table=element('table',null,'tracker-table');details.append(element('summary','Monthly comparison table'));
  const thead=element('thead'),head=element('tr');for(const text of ['Month','Avalanche balance','Snowball balance','Avalanche payment','Snowball payment'])head.append(element('th',text));thead.append(head);table.append(thead);const body=element('tbody');
  for(let month=0;month<=months;month++){const row=element('tr'),a=data.avalanche.schedule[month],s=data.snowball.schedule[month];for(const value of [String(month),money((a?.balanceCents??0)/100),money((s?.balanceCents??0)/100),money((a?.paidCents??0)/100),money((s?.paidCents??0)/100)])row.append(element('td',value));body.append(row);}table.append(body);wrap.append(table);details.append(wrap);out.append(details);
 }
}
