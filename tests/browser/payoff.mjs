import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { syntheticPage } from './harness.mjs';
const browser=await chromium.launch({headless:true});
try{
 const {page,context,errors}=await syntheticPage(browser);page.setDefaultTimeout(12000);
 const password='synthetic-passphrase',large='Large <img src=x onerror=window.__xss=1>';
 await page.locator('#lock-pass1').fill(password);await page.locator('#lock-pass2').fill(password);await page.locator('#lock-setup-btn').click();await page.locator('#main-app:not(.hidden)').waitFor();
 async function add(name,limit,available,apr){await page.locator('#open-add-account').click();await page.locator('#card-name').fill(name);await page.locator('#limit').fill(String(limit));await page.locator('#available-credit').fill(String(available));await page.locator('#apr').fill(String(apr));await page.locator('#submit-btn').click();await page.locator('#add-account-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#sync-status').textContent.includes('No local drafts'));}
 await add(large,5000,3000,30);await add('Small',1000,500,5);
 await page.locator('#util-view').selectOption('pie');await page.locator('.debt-card svg').first().waitFor();
 await page.locator('#util-view').selectOption('bar');
 await page.locator('.account-menu summary').first().click();
 await page.evaluate(()=>{globalThis.__oldMenu=document.querySelector('.account-menu');__syntheticEmit();});
 await page.waitForFunction(()=>!__oldMenu.isConnected);
 assert.equal(await page.locator('.account-menu').first().getAttribute('open'),'','Account actions must stay open across background refreshes');
 await page.locator('.account-menu summary').first().click();
 assert.equal(await page.locator('nav[aria-label="Primary"] a').count(),3);
 await page.locator('#utilization-targets').fill('80, 50, 30, 10');await page.locator('#save-utilization-targets').click();
 assert.equal(await page.locator('#utilization-kpis > article').count(),4);assert.match(await page.locator('.utilization-target-kpi[data-target="10"]').innerText(),/\$1,900\.00/);
 const save=await page.locator('#save-utilization-targets').boundingBox();assert.ok(save.height<=48,'Target save action should not stretch to label height');
 await page.locator('#utilization-targets').fill('30,10');await page.locator('#save-utilization-targets').click();assert.equal(await page.locator('#utilization-kpis > article').count(),2);
 const docs=await page.evaluate(()=>__syntheticDocs.size);
 await page.getByRole('link',{name:'Payoff Plan',exact:true}).click();await page.locator('#plan-view').waitFor();assert.equal(await page.locator('#dashboard-view').isVisible(),false);
 assert.equal(await page.locator('#optimizer').getAttribute('open'),null);assert.match(await page.locator('#optimizer-availability').innerText(),/Optional/);
 await page.locator('#sim-budget').fill('200');await page.locator('#simulator details > summary').click();await page.locator('#sim-baseline-enabled').check();
 await page.getByLabel(large+' — planned baseline / month ($)',{exact:true}).fill('25');await page.getByLabel('Small — planned baseline / month ($)',{exact:true}).fill('25');
 await page.locator('#sim-run').click();assert.equal(await page.locator('#sim-output [data-strategy]').count(),2);assert.match(await page.locator('#sim-output').innerText(),/less interest than Snowball/);
 const avalanche=page.locator('[data-strategy="avalanche"]'),snowball=page.locator('[data-strategy="snowball"]');
 for(const tile of [avalanche,snowball]){
  const first=tile.locator('.payment-month[data-month="1"]');assert.equal(await first.getAttribute('open'),'');assert.equal(await first.locator('tbody tr').count(),2);assert.match(await first.locator('tfoot').innerText(),/\$200\.00/);
  const second=tile.locator('.payment-month[data-month="2"]');assert.equal(await second.getAttribute('open'),null);assert.equal(await second.locator('table').count(),0);await second.locator('summary').click();await second.locator('table').waitFor();await second.locator('summary').click();
  const downloaded=page.waitForEvent('download');await tile.getByRole('button',{name:'Download payment schedule CSV',exact:true}).click();const csv=await readFile(await (await downloaded).path(),'utf8');assert.match(csv,/MONTH TOTAL/);assert.ok(csv.includes(large));assert.match(csv,/calendar labels are not due dates/);
 }
 assert.match(await avalanche.locator('.payment-month[data-month="1"] tbody tr').first().innerText(),/\$175\.00/);
 for(const width of [1280,1440,1920,1024,640,390,320]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Page overflow at ${width}px`);
  for(const tile of [avalanche,snowball]){
   assert.equal(await tile.locator('.payment-month[data-month="1"] .table-scroll').evaluate(wrap=>wrap.scrollWidth>wrap.clientWidth+1),false,`Payment columns must fit at ${width}px`);
   assert.equal(await tile.locator('.payment-month[data-month="1"] tbody td').evaluateAll(cells=>cells.every(cell=>{const bounds=cell.getBoundingClientRect(),wrap=cell.closest('.table-scroll').getBoundingClientRect();return bounds.left>=wrap.left-1&&bounds.right<=wrap.right+1&&getComputedStyle(cell).display!=='none';})),true);
  }
  const a=await avalanche.boundingBox(),s=await snowball.boundingBox();assert.ok(width>=1280?Math.abs(a.y-s.y)<2:s.y>a.y,`Strategy layout at ${width}px`);
  if(width===1440)await page.locator('.payoff-comparison').screenshot({path:'test-results/payoff-tables-desktop.png',animations:'disabled'});
 }
 await page.setViewportSize({width:1280,height:900});
 await page.getByLabel('Small — planned baseline / month ($)',{exact:true}).fill('0');await page.locator('#sim-run').click();assert.match(await page.locator('#sim-output [role="alert"]').innerText(),/Small: \$0 baseline/);assert.equal(await page.locator('#sim-output [data-strategy]').count(),0);
 await page.getByRole('button',{name:'Enter baseline payments',exact:true}).click();assert.equal(await page.getByLabel('Small — planned baseline / month ($)',{exact:true}).evaluate(input=>input===document.activeElement),true);
 await page.getByLabel('Small — planned baseline / month ($)',{exact:true}).fill('25');
 await page.locator('#sim-baseline-enabled').uncheck();await page.locator('#sim-run').click();await page.getByRole('button',{name:'Continue with $0 assumptions',exact:true}).click();assert.ok(await avalanche.locator('.payment-month[data-month="1"] .payment-zero').count()>0);
 await page.locator('#sim-run').click();assert.match(await page.locator('#sim-output [role="alert"]').innerText(),/Review \$0/);
 await page.locator('#sim-baseline-enabled').check();await page.locator('#sim-run').click();
 assert.equal(await page.locator('#plan-view img').count(),0);assert.equal(await page.evaluate(()=>window.__xss),undefined);
 assert.equal(await page.locator('#sim-output svg').count(),1);await page.screenshot({path:'test-results/payoff-plan-desktop.png',fullPage:true});
 await page.locator('#sim-mode').selectOption('deadline');assert.equal(await page.locator('#sim-budget-field').isVisible(),false);await page.locator('#sim-months').fill('12');await page.locator('#sim-run').click();assert.match(await page.locator('#sim-output').innerText(),/same deadline/);
 await page.locator('#sim-mode').selectOption('budget');await page.locator('#sim-budget').fill('40');await page.locator('#sim-run').click();assert.match(await page.locator('#sim-output [role="alert"]').innerText(),/baseline/);
 await page.locator('#sim-budget').fill('200');await page.locator('#sim-run').click();assert.equal(await page.evaluate(()=>__syntheticDocs.size),docs,'Hypothetical planning must not write account records');
 await page.getByRole('link',{name:'Accounts',exact:true}).click();await page.locator('#dashboard-view').waitFor();await page.goBack();await page.locator('#plan-view').waitFor();assert.equal(await page.locator('#sim-budget').inputValue(),'200');
 await page.getByRole('link',{name:'Accounts',exact:true}).click();await page.locator('#dashboard-view').waitFor();
 const small=page.locator('.debt-card').filter({has:page.getByRole('heading',{name:'Small',exact:true})});
 await small.locator('.account-menu > summary').click();await small.getByRole('button',{name:'Statement & planning',exact:true}).click();
 await page.getByLabel('Promotion type').selectOption('zero');await page.getByRole('button',{name:'Save statement and promotion references',exact:true}).click();await page.locator('dialog[open]').waitFor({state:'hidden'});
 await page.getByRole('link',{name:'Payoff Plan',exact:true}).click();await page.locator('#plan-view').waitFor();await page.waitForFunction(()=>document.getElementById('optimizer-availability').textContent.includes('1 recorded'));
 assert.equal(await page.locator('#optimizer').getAttribute('open'),null);assert.match(await page.locator('#sim-output').innerText(),/inputs changed/);
 await page.locator('#sim-run').click();
 await page.locator('#theme-toggle').click();await page.waitForFunction(()=>getComputedStyle(document.body).color==='rgb(243, 244, 246)');await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'test-results/payoff-plan-mobile-dark.png',fullPage:true,animations:'disabled'});
 await avalanche.locator('.payment-plan').screenshot({path:'test-results/monthly-payments-mobile-dark.png',animations:'disabled'});
 await page.evaluate(()=>location.hash='#optimizer');await page.waitForFunction(()=>document.getElementById('optimizer').open);await page.locator('#optimizer > summary').click();assert.equal(await page.locator('#optimizer').getAttribute('open'),null);
 await page.setViewportSize({width:320,height:750});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.reload();await page.locator('#lock-pass').fill(password);await page.locator('#lock-unlock-btn').click();await page.locator('#main-app:not(.hidden)').waitFor();await page.waitForFunction(()=>document.getElementById('optimizer').open);assert.equal(await page.locator('#plan-view').isVisible(),true);
 await page.getByRole('link',{name:'Accounts',exact:true}).click();await page.locator('#dashboard-view').waitFor();assert.equal(await page.locator('#utilization-kpis > article').count(),2);
 await page.locator('#utilization-kpis').screenshot({path:'test-results/custom-utilization-kpis.png',animations:'disabled'});await page.locator('.target-editor').screenshot({path:'test-results/target-editor-mobile.png',animations:'disabled'});
 await page.getByRole('link',{name:'Payoff Plan',exact:true}).click();await page.locator('#plan-view').waitFor();await page.locator('#sim-budget').fill('200');await page.locator('#sim-run').click();
 await page.getByRole('button',{name:'Continue with $0 assumptions',exact:true}).click();
 await page.locator('#sign-out-btn').click();assert.equal(await page.locator('#sim-budget').inputValue(),'');assert.equal(await page.locator('#sim-baseline-fields').textContent(),'');assert.equal(await page.locator('#utilization-kpis').textContent(),'');assert.equal(await page.locator('#sim-output svg').count(),0);assert.deepEqual(errors,[]);
 assert.equal(await page.locator('.payment-plan').count(),0);
 await context.close();console.log('Payoff browser passed: monthly account schedules/CSV, zero-baseline review, three views, dynamic target KPIs, budget/deadline comparison, safe text, no financial writes, mobile layout, and private-state clearing.');
}finally{await browser.close();}
