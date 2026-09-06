# Covert Channel Studio — Student Worksheet

> A printable lab worksheet for the **Covert Channel Studio** exhibit.
> Everything in the lab is a **simulation** running in your browser — no real
> packets, no real network, no resolver. You are here to *understand, detect,
> and mitigate* covert channels, not to build one.

| | |
| --- | --- |
| **Name** | ____________________________ |
| **Date** | ____________________________ |
| **Seed used** | ____________________________ (default: `crypto-lab`) |
| **Partner / group** | ____________________________ |

Lab: <https://systemslibrarian.github.io/crypto-lab-covert-channel-studio/>

---

## 1. What a covert channel is (and is not)

A **covert channel** carries information through a mechanism that was *never
intended* to carry it. The hidden information does not have to sit in a payload.
It can live in a **field value**, in an **ordering**, in the **structure** of a
protocol's requests, or simply in **when** something happens.

Keep these three ideas straight — they are easy to confuse:

| Idea | What it hides | Example |
| --- | --- | --- |
| **Encryption** | The *content* of a message | HTTPS: an observer can't read what you sent |
| **Tunnelling** | Content, inside a visible carrier | An SSH tunnel: clearly *an SSH tunnel* |
| **Covert channel** | The *existence or purpose* of the communication | A bit hidden in packet timing or a header field |

> **The distinction the lab hammers on:** *hiding content is not the same as
> hiding the existence or purpose of communication.* A covert channel tries to
> make the communication itself unremarkable.

Two more definitions you will use throughout:

- **Storage channel** — the hidden bit is in a **value** (a field, a pixel, a header order).
- **Timing channel** — the hidden bit is in **when** an event happens (a gap between arrivals).

And the fact you should be able to defend by the end:

> **No channel here is "undetectable."** Every one leaves a statistical
> footprint. Pushing more bits through, faster, always leaves a *bigger* one.
> That tension is the **capacity ↔ reliability ↔ observability** trade-off
> triangle, and you will measure all three sides.

**Metrics you will record**

- **Capacity** — how much the channel can carry (bits per event, bits/request, or total bytes).
- **BER (bit error rate)** — the fraction of decoded bits that came out wrong (shown as *bit errors* / *error rate* / *decode confidence*).
- **Observability** — how loudly the channel shows up to a defender (the *educational anomaly indicator* and its named detectors).

---

## How to drive the lab (read once)

- **Seed** — the box at the top makes every run **reproducible**. Same seed →
  same simulated traffic. Write your seed in the header above so a classmate can
  reproduce your results.
- **View mode** — switch between **Sender / Receiver** and **Defender**. Sections
  can be shared at an exact state through the URL hash, e.g.
  `#dns?seed=crypto-lab&mode=defender`.
- **Lab notebook** — every channel section can **export a Markdown "lab
  notebook"** of the current run (link, seed, settings, decoded result,
  capacity/BER/observability, detector methods). Export one whenever a task asks
  you to "record" — then paste or staple it to this sheet.

---

## 2. Module tasks

Fill every blank. Where a task says *"predict, then check,"* write your
prediction **before** you move the control.

### 2.1 DNS Channel — structure as a carrier

Open: `#dns` · e.g. <https://systemslibrarian.github.io/crypto-lab-covert-channel-studio/#dns?seed=crypto-lab>

The message is turned into **base32** text (`5` bits per label character) and
placed into simulated query labels under `example.test`.

**Set**

- Message: `______________` (default `HELLO`)
- Label length (chars/query): `______` (default `12`)
- Number of requests: `______` · Normal cover traffic: `______`
- Request interval: `______ ms` · Timing jitter: `______ ms`
- Packet loss: `______` · Simulate resolver cache: ☐ off ☐ on

**Observe** (the query log columns: Time, Client, Query, Type, Len, Entropy, Status)

- What does the **Entropy** column read for the covert queries? ☐ Low ☐ Med ☐ High
- What does it read for the normal cover queries? ______________________________

**Record**

| Item | Value |
| --- | --- |
| Decoded text at the receiver | ______________________________ |
| base32 encoding shown | ______________________________ |
| Capacity (bits ≈ label chars × 5) | ______________________________ |
| Bit errors / BER | ______________________________ |
| Anomaly indicator (observability) | ______________________________ |

Now **turn Packet loss up** and re-read the decoded text: ______________________

**Reasoning question.** A defender did not see your base32 alphabet and cannot
read the hidden message. Name **two observable features** of the query log that
would still make these lookups look unlike ordinary human DNS, and say *why*
each stands out. __________________________________________________________
____________________________________________________________________________

---

### 2.2 Timing Channel — the message is in the clock

