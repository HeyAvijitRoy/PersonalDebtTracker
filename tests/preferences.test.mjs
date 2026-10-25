import test from "node:test";
import assert from "node:assert/strict";
import { preferences } from "../src/preferences.mjs";
test("targets are bounded, deduplicated and sorted; intervals are validated",()=>{
 assert.deepEqual(preferences({targets:['30','80','30','10']}).targets,[80,30,10]);
 for(const value of [{targets:[]},{targets:[101]},{targets:['<script>']},{staleDays:0},{warningDays:91}])assert.throws(()=>preferences(value));
});
