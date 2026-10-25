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
 await page.locator('#open-add-account').click();await page.locator('#card-name').fill('Fallback account');await page.locator('#limit').fill('5000');await page.locator('#available-credit').fill('3200');await page.locator('#apr').fill('24');await page.locator('#submit-btn').click();
 await page.waitForFunction(()=>[...globalThis.__syntheticDocs.keys()].some(path=>/\/cards\/[^/]+$/.test(path)));
 // Reload re-enables the stalled-server flag; cached existing settings must
 // still bring up the passphrase field without waiting for that request.
 await page.reload();await page.locator('#lock-pass').waitFor({timeout:2500});
 assert.equal(await page.locator('#lock-setup').isVisible(),false);
 await page.locator('#lock-pass').fill('synthetic-passphrase');await page.locator('#lock-unlock-btn').click();await page.locator('#main-app:not(.hidden)').waitFor();
 // When SDK cache and WebChannel reads are unavailable, the same signed-in
 // identity can retrieve metadata through the authenticated single-read API.
 await page.evaluate(()=>localStorage.removeItem('pdt-lock-metadata:synthetic-project:synthetic-owner'));
 await page.addInitScript(()=>{globalThis.__syntheticCacheMiss=true;globalThis.__syntheticRestMetadataEnabled=true;globalThis.__syntheticAccountsHang=true;});
 await page.reload();await page.locator('#lock-pass').waitFor({timeout:5000});assert.equal(await page.locator('#lock-setup').isVisible(),false);
 await page.locator('#lock-pass').fill('synthetic-passphrase');await page.locator('#lock-unlock-btn').click();
 await page.locator('#main-app:not(.hidden)').waitFor({timeout:6000});
 assert.match(await page.locator('#card-list').innerText(),/Fallback account/);
 assert.match(await page.locator('#account-connection-message').innerText(),/HTTPS/);
 // Offline reload must recover the owner's encrypted snapshot, with a clear stale-data notice.
 await page.addInitScript(()=>{globalThis.__syntheticRestMetadataEnabled=false;});
 await page.reload();await page.locator('#lock-pass').fill('synthetic-passphrase');await page.locator('#lock-unlock-btn').click();
 await page.locator('#main-app:not(.hidden)').waitFor({timeout:6000});
 assert.match(await page.locator('#card-list').innerText(),/Fallback account/);
 assert.match(await page.locator('#account-connection-message').innerText(),/previously loaded/);
 assert.deepEqual(errors,[]);await context.close();
 console.log('Startup browser passed: bounded wait, safe retry, cached unlock, authenticated account fallback when SDK reads stall, and encrypted offline account recovery.');
}finally{await browser.close();}