Open: `#timing` · e.g. `#timing?seed=crypto-lab`

Every packet is **identical**. A short gap means bit `0`; a long gap means bit
`1`. The receiver decides with a threshold.

**Set**

- Short delay (bit 0): `______ ms` (default `100`)
- Long delay (bit 1): `______ ms` (default `300`)
- Decoder threshold: `______ ms` (default `200`)
- Network jitter: **start at `0`**, then raise it.

**Observe & record — the jitter sweep** (leave everything else fixed)

| Network jitter (ms) | Bit errors | BER (error rate) | Decode confidence |
| --- | --- | --- | --- |
| 0 | ______ | ______ | ______ |
| 40 | ______ | ______ | ______ |
| 100 | ______ | ______ | ______ |
| 160 | ______ | ______ | ______ |

Look at the **inter-arrival histogram**: with low jitter the gaps pile into
______ cluster(s); typical traffic instead spreads ______________________.

**Reasoning question.** Raising jitter did two things at once. Explain how it
affected (a) the **receiver's reliability** and (b) the **defender's ability to
spot the two clusters**. Which side of the trade-off triangle does jitter move,
and who benefits? ________________________________________________________
____________________________________________________________________________

---

### 2.3 Storage Channel — bits hidden in field values

Open: `#storage` · e.g. `#storage?seed=crypto-lab`

One bit is read out of a chosen TCP/IP field. Use **"Reveal covert field"** to
see the Bit / Byte / Char columns.

**Carrier fields**

| Field | Decoding rule |
| --- | --- |
| IP ID parity | even → 0, odd → 1 |
| TTL toggle | TTL 64 → 0, TTL 65 → 1 |
| TCP sequence low bit | the low bit of the sequence number |

**Set & record — the middlebox experiment**

Pick a carrier field, confirm the message decodes cleanly, then turn on **one
middlebox at a time** and record what happens.

