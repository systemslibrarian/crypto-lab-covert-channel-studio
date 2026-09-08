# Covert Channel Studio — Instructor Answer Key

> Model answers, talking points, and grading notes for the student worksheet and the in-lab reflection prompts.
> Pairs with **Covert Channel Studio**, the fully-simulated, browser-based teaching lab.
> Everything the lab does is an in-memory JavaScript object; nothing touches a real network.

This key is for instructors and teaching assistants. It gives a **model answer** for every worksheet
task, **talking points / what to listen for** on every reflection question, and a detailed walkthrough of
the **Detection Challenge** — including why each honest false-positive trap is benign and why some genuinely
covert cases still only rate *suspicious* rather than *high*.

Model answers are **targets, not scripts.** A student who reaches the same idea in different words has
answered correctly. The value is in the reasoning, not the phrasing.

---

## How to use this key

- **Reproduce exactly what a student saw.** State lives in the URL hash: `#<section>?seed=<seed>&mode=<view>`.
  Hand out a seed and everyone gets identical, deterministic runs. The examples below use the shared classroom
  seed `crypto-lab`, e.g. `#dns?seed=crypto-lab&mode=defender`. Change only the seed to generate a fresh set for
  a make-up or a second attempt.
- **Ask for the numbers.** Every channel section exports a **lab notebook** (Markdown) of the current run —
  link, seed, settings, decoded result, capacity/BER/observability, and the detector methods that fired. When a
  worksheet answer depends on a measured value, ask the student to paste their notebook; grade against *their*
  run, not a fixed figure.
- **Sender/receiver vs. defender view.** Several tasks assume the student has toggled `mode=defender`. If an
  answer is thin, check they were in the right view.
- **Keep the safety frame.** If a student drifts toward "how would I actually do this on a network," redirect to
  the lab's standing boundary: this is about **understanding, detection, and mitigation**, never operation. The
  lab deliberately provides no operational capability, and the honest framing is always the trade-off, never a
  claim of stealth.

---

## The five recurring lessons

These are the through-lines. Almost every task is a different doorway into one of them. Reinforce them by name
whenever a student's answer brushes against one.

| # | Lesson | One-line statement to reinforce |
| --- | --- | --- |
| 1 | **An anomaly score is not a probability.** | A "70/100, HIGH" reading means *these observations deviated this much from a baseline* — it is **not** "70% chance of a covert channel." It is a prompt to investigate, never a verdict. |
| 2 | **Combine indicators.** | No single statistic decides. Real detection stacks many weak signals plus context and a baseline. One lit gauge means "worth a look." |
| 3 | **False positives and false negatives are both real.** | Benign traffic trips the same wires (busy DNS, scheduled beacons, random CDN names); and a well-chosen low-bit channel can slip under every threshold. Absence of a signal is not proof of absence. |
| 4 | **Middleboxes and minimisation break channels.** | A NAT, a normalising proxy, or a re-compressing image pipeline destroys many channels for free. Keeping less data destroys the metadata channel entirely. Disruption and detection are different tools. |
| 5 | **Never "undetectable" — always the trade-off.** | Capacity, reliability, and observability form a triangle. Push one corner and another gives. A channel can be *subtle* without being *invisible*. |

> **Grading heuristic:** an answer that correctly names *which* of these five it is an instance of has usually
> understood the point, even if the technical detail is imperfect.

---

## Overview

**Outcome under test:** state the central thesis and place a hiding technique into the five-way taxonomy.

### Worksheet tasks

**Task — State the thesis in one sentence.**
*Model answer:* A covert channel communicates information through a mechanism that was **not intended** to carry
it — a field value, an ordering, a protocol's structure, or simply *when* something happens — so information can
hide even when the obvious payload looks innocent.

**Task — Sort five techniques into the taxonomy.**
*Model answer:*

| Technique | Category | Where the bits live |
| --- | --- | --- |
| IP-ID parity / TTL toggle | **Storage** | a field *value* |
| Inter-arrival gaps | **Timing** | *when* events occur |
| Header / packet order | **Ordering** | the *sequence* of interchangeable events |
| Data in DNS labels | **Protocol-shaped tunneling** | names/lengths/request patterns |
| Image LSB | **Steganography** | inside *other content* |

**Task — Why is an ordinary HTTPS session usually *not* a covert channel?**
*Model answer:* Because HTTPS hides **content**, not **existence or purpose**. An observer can still see that
HTTPS is happening, to which host, roughly how much, and when. Hiding what you said is not the same as hiding
that you said something. It is better described as a *tunnel* than as a covert channel.
*Talking point:* This is the single most common conflation students bring in. Encryption ≠ tunnelling ≠ covert
channel. Encryption hides content; a tunnel repackages one protocol in another; a covert channel hides the
communication itself or abuses an unintended mechanism.

