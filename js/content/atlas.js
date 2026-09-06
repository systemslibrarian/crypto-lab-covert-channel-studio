/**
 * content/atlas.js — the Carrier Atlas.
 *
 * Two things a graduate seminar needs: (1) a map from each hands-on module to a
 * named entry in the research community's hiding-pattern taxonomy, so a learner
 * can read a paper and say "this is a value-modulation pattern"; and (2) honest
 * coverage of the carrier families this lab deliberately does NOT build as tools
 * (ICMP, VoIP, Wi-Fi, protocol hopping, cache side channels, history channels),
 * each with a "fidelity card" — what is faithful, what is simplified, and what a
 * real environment adds.
 *
 * Data only (no DOM).
 */

export const TAXONOMY = {
  citation: 'Wendzel, Zander, Fechner & Herdin — "Pattern-Based Survey and Categorization of Network Covert Channel Techniques", ACM Computing Surveys 47(3), 2015',
  intro: 'The community reference organizes techniques into reusable hiding PATTERNS under two classic families — storage and timing. Mapping a technique to a pattern is more durable than memorizing individual tricks.',
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

  /* ---- Conceptual carriers: described, never built as tools ---------------- */
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
    name: 'Cache / shared-resource timing', layer: 'System side channel', family: 'Timing', pattern: 'inter-packet',
    status: 'concept',
    idea: 'Two parties on shared hardware signal by contending for a cache or other resource (Flush+Reload, occupancy).',
    breaks: 'Noise from co-tenants; mitigations like cache partitioning.',
    indicators: 'Micro-architectural monitoring; not visible at the network layer.',
    fidelity: {
      faithful: ['the concept'],
      simplified: ['NOT POSSIBLE HERE — a browser page cannot mount a real Flush+Reload; this is described only'],
      realWorld: ['precise timers, shared caches, and physical co-residency'],
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
