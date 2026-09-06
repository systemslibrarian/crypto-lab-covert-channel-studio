# Covert Channel Studio — Pre / Post Assessment

A matched pair of ten-question assessments for the **Covert Channel Studio** exhibit,
designed to be given **before** the lab (to gauge starting knowledge) and **after** it
(to measure movement against the module learning outcomes). Both forms carry the same
concept coverage at comparable difficulty, so scores can be compared directly.

> **Framing reminder for instructors.** Every item is written for an *educational,
> defensive, fully-simulated* exhibit. Questions are about **understanding, detection,
> and mitigation** — never about operating a channel. In line with the lab, no answer
> ranks channels by "stealth" and no answer calls any channel "undetectable." The honest
> framing is always the trade-off.

- **Live lab:** <https://systemslibrarian.github.io/crypto-lab-covert-channel-studio/>
- **Shareable state** lives in the URL hash — `#section?seed=crypto-lab&mode=defender`
  carries the seed and the view mode, so you can hand students an exact state to reason about.
- **Lab notebook:** every channel section exports a Markdown "lab notebook" of the current
  run (link, seed, settings, decoded result, capacity/BER/observability, detector methods).
  It doubles as a self-check answer key for the hands-on portions.

## How to use these

| | Pre-assessment | Post-assessment |
| --- | --- | --- |
| **When** | Before any exhibit sections | After completing the exhibit |
| **Purpose** | Baseline: prior mental models | Growth against learning outcomes |
| **Format** | 6 multiple-choice, 4 short-answer | 6 multiple-choice, 4 short-answer |
| **Scoring** | 1 point each; short-answer scored on the model answer's key ideas | Same |
| **Time** | ~15 minutes | ~15 minutes |

Short-answer items are scored on **ideas, not wording** — the model answers below list the
key points to look for. Partial credit is reasonable when a student names some but not all.

### Concept coverage (the two forms are parallel)

| # | Concept under test | Pre item | Post item | Related lab section (shareable link) |
| --- | --- | --- | --- | --- |
| 1 | Storage vs. timing classification | Q1 | Q1 | `#timing?seed=crypto-lab`, `#concepts` |
| 2 | Covert channel ≠ encryption ≠ tunnel | Q2 | Q2 | `#concepts`, `#compare` |
| 3 | Core definition / tunnel-vs-covert wording | Q3 | Q3 | `#overview`, `#concepts` |
| 4 | Where the bits live / permutation capacity | Q4 | Q4 | `#storage`, `#http?seed=crypto-lab`, `#ordering` |
| 5 | What a defender measures / normalisation | Q5 | Q5 | `#detection`, `#http`, `#storage` |
| 6 | A carrier transformation that breaks a channel | Q6 | Q6 | `#storage`, `#stego?seed=crypto-lab` |
| 7 | The capacity/reliability/observability trade-off & detectors | Q7 | Q7 | `#concepts`, `#detection` |
| 8 | Channel fragility / inference channels & minimisation | Q8 | Q8 | `#timing`, `#metadata` |
| 9 | DNS detection signal / blind analysis & false positives | Q9 | Q9 | `#dns?seed=crypto-lab&mode=defender`, `#challenge` |
| 10 | Detection is probabilistic / stating the trade-off | Q10 | Q10 | `#detection`, `#concepts` |

---

# Part 1 — Pre-assessment

*Answer every question. For multiple choice, pick the single best answer. Keep short
answers to one or two sentences.*

**Q1 (multiple choice).**
Two colleagues receive the *same* stream of packets. Every packet is byte-for-byte
identical to its neighbours, but the sender waits a short moment before some packets and a
longer moment before others, and those pauses spell out a message. What kind of covert
channel is this?

- A. A storage channel, because the message is stored in the packet bytes.
- B. A timing channel, because the information is in *when* packets arrive, not in their contents.
- C. Steganography, because a message is hidden inside media.
- D. Not a covert channel, because the packet contents never change.

**Q2 (multiple choice).**
A team switches its web traffic to encrypted HTTPS. Does encryption, on its own, turn that
ordinary web traffic into a covert channel?

- A. Yes — anything encrypted is by definition covert.
- B. Yes — an observer cannot read the payload, so the channel is hidden.
- C. No — encryption hides the *content*, while a covert channel is about an unintended mechanism or hiding the *existence or purpose* of communication.
- D. No — HTTPS is too slow to carry a hidden message.