### Reflection

**"Same bits, six carriers" — what does the preview demonstrate?**
*Talking points:* One short message maps to identical bits, then rides six completely different carriers. The
takeaway is that the *carrier is a choice independent of the message*, and each carrier has its own capacity,
reliability, and detection story. There is no "best" carrier — only trade-offs (Lesson 5). The protocol-hopping
row is worth pausing on: the bits do not go *into* anything, they choose which protocol comes next — so a student
looking for "where is the data" in that row will not find it in any single flow.

---

## DNS Channel

Reproduce: `#dns?seed=crypto-lab&mode=defender`.

**Outcomes under test:** explain how DNS *structure* (not payload) carries data; name the defender's indicators;
describe the capacity-vs-observability tension.

### Worksheet tasks

**Task — Where does the hidden data live in a DNS channel?**
*Model answer:* In the **structure of the requests** — long, high-entropy labels funnelled under one controlled
parent domain at some cadence — not in a payload field. The protocol itself is entirely legitimate; it is being
*used as a carrier*. (In this lab, names live under the reserved `.test` TLD and never resolve.)

**Task — List the indicators a monitor measures, and for each, name a benign cause.**
*Model answer:*

| Indicator (what fires) | Why it may matter | What else could cause it (benign) |
| --- | --- | --- |
| Long average label length | packing data forces labels longer than human names | tokenised per-session/per-asset subdomains |
| High label entropy (→1.0) | encoded/encrypted data looks near-random | CDN/cloud hashed asset names |
| Character-frequency divergence from hostname text | base32/base64/ciphertext sits far from English letters (Born & Gustafson, 2010) | hashed asset names, some CDN hostnames |
| High unique-QNAME ratio | a tunnel emits fresh names so caching never helps | analytics/telemetry one-off names |
| Concentration under one parent | a tunnel funnels everything to one controlled zone | heavy use of a single SaaS vendor |
| Metronomic cadence | machine beaconing is periodic | scheduled jobs, health checks, NTP-like polling |
| Elevated query rate | throughput tunnels need many queries | a busy user or chatty app |

*Talking point:* The right column is the whole lesson. Each indicator is *innocent on its own*; the case is built
by **combining** them (Lesson 2), and the discriminating signals are the **content** ones (length, entropy,
character divergence), not raw **volume**.

**Task — Describe the capacity ↔ observability tension for this channel.**
*Model answer:* Packing more data per query means longer, denser, more random-looking labels — which is exactly
what a monitor measures. Higher capacity directly raises observability. You cannot push more bits per query
without enlarging the statistical footprint (Lesson 5).

### Reflection

**Why is DNS such a classic carrier to *study*?**
*Talking points:* It is ubiquitous, usually allowed outbound, and often crosses boundaries other traffic cannot;
its request/response shape looks bidirectional. Note the framing: we study it because defenders inspect it
closely, not because it is a good way to attack. Cross-reference MITRE ATT&CK T1071.004 in the References panel —
this is a documented, well-defended technique, not a secret.

**A CDN serves assets from `a7f3c9b2.cdn.example.test`. Does that make it a covert channel?**
*Talking points:* No. High-divergence, high-entropy hostnames occur legitimately. This is a textbook **false
positive** (Lesson 3). The single divergence signal is not enough; you would need volume *and* cadence *and*
unique-name ratio *and* the absence of a benign explanation before escalating.

---

## Timing Channel

Reproduce: `#timing?seed=crypto-lab&mode=defender`.

**Outcomes under test:** explain bits carried purely in gaps; predict how jitter raises BER; recognise the
entropy/regularity signature and why it fades with jitter.

### Worksheet tasks

**Task — The packets are byte-for-byte identical. How is a message carried?**
*Model answer:* Purely in the **inter-arrival gaps**: a short gap encodes 0, a long gap encodes 1 (or vice
versa). Nothing inside any packet changes. A receiver who knows the timing rule reads the message; a defender may
only notice that the timing looks unnaturally structured.

**Task — Turn jitter up. What happens to the recovered message and the detector, and why?**
*Model answer:* As jitter rises, gaps that were two tight levels smear together; some short gaps cross the
decision threshold and are misread as long (and vice versa), so the **bit-error rate climbs**. On the defender
side the two clusters blur into one, the two-level clustering score drops, corrected conditional entropy rises
(the sequence looks more complex/random), and Cabuk regularity rises — so the anomaly signature **fades at the
same time the channel becomes unreliable.**
*Talking point:* This is the core timing lesson: the very jitter that hurts the sender's reliability also lowers
the defender's observability. Subtlety and fragility are the same coin (Lesson 5). It cuts both ways — a heavily
jittered real channel can hide beneath the thresholds (a **false negative**, Lesson 3).

