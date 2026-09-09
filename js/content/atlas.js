/**
 * content/atlas.js — the Carrier Atlas.
 *
 * Two things a graduate seminar needs: (1) a map from each hands-on module to a
 * named entry in the research community's hiding-pattern taxonomy, so a learner
 * can read a paper and say "this is P6 Value Modulation"; and (2) honest
 * coverage of the carrier families this lab deliberately does NOT build as tools
 * (VoIP/RTP, Wi-Fi, history / object-reuse channels, and the text/linguistic
 * family, which has its own sibling exhibit),
 * each with a "fidelity card" — what is faithful, what is simplified, and what a
 * real environment adds.
 *
 * ICMP echo and protocol hopping used to sit in that second list. Both are now
 * built modules, so they have moved up into the built section with fidelity
 * cards that describe what was actually implemented rather than the concept.
 *
 * TAXONOMY is now the PUBLISHED catalog rather than a summary of it: all eleven
 * patterns, with their P-numbers and the names Table II gives them, plus the
 * four sub-patterns those names carry (P2.a, P2.b, P6.a, P6.b) — fifteen rows
 * for eleven patterns. Three rules hold this file honest.
 *
 *   1. A pattern's `idea` is the paper's own "Illustration" line verbatim or it
 *      is null. This file never paraphrases a definition into something that
 *      reads like a quotation, and never presents a fragment as the whole line.
 *
 *   2. A carrier gets a `pattern` only when the mapping survives the paper's
 *      scope statement AND the mechanism matches what the pattern is NAMED. For
 *      several patterns this lab does not have the Illustration line to check
 *      the name against; where a mapping rests on the name alone, the carrier's
 *      `patternNote` says so in those words rather than implying the paper
 *      adjudicated it.
 *
 *   3. Where a carrier has no pattern, `pattern` is null, `noPattern` records
 *      WHY in one of three kinds, and `patternNote` explains. "Outside the
 *      scope", "not one of the eleven" and "not a network PDU at all" are three
 *      different statements and this file does not blur them. Several carriers
 *      here legitimately have no pattern, which is a finding, not a gap.
 *
 * Data only (no DOM).
 */