**Q3 (short answer).**
In one or two sentences, define a *covert channel* in your own words. What makes it
different from simply encrypting a message?

**Q4 (multiple choice).**
A sender encodes one hidden bit per packet by choosing a header field's value so that the
field is *even* for a 0 and *odd* for a 1. The receiver reads the bit from the field's
parity. This is best described as:

- A. A timing channel, because parity changes over time.
- B. A covert storage channel, because the bit lives in a field *value*.
- C. An encrypted tunnel, because the field is scrambled.
- D. A packet-ordering channel, because parity depends on order.

**Q5 (short answer).**
A defender almost never knows the hidden message in advance. Name **two** measurable
properties of the *traffic itself* that a defender could examine to decide whether a flow is
worth investigating.

**Q6 (multiple choice).**
A covert storage channel hides bits in the value of an IP header field. The traffic then
crosses a NAT device or other middlebox that rewrites or normalises that field. The most
likely result is:

- A. The hidden bits survive, because NAT only changes addresses.
- B. The channel can break, because the middlebox overwrites the exact field carrying the hidden bits.
- C. The storage channel automatically becomes a timing channel.
- D. Nothing changes, because middleboxes never touch header fields.

**Q7 (multiple choice).**
An operator tries to push as many hidden bits per second as possible to maximise a
channel's *capacity*. What usually happens to the other two corners of the
capacity / reliability / observability trade-off?

- A. All three improve together.
- B. Observability tends to rise (the traffic stands out more) and reliability can fall (less margin for noise).
- C. Nothing — the three corners are independent.
- D. Reliability rises, because more bits means more error correction.

**Q8 (short answer).**
A timing channel decodes perfectly in a quiet lab but becomes unreliable across the real
Internet. Give one concrete reason *why*.

**Q9 (multiple choice).**
A monitor notices a stream of DNS queries whose subdomain labels are long, look like
near-random characters, and change with almost every query. Why is this a useful
*detection signal*?

- A. DNS is encrypted, so any readable label is automatically malicious.
- B. Normal DNS names tend to be short and human-meaningful, so long high-entropy labels (often at high volume to one domain) can indicate data packed into the names.
- C. High-entropy labels prove the traffic is a timing channel.
- D. DNS can never legitimately use random-looking names, so any such name is proof of an attack.

**Q10 (short answer).**
True or false, and briefly say why: *"A HIGH anomaly score in a detection console proves
that a covert channel is present."*

---

# Part 2 — Post-assessment

*Same rules as the pre-assessment: single best answer for multiple choice, one or two
sentences for short answers.*

**Q1 (multiple choice).**
A sender emits packets that are all identical in content. To send a `1` it emits a packet
in a given time slot; to send a `0` it stays silent in that slot. A receiver reads the
message purely from which slots were used. Where does the hidden information live, and what
kind of channel is it?

- A. In the packet values — a storage channel.
- B. In *when* events occur (presence/absence in time) — a timing channel.
- C. Inside the packet payload — steganography.
- D. In the encryption key — an encrypted tunnel.

**Q2 (multiple choice).**
An analyst sees a long-lived, recognisable **SSH** session leaving the network. Is an SSH
tunnel, by itself, best described as a covert channel?

- A. Yes — SSH is encrypted, so it is covert by definition.
- B. No — it conceals content, but it is readily identifiable *as* SSH, so it hides neither the existence nor the nature of the connection; it is better called tunnelling.
- C. Yes — any long-lived flow is a covert channel.
- D. No — SSH cannot carry hidden data at all.

**Q3 (short answer).**
In one or two sentences, distinguish *tunnelling* from a *covert channel*. Why is a
recognisable tunnel usually **not** covert about its own existence?

**Q4 (multiple choice).**
An HTTP request contains **6** interchangeable headers whose order does not affect meaning.
If the sender uses the *order* of those headers to carry data, how many whole bits can one
request hold? (Permutation capacity is `⌊log₂(n!)⌋`.)

- A. 6 bits.
- B. 9 bits (6! = 720 orderings, and `⌊log₂ 720⌋ = 9`).
- C. 720 bits.
- D. 36 bits.

**Q5 (short answer).**
A normalising proxy re-sorts every request's headers into one canonical order before
forwarding it. Explain what this does to an HTTP-header-order channel, and why it is the
*same lesson* as a NAT rewriting an IP field.

**Q6 (multiple choice).**
A short message is embedded in the least-significant bits (LSBs) of an image's pixels. The
image is then re-saved with **lossy** compression. What happens to the hidden payload, and
why?

