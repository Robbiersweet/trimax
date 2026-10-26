/* eslint-disable @typescript-eslint/no-require-imports -- Verify private real-PostgreSQL concurrency evidence without starting a server. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const file = path.join(process.env.LOCALAPPDATA, 'Trimax/completion-concurrency-20261026/result-final.json');
const proof = JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = name => crypto.createHash('sha256').update(fs.readFileSync(name, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
assert.equal(proof.status, 'PASS');
assert.equal(proof.cases, 39);
assert.equal(proof.migrationSha256.toLowerCase(), hash('supabase/migrations/20261026_atomic_job_completion.sql'));
assert.equal(proof.runnerSha256.toLowerCase(), hash('scripts/atomic-job-completion-concurrency.cjs'));
assert.deepEqual(proof.isolation, ['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']);
assert.equal(proof.productionMutations, false);
assert.equal(proof.hostedMutations, false);
assert.equal(proof.serverStopped, true);
assert.ok(Number.isFinite(Date.parse(proof.observedAt)));
console.log('PASS source-bound private PostgreSQL concurrency evidence: 39 cases; disposable server stopped');