**Task — Name the two published detectors and what each measures.**
*Model answer:*
- **Corrected conditional entropy** (Gianvecchio & Wang, CCS 2007): how predictable the gap sequence is. Low CCE
  = regular/low-complexity = covert-timing signature.
- **Cabuk regularity** (Cabuk et al., CCS 2004): the standard deviation of per-window variability. A crafted
  channel keeps it nearly constant (low); bursty traffic is high.

### Reflection

**Why does the lab call timing channels "fragile"?**
*Talking points:* Real paths add jitter, buffering, congestion, scheduling delay, reordering, and loss — every
one perturbs the gaps. A channel that is perfect in a lab degrades on a real path. That fragility is the
reliability corner of the triangle.

**A detector reports low CCE. Has it found a covert channel?**
*Talking points:* No — it has found **regularity**, not intent. The detector's own note says so. Polling,
heartbeats, and fixed-rate media are all low-entropy and benign. Low CCE raises suspicion; it does not conclude
(Lessons 1 and 2). This directly sets up the Detection Challenge's health-check-poller trap.

---

## Storage Channel (IP/TCP fields)

Reproduce: `#storage?seed=crypto-lab&mode=defender`.

**Outcomes under test:** encode bits in a field value; explain why a middlebox destroys the channel; see why a
parity channel evades a simple histogram (a false-negative lesson).

### Worksheet tasks

**Task — Contrast the TTL-toggle carrier with the IP-ID-parity carrier for detectability.**
*Model answer:*
- **TTL toggle (64/65):** glaring. Real initial TTLs cluster at 64/128/255, so a field pinned to two *adjacent*
  values, one of them non-standard, toggling per packet, is a strong structural anomaly on its own — the exact
  0/1 balance barely matters. Expect a high anomaly reading.
- **IP-ID parity / TCP-seq low bit:** nearly invisible to a histogram. Random field values already have balanced
  parity, so hiding one bit in the parity barely perturbs the distribution. A simple histogram calls it "normal."
*Talking point:* Same category, opposite detectability. This is the deliberate **false-negative** lesson
(Lesson 3): a clean histogram does **not** prove no channel exists. It is the counterweight to the "high entropy =
tunnel" instinct students bring from the DNS section.

**Task — Toggle a middlebox. What happens, and which real devices do this?**
*Model answer:* The recovered message falls apart even though every packet still "arrives," because the middlebox
rewrites the exact field the channel borrowed. Real analogues: **NATs** rewrite IP identification fields,
**normalising firewalls** rewrite TTLs, and **proxies** open fresh connections with new sequence numbers
(Lesson 4).

**Task — Why is a storage channel "reliable until it isn't"?**
*Model answer:* On an untouched path the value arrives unchanged, so the channel is highly reliable — more so
than a timing channel. But it depends entirely on one field surviving end-to-end; any device that legitimately
edits that field silently zeroes the channel. Reliability here is conditional on the path.

### Reflection

**Detection and disruption are different defensive tools — explain using this section.**
*Talking points:* You never *detected* the parity channel (the histogram looked normal), yet a NAT on the path
would have *disrupted* it anyway. Defenders get "disruption for free" from normalising infrastructure even where
detection fails. Both matter; neither alone is sufficient.

**Which is more dangerous — the glaring TTL channel or the subtle parity channel?**
*Talking points:* A good discussion has no single answer. The TTL channel is high-capacity but trivially caught;
the parity channel is low-capacity but slips past a naive histogram. This is the trade-off triangle in miniature
(Lesson 5), and it foreshadows why the Detection Challenge deliberately uses the *glaring* storage case for a
blind call (the subtle one has no honest observable tell).

---

## Packet-Order Channel

Reproduce: `#ordering?seed=crypto-lab`.

**Outcomes under test:** encode a bit in the order of two interchangeable events; explain why reordering collapses
the channel.

### Worksheet tasks

**Task — How is a bit encoded with no special value and no timing signature?**
*Model answer:* Purely in **order**: "A then B" = 0, "B then A" = 1. The two events are otherwise identical, so
there is nothing in any single event to inspect — the information is in the sequence.

**Task — Raise the reordering probability. What happens and why?**
*Model answer:* Reliability collapses. Real networks are permitted to reorder packets; each reordering event
flips or scrambles the encoded bits, so recovered accuracy falls toward a coin-flip as reordering rises.
*Talking point:* Same shape as the timing channel's jitter and the storage channel's middlebox — the medium's
ordinary behaviour is the channel's enemy.

### Reflection

