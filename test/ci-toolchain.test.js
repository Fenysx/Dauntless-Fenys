'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('GitHub Actions builds and tests use Node.js 24',()=>{
 const root=path.resolve(__dirname,'..');
 const build=fs.readFileSync(path.join(root,'.github/workflows/build.yml'),'utf8');
 const checks=fs.readFileSync(path.join(root,'.github/workflows/test.yml'),'utf8');
 const pins=source=>[...source.matchAll(/node-version: *['"]?([0-9]+)['"]?/g)].map(x=>Number(x[1]));
 assert.deepEqual(pins(build),[24,24]);
 assert.deepEqual(pins(checks),[24,24]);
});

test('package scripts preserve separate development tests and installers',()=>{
 const pkg=require('../package.json');
 for(const name of ['test','test:integration','build:win','build:linux','doctor']){
  assert.equal(typeof pkg.scripts[name],'string');
  assert.ok(pkg.scripts[name].length>0);
 }
 assert.equal(pkg.private,true);
});