- A. It survives, because compression never touches pixel values.
- B. It is destroyed, because LSB data lives in exactly the low-order bits that lossy compression discards.
- C. It is converted into a timing channel.
- D. It becomes stronger, because compression adds redundancy.

**Q7 (multiple choice).**
The image-steganography detector uses the **chi-square ("pairs of values") attack**
(Westfeld–Pfitzmann, 1999). What does it measure, and what is an honest limitation?

- A. It decrypts the message; it fails only if a key is used.
- B. It measures how far the counts of adjacent pixel-value pairs have been equalised by LSB embedding; a *small* payload barely equalises the pairs, so the test can miss it.
- C. It measures packet timing; it fails on fast networks.
- D. It proves an image is clean whenever the score is low.

**Q8 (short answer).**
A library's routine circulation and transfer logs can be read as an *unintended inference
channel* — the pattern of records leaks information no one meant to send. Name the primary
defence the exhibit recommends, and say in one line why it works.

**Q9 (multiple choice).**
In the **blind** Detection Challenge, one case is a health-check poller: its inter-packet
timing looks very regular. You must commit a call (clean / suspicious / covert) from the
observables alone. What is the soundest reasoning?

- A. Regular timing proves a covert timing channel; call it covert.
- B. Regularity alone is not proof — benign pollers and scheduled jobs are regular too — so it is a false-positive trap; treat it as evidence to weigh, not a verdict.
- C. Any regular flow is clean; timing channels are always irregular.
- D. The console's score is a probability, so a mid score means a 50 % chance of a covert channel.

**Q10 (short answer).**
State the **capacity / reliability / observability** trade-off in one sentence, then give one
concrete example of pushing one corner and watching another move (for instance, what adding
"cover traffic" does).

---

# Answer Key

Scores are out of 10 on each form. Short-answer credit is for the **key ideas** listed, not
exact wording. One-line rationales below tie each item back to the exhibit.

## Pre-assessment key

| Q | Answer | One-line rationale |
| --- | --- | --- |
| 1 | **B** | Identical payloads mean nothing in the *value* varies; only the schedule of arrivals does, so the bits are in *when* — the defining covert **timing** channel. |
| 2 | **C** | Encryption hides *content*; an observer still sees that HTTPS is happening, to whom, and roughly how much — hiding content ≠ hiding the channel. |
| 3 | *Short answer* | **Key ideas:** a covert channel carries information through a mechanism *not intended* to carry it; it aims to hide the *existence or purpose* of communication, whereas encryption only scrambles *content* that is still plainly present. |
| 4 | **B** | Parity is a property of a stored *value*, recoverable from a single packet with no reference to time or order — a covert **storage** channel, and a subtle one (the field still looks valid). |
| 5 | *Short answer* | **Any two of:** DNS label length / entropy (character-frequency divergence), unique-name ratio, query volume or cadence, inter-arrival timing regularity, header field-value distributions, header-order regularity. (Defenders watch the *shape*, not the plaintext.) |
| 6 | **B** | A storage channel needs its exact field value to arrive unchanged; a NAT/middlebox that rewrites that field overwrites the carrier and destroys the bits — the reliability corner of the triangle. |
| 7 | **B** | Cramming more bits makes traffic deviate further from normal (raising observability) and leaves less slack to absorb noise (lowering reliability) — there is no free lunch. |
| 8 | *Short answer* | **Key idea (any one):** real paths add jitter, buffering, congestion, scheduling delay, or packet loss, which smear the precise inter-arrival gaps so the receiver misreads bits. |
| 9 | **B** | Encoded data packed into query names produces labels longer and more random-looking than human-chosen hostnames, often at high volume — a *probabilistic* clue, not proof (some legitimate services also use random names). |
| 10 | *Short answer* | **False.** An anomaly score is *evidence to investigate*, not a probability of a covert channel; benign traffic can trip the same indicators, so detection is probabilistic — "worth a look," never "proven." |

## Post-assessment key