**Why is an ordering channel described as "elegant but brittle"?**
*Talking points:* Elegant because it needs no anomalous value and leaves no timing fingerprint; brittle because
the network's routine right to reorder is enough to destroy it. Capacity is also inherently capped (see the HTTP
section's `⌊log₂ n!⌋`).

---

## HTTP Header Channel

Reproduce: `#http?seed=crypto-lab&mode=defender`.

**Outcomes under test:** compute permutation capacity `⌊log₂ n!⌋`; explain why a stable client fingerprint makes
header-order variety suspicious; connect the normalising-proxy defence back to the storage middlebox.

### Worksheet tasks

**Task — Compute the capacity of permuting 6 interchangeable headers.**
*Model answer:* `6! = 720` orderings, and `⌊log₂ 720⌋ = ⌊9.49⌋ = 9` bits per request. Each request can carry at
most 9 bits, because you can only distinguish 720 arrangements and `2^9 = 512 ≤ 720 < 1024 = 2^10`.
*Talking point:* Watch for students using `log₂(n!)` without the **floor** — you cannot send a fractional bit per
request, hence `⌊·⌋`.

**Task — Why does header order make a good detection signal?**
*Model answer:* A given client library emits its headers in a **stable, recognisable order** every request.
Genuine per-request variety in the order of interchangeable headers is unusual and therefore suspicious — even
though every individual header stays perfectly valid. It is a storage-style channel one layer up.

**Task — What does a normalising proxy do to this channel, and what is the analogy?**
*Model answer:* It re-sorts headers into a canonical order, erasing the arrangement and the message, though every
request still arrives. It is exactly the storage-channel middlebox lesson (Lesson 4) at the application layer: a
NAT rewriting an IP field and a proxy re-sorting headers are the same move.

### Reflection

**Every header is individually valid, yet the request carries a hidden message. How?**
*Talking points:* Validity of each element does not constrain the *arrangement* of elements. Covert capacity can
live in a degree of freedom (order) that no single-field check inspects. This is why field-by-field validation is
not the same as covert-channel analysis.

---

## Image Steganography

Reproduce: `#stego?seed=crypto-lab`.

**Outcomes under test:** embed/recover a message in image LSBs; explain why lossy re-compression destroys it; read
the chi-square attack and its limits on small payloads.

### Worksheet tasks

**Task — Why is a ±1 change to a colour value invisible, and where does the payload live?**
*Model answer:* The payload rides in the **least-significant bit** of pixel values; changing the LSB shifts a
colour by at most one step, below the threshold of visual perception. The eye sees the same picture; the bits are
there for a receiver who knows the rule.

**Task — Re-save the image with a lossy transform. What happens?**
*Model answer:* The payload is destroyed. LSB data lives in exactly the low-order detail that lossy compression
discards. A channel is only useful if it **survives the transformations its carrier undergoes** (Lesson 4, in
media form).

**Task — What does the chi-square (Westfeld–Pfitzmann) attack measure, and what is its limit here?**
*Model answer:* Sequential LSB embedding **equalises adjacent value pairs** (the "pairs of values" effect); the
chi-square test measures how close pairs have been driven to equal frequency. Its limit: a **small** payload in a
large, noisy image only touches a fraction of pixels, so the statistic barely moves — a genuine **false
negative** (Lesson 3). Passing the test is not proof the image is clean.

### Reflection

**How is steganography related to, but distinct from, a network covert channel?**
*Talking points:* Both conceal that a message exists, but steganography hides bits inside a **carrier object**
(a file), whereas a network covert channel hides them in the **structure, value, timing, or order of traffic**.
The carriers and the detection approaches differ (see Petitcolas et al., 1999, in the References). Don't let
students collapse all "hiding" into one bucket.

---

## Library Records (metadata inference channel)

Reproduce: `#metadata?seed=crypto-lab&mode=defender`.

**Outcomes under test:** explain how routine metadata becomes an unintended inference channel; connect covert
channels to everyday privacy risk; apply data minimisation as the defence.

### Worksheet tasks

**Task — No field here was designed to carry a message. How does a message appear?**
*Model answer:* Each item transfer is routed to a branch (Central = 0, Riverside = 1). Routing is a mundane
logistics choice, but the **pattern** of choices spells a message — a storage-style channel built from ordinary
operational records. An analyst does not even need the encoding rule to notice the routing is **not random**.

**Task — Turn on data minimisation. What happens to the message and to the privacy exposure?**
*Model answer:* Collapsing per-record routing into daily aggregates destroys the hidden message **and** most of
the privacy exposure at once. You cannot leak — or be compelled to disclose — what you never kept (Lesson 4).

**Task — Why does this section belong in a covert-channels lab at all?**
*Model answer:* Because the same property that makes routine metadata a covert channel makes it a surveillance
risk. Circulation logs, hold queues, and interlibrary-loan requests are generated by serving people, not by
building a dossier — yet aggregated and retained, they reveal patterns they were never meant to expose. Covert
channels are not only a network idea.

