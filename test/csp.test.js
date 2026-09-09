/**
 * csp.test.js — the Content-Security-Policy in index.html must stay honest.
 *
 * index.html carries one inline <script> (the dark-theme pin required by the
 * fleet theme contract). The CSP allows it by sha256 hash rather than by
 * relaxing the policy to 'unsafe-inline', which is the right call — but it
 * creates a failure mode that is completely silent and that no other test here
 * would catch:
 *
 *   Change ONE BYTE of that script — a reindent, a reworded comment, a
 *   trailing space — and the hash no longer matches. The browser then refuses
 *   to run it. The page still loads, every test still passes, and the theme
 *   pin quietly stops working. Nothing anywhere reports it except a console
 *   violation nobody is watching.
 *
 * So this file recomputes the hash from the file's own bytes on every run. It
 * is the only thing standing between a whitespace edit and a dead script.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** The CSP value, with the newlines the attribute is wrapped across. */
function cspContent() {
  const m = html.match(/http-equiv="Content-Security-Policy"\s*content="([^"]*)"/s);
  assert.ok(m, 'index.html must carry a <meta> Content-Security-Policy');
  return m[1];
}

test('every inline <script> is allowed by a matching sha256 hash', () => {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>(.*?)<\/script>/gs)].map((m) => m[1]);
  const csp = cspContent();
  const declared = [...csp.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1]);

  assert.equal(scripts.length, declared.length,
    `index.html has ${scripts.length} inline script(s) but the CSP declares ${declared.length} hash(es) — every inline script needs its own`);

  for (const body of scripts) {
    const computed = 'sha256-' + createHash('sha256').update(body, 'utf8').digest('base64');
    assert.ok(declared.includes(computed),
      `inline script hash mismatch.\n  computed: ${computed}\n  declared: ${declared.join(', ')}\n`
      + '  The script body changed without the CSP hash being regenerated, so the browser will\n'
      + '  silently refuse to run it. Recompute with:\n'
      + "    printf '%s' \"<exact script body>\" | openssl dgst -sha256 -binary | openssl base64");
  }
});

test('the CSP never relaxes to unsafe-inline or unsafe-eval', () => {
  const csp = cspContent();
  assert.ok(!csp.includes("'unsafe-inline'"), "CSP must not use 'unsafe-inline' — hash the script instead");
  assert.ok(!csp.includes("'unsafe-eval'"), "CSP must not use 'unsafe-eval'");
  assert.match(csp, /script-src 'self'/, "script-src must still allow the site's own modules");
  assert.match(csp, /connect-src 'none'/, 'connect-src none is the zero-exfiltration guarantee');
});

test('no inline event handlers, which a hash cannot cover', () => {
  // on*= attributes are inline script the CSP hash does not authorise, so they
  // would be blocked in a browser while looking fine in the source.
  const handlers = [...html.matchAll(/\son[a-z]+\s*=/gi)].map((m) => m[0].trim());
  assert.deepEqual(handlers, [], `inline event handlers found: ${handlers.join(', ')}`);
});

test('the theme pin writes only a non-secret value', () => {
  // SECURITY.md promises nothing SECRET reaches browser storage. Keep that
  // literally true by pinning what the inline script is allowed to store.
  const writes = [...html.matchAll(/localStorage\.setItem\(\s*'([^']+)'\s*,\s*'([^']+)'/g)]
    .map((m) => `${m[1]}=${m[2]}`);
  assert.deepEqual(writes, ['theme=dark'],
    `index.html may only store the theme pin; found: ${writes.join(', ') || '(none)'}`);
});

/**
 * OPT-IN: check the hash against the bytes actually SERVED, not just authored.
 *
 * Everything above proves the hash is right in the repository. It cannot prove
 * the deployed page is byte-identical to the file — only a fetch can, because
 * that is what the browser hashes. GitHub Pages serves this repo as-is (the
 * deploy uploads `path: '.'` with no build step), so the two should never
 * diverge; a serving-layer rewrite is the one failure this catches and the
 * authored-bytes check above cannot.
 *
 * Off by default, and deliberately so. This project's whole posture is that it
 * makes no network requests, and the fast test loop must stay deterministic and
 * offline. Enable it explicitly when you want the stronger claim:
 *
 *   CSP_CHECK_URL=https://systemslibrarian.github.io/crypto-lab-covert-channel-studio/ npm test
 */
test('served page matches the declared hash (opt-in via CSP_CHECK_URL)', async (t) => {
  const url = process.env.CSP_CHECK_URL;
  if (!url) {
    t.skip('set CSP_CHECK_URL to check the deployed bytes; skipped so the suite stays offline');
    return;
  }
  let served;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    assert.equal(res.status, 200, `fetching ${url} returned HTTP ${res.status}`);
    served = await res.text();
  } catch (err) {
    // A network failure is not a policy failure; say which one happened.
    t.skip(`could not reach ${url} (${err.message}) — not treating unreachable as non-conformant`);
    return;
  }

  const scripts = [...served.matchAll(/<script(?![^>]*\bsrc=)[^>]*>(.*?)<\/script>/gs)].map((m) => m[1]);
  const csp = served.match(/http-equiv="Content-Security-Policy"\s*content="([^"]*)"/s);
  assert.ok(csp, 'the served page carries no <meta> CSP');
  const declared = [...csp[1].matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1]);

  for (const body of scripts) {
    const computed = 'sha256-' + createHash('sha256').update(body, 'utf8').digest('base64');
    assert.ok(declared.includes(computed),
      `the SERVED inline script does not match any declared hash.\n`
      + `  computed from served bytes: ${computed}\n  declared: ${declared.join(', ')}\n`
      + '  The repository copy may be correct while the serving layer rewrote the page.');
  }
  assert.match(served, /<html[^>]*\bdata-theme="dark"/, 'the served page must carry the theme pin');
});