| Q | Answer | One-line rationale |
| --- | --- | --- |
| 1 | **B** | Presence/absence in a time slot encodes bits purely in *when* events occur, with identical contents — a covert **timing** channel, not a storage one. |
| 2 | **B** | An SSH tunnel conceals payload content but is readily recognisable *as* SSH, so it hides neither existence nor purpose; the lab calls this tunnelling rather than covert signalling. |
| 3 | *Short answer* | **Key ideas:** a tunnel wraps one protocol inside another and usually stays identifiable *as* that tunnel, so its own existence is not hidden; a covert channel hides the existence/purpose of communication or uses a mechanism never meant to carry data. |
| 4 | **B** | `6! = 720` orderings and `⌊log₂ 720⌋ = 9`, so a permutation of 6 interchangeable headers holds **9** whole bits — the `⌊log₂(n!)⌋` permutation-capacity ceiling. |
| 5 | *Short answer* | **Key ideas:** canonical re-sorting erases the *arrangement*, so the message is lost even though every request still arrives; it is the same middlebox lesson as a NAT rewriting an IP field — a device that legitimately edits the carrier destroys the storage-style channel. |
| 6 | **B** | LSB payloads occupy exactly the low-order bits lossy compression throws away, so re-encoding the image wipes the message; a channel is only useful if its carrier survives the transformations it undergoes. |
| 7 | **B** | The chi-square attack measures how far LSB embedding has *equalised* the counts of adjacent pixel-value pairs; a small payload barely shifts those pairs, so the test can return a false negative — subtlety is not invisibility. |
| 8 | *Short answer* | **Key idea:** *data minimisation* — keep only the records a task needs, only as long as needed (e.g., collapse per-record routing into daily aggregates). You cannot leak, or be compelled to disclose, what you never kept, so the channel and the exposure both disappear. |
| 9 | **B** | Regularity alone does not prove a covert channel; benign pollers and scheduled jobs are regular too, so this is a deliberate false-positive trap — the observables are evidence to weigh, and an anomaly score is not a probability. |
| 10 | *Short answer* | **Key ideas:** a covert channel trades among capacity, reliability, and observability, and pushing one corner moves the others — e.g., adding cover traffic *lowers observability* by blending signal into normal activity but *reduces effective capacity* (most traffic carries no payload) and adds overhead. |

---

## Alignment to module learning outcomes

Each exhibit section opens with a "by the end you can…" contract. The post-assessment maps
onto those outcomes so growth can be tied to specific modules:

| Post item | Learning outcome exercised | Section |
| --- | --- | --- |
| Q1 | Explain how identical events carry bits purely in *when* they occur. | Timing Channel (`#timing`) |
| Q2, Q3 | Distinguish covert channels from tunnels and encryption; explain why a recognisable tunnel is usually not covert. | What Makes a Channel Covert? (`#concepts`), Compare Channels (`#compare`) |
| Q4 | Compute how many bits a permutation of `n` items can hold (`⌊log₂ n!⌋`). | HTTP Header Channel (`#http`), Packet-Order Channel (`#ordering`) |
| Q5 | Connect the normalising-proxy defence to the storage-channel middlebox lesson. | HTTP Header (`#http`), Storage (`#storage`) |
| Q6 | Explain why lossy re-compression destroys an LSB payload. | Image Steganography (`#stego`) |
| Q7 | Read the chi-square steganalysis attack and its limits on small payloads. | Image Steganography (`#stego`), Detection Console (`#detection`) |
| Q8 | Apply data minimisation as a defence that removes an inference channel and its exposure. | Library Records (`#metadata`) |
| Q9 | Explain why detection is probabilistic — what fired, why, and what else could cause it. | Detection Console (`#detection`), Detection Challenge (`#challenge`) |
| Q10 | Reason about the capacity ↔ reliability ↔ observability trade-off. | What Makes a Channel Covert? (`#concepts`) |

## Extending the assessment with the lab itself

For a hands-on or take-home component, pair a short-answer item with a seeded run and the
exported lab notebook:

- **Timing fragility (Post Q1/Q8).** Hand out `#timing?seed=crypto-lab&mode=defender`, have
  students raise the jitter until the message breaks, and ask them to attach the notebook
  showing the bit-error rate climbing.
- **Header capacity (Post Q4).** From `#http?seed=crypto-lab`, have students confirm the
  `⌊log₂ n!⌋` figure the section computes and export it.
- **Blind analysis (Post Q9).** Assign `#challenge?seed=crypto-lab&mode=defender`, require a
  committed call (clean / suspicious / covert) *before* the reveal, and grade the reasoning,
  not just the outcome — the false-positive traps are the point.

Because the seed and view mode travel in the URL hash, every student reasons about the
*identical* state, and the lab notebook gives you a reproducible answer key for the
hands-on portions.
