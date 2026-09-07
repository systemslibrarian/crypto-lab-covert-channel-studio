/*
 * glossary.js — Covert Channel Studio
 * Alphabetized glossary of covert-channel, tunneling, and detection terms.
 * All scenarios referenced here are client-side simulations for education.
 */

export const GLOSSARY = [
  {
    term: 'Anomaly',
    definition: 'A measurable deviation from an established baseline of normal behavior, such as unusually long DNS labels, high-entropy hostnames, or suspiciously regular packet timing. Detection systems surface anomalies for a human analyst to investigate.',
    seeAlso: ['Baseline', 'Entropy', 'Inter-arrival time']
  },
  {
    term: 'Bandwidth',
    definition: 'The information rate a channel actually achieves in practice, constrained by its capacity, its error rate, and the noise it must survive. In covert-channel discussions the word is often used loosely as a synonym for capacity.',
    seeAlso: ['Capacity', 'Jitter']
  },
  {
    term: 'Baseline',
    definition: 'A statistical picture of normal behavior for a system or network — typical name lengths, timing distributions, request volumes — gathered before an incident. Anomaly detection is only as good as the baseline it compares against.',
    seeAlso: ['Anomaly', 'Cover traffic']
  },
  {
    term: 'Capacity',
    definition: 'The theoretical maximum rate at which a channel can transfer information, often expressed in bits per symbol or bits per second. Covert channels tend to trade capacity away in exchange for lower observability, one corner of the capacity-reliability-observability triangle.',
    seeAlso: ['Bandwidth', 'Observability', 'Encoding']
  },
  {
    term: 'Carrier',
    definition: 'The legitimate-looking medium that transports hidden information: a protocol, a file format, or a traffic pattern. In DNS tunneling the carrier is the stream of DNS queries; in image steganography it is the cover image.',
    seeAlso: ['Cover traffic', 'Tunneling', 'Steganography']
  },
  {
    term: 'Cover traffic',
    definition: 'Ordinary, legitimate-looking activity that hidden communication blends into. The more a covert signal resembles the surrounding cover traffic, the harder it is to separate from the normal baseline.',
    seeAlso: ['Carrier', 'Baseline', 'Anomaly']
  },
  {
    term: 'Covert channel',
    definition: 'A communication path that transfers information through a mechanism that was not designed or intended to carry it — a field value, an ordering, a protocol quirk, or the timing of events. Its defining goal is to conceal the existence or purpose of the communication, which is different from encryption (hiding content) and from tunneling (repackaging content in another protocol).',
    seeAlso: ['Covert storage channel', 'Covert timing channel', 'Encryption', 'Tunneling', 'Steganography']
  },
  {
    term: 'Covert storage channel',
    definition: 'A covert channel that places information into a stored or transmitted value observers can see but do not expect to carry a message, such as spare header bits or repurposed field values. The hidden bits live in what a value is.',
    seeAlso: ['Covert channel', 'Covert timing channel', 'Encoding', 'Middlebox']
  },
  {
    term: 'Covert timing channel',
    definition: 'A covert channel that conveys information through when events occur rather than what they contain, for example by modulating the delays between packets. The hidden bits live in when something happens, which makes the channel sensitive to jitter.',
    seeAlso: ['Covert channel', 'Inter-arrival time', 'Jitter']
  },
  {
    term: 'DNS label',
    definition: 'One dot-separated component of a domain name, limited to 63 bytes, within a full name capped at 255 bytes. These limits bound how much encoded data a single query name can carry, and long, random-looking labels are a classic detection signal for DNS abuse.',
    seeAlso: ['Tunneling', 'Entropy', 'Resolver']
  },
  {
    term: 'Encoding',
    definition: 'The agreed scheme that maps message bits onto features of a carrier, such as mapping 0 and 1 to short and long delays, or to characters in a hostname. Encoding is representation, not secrecy: anyone who learns the scheme can decode the message.',
    seeAlso: ['Carrier', 'Capacity', 'Encryption']
  },
  {
    term: 'Encryption',
    definition: 'Transforming a message so that it cannot be read without a key. Encryption protects content but does not hide the fact that communication is happening — an encrypted flow is still plainly visible as a flow, which is why encryption alone is not a covert channel.',
    seeAlso: ['Covert channel', 'Tunneling', 'Steganography']
  },
  {
    term: 'Entropy',
    definition: 'A measure of unpredictability in data. Analysts compare the entropy of observed values, such as DNS labels or filenames, against typical baselines; encoded, compressed, or encrypted data often stands out as unusually random.',
    seeAlso: ['Anomaly', 'DNS label', 'Baseline']
  },
  {
    term: 'Exfiltration',
    definition: 'The unauthorized movement of data out of an environment. Covert channels and protocol tunnels are among the mechanisms defenders monitor for, which is why this exhibit pairs every sender view with a detection view — and simulates the concepts rather than performing the act.',
    seeAlso: ['Covert channel', 'Tunneling', 'Anomaly']
  },
  {
    term: 'Inter-arrival time',
    definition: 'The elapsed time between two consecutive events, such as successive packets from the same host. Timing channels modulate inter-arrival times to carry bits, so defenders study their distribution for patterns too regular or too structured to be natural.',
    seeAlso: ['Covert timing channel', 'Jitter', 'Anomaly']
  },
  {
    term: 'Jitter',
    definition: 'Random variation in event timing introduced by networks, queues, and operating systems. Jitter acts as noise for a timing channel, forcing the sender to use wider timing gaps and accept lower reliable bandwidth.',
    seeAlso: ['Covert timing channel', 'Inter-arrival time', 'Bandwidth']
  },
  {
    term: 'Least-significant bit (LSB)',
    definition: 'The lowest-order bit of a numeric value, whose change alters the value the least. LSB steganography replaces these bits in pixel color values with message bits, producing changes that are usually imperceptible to the eye yet still measurable statistically.',
    seeAlso: ['Steganography', 'Entropy', 'Encoding']
  },
  {
    term: 'Middlebox',
    definition: 'A network device that sits in the traffic path and inspects, rewrites, or filters packets — firewalls, proxies, load balancers, NAT gateways. Middleboxes can break covert channels unintentionally by normalizing header fields, reordering packets, or smoothing timing.',
    seeAlso: ['NAT', 'Covert storage channel', 'Ordering channel']
  },
  {
    term: 'NAT',
    definition: 'Network Address Translation, a middlebox function that rewrites IP addresses and ports as traffic crosses a network boundary. Because NAT alters header fields in transit, it can incidentally destroy storage channels that hide data in those fields.',
    seeAlso: ['Middlebox', 'Covert storage channel']
  },
  {
    term: 'Observability',
    definition: 'The degree to which a channel leaves artifacts a defender can measure: odd field values, skewed timing distributions, excess queries. Lower observability generally costs capacity or reliability, forming the tradeoff triangle at the heart of this exhibit.',
    seeAlso: ['Capacity', 'Anomaly', 'Baseline']
  },
  {
    term: 'Ordering channel',
    definition: 'A covert channel that encodes information in the relative order of otherwise legitimate items, such as the sequence in which packets or requests are emitted. Natural reordering by networks and middleboxes acts as noise, limiting its reliability.',
    seeAlso: ['Covert channel', 'Middlebox', 'Encoding']
  },
  {
    term: 'Payload',
    definition: 'The portion of a packet or message that carries the intended application data, as distinct from headers and metadata. A central lesson of covert channels is that hidden information does not have to live in the payload at all.',
    seeAlso: ['Covert storage channel', 'Covert timing channel', 'Carrier']
  },
  {
    term: 'Resolver',
    definition: 'A DNS component that answers name lookups on behalf of clients, usually by querying authoritative servers up the hierarchy. In a DNS tunneling scenario the resolver unwittingly relays encoded query names toward a domain the receiver controls — modeled in this exhibit entirely with in-browser objects and .test domains.',
    seeAlso: ['DNS label', 'Tunneling']
  },
  {
    term: 'Steganography',
    definition: 'Hiding a message inside other content so the content still appears ordinary, such as embedding bits in the least-significant bits of image pixels. Where encryption scrambles a message that is visibly present, steganography tries to conceal that a message exists at all.',
    seeAlso: ['Least-significant bit (LSB)', 'Carrier', 'Encryption']
  },
  {
    term: 'Tunneling',
    definition: 'Wrapping one protocol inside another so traffic rides a carrier protocol, as in DNS tunneling or an SSH tunnel. Tunnels hide or repackage content, but they are often readily identifiable as tunnels, so tunneling is not automatically covert — hiding content is not the same as hiding the existence or purpose of communication.',
    seeAlso: ['Covert channel', 'Carrier', 'Encryption', 'Resolver']
  },
  {
    term: 'Corrected conditional entropy',
    definition: 'A complexity measure of a sequence of events, corrected for finite-sample bias. Covert timing channels are far more regular than human traffic, so their corrected conditional entropy is unusually low — the basis of an entropy-based timing-channel detector (Gianvecchio & Wang, 2007).',
    seeAlso: ['Covert timing channel', 'Entropy', 'Inter-arrival time']
  },
  {
    term: 'Cabuk regularity',
    definition: 'A statistic that measures how constant a traffic stream\'s per-window variability is. A crafted timing channel keeps it nearly constant (low regularity value); bursty legitimate traffic does not (Cabuk et al., 2004).',
    seeAlso: ['Covert timing channel', 'Inter-arrival time']
  },
  {
    term: 'Chi-square attack',
    definition: 'A steganalysis test that detects LSB embedding by measuring how far the counts of adjacent pixel-value pairs have been equalised, which near-random embedding tends to do (Westfeld & Pfitzmann, 1999).',
    seeAlso: ['Steganography', 'Least-significant bit (LSB)']
  },
  {
    term: 'Shared Resource Matrix',
    definition: 'Kemmerer\'s methodology (1983) for finding covert channels by tabulating which subjects can Reference or Modify each shared attribute; a potential channel exists where a high-clearance subject can modify an attribute a low-clearance subject can read.',
    seeAlso: ['Covert storage channel', 'Covert timing channel']
  },
  {
    term: 'Hiding pattern',
    definition: 'A reusable category of covert-channel technique in the network information-hiding taxonomy (Wendzel et al., 2015), such as value modulation, sequence/ordering, or inter-packet times. Learning the pattern generalises better than memorising individual tricks.',
    seeAlso: ['Covert channel', 'Carrier']
  },
  {
    term: 'Permutation capacity',
    definition: 'The information a permutation of n distinguishable events can carry: ⌊log₂(n!)⌋ bits. It sets the ceiling for ordering-based channels such as packet order and HTTP header order.',
    seeAlso: ['Capacity', 'Covert storage channel']
  },
  {
    term: 'Inference channel',
    definition: 'Information leaked by metadata, aggregates, or operational records that were never intended to carry a message — for example, patterns in circulation or routing logs. Related to covert channels but often unintended, and a privacy risk in its own right.',
    seeAlso: ['Covert channel', 'Data minimisation']
  },
  {
    term: 'Data minimisation',
    definition: 'Collecting and retaining only the data a task requires, for only as long as needed. A core privacy practice that also removes many inference and covert channels in records: you cannot leak, or be compelled to disclose, what you never kept.',
    seeAlso: ['Inference channel']
  },
  {
    term: 'On/off keying (OOK)',
    definition: 'The simplest form of amplitude modulation: the carrier is switched fully on for one symbol and fully off for the other, so a lit emitter is a 1 and a dark one is a 0. It is the encoding used by the air-gap optical module in this exhibit.',
    seeAlso: ['Air-gap covert channel', 'Matched filter', 'Encoding']
  },
  {
    term: 'Matched filter',
    definition: 'A receiver that correlates the incoming signal with the known shape of the transmitted symbol; for a rectangular pulse this is simply averaging the samples across the symbol. Averaging N independent noise samples reduces the noise by a factor of the square root of N while leaving the signal untouched — the processing gain that makes a faint carrier readable.',
    seeAlso: ['On/off keying (OOK)', 'Bit-error rate (BER)', 'Baseline']
  },
  {
    term: 'Air-gap covert channel',
    definition: 'A channel between machines with no network connection between them, carried by a physical medium instead: light from an indicator LED, heat, fan or drive noise, power-line draw, or stray electromagnetic emission. Air-gapping removes the network but not physics.',
    seeAlso: ['Carrier', 'On/off keying (OOK)', 'Covert channel']
  },
  {
    term: 'Bit-error rate (BER)',
    definition: 'The fraction of transmitted bits the receiver recovers incorrectly. It is the reliability axis of the capacity/reliability/observability trade-off, and it rises as noise rises — every channel module in this exhibit reports its measured BER.',
    seeAlso: ['Capacity', 'Observability', 'Jitter']
  },
  {
    term: 'Flush+Reload',
    definition: 'A shared-cache attack in which the receiver flushes one specific cache line, waits, then reloads it and times the load: a fast reload means someone else touched that line in the interval. It requires a page mapped by both parties, typically a shared library (Yarom & Falkner, 2014).',
    seeAlso: ['Prime+Probe', 'Cache side channel', 'Shared Resource Matrix']
  },
  {
    term: 'Prime+Probe',
    definition: 'A shared-cache attack that needs no shared memory: the receiver fills a cache set with its own lines, waits, then re-walks the set and times it. A slow walk means the other party used that set and evicted something. Note the polarity is the opposite of Flush+Reload (Osvik, Shamir & Tromer, 2006).',
    seeAlso: ['Flush+Reload', 'Cache side channel', 'Shared Resource Matrix']
  },
  {
    term: 'Cache side channel',
    definition: 'A channel that carries information through the presence or absence of data in a shared CPU cache, read by timing memory accesses. Neither party writes to the other; they simply contend for one shared hardware resource, which makes it the concrete case of the shared-attribute criterion in the Shared Resource Matrix.',
    seeAlso: ['Flush+Reload', 'Prime+Probe', 'Covert timing channel', 'Shared Resource Matrix']
  },
  {
    term: 'Detectability index (d-prime)',
    definition: 'How many standard deviations of noise separate two signal classes, computed as the distance between their means divided by the pooled within-class standard deviation. A large value means a threshold receiver can tell the two classes apart almost perfectly — which is what both a covert receiver and a defender are measuring.',
    seeAlso: ['Bit-error rate (BER)', 'Anomaly', 'Baseline']
  },
];
