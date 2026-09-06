# Security Policy — Covert Channel Studio

**Covert Channel Studio** is an educational security exhibit in the fictional *Crypto-Lab*
collection. It teaches how covert channels work — and how defenders detect them — through
a **100% client-side, browser-based simulation**. This document describes the project's
scope, its own security posture, responsible-use expectations, and how to report issues.

---

## Scope: this is a simulation, not a tool

Every packet, DNS query, resolver, server, receiver, and timing event in this exhibit is a
plain JavaScript object rendered in the browser. **The site generates no real network
traffic of any kind** beyond loading its own static assets. Simulated domains use the
reserved documentation TLD `.test` (e.g. `example.test`).

The exhibit **must not** be, and must never be described as:

- a working tunnel, covert channel, or exfiltration tool;
- a command-and-control (C2) framework or implant;
- anything deployable against a real network or host.

It does **not** use:

- raw sockets or packet injection;
- live DNS resolution or DNS traffic of any kind;
- ICMP or any other real protocol traffic;
- remote destinations, callbacks, or beacons;
- any form of real network transmission for the simulated channels.

The purpose of the exhibit is **understanding and detection**, not operational deployment.

## Security posture of the exhibit itself

The site is a static deployment (GitHub Pages) built with vanilla JavaScript ES modules.
Its attack surface is deliberately minimal:

- **Entirely client-side.** No backend, no database, no server-side code.
- **No secrets.** No API keys, tokens, or credentials exist anywhere in the project.
- **No external network requests.** The site loads only its own vendored assets; there are
  no third-party CDNs, fonts, analytics, or trackers.
- **No cookies and no sensitive storage.** Nothing secret is written to cookies,
  `localStorage`, or any other browser storage.
- **Strict Content-Security-Policy** delivered via a `<meta http-equiv>` tag, restricting
  scripts, styles, and connections to the site's own origin.
- **No `eval` or dynamic script execution.** No `eval()`, no `new Function()`, no
  string-based timers, no runtime script injection.
- **No inline event handlers.** All event wiring uses `addEventListener` in ES modules.
- **Safe rendering of user-supplied text.** Anything a visitor types (messages to encode,
  quiz answers, etc.) is rendered via `textContent` and programmatic DOM construction —
  never via unsafe `innerHTML`.
- **No third-party dependencies.** The site has no package dependencies to audit or keep
  patched; everything it runs is part of this repository.

## Responsible use

Covert-channel concepts are inherently **dual-use**. This project exists so that
defenders, students, and researchers can understand how hidden communication works — in
field values, in ordering, in protocol structure, in timing, and inside media — and how
such channels are detected and constrained.

**Do not** use the ideas presented here to build real covert-communication, exfiltration,
or command-and-control systems, or to hide activity on networks or systems you do not own
or have explicit authorization to test. Doing so may be **illegal** under computer-misuse
laws and will almost certainly **violate the acceptable-use policies** of your employer,
school, or network operator. Authorized security testing should always be performed under
a written agreement that defines its scope.

Nothing in this exhibit is "undetectable." A recurring lesson of the material is the
opposite: every channel trades **capacity against reliability against observability**, and
defenders have meaningful ways to detect, constrain, or eliminate each category shown.

## Reporting a vulnerability

Because this is a static educational site with no backend, the realistic vulnerability
classes are things like cross-site scripting through user-supplied input, CSP gaps,
misleading or technically incorrect educational content, or supply-chain issues in the
repository itself.

If you find a problem:

1. **For anything sensitive, use GitHub's private vulnerability reporting.** On this
   repository, go to the **Security** tab → **Report a vulnerability** (GitHub Security
   Advisories). This keeps the report private with the maintainers until a fix is ready.
2. **For non-sensitive functional or content bugs, open a regular GitHub issue** describing
   the affected page or module and the general nature of the problem.
3. **Do not include working exploit code** in a public issue. A description of the input and
   the observed behavior is enough; maintainers will follow up if more detail is needed.

There is no bug-bounty program. Reports are handled on a best-effort basis, and fixes ship
as ordinary commits to the public repository.

## Threat model and non-goals

To set expectations clearly, the following are **out of scope** for this project:

- **It is not a production detector.** The Detection Console's anomaly scores are
  educational indicators designed to make patterns visible to a learner. They are not IDS
  logic, are not tuned against real traffic, and should not be deployed to protect
  anything.
- **It is not a reference implementation of any channel.** The simulations favor clarity
  over fidelity; real protocols, resolvers, and networks behave differently in ways that
  matter.
- **It makes no claims about real-world stealth.** The exhibit deliberately avoids ranking
  channels by evasiveness; comparisons are made on educational clarity, reliability within
  the simulation, defensive teaching value, and complexity.
- **It does not model attacks on the visitor's browser.** The threat model for the site
  itself is limited to the static-site posture described above.

If a change to the project would blur any of these boundaries — for example, adding real
network transmission to a "simulation" — that change is a security problem by definition
and should be reported as such.