### Reflection

**"Data minimisation" vs. "detection" — which is the stronger defence here, and why?**
*Talking points:* Minimisation is categorically stronger for this channel: detection tries to *notice* a leak
after the data exists, whereas minimisation removes the carrier so there is nothing to notice, exfiltrate, or
subpoena. It also happens to be good privacy practice independent of covert channels — a rare defence that costs
nothing in false positives.

---

## Detection Console

Reproduce: `#detection?seed=crypto-lab`.

**Outcomes under test:** read named, cited detector metrics; explain why detection is probabilistic — what fired,
why, and what else could cause it.

### Worksheet tasks

**Task — A gauge reads "70 / 100 — HIGH ANOMALY." Interpret it precisely.**
*Model answer:* It means the measured observations deviated substantially from a baseline of normal traffic on
these particular statistics. It does **not** mean "70% probability of a covert channel." The number is a graded
indicator that says *investigate*, not a probability and not a verdict (Lesson 1).
*Talking point:* This is the highest-value single sentence in the whole lab. Push students until they can state
it without hedging. The thresholds (LOW < 34 ≤ MODERATE < 67 ≤ HIGH) are deliberately round teaching thresholds,
not tuned IDS thresholds.

**Task — Every indicator states three things. Name them and say why the third matters.**
*Model answer:* **What was observed**, **why it may matter**, and **what else could cause it.** The third is the
whole reason detection is hard: benign traffic trips the same wires, so an indicator is evidence to weigh, not
proof (Lessons 2 and 3).

### Reflection

**Why does the lab refuse to ever print "covert channel detected"?**
*Talking points:* Because a single entropy threshold or histogram is not a production detector, and asserting a
verdict from one would teach exactly the wrong habit. Real pipelines combine many weak signals, baselines, and
context — and still investigate before concluding. The honest output is a graded, explained indicator.

---

## Compare Channels

Reproduce: `#compare?seed=crypto-lab`.

### Worksheet tasks

**Task — The comparison table ranks channels. On what, and (pointedly) not on what?**
*Model answer:* It ranks by **teaching value, reliability in simulation, and what a defender can look for** —
never by "stealth" or how well a channel evades anyone. The lab never ranks by evasive quality by design.

**Task — Place SSH/HTTPS in the taxonomy and justify it.**
*Model answer:* They are **tunnels**, not covert channels: they conceal content but remain readily recognisable
*as* SSH or HTTPS, so they do not hide the existence or purpose of the communication. Hiding content ≠ hiding the
channel.

### Reflection

**Why would ranking channels by stealth be both wrong and pedagogically harmful?**
*Talking points:* Technically wrong because "stealth" is not a fixed property — it depends on the defender's
baseline, the path's middleboxes, and how hard the channel is pushed (the trade-off triangle). Pedagogically
harmful because a stealth leaderboard is an operational artifact; the lab's purpose is understanding and defence.

---

## Carrier Atlas

Reproduce: `#atlas?seed=crypto-lab`.

### Worksheet tasks

**Task — Map one lab module to its named hiding pattern.**
*Model answer (example):* The DNS module maps to a *protocol-shaped tunneling / value-modulation* pattern in the
Wendzel et al. (2015) categorisation; the timing module maps to an *inter-packet-times* pattern. Any correct
module→pattern pairing from the Atlas is acceptable.

**Task — Pick a described-only carrier (VoIP/RTP, Wi-Fi, history channels, text/linguistic) and say what its
fidelity card admits.**
*Model answer:* The fidelity card states honestly that the carrier is **described conceptually, not simulated** —
so students understand the mechanism without the lab implying an operational capability it does not provide.

*Note for instructors:* ICMP and protocol hopping used to be on this list and are now built modules. That is worth
saying out loud, because it makes the point that the described/built line is a **deliberate and revisable
judgement**, not a statement about which carriers are real. Nothing changed about ICMP; what changed is that a
simulation was written that teaches it without adding operational surface. A good follow-up question: *what would
have to be true for VoIP/RTP to move across that line — and what would it cost in fidelity to get there?*

### Reflection

**Why describe some carriers but simulate others?**
*Talking points:* Simulating everything would add operational surface with no teaching gain. The Atlas draws the
map so learners see the *breadth* of carriers, while the interactive modules go deep on a representative few. The
fidelity cards keep the honesty boundary explicit.

---

## Shared-Resource Matrix (Kemmerer's method)

Reproduce: `#srm?seed=crypto-lab`.

**Outcome under test:** apply a systematic method for finding storage and timing channels.

### Worksheet tasks

