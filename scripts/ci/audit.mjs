import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const baselinePath = '.github/security-audit-baseline.json';
const severities = ['info', 'low', 'moderate', 'high', 'critical'];
const ghsa = /^GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}$/;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateBaseline(baseline) {
  if (baseline?.schemaVersion !== 1 || !Array.isArray(baseline.advisories)) {
    throw new Error('Unsupported audit baseline format');
  }
  const ids = new Set();
  for (const item of baseline.advisories) {
    if (
      !ghsa.test(item.id) ||
      ids.has(item.id) ||
      typeof item.package !== 'string' ||
      !item.package ||
      !severities.includes(item.severity) ||
      item.devOnly !== true ||
      !Array.isArray(item.versions) ||
      item.versions.length === 0 ||
      item.versions.some((version) => typeof version !== 'string' || !version) ||
      typeof item.reason !== 'string' ||
      !item.reason.trim()
    ) {
      throw new Error(`Invalid or duplicate baseline entry: ${item.id}`);
    }
    ids.add(item.id);
  }
  return baseline.advisories;
}

// A PR cannot make a new advisory pass by extending its own exception list.
// Removals and tighter limits are allowed; expansion requires a separate policy review.
export function assertNoExpansion(current, trusted) {
  const approved = new Map(validateBaseline(trusted).map((item) => [item.id, item]));
  for (const item of validateBaseline(current)) {
    const previous = approved.get(item.id);
    if (
      !previous ||
      previous.package !== item.package ||
      severities.indexOf(item.severity) > severities.indexOf(previous.severity) ||
      item.versions.some((version) => !previous.versions.includes(version))
    ) {
      throw new Error(`Audit baseline expansion is not allowed: ${item.id}`);
    }
  }
}

export function evaluateAudit(report, baseline) {
  const approved = new Map(validateBaseline(baseline).map((item) => [item.id, item]));
  if (!record(report) || report.error || !record(report.advisories)) {
    throw new Error('Audit failed or returned an unsupported report; refusing to pass');
  }
  const counts = report.metadata?.vulnerabilities;
  if (
    !record(counts) ||
    severities.some((level) => !Number.isInteger(counts[level]) || counts[level] < 0)
  ) {
    throw new Error('Audit report has no valid vulnerability summary');
  }
  const actualCounts = Object.fromEntries(severities.map((level) => [level, 0]));
  const known = [],
    unexpected = [],
    seen = new Set();
  for (const advisory of Object.values(report.advisories)) {
    const id = advisory.github_advisory_id;
    if (
      !ghsa.test(id) ||
      seen.has(id) ||
      typeof advisory.module_name !== 'string' ||
      !severities.includes(advisory.severity) ||
      !Array.isArray(advisory.findings) ||
      advisory.findings.length === 0 ||
      advisory.findings.some(
        (finding) => typeof finding.version !== 'string' || typeof finding.dev !== 'boolean',
      )
    ) {
      throw new Error('Audit contains an unrecognized advisory or finding');
    }
    seen.add(id);
    actualCounts[advisory.severity]++;
    const entry = approved.get(id);
    const accepted =
      entry &&
      entry.package === advisory.module_name &&
      severities.indexOf(advisory.severity) <= severities.indexOf(entry.severity) &&
      advisory.findings.every(
        (finding) => finding.dev === true && entry.versions.includes(finding.version),
      );
    const result = {
      id,
      package: advisory.module_name,
      severity: advisory.severity,
      versions: [...new Set(advisory.findings.map((finding) => finding.version))],
      url: `https://github.com/advisories/${id}`,
    };
    (accepted ? known : unexpected).push(result);
  }
  if (severities.some((level) => counts[level] !== actualCounts[level])) {
    throw new Error('Audit summary does not match its advisory details');
  }
  return {
    known,
    unexpected,
    resolved: [...approved.keys()].filter((id) => !seen.has(id)),
  };
}

function checkBaselineHistory(baseline) {
  if (!process.env.GITHUB_EVENT_PATH) return;
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const eventName = process.env.GITHUB_EVENT_NAME;
  const reference =
    eventName === 'pull_request'
      ? event.pull_request?.base?.sha
      : eventName === 'push'
        ? event.before
        : process.env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(reference ?? '') || /^0+$/.test(reference)) {
    throw new Error('Cannot establish trusted baseline revision');
  }
  // ls-tree fails on missing history, but succeeds with empty output for the initial rollout.
  const exists = execFileSync('git', ['ls-tree', '--name-only', reference, '--', baselinePath], {
    encoding: 'utf8',
  }).trim();
  if (!exists) {
    if (eventName !== 'push' || process.env.GITHUB_REF !== 'refs/heads/main') {
      throw new Error('Trusted baseline is missing; bootstrap it on main first');
    }
    console.log('Initial audit baseline rollout on main (no baseline in previous revision).');
    return;
  }
  const trusted = JSON.parse(
    execFileSync('git', ['show', `${reference}:${baselinePath}`], { encoding: 'utf8' }),
  );
  assertNoExpansion(baseline, trusted);
}

function main() {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  validateBaseline(baseline);
  checkBaselineHistory(baseline);
  const audit = spawnSync('pnpm audit --json', {
    shell: true,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/security-audit.json', audit.stdout ?? '');
  if (audit.error || ![0, 1].includes(audit.status)) {
    throw new Error(
      `pnpm audit did not complete (exit ${audit.status}): ${audit.error?.message ?? audit.stderr}`,
    );
  }
  const result = evaluateAudit(JSON.parse(audit.stdout), baseline);
  const total = result.known.length + result.unexpected.length;
  if ((audit.status === 0) !== (total === 0))
    throw new Error('Audit exit code contradicts its report');
  const lines = [
    '## Security audit',
    '',
    `Known: ${result.known.length}; unexpected: ${result.unexpected.length}; no longer detected: ${result.resolved.length}.`,
    '',
    '| Status | Advisory | Package | Severity | Versions |',
    '| --- | --- | --- | --- | --- |',
    ...['known', 'unexpected'].flatMap((status) =>
      result[status].map(
        (item) =>
          `| ${status} | [${item.id}](${item.url}) | ${item.package} | ${item.severity} | ${item.versions.join(', ')} |`,
      ),
    ),
    '',
    ...result.resolved.map(
      (id) => `No longer detected: ${id}. Remove its baseline entry after review.`,
    ),
  ];
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  if (result.unexpected.length)
    throw new Error(
      'New advisory, increased severity, changed version, or production exposure detected',
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
