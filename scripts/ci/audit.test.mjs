import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAudit, assertNoExpansion } from './audit.mjs';

const id = 'GHSA-67mh-4wv8-2f99';
const baseline = {
  schemaVersion: 1,
  advisories: [
    {
      id,
      package: 'esbuild',
      severity: 'moderate',
      versions: ['0.18.20'],
      devOnly: true,
      reason: 'Development tooling only',
    },
  ],
};
function report() {
  return {
    advisories: {
      1: {
        github_advisory_id: id,
        module_name: 'esbuild',
        severity: 'moderate',
        findings: [{ version: '0.18.20', dev: true }],
      },
    },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0 } },
  };
}

test('accepts only reviewed development findings', () => {
  const result = evaluateAudit(report(), baseline);
  assert.equal(result.known.length, 1);
  assert.deepEqual(result.unexpected, []);
});

test('rejects a different advisory even when severity counts are identical', () => {
  const audit = report();
  audit.advisories[1].github_advisory_id = 'GHSA-698v-4r3x-3vcv';
  assert.equal(evaluateAudit(audit, baseline).unexpected.length, 1);
});

test('rejects production exposure, unreviewed versions, packages and increased severity', () => {
  for (const change of [
    (a) => {
      a.advisories[1].findings[0].dev = false;
    },
    (a) => {
      a.advisories[1].findings[0].version = '0.19.0';
    },
    (a) => {
      a.advisories[1].module_name = 'another-package';
    },
    (a) => {
      a.advisories[1].severity = 'high';
      a.metadata.vulnerabilities.moderate = 0;
      a.metadata.vulnerabilities.high = 1;
    },
  ]) {
    const audit = report();
    change(audit);
    assert.equal(evaluateAudit(audit, baseline).unexpected.length, 1);
  }
});

test('reports resolved advisories without requiring the vulnerability to remain', () => {
  const audit = report();
  audit.advisories = {};
  audit.metadata.vulnerabilities.moderate = 0;
  assert.deepEqual(evaluateAudit(audit, baseline).resolved, [id]);
});

test('fails closed on service errors, unknown formats and truncated reports', () => {
  for (const audit of [
    { error: 'registry unavailable' },
    {},
    { advisories: {} },
    { ...report(), advisories: {} },
  ]) {
    assert.throws(() => evaluateAudit(audit, baseline));
  }
  const audit = report();
  delete audit.advisories[1].findings[0].dev;
  assert.throws(() => evaluateAudit(audit, baseline));
});

test('baseline changes cannot add exceptions or broaden an existing exception', () => {
  for (const change of [
    (b) => {
      b.advisories.push({ ...b.advisories[0], id: 'GHSA-698v-4r3x-3vcv' });
    },
    (b) => {
      b.advisories[0].versions.push('0.19.0');
    },
    (b) => {
      b.advisories[0].severity = 'critical';
    },
    (b) => {
      b.advisories[0].package = 'another-package';
    },
    (b) => {
      b.advisories[0].devOnly = false;
    },
  ]) {
    const proposed = structuredClone(baseline);
    change(proposed);
    assert.throws(() => assertNoExpansion(proposed, baseline));
  }
  assert.doesNotThrow(() => assertNoExpansion(baseline, baseline));
  assert.doesNotThrow(() => assertNoExpansion({ schemaVersion: 1, advisories: [] }, baseline));
});
