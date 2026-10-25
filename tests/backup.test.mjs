import test from "node:test";
import assert from "node:assert/strict";
import { validateBackup,csvCell,BACKUP_FORMAT } from "../src/backup.mjs";
import { observations } from "../src/history.mjs";
import { createAccount } from "../src/account-model.mjs";
const account=createAccount({name:"A",creditLimit:1000,availableCredit:200,apr:12},{observedAt:"2026-10-24T16:00:00.000Z",effectiveDate:"2026-10-24"});
const event={id:"original",accountId:"account",schemaVersion:1,recordedAt:"2026-10-24T16:00:00.000Z",type:"add",details:{},before:null,after:account};
test("full backups retain identities and dates; invalid shapes and duplicate IDs fail",()=>{
 const raw={format:BACKUP_FORMAT,version:1,accounts:[{id:"account",account,events:[event]}]};assert.deepEqual(validateBackup(raw).accounts[0].events[0],event);
 assert.throws(()=>validateBackup({...raw,version:2}));assert.throws(()=>validateBackup({...raw,accounts:[raw.accounts[0],raw.accounts[0]]}));
 assert.throws(()=>validateBackup({...raw,accounts:[{...raw.accounts[0],id:"../other"}]}));
});
test("CSV text cannot execute spreadsheet formulas",()=>{assert.equal(csvCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');assert.equal(csvCell("normal"),'"normal"');});
test("corrections supersede observations instead of creating fake progress",()=>{
 const corrected={...event,id:"corrected",type:"correction",details:{correctionOf:"original",observation:{...account,balance:700,availableCredit:300}}};
 const result=observations([event,corrected]);assert.equal(result.length,1);assert.equal(result[0].account.balance,700);
});
