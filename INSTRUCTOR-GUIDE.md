# Instructor Guide — Covert Channel Studio

> A teaching companion for the browser-based, fully-simulated **Covert Channel Studio** exhibit.
> This guide is for the person running the session. It gives you lesson plans, seeded links to hand
> out, discussion prompts, an outcome map, and grading rubrics.

**Live lab:** <https://systemslibrarian.github.io/crypto-lab-covert-channel-studio/>

Everything in the lab is a 100% client-side simulation. Every "packet," DNS query, resolver, and
timing event is a plain JavaScript object rendered in the browser. Nothing touches a real network,
and the exhibit is built for **understanding, detection, and mitigation** — not operation. Please
read the [Responsible use & ethics](#responsible-use--ethics) note before teaching from it, and keep
its framing in front of your students.

---

## Contents

- [Purpose & audience](#purpose--audience)
- [Prerequisites](#prerequisites)
- [How to run a session](#how-to-run-a-session)
  - [Point students at the live URL](#1-point-students-at-the-live-url)
  - [Hand out a seeded state](#2-hand-out-a-seeded-state)
  - [Have students export a lab notebook](#3-have-students-export-a-lab-notebook)
- [Lesson plans](#lesson-plans)
  - [Plan A — 30-minute survey](#plan-a--30-minute-survey)
  - [Plan B — 60-minute lab](#plan-b--60-minute-lab)
  - [Plan C — 90-minute deep lab](#plan-c--90-minute-deep-lab)
- [Learning-outcome map](#learning-outcome-map)
- [Grading rubrics](#grading-rubrics)
  - [Rubric 1 — Blind Detection Challenge](#rubric-1--blind-detection-challenge)
  - [Rubric 2 — Written reflection](#rubric-2--written-reflection)
- [Facilitation notes: common misconceptions](#facilitation-notes-common-misconceptions)
- [Responsible use & ethics](#responsible-use--ethics)
- [Appendix — section and seed reference](#appendix--section-and-seed-reference)

---

## Purpose & audience

Covert Channel Studio teaches what a covert channel is, how it differs from encryption and ordinary
tunnelling, and — with equal weight — how **defenders** detect and disrupt one. The exhibit is
organised around a single thesis:

> A covert channel communicates information through a mechanism that was **not intended** to carry
> that information.

The lab is a good fit for:

- **Undergraduate or graduate security courses** — a module on information hiding, network security,
  or trusted-systems evaluation.
- **Professional / workforce training** — SOC analysts, blue-team upskilling, threat-hunting
  fundamentals, privacy-by-design workshops.
- **Library & information-science / data-governance audiences** — the *Library Records* section
  reframes covert channels as an everyday metadata-privacy problem, so the material lands for a
  non-network audience too.
- **Self-directed learners** — every section opens with a "by the end you can…" outcome contract and
  ends with a self-check quiz.

You do **not** need to be a covert-channel specialist to facilitate. This guide gives you the
distinctions, the misconceptions to watch for, and the corrections in advance.

## Prerequisites

**For students**

- Comfort with the idea of *bits and bytes* (a message is encoded as bits).
- A rough mental model of how network traffic is structured: packets, headers, a request and a
  response. The lab re-explains everything it uses, so gaps here are survivable.
- No programming is required. No installation is required. A modern desktop browser (current Chrome,
  Firefox, Edge, or Safari) is the only tool.

**For instructors**

- Skim the [README](README.md) and this guide once before class.
- Decide which **seed(s)** you will hand out (see below) so every screen in the room matches yours.
- If your network blocks GitHub Pages, you can serve the site locally instead:
  `python3 -m http.server 8080` from the repo root, then open `http://localhost:8080`. (Opening
  `index.html` over `file://` will not work — the app uses native ES modules.)

---

## How to run a session

The lab needs no accounts, no logins, and no setup. A session is three moves.

### 1. Point students at the live URL

Share <https://systemslibrarian.github.io/crypto-lab-covert-channel-studio/>. The left-hand
navigation is grouped **Start · Channels · Analysis · Reference**. Three global controls sit at the
top of every page:

| Control | What it does | Teaching use |
| --- | --- | --- |
| **Hidden message** | The toy message encoded by every channel (default `HELLO`, capped at 24 UTF-8 bytes). | Change it once and every channel re-encodes the same bits — the "same bits, many carriers" idea made literal. |
| **Seed** | A deterministic key (default `crypto-lab`). | The same seed always produces the same run, so your screen and theirs match exactly. |
| **View mode** | **Sender / Receiver** vs **Defender**. | Flip the whole exhibit between "how it's built" and "what a monitor sees." |

### 2. Hand out a seeded state

The lab encodes the **section, seed, and view mode in the URL hash**, so you can hand out an exact,
reproducible state as a link:

```
https://systemslibrarian.github.io/crypto-lab-covert-channel-studio/#dns?seed=crypto-lab&mode=defender
```

- `#dns` — open the DNS Channel section (any section id works; see the [appendix](#appendix--section-and-seed-reference)).
- `seed=crypto-lab` — the deterministic key. **Any string is a valid seed.** Give each breakout group
  a different seed (`seed=group-1`, `seed=group-2`, …) so they each analyse a *different but
  reproducible* run.
- `mode=defender` — open in Defender view. Omit it (or use `mode=sender`) for the sender/receiver
  build view.

> **Note:** the app only writes the seed into the URL when it differs from the default `crypto-lab`,
> and only writes `mode=defender` when in Defender view. So a link may look shorter than the one you
> typed — the *state* is identical. When you want each group on distinct data, give them distinct
> **non-default** seeds; those always appear in the link.

**Recipe for handing out state**

1. Navigate to the exact section, set the seed and view mode you want.
2. Copy the URL from the browser's address bar (or just construct it from the pattern above).
3. Paste it into your LMS / chat / slide. Anyone who opens it lands on the identical run.

### 3. Have students export a lab notebook

Each of the five network-channel sections — **DNS, Timing, Storage, Packet-Order, and HTTP Header** —
carries a **live trade-off instrument** (capacity · reliability · observability) with an expandable
**"Lab notebook — export this run"** panel. Clicking **Copy Markdown** puts a reproducible record on
the clipboard:

- the channel and the message,
- the **shareable link** (seed + settings that replay the run),
- a timestamp,
- the **decoded result** and any bit errors,
- **capacity** (bits/s and bits/event), **reliability** (bit-error rate), **observability** (0–100
  score and LOW/MODERATE/HIGH level),
- the **named, cited detector methods** and their measured values,
- a footer reminding the reader it is an educational indicator, not a verdict.

Use the notebook as the **submission artifact**: students paste it into a worksheet or your LMS as
proof of the exact run they analysed. Because the link replays the run, you can verify any submission
by opening it yourself. It also makes a ready-made **answer key** — capture the notebook for each
seed you assign.

---

## Lesson plans

Three timings, same exhibit. Each plan lists an agenda, the sections to use, the seeded links to open,
discussion prompts, and what to assess. Timings assume students each have a device; for a
lecture-hall setting, drive from the front and treat the "students do" steps as think-pair-share.

Throughout, keep the **framing rules** visible: never rank channels by stealth, never call anything
"undetectable," always land on detection and mitigation.

---

### Plan A — 30-minute survey

**Goal:** every student leaves able to say what a covert channel is, why it is *not* the same as
encryption, and that detection is probabilistic.

**Sections used:** Overview → Timing Channel → Storage Channel → Detection Console (brief).

| Time | Activity | Section / link |
| --- | --- | --- |
| 0–5 min | **Frame the thesis.** Read the "one idea to take away." Show the "five ways to hide" cards. | `#overview` |
| 5–13 min | **Timing, live.** Set message `HELLO`. Show identical packets carrying bits purely in the gaps. Raise **jitter** and watch a perfect message degrade. | `#timing?seed=crypto-lab` |
| 13–21 min | **Storage, live.** Show one bit per packet in a field value. Toggle a **middlebox** and watch the recovered message fall apart even though every packet "arrived." | `#storage?seed=crypto-lab` |
| 21–27 min | **Flip to the defender.** Same runs, Defender view: what a monitor actually measures, stated as LOW/MODERATE/HIGH anomaly with reasons. | `#timing?seed=crypto-lab&mode=defender` |
| 27–30 min | **Wrap + one quiz item.** Do the `https-not-automatically-covert` item together. | `#quiz` |

**Discussion prompts**

- The bytes in every timing packet are identical. Where is the message?
- The storage packets all still "arrived." Why did the message break anyway?
- If a monitor sees "regular timing," has it caught a covert channel? (Answer: no — regularity is a
  clue, not a verdict.)

**What to assess (formative only):** a one-sentence exit ticket — *"In your own words, why is an
HTTPS session usually not a covert channel?"* Look for: encryption hides **content**, but the
existence/shape of the communication is still plain.

---

### Plan B — 60-minute lab

**Goal:** students build and break two channels, then act as an analyst on unseen traffic.

**Sections used:** Overview (brief) → one build channel → Storage middlebox experiment → **Detection
Challenge** → What Makes a Channel Covert?

| Time | Activity | Section / link |
| --- | --- | --- |
| 0–5 min | Frame the thesis and the taxonomy. | `#overview` |
| 5–18 min | **Build & break — DNS.** In Sender view, encode a message into query labels. Then flip to Defender view: label length, character-frequency divergence, unique-name ratio, cadence. Export the lab notebook. | `#dns?seed=crypto-lab` → add `&mode=defender` |
| 18–30 min | **Middlebox experiment — Storage.** Encode bits in IP-ID parity / TTL / TCP-seq low bit. Predict what a NAT / normaliser / proxy will do, then toggle it and confirm. Note the bit-error rate jump. | `#storage?seed=crypto-lab` |
| 30–50 min | **Blind Detection Challenge.** Assign each group a distinct seed. Students see observables only, commit a call (clean / suspicious / covert), name the tell, then reveal. Includes benign-but-busy false-positive traps. | `#challenge?seed=group-1`, `…group-2`, … |
| 50–58 min | **Consolidate.** Walk the three core distinctions and the trade-off triangle computed live. | `#concepts` |
| 58–60 min | Assign the take-home reflection (see [Rubric 2](#rubric-2--written-reflection)). | — |

**Discussion prompts**

- In the DNS run, which single indicator would you trust *least* on its own, and why? (Volume — a
  software-update burst looks alarming and is benign.)
- Storage vs timing: which corner of the trade-off triangle did the middlebox attack? (Reliability.)
- In the Challenge, did anyone flag a *clean* case as covert? What benign process produced the tell?

**What to assess:**

- The **Detection Challenge** result tally (covert caught, missed, false alarms, clean cleared) — see
  [Rubric 1](#rubric-1--blind-detection-challenge).
- One **exported lab notebook** per group from the DNS or Storage build, pasted into the worksheet.

---

### Plan C — 90-minute deep lab

**Goal:** students reason across the whole taxonomy, apply a systematic analysis method, and connect
covert channels to real defensive controls and to privacy.

**Sections used:** Overview → three build channels of the group's choice → Image Steganography →
Library Records → Shared-Resource Matrix → Carrier Atlas → Detection Challenge → Defensive Takeaways.

| Time | Activity | Section / link |
| --- | --- | --- |
| 0–8 min | Frame the thesis, taxonomy, and the "same bits, five carriers" preview. | `#overview` |
| 8–30 min | **Station rotation (build & break).** Groups pick 3 of: DNS, Timing, Storage, Packet-Order, HTTP Header. Build in Sender view, break with the natural knob (jitter / middlebox / reordering / normalising proxy), export a notebook each. | `#dns`, `#timing`, `#storage`, `#ordering`, `#http` (add `?seed=…`) |
| 30–42 min | **Beyond the network (optional swap).** Air-Gap Optical: raise ambient noise, then raise samples-per-bit and watch the matched filter win the message back; then raise *drift* with noise at zero to show a systematic offset averaging cannot remove. Shared Cache: switch Flush+Reload to Prime+Probe and note the polarity inverts. Both are explicit **models** of their medium. | `#physical`, `#cache` |
| 30–42 min | **Media & metadata.** Image Steganography: embed, view the bit-plane and the chi-square attack, then note lossy re-compression destroys the payload. Library Records: routine metadata as an unintended inference channel, and **data minimisation** as the defence. | `#stego`, `#metadata` |
| 42–55 min | **Systematic method.** Work the **Shared-Resource Matrix** (Kemmerer 1983) as an interactive exercise — read/alter relationships that reveal storage and timing channels. | `#srm` |
| 55–63 min | **Carrier Atlas.** Map each module to a named hiding pattern (Wendzel et al.), and read the fidelity cards for carriers the lab only *describes* (ICMP, VoIP, Wi-Fi, history, and the text/linguistic family, which links out to the sibling Ghost-Ink exhibit). | `#atlas` |
| 63–80 min | **Blind Detection Challenge**, distinct seeds per group; then compare tallies as a class. | `#challenge?seed=team-a`, `…team-b`, … |
| 80–88 min | **Defensive Takeaways** — combine weak indicators, respect false positives, know your middleboxes, understand the limits. | `#defense` |
| 88–90 min | Assign the graded reflection + the two exported notebooks. | — |

**Discussion prompts**

- Across your three built channels, which was most **reliable** and which most **fragile**? What
  destroyed each fragile one?
- Steganography vs a network channel: what is the carrier in each, and what transformation kills it?
- Library Records: who is exposed by retained circulation metadata, even with no attacker present?
  How does minimisation remove *both* the covert channel and the privacy risk?
- Shared-Resource Matrix: how does a systematic method find channels that ad-hoc inspection misses?
- Carrier Atlas: pick one "described only" carrier and argue what a defender would monitor for it.

**What to assess:**

- Two **exported lab notebooks** (different channels), demonstrating a built-and-broken run each.
- The **Detection Challenge** tally with the reasoning worksheet ([Rubric 1](#rubric-1--blind-detection-challenge)).
- A **written reflection** ([Rubric 2](#rubric-2--written-reflection)).

---

## Learning-outcome map

Each interactive section opens with its own "by the end you can…" contract. This table ties those to
where they are assessed. Section links use the hash ids from the [appendix](#appendix--section-and-seed-reference).

| Section (`#id`) | Learning outcomes | How it's assessed |
| --- | --- | --- |
| **Overview** (`#overview`) | State the covert-channel thesis; distinguish covert channel from encryption and tunnelling; name the five carriers. | Exit ticket (Plan A); reflection prompt 1. |
| **DNS Channel** (`#dns`) | Explain how DNS *query structure* — not payload — carries data; name the monitor's indicators (label length, character-frequency divergence, unique-name ratio, cadence); describe capacity-vs-observability tension. | Exported lab notebook; Detection Challenge DNS cases; quiz `dns-label-entropy`. |
| **Timing Channel** (`#timing`) | Explain how identical packets carry bits in inter-arrival gaps; predict how jitter/noise/loss raise bit-error rate; recognise the entropy/regularity signature and why it fades with jitter. | Live demo prediction; Detection Challenge timing cases; quiz `timing-vs-content`, `timing-fails-internet`. |
| **Storage Channel** (`#storage`) | Encode bits in a field value (IP-ID parity, TTL, TCP-seq low bit); explain why NAT/proxy/normaliser destroys the channel; see why a parity channel can evade a naive histogram (false-negative lesson). | Middlebox experiment; exported notebook; quiz `field-parity-storage`, `nat-breaks-storage`. |
| **Packet-Order Channel** (`#ordering`) | Encode a bit in the order of two interchangeable events; explain why network reordering collapses it. | Reordering demo; reflection prompt on fragility. |
| **HTTP Header Channel** (`#http`) | Compute permutation capacity ⌊log₂ n!⌋; explain why a stable client fingerprint makes header-order variety suspicious; connect the normalising-proxy defence to the storage middlebox lesson. | Capacity calculation check; normalising-proxy demo. |
| **Image Steganography** (`#stego`) | Embed and recover a message in image LSBs; explain why lossy re-compression destroys the payload; read the chi-square steganalysis attack and its limits on small payloads. | Bit-plane / chi-square walkthrough; quiz `stego-vs-network-channel`. |
| **Library Records** (`#metadata`) | Explain how routine metadata becomes an unintended inference channel; connect covert channels to everyday privacy risk; apply data minimisation as a defence. | Minimisation demo; reflection prompt on privacy. |
| **Detection Console** (`#detection`) | Read named, cited detector metrics across channels; explain why detection is probabilistic (what fired, why, what else could cause it). | Guided reading; quiz `detection-probabilistic`. |
| **Detection Challenge** (`#challenge`) | Make a clean/suspicious/covert call from **observables alone**; name the indicator to investigate; weigh false positives against misses. | Scored blind challenge — [Rubric 1](#rubric-1--blind-detection-challenge). |
| **Compare Channels** (`#compare`) | Compare channels by teaching value, reliability, and what a defender looks for — never by stealth. | Discussion; reflection prompt on trade-offs. |
| **Carrier Atlas** (`#atlas`) | Map each module to a named hiding pattern; reason about carriers described only conceptually (ICMP, VoIP, Wi-Fi, …). | Deep-lab discussion prompt. |
| **Shared-Resource Matrix** (`#srm`) | Apply Kemmerer's method to systematically identify storage and timing channels. | Worked matrix exercise (Plan C). |
| **What Makes a Channel Covert?** (`#concepts`) | Distinguish storage from timing, and covert channels from tunnels/encryption; explain why an encrypted tunnel is usually not covert; reason about the capacity/reliability/observability trade-off. | Reflection prompts 1–3; quiz `capacity-vs-observability`, `cover-traffic`. |
| **Defensive Takeaways** (`#defense`) | Watch shape not payload; combine weak indicators; respect false positives; know your middleboxes; understand the limits. | Reflection prompt on defence; Detection Challenge reasoning. |
| **Glossary** (`#glossary`) | Use the field's vocabulary precisely (33 cited terms). | Referenced throughout; optional term-match check. |
| **Knowledge Check** (`#quiz`) | Self-assess the core distinctions across 10 items. | Formative self-check; can be collected. |

---

## Grading rubrics

Two artifacts carry most of the assessment weight: the **blind Detection Challenge** (analysis under
uncertainty) and a **short written reflection** (conceptual command). Adjust point totals to your
scale; the level descriptors are what matter.

### Rubric 1 — Blind Detection Challenge

The Challenge shows observables only. Students commit a call — **clean**, **suspicious**, or
**covert-likely** — name the tell, then reveal the ground truth. The exhibit's own tally reports
**covert caught, missed, false alarms, clean cleared**. Grade the *reasoning*, not just the raw score:
a defensible "suspicious" on a hard case is stronger than a lucky "covert" with no rationale. Note the
scoring model treats *suspicious* on a truly-covert case as a catch, and *suspicious* on a clean case
as over-cautious-but-safe — so reward calibrated hedging, and penalise confident errors (a **miss** on
a covert case, or a **false alarm** on a clean one) most.

| Criterion | Excellent (full) | Proficient | Developing | Beginning |
| --- | --- | --- | --- | --- |
| **Accuracy of calls** | Catches covert cases and clears clean ones; no confident errors (no misses, no false alarms). | Mostly correct; at most one confident error, explained in hindsight. | Several confident errors; pattern of over- or under-calling. | Calls appear near-random or ignore the observables. |
| **Naming the tell** | Correctly identifies the specific indicator for each call and ties it to the observable data. | Identifies the right indicator most of the time. | Names a plausible but wrong or vague indicator. | No indicator named, or contradicts the data. |
| **False-positive discipline** | Recognises benign-but-busy traps (update bursts, health-check pollers) and reasons about base rates. | Catches most traps; occasional over-caution. | Flags benign traffic as covert without justification. | Treats any anomaly as proof of a covert channel. |
| **Uncertainty & calibration** | Uses *suspicious* deliberately; frames results as evidence to investigate, never as proof. | Mostly calibrated; some overconfidence. | Binary thinking (clean/covert) with little hedging. | States verdicts as certainties; uses "undetectable"/"proven." |

**Suggested weighting:** Accuracy 30% · Naming the tell 30% · False-positive discipline 25% ·
Calibration 15%.

### Rubric 2 — Written reflection

Assign a short reflection (roughly 400–700 words). Suggested prompts (choose or combine):

1. Explain, in your own words, why a covert channel is **not** the same as encryption or an ordinary
   tunnel. Use one concrete example from the lab.
2. Pick one channel you built. Describe the **capacity / reliability / observability** trade-off you
   observed when you pushed one knob, citing your exported lab notebook's numbers.
3. Argue why "a clean histogram" or "regular timing" does **not** prove traffic is safe or covert,
   respectively.
4. Using the Library Records section, explain how **data minimisation** defends against both a covert
   channel and an everyday privacy exposure.

| Criterion | Excellent (full) | Proficient | Developing | Beginning |
| --- | --- | --- | --- | --- |
| **Conceptual accuracy** | Distinctions (storage/timing, covert/tunnel/encryption) are correct and precise; no misconceptions. | Largely correct; minor imprecision. | One core distinction blurred or wrong. | Multiple misconceptions (e.g. "encrypted = covert"). |
| **Evidence from the lab** | Cites a specific run (seed/link or notebook numbers) to support claims. | References the lab generally with some specifics. | Vague gestures at "the demo." | No evidence; generic assertions. |
| **Trade-off reasoning** | Explains why pushing one corner moves the others, with a concrete case. | States the trade-off correctly; example thin. | Names the corners but not the tension. | Trade-off absent or misstated. |
| **Defensive & ethical framing** | Frames detection as probabilistic; avoids "undetectable"; connects to a real control or privacy point. | Mostly probabilistic framing; minor slips. | Occasional absolute claims. | Treats detection as certain or channels as unbeatable; no defensive framing. |
| **Clarity** | Well-organised, uses the field's vocabulary correctly. | Clear with minor lapses. | Understandable but disorganised. | Hard to follow. |

**Suggested weighting:** Conceptual accuracy 30% · Evidence 20% · Trade-off reasoning 20% ·
Defensive/ethical framing 20% · Clarity 10%.

---

## Facilitation notes: common misconceptions

These come up almost every time. Each has a one-line correction and a lab move that makes the
correction concrete.

**1. "Encrypted means covert."**
*Why it's wrong:* encryption hides the **content** of a message; a covert channel hides the
**existence, purpose, or mechanism** of the communication. An HTTPS or SSH session is usually
readily recognisable *as* HTTPS or SSH — an observer sees that you communicated, to whom, and roughly
how much.
*Correction move:* work the quiz item `https-not-automatically-covert` (`#quiz`) and re-read the
Overview callout "Covert channel ≠ encryption ≠ tunnelling."

**2. "Regular / metronomic timing proves a covert timing channel."**
*Why it's wrong:* regularity is a **clue**, not a verdict. Plenty of benign systems beacon on a timer
— health-check pollers, scheduled jobs, keepalives.
*Correction move:* in the Detection Challenge (`#challenge`), the *health-check poller* case is a
regular-but-clean trap. Have students commit a call, then reveal — the note literally reads "regular
does not mean covert."

**3. "A clean histogram (or a low anomaly score) proves the traffic is safe."**
*Why it's wrong:* absence of a signal is not proof of absence. A well-chosen parity or low-bit storage
channel barely disturbs a field's distribution, and a small payload can hide beneath a simple
steganalysis test. This is the **false-negative** lesson.
*Correction move:* the Storage section's outcomes call this out directly ("see why a well-chosen
parity channel evades a simple histogram"). Pair it with the Defensive Takeaways line: "Absence of a
signal is not proof of absence."

**4. "The anomaly score is the probability that this is a covert channel."**
*Why it's wrong:* the score is a **weighted indicator**, not a calibrated probability. The Detection
Console reports LOW / MODERATE / HIGH anomaly (thresholds at 34 and 67 of 100) and lists what fired,
why it might matter, and **what else could cause it**. A lit indicator means "worth a look," never
"proven."
*Correction move:* in Defender view, read the three-part explanation under any indicator; do the quiz
item `detection-probabilistic`.

**5. "The covert one is whichever traffic looks weird."**
*Why it's wrong:* benign traffic trips the same wires. CDNs use random-looking hostnames; update
bursts flood DNS; pollers beacon on a timer. Detection is about **combining weak signals with
context**, and accepting false positives.
*Correction move:* the Challenge's *software-update burst* and *high-volume CDN* cases are clean but
alarming. Debrief every false alarm in the class tally.

**6. "Steganography and a network covert channel are the same thing."**
*Why it's wrong:* steganography hides data **inside a carrier object** (e.g. image pixels); a network
covert channel hides data in **how traffic is structured, valued, timed, or ordered**. Related
disciplines, different carriers, different detection.
*Correction move:* contrast the Image Steganography and, say, the Timing sections; quiz item
`stego-vs-network-channel`.

**7. "More capacity is strictly better."**
*Why it's wrong:* pushing more bits through usually **raises observability** and can **lower
reliability** — the traffic stands out more and leaves less margin for noise. There is no free lunch.
*Correction move:* on any of the five network channels, push the knob and watch the live trade-off
curve: as jitter or label length rises, both bit errors and the detector score move. Quiz item
`capacity-vs-observability`.

**8. "One good detector catches everything."**
*Why it's wrong:* no single statistic is a verdict. Real detection banks many weak indicators plus
baselines and context, and still **investigates before concluding**.
*Correction move:* Detection Console (`#detection`) and Defensive Takeaways (`#defense`) — every
indicator names what else could cause it.

**A note on vocabulary you should model:** never rank the channels by "stealth," and never say any
channel is "undetectable" or "invisible." The honest framing is always the **trade-off**. The exhibit
holds this line throughout; hold it in your language too, and correct it gently when students reach
for absolutes.

---

## Responsible use & ethics

Covert Channel Studio is an **educational, defensive, fully-simulated** exhibit. Teach it that way.

- **Nothing here is deployable.** Every packet, DNS query, resolver, server, and timing event is a
  plain in-memory JavaScript object. The site makes no network requests beyond loading its own static
  files, and a strict Content-Security-Policy enforces that. There is no sender-to-receiver
  transmission — "sender" and "receiver" are two panels rendering the same objects.
- **The framing is understanding, detection, and mitigation** — never operation. Simulated domains use
  the reserved `.test` TLD, which cannot resolve on the public Internet. Messages are capped at 24
  bytes because the point is to trace bits, not to move data.
- **No stealth talk.** The lab never ranks channels by how well they evade anyone and never calls any
  channel "undetectable." A core teaching point is that every channel leaves an observable footprint
  and trades bandwidth for concealment. Keep student language aligned with this.
- **Set expectations with students.** The value of studying covert channels is to **build systems that
  resist them and monitoring that finds them**. If a student wants to explore channels operationally,
  the answer is: only in an isolated lab you own, under authorization that explicitly covers it. This
  project will not help do it on a real network — by design.
- **Privacy is part of the lesson.** The Library Records section exists to show that the same property
  that makes metadata a covert channel makes it a surveillance risk — and that **data minimisation**
  is the defence. Use it to connect security to the ethics of what we collect and retain.

If you find a security concern with the exhibit itself, see [SECURITY.md](SECURITY.md).

---

## Appendix — section and seed reference

**Section hash ids** (use as `https://systemslibrarian.github.io/crypto-lab-covert-channel-studio/#<id>`):

| Group | Section | `#id` |
| --- | --- | --- |
| Start | Overview | `overview` |
| Channels | DNS Channel | `dns` |
| Channels | Timing Channel | `timing` |
| Channels | Storage Channel | `storage` |
| Channels | Packet-Order Channel | `ordering` |
| Channels | HTTP Header Channel | `http` |
| Channels | Image Steganography | `stego` |
| Channels | Library Records | `metadata` |
| Analysis | Detection Console | `detection` |
| Analysis | Detection Challenge | `challenge` |
| Analysis | Compare Channels | `compare` |
| Analysis | Carrier Atlas | `atlas` |
| Analysis | Shared-Resource Matrix | `srm` |
| Analysis | What Makes a Channel Covert? | `concepts` |
| Analysis | Defensive Takeaways | `defense` |
| Reference | Glossary | `glossary` |
| Reference | Knowledge Check (Quiz) | `quiz` |

**URL parameters** (append after the section id as `?key=value&key=value`):

| Parameter | Values | Notes |
| --- | --- | --- |
| `seed` | any string | Deterministic key. Default `crypto-lab`; only written to the URL when non-default. Give breakout groups distinct seeds for distinct-but-reproducible runs. |
| `mode` | `sender` \| `defender` | Sender/Receiver build view vs Defender monitoring view. Only `mode=defender` is written to the URL. |

**Worked examples to hand out**

- Defender-view DNS on the default run:
  `…/#dns?seed=crypto-lab&mode=defender`
- Three groups, three storage runs:
  `…/#storage?seed=team-a` · `…/#storage?seed=team-b` · `…/#storage?seed=team-c`
- A blind challenge set unique to your section:
  `…/#challenge?seed=fall2026-sec2`

**Lab notebook** — available on the five network-channel sections (`dns`, `timing`, `storage`,
`ordering`, `http`) under **"Lab notebook — export this run."** Click **Copy Markdown** to capture a
reproducible record (link, seed, settings, decoded result, capacity/BER/observability, detector
methods) for submissions or answer keys.

---

*Covert Channel Studio is an educational Crypto-Lab exhibit, MIT-licensed. Everything is simulated in
the browser — no packets, DNS queries, or images are ever sent over the network.*