**Task — What does an entry in the matrix mean, and what pattern flags a potential channel?**
*Model answer:* Rows are shared resource attributes; columns are operations (or subjects); an entry records
whether an operation can **reference (R)** or **modify (M)** an attribute. A potential covert channel exists when
one subject can **modify** an attribute that another can **reference** across a security boundary — the modifier
signals, the referencer reads.

**Task — Why is a *systematic* method better than "look for something odd"?**
*Model answer:* Because it is exhaustive and repeatable: it enumerates every shared attribute and every
reference/modify relationship rather than relying on an analyst's intuition to notice a channel. It converts
covert-channel analysis from an art into an audit (cf. Kemmerer, 1983).

### Reflection

**How does the matrix connect to the storage-vs-timing split the lab is organised around?**
*Talking points:* The method was designed to surface **both** kinds: modifying a *value* another subject reads is
a storage channel; modifying *when* a shared resource is available/served is a timing channel. The same matrix
finds both, which is why it grounds the whole taxonomy.

---

## What Makes a Channel Covert? (the trade-off triangle)

Reproduce: `#concepts?seed=crypto-lab`.

### Worksheet tasks

**Task — State the three core distinctions.**
*Model answer:*
1. **Content vs. existence** — encryption hides content; a covert channel hides the *existence or purpose* of a
   communication, or uses an unintended mechanism.
2. **Tunnel vs. covert channel** — a tunnel carries one protocol in another; if it is still obviously that tunnel
   (recognisably HTTPS/SSH), it is not covert about its own existence.
3. **Storage vs. timing** — is the information in a *value* (storage) or in *when* something happens (timing)?

**Task — Move one corner of the triangle and predict the others.**
*Model answer:* Raising **capacity** typically raises **observability** (stronger artefacts) and can lower
**reliability** (less margin for noise). A timing channel can be low-observability but is low-reliability; a
storage channel can be high-reliability until a middlebox rewrites its field. There is no free lunch.

### Reflection

**"The sender needs the rule; the defender only needs suspicion." Unpack the asymmetry.**
*Talking points:* A receiver must know the exact encoding to recover the message; a defender need only notice the
pattern is statistically unusual to start investigating. That asymmetry is precisely why covert channels can be
subtle **without** being undetectable (Lesson 5), and why the defender's job is triage, not decryption.

---

## Detection Challenge — the blind exercise (deep dive)

Reproduce a specific set: `#challenge?seed=crypto-lab`. The seed fixes the case set deterministically, so every
student who uses the same seed sees the same cases and you can grade a shared answer sheet.

### How the exercise scores a call

For each case the student sees **only observables** (a query log, a gap histogram, or a packet table), names the
**tell** they would investigate, and commits to **Clean / Suspicious / Covert-likely** *before* the ground truth
is revealed. The scoring rewards calibrated caution:

| Ground truth | Student call | Outcome | Counts as correct? |
| --- | --- | --- | --- |
| Covert | Covert-likely | **Caught** | ✔ |
| Covert | Suspicious | **Caught** | ✔ |
| Covert | Clean | **Missed** (false negative) | ✗ |
| Clean | Clean | **Correctly cleared** | ✔ |
| Clean | Suspicious | **Over-cautious (but safe)** | ✔ |
| Clean | Covert-likely | **False alarm** (false positive) | ✗ |

The two crucial columns to teach from:
- **Only two calls are *wrong*:** a hard "clean" on a covert case (a **miss**), and a hard "covert-likely" on a
  clean case (a **false alarm**). Everything else is credited.
- **"Suspicious" is always safe.** It is the honest call when the evidence is real but not decisive. On covert
  cases it still counts as a catch; on clean cases it is only "over-cautious," never a failure. **Certainty you
  do not have is the failure mode** — that is the calibration lesson (Lessons 1 and 3).

> Emphasise: the exercise trains **analysis, not recognition**. There is no "the covert one is always case 3."
> The set is shuffled and reproducible only from the seed.

### The two honest false-positive traps — why each is benign

These cases are **clean** but built to *look* alarming. A student who reflexively escalates on the loudest single
signal will file a false alarm. The lesson each time: **combine indicators, and weigh the discriminating signal,
not the loud one.**

**Trap 1 — "DNS during a software-update burst" (clean).**
A flood of queries (roughly 60–90) to one CDN at a fast, ~300 ms cadence, with ordinary dictionary-word labels.
- *What fires:* the **volume/rate** indicator (queries per minute is high), and possibly parent-concentration —
  the *loud* signals.
- *What does **not** fire:* the **content** signals. The labels are real hostnames, so label length is normal,
  entropy is low, and character-frequency divergence from hostname text is small. Cadence is still irregular
  (bursty human/software jitter), so the metronomic-cadence wire stays quiet.
