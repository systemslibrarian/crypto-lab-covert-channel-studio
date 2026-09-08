/**
 * content/atlas.js — the Carrier Atlas.
 *
 * Two things a graduate seminar needs: (1) a map from each hands-on module to a
 * named entry in the research community's hiding-pattern taxonomy, so a learner
 * can read a paper and say "this is a value-modulation pattern"; and (2) honest
 * coverage of the carrier families this lab deliberately does NOT build as tools
 * (ICMP, VoIP, Wi-Fi, protocol hopping, history channels, and the text/linguistic
 * family, which has its own sibling exhibit),
 * each with a "fidelity card" — what is faithful, what is simplified, and what a
 * real environment adds.
 *
 * Data only (no DOM).
 */

export const TAXONOMY = {
  citation: 'Wendzel, Zander, Fechner & Herdin — "Pattern-Based Survey and Categorization of Network Covert Channel Techniques", ACM Computing Surveys 47(3), 2015 (DOI 10.1145/2684195)',
  intro: 'The community reference organizes techniques into reusable hiding PATTERNS under two classic families — storage and timing. Mapping a technique to a pattern is more durable than memorizing individual tricks.',
  since: 'This lab maps its hands-on modules to the 2015 NETWORK pattern taxonomy. In 2025 the same group generalized it: Wendzel, Caviglione, Mazurczyk et al., "A Generic Taxonomy for Steganography Methods" (ACM Computing Surveys, DOI 10.1145/3729165) spans information hiding across network, media, text, filesystem, and cyber-physical domains. The network patterns below remain the clearest on-ramp; the generic taxonomy is where to go next.',
  families: [
    {
      name: 'Storage patterns',
      note: 'Information lives in a value.',
      patterns: [
        { id: 'value-modulation', name: 'Value / field modulation', idea: 'Set a protocol field to a chosen value.', lab: 'Storage Channel (TTL toggle), DNS labels' },
        { id: 'random-value', name: 'Random-value fields', idea: 'Borrow a field that is meant to look random (IP ID, initial sequence number).', lab: 'Storage Channel (IP-ID parity, TCP seq low bit)' },
        { id: 'reserved-unused', name: 'Reserved / unused fields', idea: 'Use bits the protocol does not currently assign.', lab: 'Storage Channel (concept), TCP reserved bits' },
        { id: 'sequence', name: 'Sequence / ordering', idea: 'Encode in the order of interchangeable elements.', lab: 'Packet-Order Channel, HTTP Header Channel' },
        { id: 'payload-structure', name: 'Payload structure / naming', idea: 'Encode in the structure or names carried in the payload.', lab: 'DNS Channel (query labels)' },
      ],
    },
    {
      name: 'Timing patterns',
      note: 'Information lives in when something happens.',
      patterns: [
        { id: 'inter-packet', name: 'Inter-packet times', idea: 'Modulate the gaps between events.', lab: 'Timing Channel' },
        { id: 'rate', name: 'Rate / throughput', idea: 'Modulate the sending rate over a window.', lab: 'Timing Channel (concept)' },
        { id: 'retransmission', name: 'Retransmission / loss', idea: 'Use presence or absence of retransmissions.', lab: '(conceptual)' },
      ],
    },
  ],
};

/**
 * Carriers, both the ones this lab builds and the ones it only describes. Each
 * carries a fidelity card so nobody mistakes the simulation for the real thing.
 */
export const CARRIERS = [
  {
    name: 'DNS query names', layer: 'Application', family: 'Storage', pattern: 'payload-structure',
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
    name: 'Inter-packet timing', layer: 'Any', family: 'Timing', pattern: 'inter-packet',
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
    name: 'IP/TCP header fields', layer: 'Network / Transport', family: 'Storage', pattern: 'random-value',
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
    name: 'Packet ordering', layer: 'Network', family: 'Storage', pattern: 'sequence',
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
    name: 'HTTP header order', layer: 'Application', family: 'Storage', pattern: 'sequence',
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
    name: 'Image LSB', layer: 'Media', family: 'Steganography', pattern: null,
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
    name: 'Operational records (library metadata)', layer: 'Records / inference', family: 'Storage', pattern: 'value-modulation',
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
    name: 'Air-gap physical media', layer: 'Physical (no network)', family: 'Both', pattern: null,
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

  /* ---- Conceptual carriers: described, never built as tools ---------------- */
  {
    name: 'Text / linguistic carriers', layer: 'Application / document', family: 'Steganography', pattern: null,
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
    name: 'ICMP tunneling', layer: 'Network', family: 'Storage', pattern: 'payload-structure',
    status: 'concept',
    idea: 'Carry data in the payload of ICMP echo request/reply ("ping") packets.',
    breaks: 'Often conspicuous; many networks rate-limit or drop large/!standard ICMP.',
    indicators: 'Oversized or high-entropy ICMP payloads; unusual echo volume.',
    fidelity: {
      faithful: ['the concept'],
      simplified: ['NOT IMPLEMENTED — no ICMP is crafted or sent'],
      realWorld: ['raw sockets and elevated privileges; egress filtering usually notices'],
    },
  },
  {
    name: 'VoIP / RTP', layer: 'Application', family: 'Both', pattern: 'inter-packet',
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
    name: 'Wi-Fi / link layer', layer: 'Physical / Link', family: 'Both', pattern: 'reserved-unused',
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
    name: 'Protocol hopping / switching', layer: 'Any', family: 'Storage', pattern: 'value-modulation',
    status: 'concept',
    idea: 'The CHOICE of which protocol to use next encodes bits — a covert state machine over protocols.',
    breaks: 'Traffic that must be recognisable will still be classified; the hopping pattern itself is a tell.',
    indicators: 'Unusual protocol-transition statistics for the host.',
    fidelity: {
      faithful: ['the concept (a simulated state machine could model it)'],
      simplified: ['NOT IMPLEMENTED as live traffic'],
      realWorld: ['real classifiers and NetFlow-level behaviour analytics'],
    },
  },
  {
    name: 'Cache / shared-resource timing', layer: 'System side channel', family: 'Timing', pattern: null,
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
  {
    name: 'History / object-reuse channels', layer: 'Application', family: 'Storage', pattern: 'value-modulation',
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
