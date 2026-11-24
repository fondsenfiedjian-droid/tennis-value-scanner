import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rootHtml=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const devHtml=readFileSync(new URL("../developer/index.html",import.meta.url),"utf8");
const rootManifest=JSON.parse(readFileSync(new URL("../manifest.webmanifest",import.meta.url),"utf8"));
const devManifest=JSON.parse(readFileSync(new URL("../developer/manifest.webmanifest",import.meta.url),"utf8"));
const rootWorker=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
const devWorker=readFileSync(new URL("../developer/sw.js",import.meta.url),"utf8");
const devRuntime=readFileSync(new URL("../developer/edition-runtime.js",import.meta.url),"utf8");

test("Production and Developer have distinct install identities and scopes",()=>{
  assert.notEqual(rootManifest.id,devManifest.id);
  assert.equal(rootManifest.id,"/");
  assert.equal(devManifest.id,"/developer/");
  assert.equal(devManifest.start_url,"/developer/");
  assert.equal(devManifest.scope,"/developer/");
  assert.match(devManifest.name,/Developer/);
});
test("both editions expose an in-app version and Developer has a separate label",()=>{
  assert.match(rootHtml,/id="editionVersion"/);
  assert.match(devHtml,/version:"2\.1\.0-dev\.1"/);
  assert.match(rootHtml,/edition-runtime\.js/);
  assert.match(devHtml,/edition-runtime\.js/);
});
test("model laboratory is gated to Developer Edition",()=>{
  assert.match(devHtml,/channel:"developer"/);
  assert.match(devRuntime,/if\(!isDeveloper\).*quickLab/s);
  assert.match(devRuntime,/tvs-lab-models-v1/);
  assert.match(devRuntime,/labK/);
  assert.match(devRuntime,/labSurface/);
  assert.match(devRuntime,/labForm/);
  assert.match(devRuntime,/labH2h/);
  assert.match(devRuntime,/Исторический backtest-runner ещё не подключён/);
});
test("Developer local data and service worker caches are isolated",()=>{
  assert.match(devHtml,/tvs-developer:/);
  assert.match(devHtml,/prefix\+String\(name\)/);
  assert.match(devWorker,/tvs-developer-static-v1/);
  assert.match(devWorker,/startsWith\("tvs-developer-static-"\)/);
  assert.match(rootWorker,/startsWith\("tennis-value-static-"\)/);
});
