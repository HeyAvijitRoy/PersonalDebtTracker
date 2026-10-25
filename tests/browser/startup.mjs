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
 assert.deepEqual(errors,[]);await context.close();
 console.log('Startup browser passed: bounded metadata wait, safe retry, server-confirmed setup, and cache-first passphrase reload.');
}finally{await browser.close();}
