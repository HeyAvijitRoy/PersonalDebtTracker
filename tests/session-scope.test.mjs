import test from "node:test";
import assert from "node:assert/strict";
import { SessionScope } from "../src/session-scope.mjs";
test("a newer snapshot supersedes an earlier asynchronous read", () => {
  const scope = new SessionScope();
  const old = scope.startRead();
  const latest = scope.startRead();
  assert.equal(scope.accepts(old),false);
  assert.equal(scope.accepts(latest),true);
});
test("sign-out or account change invalidates all pending reads even if a new read has the same sequence", () => {
  const scope = new SessionScope();
  const generation = scope.generation;
  const old = scope.startRead();
  scope.invalidate();
  const newer = scope.startRead();
  assert.equal(scope.accepts(old),false);
  assert.equal(scope.current(generation),false);
  assert.equal(scope.accepts(newer),true);
});
