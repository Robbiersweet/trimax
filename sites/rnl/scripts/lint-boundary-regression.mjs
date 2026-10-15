import assert from 'node:assert/strict';import {createRequire} from 'node:module';import config from '../eslint.config.mjs';
const require=createRequire(import.meta.url);const {getRootDirs}=require('@next/eslint-plugin-next/dist/utils/get-root-dirs.js');
// Next's glob parsing is only invoked for a string/array settings.next.rootDir.
const settings=config.reduce((all,c)=>({...all,...c.settings,next:{...all.next,...c.settings?.next}}),{});
assert.equal(settings.next.rootDir,undefined);const cwd=process.cwd();assert.deepEqual(getRootDirs({cwd,settings}),[cwd]);
assert.ok(config.some(c=>Object.keys(c.rules??{}).some(k=>k.startsWith('@next/next/'))),'Next rules retained');
console.log('PASS lint has no configurable root glob, current-directory discovery and Next rules retained; upstream advisory remains open');
