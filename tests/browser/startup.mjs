import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { syntheticPage } from './harness.mjs';
const browser=await chromium.launch({headless:true});
try{
 const {page,context,errors}=await syntheticPage(browser);
 // A fresh user must not see setup when the server cannot confirm absence.
 await page.addInitScript(()=>{globalThis.__syntheticMetaHangs=true;});await page.reload();
 await page.locator('#lock-loading').waitFor();
 await page.locator('#lock-retry').waitFor({timeout:15000});
 assert.equal(await page.locator('#lock-setup').isVisible(),false);
 await page.evaluate(()=>globalThis.__syntheticMetaHangs=false);await page.locator('#lock-retry').click();
 await page.locator('#lock-pass1').fill('synthetic-passphrase');await page.locator('#lock-pass2').fill('synthetic-passphrase');await page.locator('#lock-setup-btn').click();await page.locator('#main-app:not(.hidden)').waitFor();
 // Reload re-enables the stalled-server flag; cached existing settings must
 // still bring up the passphrase field without waiting for that request.
 await page.reload();await page.locator('#lock-pass').waitFor({timeout:2500});
 assert.equal(await page.locator('#lock-setup').isVisible(),false);
 await page.locator('#lock-pass').fill('synthetic-passphrase');await page.locator('#lock-unlock-btn').click();await page.locator('#main-app:not(.hidden)').waitFor();
 // When SDK cache and WebChannel reads are unavailable, the same signed-in
 // identity can retrieve metadata through the authenticated single-read API.
 await page.evaluate(()=>localStorage.removeItem('pdt-lock-metadata:synthetic-project:synthetic-owner'));
 await page.addInitScript(()=>{globalThis.__syntheticCacheMiss=true;globalThis.__syntheticRestMetadataEnabled=true;});
 await page.reload();await page.locator('#lock-pass').waitFor({timeout:5000});assert.equal(await page.locator('#lock-setup').isVisible(),false);
 assert.deepEqual(errors,[]);await context.close();
 console.log('Startup browser passed: bounded wait, safe retry, cached unlock, and authenticated metadata fallback when SDK reads stall.');
}finally{await browser.close();}