export const TAXONOMY = {
  citation: 'Wendzel, Zander, Fechner & Herdin — "Pattern-Based Survey and Categorization of Network Covert Channel Techniques", ACM Computing Surveys 47(3), 2015 (DOI 10.1145/2684195). Preprint: arXiv:1406.2901 (https://arxiv.org/abs/1406.2901).',
  intro: 'The community reference reduces 109 published techniques to ELEVEN reusable hiding PATTERNS, arranged hierarchically under the two classic families — storage and timing. Four of the eleven carry named sub-patterns (P2.a, P2.b, P6.a, P6.b), so the table below has fifteen rows for eleven patterns; each sub-pattern row says which parent it sits under. Mapping a technique to a pattern is more durable than memorizing individual tricks. Everything in the catalog is listed, including the patterns this lab does not demonstrate; a blank "in this lab" cell is information, not an omission.',
  since: 'This lab maps its hands-on modules to the 2015 NETWORK pattern taxonomy. In 2025 the same group published a broader one: Wendzel, Caviglione, Mazurczyk et al., "A Generic Taxonomy for Steganography Methods" (ACM Computing Surveys, DOI 10.1145/3729165), which generalises the network patterns toward information hiding across domains. The network patterns below remain the clearest on-ramp, and the later taxonomy is the natural next step for anyone who wants a vocabulary that reaches past the network. This lab has not mapped its carriers onto it and makes no claim about which of them it covers.',

  /**
   * The scope statement is a teaching point, not a footnote. It is the reason
   * several built modules below have NO pattern: the catalog deliberately does
   * not cover channels that hide in payload.
   */
  scope: {
    title: 'What the eleven patterns deliberately exclude',
    quote: 'We distinguish between storage channels which apply hiding methods to payload (e.g. to audio streaming) - these channels are outside of our scope - and storage channels which alter non-payload (e.g. header elements or padding bits).',
    body: 'That single sentence decides a lot of this atlas. A channel that writes its bits into what a PDU **carries** is out of scope; a channel that alters the PDU **itself** — header elements, padding, size, order, timing — is in scope. So the DNS query-name channel and the ICMP echo **data area** have no entry in this catalog, and saying "no pattern" is the correct answer rather than a missing one. Note that "outside this catalog" is not one verdict but three, and the carrier cards below keep them apart: a channel can be **payload-carrying** and excluded by the sentence above, it can be **in scope but not one of the eleven** (protocol switching, which the survey discusses separately), or it can have **no network PDU at all** (an air gap, a cache line, a circulation record).',
    caution: 'Two traps worth naming out loud. **P6.b "LSB" is a header-field pattern**, not image LSB steganography — the names collide and the meanings do not. And **P10 PDU Order is filed under TIMING**, even though "the message is in the order" feels like storage.',
  },

  /**
   * The complete catalog: the names and hierarchy are Table II's. `idea` holds
   * the paper's own "Illustration" line where this lab has it verbatim; where it
   * does not, `idea` is null and the view says so rather than paraphrasing a
   * definition we cannot quote. `parent` names the pattern a sub-pattern sits
   * under, so the hierarchy is stated rather than implied by the P-number.
   * `lab` is empty when nothing here demonstrates the pattern — including P1,
   * which this lab describes but does not build.
   */
  families: [
    {
      name: 'Storage Channel Patterns', short: 'Storage',
      note: 'The covert channel alters something about the PDU itself — a value, a size, an order, a redundancy.',
      patterns: [
        {
          id: 'p1', code: 'P1', name: 'Size Modulation',
          idea: 'The covert channel uses the size of a header element or of a PDU to encode the hidden message.',
          context: 'Storage → Modification of Non-Payload → Structure Modifying',
          lab: 'Not demonstrated here. The ICMP module DETECTS unusual payload sizes, but its own data-area carrier is not P1: the size varies as a by-product of how the message was chunked, not to encode it, and padding the echoes out removes the variation without costing a bit.',
        },
        {
          id: 'p2', code: 'P2', name: 'Sequence',
          idea: 'The covert channel alters the sequence of header/PDU elements to encode hidden information.',
          context: 'Storage → Modification of Non-Payload → Structure Modifying',
          lab: 'HTTP Header Channel — the reorderable request headers are permuted inside one request.',
        },
        {
          id: 'p2a', code: 'P2.a', name: 'Position', parent: 'P2 Sequence',
          idea: 'The covert channel alters the position of a given header/PDU element.',
          lab: '',
        },
        {
          id: 'p2b', code: 'P2.b', name: 'Number of Elements', parent: 'P2 Sequence',
          idea: 'The covert channel encodes hidden information by the number of header elements.',
          lab: '',
        },
        { id: 'p3', code: 'P3', name: 'Add Redundancy', idea: null, lab: '' },
        { id: 'p4', code: 'P4', name: 'PDU Corruption/Loss', idea: null, lab: '' },
        {
          id: 'p5', code: 'P5', name: 'Random Value', idea: null,
          lab: 'Storage Channel — IP-ID parity and the TCP initial-sequence-number low bit, both fields whose values are supposed to look arbitrary.',
        },
        {
          id: 'p6', code: 'P6', name: 'Value Modulation', idea: null,
          lab: 'Storage Channel — the TTL toggle (64 = 0, 65 = 1).',
        },
        { id: 'p6a', code: 'P6.a', name: 'Case', idea: null, parent: 'P6 Value Modulation', lab: '' },
        {
          id: 'p6b', code: 'P6.b', name: 'LSB', idea: null, parent: 'P6 Value Modulation',
          lab: 'ICMP Channel — the low bit of the 16-bit Echo Identifier. NOT the image-LSB module: this pattern is about a header field.',
        },
        { id: 'p7', code: 'P7', name: 'Reserved/Unused', idea: null, lab: '' },
      ],
    },
    {
      name: 'Timing Channel Patterns', short: 'Timing',
      note: 'The covert channel alters WHEN something happens, or which of several things happens first.',
      patterns: [
        {
          id: 'p8', code: 'P8', name: 'Inter-arrival Time', idea: null,
          lab: 'Timing Channel — short gap = 0, long gap = 1.',
        },
        { id: 'p9', code: 'P9', name: 'Rate', idea: null, lab: '' },
        {
          id: 'p10', code: 'P10', name: 'PDU Order',
          idea: 'The covert channel encodes data using a synthetic PDU order for a given number of PDUs flowing between covert sender and receiver.',
          context: 'Network Covert TIMING Channels',
          lab: 'Packet-Order Channel — A→B = 0, B→A = 1.',
        },
        {
          id: 'p11', code: 'P11', name: 'Re-Transmission',
          idea: 'A covert channel re-transmits previously sent or received PDUs.',
          context: 'Network Covert TIMING Channels',
          lab: '',
        },
      ],
    },
  ],
};