- *Why it is benign:* the discriminating signature of a DNS tunnel is **encoded content** (long, high-entropy,
  high-divergence labels), not raw volume. A busy update is high-volume but content-normal. An analyst who leans
  on volume alone escalates; one who checks the content signals clears it. **Model call: Clean** (Suspicious is
  acceptable and only "over-cautious"). **Covert-likely here is the trap** — a false alarm.
- *Reinforces:* Lesson 2 (combine — volume without the content signature is not a tunnel) and Lesson 3 (false
  positives are real).

**Trap 2 — "Timing on a health-check poller" (clean).**
A fixed interval with a small ±jitter, producing very regular timing — but only **one** level, not two.
- *What fires:* the **regularity** signals — corrected conditional entropy is low (predictable) and Cabuk
  regularity is low (metronomic). These are genuinely lit.
- *What does **not** fire:* **two-level clustering.** A binary timing channel splits gaps into *two* tight
  clusters; a poller sits at *one* level. The bimodality signal stays near zero.
- *Why it is benign:* the detectors flag **regularity, not intent** — their own notes say so. Machine-driven
  benign traffic (polling, heartbeats, NTP) is exactly this: regular and single-level. **Regular does not mean
  covert.** The tell that would justify escalation — two distinct timing levels carrying bits — is absent.
  **Model call: Clean or Suspicious** (regularity is real, so "Suspicious/over-cautious" is defensible); a hard
  **Covert-likely is the false alarm.**
- *Reinforces:* Lesson 1 (a low CCE reading is not a probability of covert), Lesson 2 (regularity *plus* two
  levels *plus* no benign explanation, not regularity alone), Lesson 3.

> **The unifying point of both traps:** the anomaly gauge may well glow (rate on Trap 1, regularity on Trap 2),
> and it is still benign. The gauge is a prompt, not a verdict. Students must read *which* indicators fired and
> ask whether the ones that fired are the *discriminating* ones for a covert channel.

### Why some genuinely covert cases only rate "Suspicious," not "High"

Two of the covert cases are built so the detector's own reading lands in **MODERATE**, not **HIGH** — and
"Suspicious" is therefore the model call (it still scores as a catch). This teaches that a real channel does not
owe you a screaming gauge.

**Covert DNS mixed with cover traffic.**
The covert queries are **diluted** with 15–35 benign cover queries. The detector averages over the whole mixed
stream, so the tunnel's long, high-entropy labels are pulled toward the benign mean; the aggregate score often
lands MODERATE rather than HIGH. The channel is real, but the *aggregate* footprint is muted by the cover
traffic — a deliberate design move by the sender (blending reduces observability, at the cost of capacity). The
honest analyst sees a partial signature — some long/high-divergence labels among normal ones — and calls
**Suspicious**, which is credited as a catch. Demanding HIGH before flagging would **miss** it.

**Covert timing with jitter.**
The covert timing case carries a random amount of jitter (roughly 0–18 ms). With little jitter the two levels are
crisp and the gauge reads HIGH; with more jitter the clusters blur, CCE and Cabuk regularity rise, bimodality
drops, and the score slides into MODERATE. Same true channel, weaker observable — because the sender traded
reliability and observability against each other. The model call at higher jitter is **Suspicious**.

> **Grading note:** for these two cases, do **not** mark a student down for "Suspicious" and reserve full credit
> for "Covert-likely." The exercise treats both as caught on purpose. The teachable failure is the opposite
> mistake — claiming HIGH-confidence "Covert-likely" when the evidence only supports "Suspicious," or dismissing a
> muted-but-real signature as "Clean."

### The storage cases (for completeness)

The **covert** storage case in the blind set uses the **glaring TTL-toggle** carrier (a per-packet 64/65 toggle),
which produces a strong, honest structural anomaly — students should catch it and name "a field stuck on two odd
values." The **clean** storage case is ordinary header traffic.

Note what is *deliberately absent* from the blind set: the **subtle IP-ID-parity** channel. That channel has no
honest observable tell — a histogram of a parity channel looks normal — so it cannot fairly be put to a blind
"name the tell" call. Its **false-negative** lesson lives in the Storage *module* instead (see above). Point this
out: the challenge only asks for calls where an observable tell genuinely exists; the parity channel is the
reminder that some channels leave no such tell at all (Lesson 3).

### Debrief questions for the challenge

- **"Which is worse, a miss or a false alarm?"** There is no universal answer — it depends on cost. In a
  high-stakes environment a miss (a real channel walking free) may be worse; in a noisy SOC, chronic false alarms
  cause alert fatigue and get real detections ignored. The point is that *both* are real and the operating point
  is a **choice**, visible in how freely you use "Covert-likely" vs. "Suspicious."
