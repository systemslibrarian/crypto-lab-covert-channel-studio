/**
 * content/copy.js — authored educational prose for each section.
 *
 * Content is structured DATA (arrays of "blocks"), not HTML strings, so the
 * renderer can build it with createElement/textContent and never touch
 * innerHTML. Supported block shapes are documented in views/blocks.js.
 *
 * Inline emphasis uses **bold** and `code` markers, parsed safely at render.
 */

export const COPY = {
  overview: {
    title: 'Covert Channel Studio',
    subtitle: 'Hidden communication in protocols, timing, and media',
    lede: 'A covert channel communicates information through a mechanism that was **not intended** to carry that information. This exhibit lets you build, break, and detect several classic kinds — entirely as a simulation inside your browser.',
    blocks: [
      { h: 'The one idea to take away' },
      'The hidden information does not have to live in the message field. It can live in a **field value**, in an **ordering**, in a **protocol’s structure**, or simply in **when** something happens. If the obvious payload looks innocent, information can still be hiding somewhere else in the observable behaviour.',
      { callout: {
        kind: 'key',
        title: 'Covert channel ≠ encryption ≠ tunnelling',
        body: 'Encryption hides the **content** of a message. A covert channel is about using an **unintended mechanism**, or hiding the very **existence or purpose** of the communication. An HTTPS or SSH tunnel may conceal content, yet it is usually easy to recognise *as* HTTPS or SSH — so it is better described as tunnelling than as a covert channel.',
      } },
      { h: 'Five ways to hide' },
      { cards: [
        { tag: 'STORAGE', text: 'Information hidden in a **value** (a header field, a parity bit).' },
        { tag: 'TIMING', text: 'Information hidden in **when** events occur (short vs long gaps).' },
        { tag: 'ORDERING', text: 'Information hidden in the **sequence** of otherwise identical events.' },
        { tag: 'PROTOCOL STRUCTURE', text: 'Information hidden in **names, lengths, or request patterns** — e.g. DNS labels.' },
        { tag: 'STEGANOGRAPHY', text: 'Information hidden **inside other content**, such as image pixels.' },
      ] },
    ],
  },

  dns: {
    title: 'DNS as a Covert Carrier',
    outcomes: [
      'explain how DNS **query structure** — not the payload — carries hidden data',
      'name the indicators a monitor uses (label length, character-frequency divergence, unique-name ratio, cadence)',
      'describe the capacity-vs-observability tension as you pack more per query',
    ],
    lede: 'DNS is everywhere and often crosses security boundaries, which is exactly why it is a classic carrier to study — and why enterprise defenders inspect it closely.',
    blocks: [
      'Every label you see below is **generated locally**. Nothing is resolved; no query leaves your browser. Names live under the reserved `.test` TLD (RFC 6761), so `example.test` can never resolve on the real Internet.',
      { h: 'Why DNS is interesting to study' },
      { ul: [
        'DNS is ubiquitous and usually allowed outbound, so it frequently crosses boundaries other traffic cannot.',
        'Labels can carry encoded data, and the request/response shape *looks* bidirectional.',
        'Because of this, defenders treat unusual DNS characteristics as worth investigating.',
      ] },
      { callout: {
        kind: 'note',
        title: 'DNS channel',
        body: 'The protocol is entirely legitimate; it is the **structure of the requests** — long, high-entropy labels funnelled under one domain at a steady cadence — that carries the hidden representation.',
      } },
    ],
    tension: 'More data per query (longer, denser labels) raises **capacity** but also raises **observability**: the labels get longer and look more random, which is precisely what a monitor measures.',
  },

  timing: {
    title: 'The Message Is in the Clock',
    outcomes: [
      'explain how identical packets carry bits purely in their **inter-arrival gaps**',
      'predict how jitter, noise, and loss raise the bit-error rate',
      'recognise the entropy/regularity signature a defender measures — and why it fades as jitter rises',
    ],
    lede: 'Here the packets can be identical. Nothing inside them changes. The bits are carried purely by the **gaps between arrivals**.',
    blocks: [
      { code: '0  →  short gap\n1  →  long gap' },
      { callout: {
        kind: 'note',
        title: 'Timing channel',
        body: 'The information is in **when** the event happens, not in what the event contains. A receiver who knows the timing rule reads the message; a defender may only notice that the timing looks unnaturally structured.',
      } },
      { h: 'Why timing channels are fragile' },
      'Real networks add jitter, buffering, congestion, scheduling delay, and packet loss. Every one of those perturbs the gaps. Turn up the jitter below and watch a perfect message degrade into errors — the fundamental weakness of timing channels made visible.',
    ],
  },

  storage: {
    title: 'Hiding Bits in Values',
    outcomes: [
      'encode bits in a protocol **field value** (IP-ID parity, TTL, TCP-seq low bit)',
      'explain why a NAT, proxy, or normaliser can silently destroy the channel',
      'see why a well-chosen parity channel evades a simple histogram — a false-negative lesson',
    ],
    lede: 'The classic covert storage channel hides bits in the **value** of a field that was never meant to carry a message. The packets look ordinary; a receiver who knows the rule reads one bit out of a chosen field.',
    blocks: [
      { callout: {
        kind: 'note',
        title: 'Storage channel',
        body: 'The information is in a **value**. Change the value and you change the message — which is also why anything on the path that rewrites that value can quietly destroy the channel.',
      } },
      { h: 'The middlebox lesson' },
      'A storage channel can be perfectly valid on paper and still fail in the real world. NATs rewrite IP identification fields, normalising firewalls rewrite TTLs, and proxies open fresh connections with new sequence numbers. Toggle a middlebox below and watch the recovered message fall apart even though every packet still "arrived".',
    ],
  },

  ordering: {
    title: 'The Message Is in the Order',
    outcomes: [
      'encode a bit in the **order** of two interchangeable events',
      'explain why network reordering makes the channel collapse',
    ],
    lede: 'A channel with no special value and no timing signature at all: the bit lives purely in the **order** of two otherwise interchangeable events.',
    blocks: [
      { code: 'A then B  →  0\nB then A  →  1' },
      'It is elegant — and brittle. The moment the network is allowed to reorder packets, which real networks do, the bits scramble. Raise the reordering probability and watch reliability collapse.',
    ],
  },

  http: {
    title: 'The Message Is in the Header Order',
    outcomes: [
      'compute how many bits a permutation of n headers can hold (⌊log₂ n!⌋)',
      'explain why a stable client "fingerprint" makes header-order variety suspicious',
      'connect the normalizing-proxy defence back to the storage-channel middlebox lesson',
    ],
    lede: 'A covert channel one layer up: the request looks completely normal, but the **order of its headers** carries the payload.',
    blocks: [
      { code: 'Accept, Accept-Language, Accept-Encoding, …\n↕ reorder these 6 headers\n6! = 720 orderings  →  ⌊log₂ 720⌋ = 9 bits per request' },
      { callout: {
        kind: 'note',
        title: 'HTTP header channel',
        body: 'A real client library emits its headers in a **stable, recognisable order** every request. Permuting a set of interchangeable headers hides bits while every individual header stays valid — a storage-style channel at the application layer.',
      } },
      { h: 'Why it is fragile' },
      'Any proxy, CDN, or gateway that **normalises** requests will re-sort the headers into a canonical order. That erases the arrangement — and with it the message — even though every request still arrives. Toggle the normalizing proxy below and watch it collapse, exactly like a NAT rewriting an IP field.',
    ],
  },

  stego: {
    title: 'Hidden in Plain Sight',
    outcomes: [
      'embed and recover a message in the **least-significant bits** of an image',
      'explain why lossy re-compression destroys the payload',
      'read the chi-square steganalysis attack and its limits on small payloads',
    ],
    lede: 'Steganography hides a payload **inside other content**. Here a short message rides in the least-significant bits of an image’s pixels, where a ±1 change in a colour value is invisible to the eye.',
    blocks: [
      { callout: {
        kind: 'note',
        title: 'Steganography',
        body: 'The carrier still looks like ordinary content. That is its strength — and steganography is related to, but not the same as, a live network covert channel: it is about a **carrier object**, not necessarily about traffic on the wire.',
      } },
      { h: 'The carrier must survive its journey' },
      'LSB data lives in exactly the bits that lossy compression throws away. Re-save the image with a lossy transform and the payload is gone. A channel is only useful if it survives whatever transformations its carrier undergoes.',
    ],
  },

  metadata: {
    title: 'The Message Is in the Records',
    outcomes: [
      'explain how routine metadata becomes an **unintended inference channel**',
      'connect covert channels to everyday privacy risk in operational logs',
      'apply data minimisation as a defence that removes the channel and the exposure',
    ],
    lede: 'Covert channels are not only a network idea. Ordinary operational **metadata** — records no one designed to carry a message — can be read as one. This is the exhibit a librarian would build.',
    blocks: [
      { code: 'Each item transfer is routed to a branch:\nCentral = 0     Riverside = 1\nThe routing pattern spells a message.' },
      { callout: {
        kind: 'note',
        title: 'Unintended-inference channel',
        body: 'No field here was meant to carry data. Routing a transfer is a mundane logistics choice — yet the **pattern** of choices is a storage-style channel, and an analyst reading the log does not need the encoding rule to notice the routing is not random.',
      } },
      { h: 'Why this matters beyond the trick' },
      'The deeper point is a privacy one. Circulation logs, hold queues, and interlibrary-loan requests are metadata generated by serving people — not a dossier. But aggregated and retained, that metadata reveals patterns it was never meant to expose. The same property that makes it a covert channel makes it a surveillance risk.',
      { callout: {
        kind: 'warn',
        title: 'The defence is minimisation',
        body: 'Keep only what you need for the operational task, and only as long as you need it. Toggle **data minimisation** below: collapse the per-record routing into daily aggregates and the hidden message — and much of the privacy exposure — simply disappears. You cannot leak, or be forced to disclose, what you never kept.',
      } },
    ],
  },

  detection: {
    title: 'Detection Console',
    lede: 'A defender rarely knows the hidden message. They look at the **shape** of the traffic and ask whether it is statistically or structurally unusual.',
    outcomes: [
      'read named, cited detector metrics across every channel',
      'explain why detection is probabilistic — what fired, why, and what else could cause it',
    ],
    blocks: [
      { callout: {
        kind: 'key',
        title: 'Detection is probabilistic',
        body: 'These indicators never say “covert channel detected.” They say **LOW / MODERATE / HIGH anomaly** and explain which observations contributed. A single entropy threshold or histogram is not a production detector — real analysis combines many weak signals and still investigates before concluding.',
      } },
      'Every indicator below states three things: **what was observed**, **why it may matter**, and **what else could cause it**. That last one is the whole reason detection is hard — benign traffic can trip the same wires.',
    ],
  },

  compare: {
    title: 'Compare Channels',
    lede: 'The same message can hide many ways, and the trade-offs differ sharply. This table ranks channels by teaching value, reliability in simulation, and what a defender can look for — **not** by how well they evade anyone.',
    blocks: [
      { note: 'ICMP, HTTPS, SSH, VoIP/RTP, and Wi-Fi are described conceptually. HTTPS and SSH tunnels conceal content but remain recognisable *as* HTTPS or SSH, so they are tunnelling rather than covert signalling.' },
    ],
  },

  concepts: {
    title: 'What Makes a Channel Covert?',
    outcomes: [
      'distinguish storage from timing, and covert channels from tunnels and encryption',
      'explain why an encrypted tunnel is usually **not** a covert channel',
      'reason about the capacity ↔ reliability ↔ observability trade-off',
    ],
    lede: 'Three distinctions do most of the work. Getting them straight is the point of the whole exhibit.',
    blocks: [
      { kv: [
        ['Content vs. existence', 'Encryption hides **content**. A covert channel can hide the **existence or purpose** of a communication relationship — or use a mechanism nobody expected to carry data.'],
        ['Tunnel vs. covert channel', 'A tunnel carries one protocol inside another. If it is still obviously that tunnel (recognisably HTTPS, SSH), it is not covert about its own existence — only about its payload.'],
        ['Storage vs. timing', 'The security literature’s classic split: is the information in a **value** (storage) or in **when** something happens (timing)? Storage channels are often reliable but rewritten by middleboxes; timing channels are subtle but fragile.'],
      ] },
      { h: 'Capacity ↔ Reliability ↔ Observability' },
      'Covert-channel designs live inside a triangle of trade-offs. Push one corner and the others move:',
      { ul: [
        'Higher **capacity** usually creates stronger statistical artefacts — easier to notice.',
        'Timing channels can be subtle (low observability) but are **fragile** (low reliability).',
        'Storage channels can be **reliable** until a middlebox rewrites the field they depend on.',
        'Steganography may survive copying but fail after a lossy transform.',
      ] },
      { callout: {
        kind: 'key',
        title: 'The sender needs the rule; the defender only needs suspicion',
        body: 'A receiver must know the exact encoding to recover the message. A defender does not — they may simply notice that the pattern is statistically unusual and start investigating. That asymmetry is why covert channels can be subtle **without** being undetectable.',
      } },
    ],
  },

  defense: {
    title: 'Defensive Takeaways',
    lede: 'What a defender actually carries away from this exhibit.',
    blocks: [
      { ol: [
        'Watch the **shape**, not just the payload: label length and entropy, inter-arrival structure, field-value distributions, request cadence, and ordering regularity.',
        'Combine weak indicators. No single statistic is a verdict; a bank of them, plus context, is how real detection works.',
        'Remember false positives. CDNs use random-looking hostnames; scheduled jobs beacon on a timer; busy users burst DNS. Every indicator here lists what else could cause it.',
        'Know your middleboxes. NAT, header normalisation, and proxies destroy many storage channels for free — detection and disruption are different defensive tools.',
        'Understand the limits. A well-chosen parity or low-bit channel barely disturbs a distribution, and a small payload in a noisy photo can hide beneath simple steganalysis. Absence of a signal is not proof of absence.',
      ] },
      { callout: {
        kind: 'warn',
        title: 'On precision',
        body: 'Nothing here is “undetectable” or “untraceable.” Covert channels trade **bandwidth for concealment** and leave observable artefacts. The honest framing is always the trade-off, never the absolute.',
      } },
    ],
  },
};

/** Short learning callouts reused as inline chips near each channel. */
export const CALLOUTS = {
  storage: { title: 'Storage channel', body: 'The information is in a value.' },
  timing: { title: 'Timing channel', body: 'The information is in when the event happens.' },
  dns: { title: 'DNS channel', body: 'The protocol is legitimate; the structure of the requests carries the hidden representation.' },
  ordering: { title: 'Ordering channel', body: 'The information is in the sequence, not the contents.' },
  http: { title: 'HTTP header channel', body: 'Every header is valid; the order they appear in carries the bits.' },
  metadata: { title: 'Metadata channel', body: 'Records never meant as a message can still carry — and leak — one.' },
  stego: { title: 'Steganography', body: 'The carrier still looks like ordinary content.' },
  defender: { title: 'Defender', body: 'The receiver needs the encoding rule. The defender may only need to notice that the pattern is statistically unusual.' },
};