/** Flat lookup: pattern id → { code, name, family, … }. Built once from TAXONOMY. */
export const PATTERN_INDEX = Object.freeze(Object.fromEntries(
  TAXONOMY.families.flatMap((fam) => fam.patterns.map((p) => [p.id, { ...p, family: fam.name, familyShort: fam.short }])),
));

/** Resolve a carrier's `pattern` id to its catalog entry, or null. */
export function patternFor(id) {
  return id ? (PATTERN_INDEX[id] ?? null) : null;
}

/**
 * The three reasons a carrier can have no pattern. They are NOT the same
 * statement, and collapsing them into one line was the bug this vocabulary
 * exists to prevent: the survey's scope sentence excludes PAYLOAD channels, so
 * saying "outside this catalog's scope" about protocol switching — which the
 * survey discusses at length, and devotes §6.3 to a countermeasure for —
 * contradicts the survey and this atlas's own note on that card.
 */
export const NO_PATTERN_REASONS = Object.freeze({
  payload: 'Payload-carrying — outside this catalog’s scope',
  'not-a-pattern': 'In scope, but not one of the eleven patterns — the survey discusses it separately',
  'no-pdu': 'No network PDU — outside this catalog’s domain',
});

/** Label for a carrier with no pattern. Falls back only if `noPattern` is unset. */
export function noPatternLabel(carrier) {
  return NO_PATTERN_REASONS[carrier?.noPattern] ?? 'No pattern in this catalog';
}

/**
 * Carriers, both the ones this lab builds and the ones it only describes. Each
 * carries a fidelity card so nobody mistakes the simulation for the real thing.
 */