- **"Your gauge read MODERATE on a clean case — did the detector fail?"** No. It reported real deviation
  (regularity, or volume) honestly. The detector's job is to surface; the analyst's job is to weigh. Confusing
  "the gauge lit" with "it's covert" is the exact error the trap exists to expose (Lesson 1).
- **"Could a determined sender make a covert case read LOW?"** Yes — low-and-slow, heavy cover traffic, or heavy
  jitter can push a real channel under the thresholds. That is the false negative, and why "clean gauge" is never
  "proven clean." It is also why detection is only one tool alongside disruption (middleboxes) and minimisation.

---

## Quiz answer key

Each item's built-in explanation is shown to students on reveal; the **talking point** below is the extra thread
to pull in discussion. Answers are given as the option letter (A/B/C/D in listed order).

| # | Item | Answer | Talking point |
| --- | --- | --- | --- |
| 1 | Identical packets, message in the pauses | **B** — timing channel | If nothing in the *value* differs, the only carrier left is *when*. Cleanest storage-vs-timing separator. |
| 2 | One bit per packet via field parity | **B** — covert storage channel | Parity is a property of a stored value, readable from one packet with no timing/order reference. Shows a storage channel needs an *unintended* value, not an *invalid* one. |
| 3 | NAT/middlebox normalises the carrier field | **B** — the channel can break | The reliability corner: storage channels are fragile against any device that legitimately edits their field (Lesson 4). |
| 4 | Timing channel fails on the real Internet | **B** — jitter/buffering/congestion/loss distort gaps | Note the wrong answers ("routers refuse irregular packets", "illegal") are physically false; the failure is *noise*, not policy. |
| 5 | Does HTTPS make traffic covert? | **C** — no; encryption hides content, not existence/purpose | The central conflation. Encryption ≠ tunnelling ≠ covert channel. |
| 6 | Long high-entropy DNS labels | **A** — normal names are short/meaningful, so long high-entropy labels can indicate data in names | Reinforce "can indicate," not "proves." Wrong answers overclaim ("automatically malicious", "never legitimate"). Lesson 1/3. |
| 7 | Maximising capacity | **B** — raises observability, can lower reliability | The trade-off triangle stated directly. "No free lunch." |
| 8 | Image LSB vs. network channel | **A** — stego hides in a carrier object; network channels hide in traffic structure/value/timing/order | Distinct disciplines; don't lump all hiding together. Note the distractor "stego is always undetectable" — the lab never says undetectable. |
| 9 | Why detection is probabilistic | **B** — signals shift likelihood but benign traffic triggers them too, so evidence not proof | The anomaly-score-≠-probability lesson in quiz form (Lesson 1). |
| 10 | Cover traffic | **B** — lowers observability by blending, but cuts effective capacity and adds overhead | Blending *reduces, never eliminates* detection risk — and it is why the challenge's mixed-DNS covert case only reads MODERATE. |

*Common wrong-answer patterns to watch for:* any option containing "undetectable," "always," "never," "illegal,"
or "automatically" is a distractor by design — the lab's whole stance is that absolutes are the wrong frame.
When a student picks one, the remediation is Lesson 5.

---

## Quick reference — cross-links and exports

- **Reproduce any state:** `#<section>?seed=<seed>&mode=<sender|defender>`. Examples:
  `#dns?seed=crypto-lab&mode=defender`, `#timing?seed=crypto-lab&mode=defender`,
  `#challenge?seed=crypto-lab`.
- **Grade against the student's own run:** have them export the section's **lab notebook** (Markdown) — it
  records the link, seed, settings, decoded result, capacity/BER/observability, and the detector methods that
  fired. It is the ground truth for any answer that cites a measured number.
- **Named detectors and citations** (all in the in-app References panel): character-frequency divergence
  (Born & Gustafson, 2010); corrected conditional entropy (Gianvecchio & Wang, 2007); Cabuk regularity
  (Cabuk et al., 2004); the Westfeld–Pfitzmann chi-square attack (1999); shared-resource-matrix analysis
  (Kemmerer, 1983). Foundational: Lampson (1973); the NCSC "Light Pink Book" (NCSC-TG-030); Wendzel et al. (2015).

---

## Standing reminders for the instructor

- **Never grade toward "undetectable" or a stealth ranking.** If a student's answer trends that way, the correct
  response is the trade-off triangle, not a better evasion.
- **Reward calibrated uncertainty.** "Suspicious, because X fired but Y (the discriminating signal) did not" is a
  stronger answer than a confident "Covert" with no reasoning — even when the confident guess is right.
- **Every "clean gauge" is provisional.** Close on the honest line the lab keeps returning to: *absence of a
  signal is not proof of absence.* Detection is one tool; disruption (middleboxes) and minimisation are the
  others.