| Carrier field | Middlebox turned on | Message survives? | Bit errors / BER |
| --- | --- | --- | --- |
| ______________ | (none) | ☐ yes ☐ no | ______ |
| ______________ | NAT (rewrites IP ID) | ☐ yes ☐ no | ______ |
| ______________ | Header normalization (TTL) | ☐ yes ☐ no | ______ |
| ______________ | Proxy (new sequence #) | ☐ yes ☐ no | ______ |

Which middlebox **broke** your chosen field, and which ones left it intact?
Break: ______________  Intact: ______________________________

**Reasoning question.** Every packet still "arrived," yet the message fell
apart. Explain *why* a middlebox destroys a storage channel without dropping a
single packet — and why this makes **normalisation a defence, not just a
detector**. ______________________________________________________________
____________________________________________________________________________

---

### 2.4 HTTP Header Channel — the message is in the order

Open: `#http` · e.g. `#http?seed=crypto-lab`

Every header stays valid; the **arrangement** of a set of interchangeable
headers carries the bits (about `9` bits per request).

**Set**

- Message: `______________`
- Normal cover requests: `______` (default `20`)
- Normalizing proxy (re-sorts headers): ☐ off ☐ on

**Record — proxy off vs. on**

| Item | Proxy OFF | Proxy ON |
| --- | --- | --- |
| Decoded text | ______________ | ______________ |
| Bits per request (capacity) | ______________ | ______________ |
| Bit errors / BER | ______________ | ______________ |
| Distinct orderings (fingerprint) | ______________ | ______________ |
| Order entropy | ______________ | ______________ |

**Reasoning question.** A real client library emits its headers in a **stable,
recognisable order** every request. Using the "Header-order fingerprint" numbers,
explain how a defender tells this covert flow from a normal client — *without*
ever decoding a bit. Then connect the **normalizing proxy** here to the
**middlebox** lesson in the storage channel. _______________________________
____________________________________________________________________________

---

### 2.5 Image Steganography — hidden in the least-significant bits

Open: `#stego` · e.g. `#stego?seed=crypto-lab`

The message is written into the **LSBs** of the cover image's pixels. A ±1
change to a colour value is invisible to the eye — but not to statistics.

**Set**

- Hidden message: `______________` (max 24 bytes)
- Lossy transform strength: `______` (default `8`)

**Observe** the four panels: Original, Stego image, Difference ×40, LSB
bit-plane.

- Can you see any difference between **Original** and **Stego image** by eye? ☐ no ☐ yes
- In the **LSB bit-plane**, the embedded region looks like __________________.

**Record**

| Item | Value |
| --- | --- |
| Capacity of this carrier (bytes) | ______________ |
| Characters hidden | ______________ |
| Extracted message (receiver) | ______________ |
| Steganalysis: hottest-block entropy | ______________ |
| Steganalysis: block contrast | ______________ |

Now **raise "Lossy transform strength"** and read *"Recovered from degraded"*:
message survives? ☐ yes ☐ no — recovered text: ______________________

**Reasoning question.** The stego image looks identical to the original, yet the
lossy transform destroys the payload. Explain the connection: *why do the LSBs
that carry the message live in exactly the bits a re-compression throws away?*
And what does that tell a defender about **where** to look? ________________
____________________________________________________________________________

---

### 2.6 Detection Challenge — you are the analyst (BLIND)

Open: `#challenge` · e.g. `#challenge?seed=crypto-lab`

Each case shows **only what a monitor would see** — no message, no bits, no
label. For each case you: (1) name **the tell** you'd investigate, (2) commit a
call — **Clean / Suspicious / Covert-likely** — then (3) reveal the ground truth.

**Rules of engagement**

- Decide from **observables alone**. Do not guess based on "it's a challenge, so
  it must be covert."
- Weigh a **false alarm** (calling benign-but-busy traffic covert) against a
  **miss** (waving a subtle channel through). Both are wrong; both cost.
- The set is **deterministic from the seed** — record your seed so results are
  reproducible.

Work all **6** cases, then fill in the **Detection Challenge Log** in section 3.

**Reasoning question.** Pick one case you got wrong (a miss *or* a false alarm).
What single observable would have changed your call, and why did you weight it
incorrectly the first time? _______________________________________________
____________________________________________________________________________

---

## 3. Detection Challenge Log

Fill one row per case. **Your call** = Clean / Suspicious / Covert-likely.
**Ground truth** = Clean / Covert (revealed after you commit). **Outcome** =
Caught / Missed / False alarm / Correctly cleared.

| # | Channel | Your call | The indicator (tell) you named | Ground truth | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | ____________ | ____________ | ______________________________ | ____________ | ____________ |
| 2 | ____________ | ____________ | ______________________________ | ____________ | ____________ |
| 3 | ____________ | ____________ | ______________________________ | ____________ | ____________ |
| 4 | ____________ | ____________ | ______________________________ | ____________ | ____________ |
| 5 | ____________ | ____________ | ______________________________ | ____________ | ____________ |
| 6 | ____________ | ____________ | ______________________________ | ____________ | ____________ |

**Tally.** Covert caught: ______ Missed: ______ False alarms: ______
Clean cleared: ______

**One sentence on your own trade-off.** Did you lean toward *over-cautious*
(more false alarms) or toward *misses*? Which is worse for the system you were
protecting, and why? _____________________________________________________
____________________________________________________________________________

---

## 4. Closing reflection

Answer in two or three sentences each. Use the results you recorded above as
evidence.

**Q1 — Storage vs. timing.** Give one channel you tested that is a **storage**
channel and one that is a **timing** channel. For each, say where the hidden bit
lived, and name the real-world effect (a middlebox, or jitter/loss) that
degraded it. ____________________________________________________________
____________________________________________________________________________

**Q2 — Covert vs. tunnel vs. encryption.** An HTTPS session hides *what* you
said. Why is that **not** a covert channel? Contrast it with one channel from
this lab that hides the *existence or purpose* of the communication instead of
its content. ____________________________________________________________
____________________________________________________________________________

**Q3 — The trade-off triangle.** State the three corners
(capacity / reliability / observability) and, using your **timing jitter sweep**
(2.2) or **DNS label length** (2.1), describe one concrete move that improved one
corner while hurting another. ____________________________________________
____________________________________________________________________________

**Q4 — Why minimisation helps.** Several channels here ride on data that "was
just there" (spare header fields, header order, routine records). Explain why
**collecting or emitting less** — data minimisation — removes covert-channel and
inference risk *before* any detector runs. ______________________________
____________________________________________________________________________

**Q5 — Why detection is probabilistic.** An anomaly indicator lit up on a case
you had to judge. Explain why a high anomaly score is **not** the same as "the
probability that this is a covert channel," and what a responsible analyst does
with an indicator that says *"worth a look."* _____________________________
____________________________________________________________________________

---

### Before you hand this in

- ☐ Seed recorded in the header (so your runs are reproducible).
- ☐ At least one **exported lab notebook** attached (DNS, Timing, Storage, HTTP,
  or Stego).
- ☐ All six Detection Challenge rows filled, with the *tell* named for each.
- ☐ Every reasoning and reflection blank answered.

> **Remember the framing.** This exhibit is about *understanding, detection, and
> mitigation.* Nothing here is deployable, no channel is ranked by "stealth," and
> nothing is "undetectable" — the whole point is that every channel leaves a
> footprint a defender can learn to read.