export const CARRIERS = [
  {
    name: 'DNS query names', layer: 'Application', family: 'Storage', pattern: null, noPattern: 'payload',
    patternNote: 'No pattern — and that is the correct answer, not a gap. The query name is what the DNS message CARRIES, so this is a payload channel, and the survey puts payload channels outside its scope explicitly. If you are asked to map this module to one of the eleven, the right answer is that it does not map, and the scope sentence is the reason.',
    status: 'built', section: 'dns',
    idea: 'Encode data into the labels of names a client asks a resolver to look up.',
    breaks: 'Aggressive caching (if names repeat), truncation, and DNS inspection that scores label entropy/length.',
    indicators: 'Long high-entropy labels, near-100% unique names, one parent domain, steady cadence.',
    fidelity: {
      faithful: ['Base32 label encoding', 'label length / entropy as real detectors measure them', 'the single-parent-domain funnel'],
      simplified: ['no real resolver, cache, or NXDOMAIN behaviour', 'toy message sizes', 'A-record framing only'],
      realWorld: ['recursive resolver logs', 'response records carrying the return path', 'rate limits and RPZ blocklists'],
    },
  },
  {
    name: 'ICMP echo', layer: 'Network', family: 'Storage', pattern: 'p6b',
    patternNote: 'This module builds two carriers, and they land in different places. The **Echo Identifier low bit** is a header field whose least significant bit is modulated — **P6.b LSB** — which is the code shown above; that mapping rests on the pattern\'s NAME, since this lab does not have P6.b\'s Illustration line to check it against, and P5 Random Value is a defensible alternative reading. Ordinary ping sets one identifier per session rather than a random one, which is why this lab reads it as LSB modulation of a header field, and says so rather than implying the paper adjudicated it. The **echo data area has no pattern at all**: it is payload, and payload is outside the survey\'s scope. Do not reach for **P1 Size Modulation** to fill that blank. P1 requires the size to *encode the hidden message*; here the size varies only as a by-product of chunking, and turning padding on removes the variation without costing a single bit. What the module\'s size statistic actually looks for is non-conformance to the conventional ping sizes — a useful indicator, and not this pattern.',
    status: 'built', section: 'icmp',
    idea: 'RFC 792 says an echo reply must return whatever the request sent, so the data area is space the protocol carries faithfully and never inspects. This module builds TWO carriers over it: message bytes in the **echo data area** (loud, high capacity) and one bit in the low bit of the 16-bit **Echo Identifier** (quiet, one bit per echo).',
    breaks: 'Different defences for each carrier, and neither closes both. A normaliser that clamps the payload or rewrites it back to the conventional fill kills the data-area channel and leaves the identifier untouched; a NAT rewriting the Echo Identifier (RFC 5508 requires this so replies can be demultiplexed) kills the identifier channel and leaves the data area untouched. Rate limiting and filtering drop echoes outright.',
    indicators: 'Ordinary ping is rigidly uniform: one Echo Identifier per session, sequence numbers stepping by one, one payload size, and the SAME fixed fill bytes in every echo. A data-area tunnel breaks all four at once. Note the statistic that does NOT work — payload entropy. The conventional fill is an incrementing run of distinct bytes, so its entropy is already near maximal; predictability separates them, entropy does not.',
    fidelity: {
      faithful: ['both carriers and their opposite failure modes', 'the fill-pattern conformance test, which is a structural check rather than an entropy check', 'payload-size distribution as a second, independent structural check — it measures conformance to the conventional 56/32-byte ping sizes, not size modulation; a channel that encoded its bits IN the size would be P1, and this one does not', 'the per-peer pivot that recovers a few loaded echoes from a busy ping stream', 'the honest near-miss on the identifier channel — one bit in a field with no reference distribution is close to invisible, exactly as IP-ID parity is in the storage module'],
      simplified: ['NO PACKET IS CRAFTED, SENT, OR RECEIVED — an "echo" is a plain object in an array, and every address comes from the RFC 5737 documentation ranges, which are reserved for documentation and are not routable', 'no real ICMP stack: no checksums, no reply matching, no rate limiting, no path MTU', 'one covert session against one cover session; a modelled timestamp prefix rather than a real clock'],
      realWorld: ['raw sockets and elevated privileges to send at all; egress filtering, ICMP rate limits, and per-host policy usually notice; real fill patterns differ between ping implementations'],
    },
  },
  {
    name: 'Inter-packet timing', layer: 'Any', family: 'Timing', pattern: 'p8',
    status: 'built', section: 'timing',
    idea: 'Carry bits in the gaps between otherwise identical events (short = 0, long = 1).',
    breaks: 'Jitter, buffering, congestion, scheduling, and loss — the channel is fragile by nature.',
    indicators: 'Low corrected conditional entropy, low Cabuk regularity, two tight inter-arrival clusters.',
    fidelity: {
      faithful: ['two-level gap encoding', 'jitter/loss corruption', 'CCE & Cabuk regularity detectors'],
      simplified: ['no real queueing model', 'one bottleneck', 'clean sender clock'],
      realWorld: ['OS scheduling, NIC coalescing, and cross-traffic reshape every gap'],
    },
  },
  {
    name: 'IP/TCP header fields', layer: 'Network / Transport', family: 'Storage', pattern: 'p5',
    patternNote: 'The module offers three fields and they are not all one pattern. IP-ID parity and the TCP ISN low bit borrow fields whose values are meant to look arbitrary — **P5 Random Value**, the code shown above. The **TTL toggle is P6 Value Modulation**: 64 and 65 are specific chosen values in a field with a conventional one. Both mappings rest on the pattern NAMES; this lab does not have the Illustration lines for P5 or P6 to check them against, and says that rather than implying the paper adjudicated it. Because both of the first two ride the lowest bit, P6.b LSB is a defensible reading of them too; the catalog does not partition as cleanly as a table implies, and noticing that is part of the lesson.',
    status: 'built', section: 'storage',
    idea: 'Hide bits in the value of a field that is not meant to carry a message (IP ID parity, TTL, ISN low bit).',
    breaks: 'NATs, header normalisation, and proxies rewrite exactly these fields.',
    indicators: 'A field confined to a tiny/unusual value set (a per-packet 64/65 TTL is glaring); parity channels are near-invisible.',
    fidelity: {
      faithful: ['field-value encoding', 'middlebox rewrites that destroy it', 'the honest fact that parity channels evade simple histograms'],
      simplified: ['no real TCP state machine', 'no path MTU or fragmentation'],
      realWorld: ['stateful firewalls, RFC-compliant normalisers, and load balancers'],
    },
  },
  {
    name: 'Packet ordering', layer: 'Network', family: 'Timing', pattern: 'p10',
    patternNote: 'Expect to be surprised here. "The message is in the order" sounds like storage, and almost every student files it there — this atlas did too, until it was checked against the paper. The survey lists **P10 PDU Order under Network Covert TIMING Channels**. The reason holds up: no value anywhere in any packet is altered, and a byte-for-byte comparison of the packets finds nothing. What varies is WHEN each PDU appears relative to the others, which is the definition of a timing channel. Compare the HTTP Header Channel below, which permutes elements INSIDE one PDU and is genuinely storage (P2 Sequence) — same intuition, different side of the line.',
    status: 'built', section: 'ordering',
    idea: 'Encode a bit in the order of two interchangeable events (A→B = 0, B→A = 1).',
    breaks: 'Any network reordering; retransmission; load balancing across paths.',
    indicators: 'Improbably structured ordering; a pure stream of isolated pairs.',
    fidelity: {
      faithful: ['order encoding', 'reordering collapse', 'permutation-capacity ceiling ⌊log₂ n!⌋'],
      simplified: ['pairwise (1 bit) rather than full-permutation encoding'],
      realWorld: ['multipath and per-flow hashing reorder packets constantly'],
    },
  },
  {
    name: 'HTTP header order', layer: 'Application', family: 'Storage', pattern: 'p2',
    patternNote: 'This is the one that really is storage: P2 Sequence is defined over "header/PDU elements", and the permuted headers all sit inside a single request. Order across PDUs is the other pattern — P10, and it is filed under timing.',
    status: 'built', section: 'http',
    idea: 'Permute a set of reorderable request headers — 6 headers give ⌊log₂ 6!⌋ = 9 bits/request.',
    breaks: 'Any normalising proxy or CDN that re-sorts headers into a canonical order.',
    indicators: 'Header order varies request-to-request; a real client fingerprints as one stable order.',
    fidelity: {
      faithful: ['Lehmer-rank order encoding', 'stable-client fingerprint baseline', 'proxy normalisation destroying it'],
      simplified: ['one client profile', 'no TLS/JA3 layer'],
      realWorld: ['passive fingerprinting (p0f, JA3/JA4) and header-rewriting gateways'],
    },
  },
  {
    name: 'Protocol hopping / switching', layer: 'Any', family: 'Storage', pattern: null, noPattern: 'not-a-pattern',
    patternNote: 'Not one of the eleven. The survey discusses protocol switching separately rather than assigning it a pattern code, and it has its own primary literature: Wendzel & Zander, "Detecting Protocol Switching Covert Channels", 37th IEEE Conference on Local Computer Networks (LCN), IEEE, 2012, 280–283; Wendzel & Keller, "Preventing Protocol Switching Covert Channels", International Journal On Advances in Security 5, 3 and 4 (2012), 81–93; and Wendzel & Keller, "Low-attention forwarding for mobile network covert channels", Communications and Multimedia Security (LNCS 7025), Springer, 2011, 122–133. The countermeasure the second of those introduces, PCAW, delays protocol switches to cap the bitrate, and the survey notes it works on BACnet building-automation networks as well as IPv4.',
    status: 'built', section: 'hopping',
    idea: 'The CHOICE of which protocol to speak next encodes bits — a covert state machine over protocols rather than a channel inside any one of them. This module walks an agreed, ordered set of five (HTTPS, DNS, NTP, SMTP, SSH) with `to = (from + 1 + symbol) mod n`, so every hop must change protocol and each carries ⌊log₂(n−1)⌋ = 2 bits.',
    breaks: 'An egress allow-list that removes protocols from the set, and — far more sharply than you would expect — ordinary loss. The receiver reads each transition straight off the carrier, so the STATE MACHINE resynchronises immediately after a dropped flow, but the BIT INDEXING does not: every symbol after the gap lands one position early. A couple of percent loss is enough to push the error rate to roughly a coin flip.',
    indicators: 'Not a field value — a transition statistic. The grammar must change protocol every hop, so the diagonal of the transition matrix is exactly empty, while real hosts are sticky (a browsing session is a long run of HTTPS). Arbitrary payload also flattens the transition distribution toward uniform. Both are only visible after grouping traffic BY PEER: aggregated over a host, ordinary traffic refills the diagonal and the channel disappears.',
    fidelity: {
      faithful: ['the state-machine encoding and its ⌊log₂(n−1)⌋ ceiling, which grows only logarithmically with the protocol set', 'transition-matrix analysis: diagonal mass, transition entropy normalised against the ceiling a sample of that size can actually reach, and a chi-square against uniform', 'the per-peer pivot, and the fact that cover traffic defeats an aggregate but not an analyst who pivots', 'desynchronisation of bit positions under loss while the state machine itself recovers', 'a fixed-rotation monitoring agent kept in the benchmark as a genuine false positive — it also never repeats a protocol, and only the entropy term separates it'],
      simplified: ['NO FLOW IS OPENED AND NO PROTOCOL IS SPOKEN — a "flow" is a plain object recording a protocol name, a destination and a time', 'one rendezvous peer and a fixed five-protocol set agreed in advance; a real hopping channel would negotiate both', 'ordinary host traffic is a MODELLED baseline (sticky peer and protocol draws), not a capture of real behaviour', 'this carrier has NO pattern code — earlier versions of this atlas called it value modulation over a protocol identifier, which was this lab\'s own reading passed off as taxonomy; the eleven patterns do not contain it, and the note above names the primary literature that does'],
      realWorld: ['real traffic classifiers, NetFlow/IPFIX-level behaviour analytics, and per-host baselining over long windows; hosts whose protocol mix is far messier than any model of it'],
    },
  },
  {
    name: 'Image LSB', layer: 'Media', family: 'Steganography', pattern: null, noPattern: 'payload',
    patternNote: 'Read the catalog carefully before mapping this one: **P6.b is named "LSB" and it is NOT this.** P6.b is a header-field pattern — the least significant bit of a protocol field, one bit per PDU. Image LSB steganography writes into the pixels of a media file, which is payload, and payload is outside the survey\'s scope entirely. Two things called LSB, one letter apart in a table, on opposite sides of the scope line.',
    status: 'built', section: 'stego',
    idea: 'Flip the least-significant bits of pixels; a ±1 colour change is invisible.',
    breaks: 'Any lossy re-compression (JPEG) that discards the low bits.',
    indicators: 'Chi-square pairs-of-values attack; a region whose LSB plane is over-random.',
    fidelity: {
      faithful: ['LSB embed/extract', 'chi-square attack (Westfeld & Pfitzmann)', 'lossy transform destroying the payload'],
      simplified: ['sequential embedding', 'not JPEG/DCT-domain like J-UNIWARD'],
      realWorld: ['modern steganalysis uses rich models / CNNs; modern stego hides in the transform domain'],
    },
  },
  {
    name: 'Operational records (library metadata)', layer: 'Records / inference', family: 'Storage', pattern: null, noPattern: 'no-pdu',
    patternNote: 'No pattern, because there is no network here. Every Illustration line in the catalog is written in terms of a header element or a PDU, and a transfer-routing field in a circulation record is neither. Earlier versions of this atlas called it value modulation; that is the right INTUITION and the wrong CITATION. A vocabulary that reaches carriers like this one has to come from outside the network pattern catalog, and naming which is a research question rather than something this card can settle.',
    status: 'built', section: 'metadata',
    idea: 'Routine metadata (transfer routing, holds, circulation) forms an unintended channel and an inference risk.',
    breaks: 'Data minimisation — keep only aggregates and the per-record signal disappears.',
    indicators: 'A routing split near 50/50 where operations are normally hub-weighted.',
    fidelity: {
      faithful: ['records-as-channel idea', 'minimisation as defence', 'the privacy framing'],
      simplified: ['a single binary routing field'],
      realWorld: ['real logs mix many fields; re-identification risk compounds across data sets'],
    },
  },

  {
    name: 'Air-gap physical media', layer: 'Physical (no network)', family: 'Both', pattern: null, noPattern: 'no-pdu',
    patternNote: 'No pattern: the catalog describes channels in network PDUs, and an air gap has none. The on/off keying below would read as a timing pattern in any taxonomy that covered it, but naming a P-number here would be inventing one.',
    status: 'built', section: 'physical',
    idea: 'With no network at all, the carrier becomes the **medium** — light from an LED, heat, fan noise, power draw, or stray RF. This lab models the OPTICAL carrier as on/off keying with an explicit ambient-noise process.',
    breaks: 'Ambient light and its drift, distance and line of sight, sensor bandwidth, and simply covering or removing the emitter.',
    indicators: 'Luminance that falls into two tight levels well clear of the noise floor, and is driven lit about half the time — an activity LED doing ordinary work wanders and is mostly dark.',
    fidelity: {
      faithful: ['on/off keying', 'the matched filter and its √N processing gain', 'threshold decoding', 'noise vs systematic drift as distinct impairments', 'measured BER against Shannon capacity'],
      simplified: ['THE MEDIUM IS MODELLED — no LED, camera, or light sensor is involved; the "photodiode" is a number and ambient light is an explicit noise process', 'only the optical carrier is built; thermal, acoustic, power-line and RF carriers are named in the references, not modelled'],
      realWorld: ['real photodiode and camera response, frame rates, rolling shutter, distance falloff, and physical sightlines'],
    },
  },

  {
    name: 'Cache / shared-resource timing', layer: 'System side channel', family: 'Timing', pattern: null, noPattern: 'no-pdu',
    patternNote: 'No pattern, and the card says why itself: this channel is "not visible at the network layer at all". A cache line is not a PDU. The Shared-Resource Matrix is the right abstraction for it; the network pattern catalog is not.',
    status: 'built', section: 'cache',
    idea: 'Two parties on shared hardware signal by contending for a cache line or set (Flush+Reload, Prime+Probe). The concrete instance of the Shared-Resource Matrix abstraction.',
    breaks: 'Co-tenant eviction noise, scheduler interference, and mitigations such as cache partitioning or flushing on context switch.',
    indicators: 'A latency histogram whose fast and slow classes are used about equally — ordinary code has locality and mostly hits. Not visible at the network layer at all.',
    fidelity: {
      faithful: ['both probing protocols and their opposite polarities', 'the threshold classifier', 'repeated probing and its averaging gain', 'asymmetric eviction noise', 'measured BER and capacity arithmetic'],
      simplified: ['A BROWSER PAGE STILL CANNOT MOUNT A REAL FLUSH+RELOAD — that has not changed; what this module adds is a MODEL of one', 'THE CACHE IS MODELLED — no line is flushed, no timer is read, and no timing side channel exists in this page; "cycles" are numbers drawn from a documented distribution'],
      realWorld: ['precise cycle counters, real inclusive-cache behaviour, address-to-set mapping, prefetchers, and physical co-residency'],
    },
  },

  /* ---- Conceptual carriers: described, never built as tools ---------------- */
  {
    name: 'Text / linguistic carriers', layer: 'Application / document', family: 'Steganography', pattern: null, noPattern: 'payload',
    patternNote: 'No pattern: the characters ARE the payload, and payload channels are outside the catalog\'s scope. P6.a is named "Case", which invites the same mistake P6.b "LSB" invites — this lab reads it as a sub-pattern of value modulation over non-payload, like every other storage pattern in the catalog, rather than as a licence to map document prose onto it.',
    status: 'concept',
    idea: 'The characters themselves carry the payload: zero-width and variation-selector code points, Unicode Tags, whitespace runs (SNOW), homoglyph substitution, and bidi controls that make the stored order differ from the displayed order.',
    breaks: 'Unicode normalisation (NFKC), whitespace collapsing, confusable/mixed-script detection, and any pipeline that re-encodes or strips non-printing code points.',
    indicators: 'Non-printing code points inside a plain-text field, mixed-script tokens, trailing-whitespace runs, and a rendered string that does not match its stored bytes.',
    fidelity: {
      faithful: ['the concept and the carrier family'],
      simplified: ['NOT BUILT HERE — the text/linguistic family is covered in depth by a sibling exhibit rather than duplicated in this one'],
      realWorld: ['copy-and-paste paths, document and code-review pipelines, chat and model prompts, and any renderer that shows something other than what the bytes say'],
    },
    deepDive: {
      url: 'https://systemslibrarian.github.io/Ghost-Ink/',
      label: 'Deep dive: the Ghost-Ink exhibit →',
      note: 'A sibling Crypto-Lab exhibit devoted to this family — invisible Unicode-tag messages, and how to catch them.',
    },
  },
  {
    name: 'VoIP / RTP', layer: 'Application', family: 'Both', pattern: 'p8',
    patternNote: 'The code above covers the TIMING half only, and it rests on the pattern\'s NAME: silence-suppression frame timing is inter-arrival time, and this lab does not have P8\'s Illustration line to check that against. The storage half genuinely is in scope, because the survey names "padding bits" as non-payload, but no code is picked for RTP padding or timestamps — there the candidate patterns are several and guessing between them would be inventing a citation. Hiding in the audio SAMPLES would be payload and outside the catalog altogether. Nothing here is built, so treat the code as a reading to argue with, not a result.',
    status: 'concept',
    idea: 'Hide data in RTP padding/timestamps or in the timing of silence-suppression frames.',
    breaks: 'Transcoding, jitter buffers, and packet loss concealment.',
    indicators: 'Statistical anomalies in inter-packet timing or unexpected padding.',
    fidelity: {
      faithful: ['the concept'],
      simplified: ['NOT IMPLEMENTED — no media stream exists here'],
      realWorld: ['a full codec/jitter-buffer pipeline; regulatory/lawful-intercept context'],
    },
  },
  {
    name: 'Wi-Fi / link layer', layer: 'Physical / Link', family: 'Both', pattern: 'p7',
    patternNote: 'This entry is really three carriers wearing one name, and only the first gets a code. This lab reads unassigned 802.11 header bits as **P7 Reserved/Unused** — a mapping that rests on the pattern\'s NAME, since P7\'s Illustration line is not quoted here, so it is the lab\'s own reading rather than something the paper adjudicated. Frame padding and transmission timing are separate patterns this lab does not name at all, because guessing which would be inventing a citation. Nothing here is built, so treat the code as a reading to argue with, not a result.',
    status: 'concept',
    idea: 'Encode in 802.11 fields, frame padding, or transmission timing at the link layer.',
    breaks: 'Re-association, rate adaptation, and driver/firmware normalisation.',
    indicators: 'Requires specialised monitor-mode capture and hardware to even observe.',
    fidelity: {
      faithful: ['the concept'],
      simplified: ['NOT IMPLEMENTED — no radios, drivers, or frames'],
      realWorld: ['monitor-mode NICs, PHY effects, and RF noise'],
    },
  },
  {
    name: 'History / object-reuse channels', layer: 'Application', family: 'Storage', pattern: null, noPattern: 'no-pdu',
    patternNote: 'No pattern. The signal is which ordinary public objects get reused and when — a property of the sender\'s behaviour over a long window, not of any header element or PDU. Earlier versions of this atlas called it value modulation, which the eleven patterns do not support.',
    status: 'concept',
    idea: 'Signal by the pattern of reuse of ordinary public objects, so the traffic "looks like" normal reuse (DYST-class ideas).',
    breaks: 'Changes to the public objects; caching and CDNs; behavioural baselining.',
    indicators: 'Reuse patterns that deviate from a population baseline.',
    fidelity: {
      faithful: ['the concept — related to the Library Records exhibit'],
      simplified: ['NOT IMPLEMENTED as live traffic'],
      realWorld: ['large public object stores and long observation windows'],
    },
  },
];
