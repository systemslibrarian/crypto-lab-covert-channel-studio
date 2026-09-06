/**
 * comparison.js — tabular data for the "Compare Channels" section of the
 * Covert Channel Studio exhibit.
 *
 * COMPARISON_COLUMNS defines the table schema; COMPARISON_ROWS gives one row
 * per illustrated channel. Every value is a short, simulation-safe string.
 *
 * These rows describe a 100% client-side educational simulation. Rows are
 * ordered for teaching progression, NOT ranked by stealth. Capacity figures
 * are illustrative of the simulated demos, not measurements of real networks.
 * No value here implies any channel is undetectable or deployable.
 *
 * Pure data (no imports, no DOM, no side effects).
 */

export const COMPARISON_COLUMNS = [
  { key: 'channel', label: 'Channel' },
  { key: 'carrier', label: 'Carrier' },
  { key: 'kind', label: 'Storage / Timing' },
  { key: 'capacity', label: 'Illustrative Capacity' },
  { key: 'reliability', label: 'Reliability' },
  { key: 'noise', label: 'Susceptibility to Noise' },
  { key: 'breaks', label: 'What May Break It' },
  { key: 'indicators', label: 'Defensive Indicators' },
  { key: 'difficulty', label: 'Lab Difficulty' },
];

export const COMPARISON_ROWS = [
  {
    channel: 'DNS',
    carrier: 'Query names / record fields',
    kind: 'Storage',
    capacity: 'Moderate (bytes per query)',
    reliability: 'Good when resolvers cooperate',
    noise: 'Low to moderate',
    breaks: 'Caching, query-length limits, resolver rewriting',
    indicators: 'High query rate, long or high-entropy labels, rare record types',
    difficulty: 'Beginner-friendly',
    note: 'High teaching value and a realistic enterprise example: DNS is meant to name hosts, not carry payloads.',
  },
  {
    channel: 'Timing',
    carrier: 'Delays between events',
    kind: 'Timing',
    capacity: 'Very low (bits per event)',
    reliability: 'Fragile',
    noise: 'Very high',
    breaks: 'Jitter, buffering, scheduling, congestion',
    indicators: 'Regular inter-arrival patterns, unusual delay distributions',
    difficulty: 'Advanced',
    note: 'Extremely subtle and low throughput, since the message lives in when events happen rather than in any value.',
  },
  {
    channel: 'IP/TCP metadata',
    carrier: 'Header fields (TTL, options, flags)',
    kind: 'Storage',
    capacity: 'Low (a few bits per packet)',
    reliability: 'Moderate',
    noise: 'Moderate',
    breaks: 'Middleboxes and NAT rewriting fields, normalization',
    indicators: 'Anomalous or static field values, unusual option combinations',
    difficulty: 'Intermediate',
    note: 'An excellent storage example, though middleboxes routinely rewrite the very fields it depends on.',
  },
  {
    channel: 'Packet ordering',
    carrier: 'Sequence of packets',
    kind: 'Both/other',
    capacity: 'Low (bits per group)',
    reliability: 'Fragile',
    noise: 'High',
    breaks: 'Reordering, retransmission, load balancing',
    indicators: 'Statistically improbable ordering, reorder rates above baseline',
    difficulty: 'Advanced',
    note: 'Information rides in the arrangement of packets rather than in any single packet value.',
  },
  {
    channel: 'ICMP concept',
    carrier: 'Echo payload / fields',
    kind: 'Storage',
    capacity: 'Moderate (bytes per message)',
    reliability: 'Moderate where allowed',
    noise: 'Low to moderate',
    breaks: 'Filtering, rate limiting, payload inspection',
    indicators: 'Oversized or frequent echoes, non-standard payload content',
    difficulty: 'Intermediate',
    note: 'A classic textbook channel that is often conspicuous and commonly filtered at the network edge.',
  },
  {
    channel: 'HTTPS tunneling',
    carrier: 'Encrypted session',
    kind: 'Storage (tunnel)',
    capacity: 'High (session throughput)',
    reliability: 'High',
    noise: 'Low',
    breaks: 'TLS inspection, allow-lists, certificate policy',
    indicators: 'Recognizable as HTTPS, odd destinations, long-lived flows',
    difficulty: 'Intermediate',
    note: 'Better described as tunneling than covert signaling — it hides content but is readily identifiable as HTTPS.',
  },
  {
    channel: 'SSH tunneling',
    carrier: 'Encrypted session',
    kind: 'Storage (tunnel)',
    capacity: 'High (session throughput)',
    reliability: 'High',
    noise: 'Low',
    breaks: 'Egress policy, protocol allow-lists, port control',
    indicators: 'Recognizable as SSH, unexpected forwards, unusual endpoints',
    difficulty: 'Intermediate',
    note: 'Better described as tunneling than covert signaling — it hides content but is readily identifiable as SSH.',
  },
  {
    channel: 'Image steganography',
    carrier: 'Pixel data (e.g. LSB)',
    kind: 'Storage (steg)',
    capacity: 'Moderate to high (per image)',
    reliability: 'Good until the image is altered',
    noise: 'Low at rest, high if re-encoded',
    breaks: 'Recompression, resizing, format conversion',
    indicators: 'LSB statistics, entropy shifts, palette anomalies',
    difficulty: 'Beginner-friendly',
    note: 'Very visual and easy to demonstrate, but it hides data inside a file and is not inherently a live network channel.',
  },
  {
    channel: 'VoIP/RTP concept',
    carrier: 'Media stream fields / timing',
    kind: 'Both/other',
    capacity: 'Low to moderate',
    reliability: 'Fragile',
    noise: 'High',
    breaks: 'Transcoding, jitter buffers, packet loss concealment',
    indicators: 'Statistical anomalies in media fields or inter-packet timing',
    difficulty: 'Advanced',
    note: 'Included as a concept only — a real-time media stream is a demanding and lossy carrier.',
  },
  {
    channel: 'Wi-Fi concept',
    carrier: 'Frame fields / timing',
    kind: 'Both/other',
    capacity: 'Low',
    reliability: 'Fragile',
    noise: 'Very high',
    breaks: 'Interference, retransmission, driver and firmware behavior',
    indicators: 'Unusual frame timing or field usage against a baseline',
    difficulty: 'Advanced',
    note: 'Included as a concept only — a noisy radio environment makes it an unreliable illustrative carrier.',
  },
];
