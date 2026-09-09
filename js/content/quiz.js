/*
 * Covert Channel Studio — Quiz content
 * Multiple-choice items for the exhibit's self-check quiz.
 * Each item reinforces the exhibit's core distinctions:
 * storage vs timing channels, protocol-shaped tunneling,
 * steganography, and plain encryption. Educational simulation only.
 */

export const QUIZ = [
  {
    id: 'timing-vs-content',
    question:
      'Two receivers get an identical stream of packets. The bytes in every packet are byte-for-byte the same, but the sender inserts a short pause before some packets and a long pause before others, and those pauses spell out a hidden message. What kind of covert channel is this?',
    choices: [
      'A storage channel, because the message is stored in the packet bytes',
      'A timing channel, because the information lives in WHEN packets arrive, not in their contents',
      'Steganography, because the message is hidden inside an image',
      'Not a covert channel at all, because the packet contents never change'
    ],
    answerIndex: 1,
    explanation:
      'When the payloads are identical, nothing in the value carries the message — the only thing that varies is the delay between events, so the information is encoded in time. This is the defining example of a covert TIMING channel and the cleanest way to see why the exhibit separates timing from storage: a storage channel would need some field value to differ, while here only the schedule of arrivals differs.'
  },
  {
    id: 'field-parity-storage',
    question:
      'A sender encodes one hidden bit per packet by choosing values for a protocol header field so that the field is always even when the bit is 0 and always odd when the bit is 1. The receiver reads the bit from the parity of that field. This is an example of:',
    choices: [
      'A timing channel, because parity changes over time',
      'A covert storage channel, because the bit lives in a field VALUE',
      'An ordinary encrypted tunnel, because the field is scrambled',
      'A packet-ordering channel, because parity depends on order'
    ],
    answerIndex: 1,
    explanation:
      'Parity is just a property of a stored value: the bit is recoverable from the field itself in a single packet, with no reference to timing or arrival order. That makes it a covert STORAGE channel. The exhibit highlights this because parity is a subtle carrier — the field still looks like a normal, valid value — which shows that a storage channel does not require an obviously wrong or unusual value, only an unintended one.'
  },
  {
    id: 'nat-breaks-storage',
    question:
      'A covert storage channel hides bits in the value of a header field. The traffic passes through a NAT device or other middlebox that normalizes or rewrites that field. What is the most likely result?',
    choices: [
      'The hidden bits survive, because NAT only changes IP addresses',
      'The channel can break, because the middlebox may overwrite the exact field carrying the hidden information',
      'The channel becomes a timing channel instead',
      'Nothing changes, because middleboxes never touch header fields'
    ],
    answerIndex: 1,
    explanation:
      'A storage channel depends on a specific field value reaching the receiver unchanged. A NAT or middlebox that rewrites or normalizes that field simply overwrites the carrier, destroying the encoded bits. The exhibit uses this to illustrate the reliability corner of the capacity/reliability/observability triangle: storage channels are fragile against any device that legitimately edits the field they borrow.'
  },
  {
    id: 'timing-fails-internet',
    question:
      'A timing channel works perfectly in a controlled lab. Why might the same channel become unreliable or fail across the real Internet?',
    choices: [
      'Encryption on the path rewrites the timestamps',
      'Jitter, buffering, congestion, scheduling delays, and packet loss distort the gaps between events',
      'Routers refuse to forward packets that arrive at irregular intervals',
      'Timing channels are illegal on public networks and get blocked'
    ],
    answerIndex: 1,
    explanation:
      'A timing channel encodes information in precise inter-arrival gaps, but real paths add jitter, queue and buffer packets, reorder or drop them, and schedule delivery unpredictably. All of that noise smears the carefully constructed delays, so the receiver can misread bits. This is why the exhibit treats timing channels as low-reliability and low-throughput compared with storage channels in noisy environments.'
  },
  {
    id: 'https-not-automatically-covert',
    question:
      'Does using encrypted HTTPS automatically turn ordinary web traffic into a covert channel?',
    choices: [
      'Yes, because anything encrypted is by definition covert',
      'Yes, because an observer cannot read the payload',
      'No, because encryption hides the CONTENT, while a covert channel is about using an unintended mechanism or hiding the existence or purpose of the communication',
      'No, because HTTPS is too slow to carry hidden data'
    ],
    answerIndex: 2,
    explanation:
      'HTTPS conceals what is being said, but an observer can still readily see that HTTPS is happening, to which host, and roughly how much — the existence and shape of the communication are plain. A covert channel is defined by carrying information through a mechanism not intended for it, or by concealing that communication is occurring at all. The exhibit keeps this distinction sharp: encryption hides content, which is not the same as hiding the channel.'
  },
  {
    id: 'dns-label-entropy',
    question:
      'A defender notices a stream of DNS queries whose subdomain labels look like long, high-entropy strings of seemingly random characters, changing with almost every query. Why is this a useful detection signal for protocol-shaped tunneling?',
    choices: [
      'Normal DNS names tend to be short and human-meaningful, so long high-entropy labels and huge query volume can indicate data being packed into the names',
      'DNS is encrypted, so any readable label is automatically malicious',
      'High-entropy labels prove the traffic is a timing channel',
      'DNS can never legitimately use random-looking names, so any such name is an attack'
    ],
    answerIndex: 0,
    explanation:
      'When DNS is abused as a carrier, data gets packed into the query names, producing labels that are longer and more random-looking than typical human-chosen hostnames, often at high volume to one zone. Entropy and volume are therefore probabilistic clues, not proof — some legitimate services use random-looking names too. The exhibit frames DNS tunneling as protocol-shaped tunneling and stresses that detection here is statistical, not certain.'
  },
  {
    id: 'capacity-vs-observability',
    question:
      'A covert channel operator pushes as many hidden bits per second as possible to maximize capacity. What is the usual consequence for the other corners of the tradeoff triangle?',
    choices: [
      'Capacity, reliability, and observability all improve together',
      'Higher capacity typically raises observability and can lower reliability, because the traffic stands out more and leaves less margin for error',
      'It has no effect, because the corners are independent',
      'Reliability increases, because more bits means more error correction'
    ],
    answerIndex: 1,
    explanation:
      'Cramming more information through a channel makes it deviate further from normal traffic (more, larger, or oddly timed events), which raises the chance a defender notices, and it often leaves less slack to absorb noise, hurting reliability. The exhibit centers this capacity vs reliability vs observability tension precisely because there is no free lunch: gains in one corner usually cost you in another.'
  },
  {
    id: 'stego-vs-network-channel',
    question:
      'Hiding a message in the least-significant bits of an image differs from a network covert channel mainly in that:',
    choices: [
      'Steganography hides information inside the content of a carrier object (like an image), while a network channel hides information in protocol fields, timing, or ordering of traffic',
      'Steganography is always undetectable, while network channels are not',
      'Steganography requires encryption, while network channels never do',
      'They are the same thing with different names'
    ],
    answerIndex: 0,
    explanation:
      'Image LSB steganography embeds bits inside a piece of media so the file still looks like an ordinary picture, whereas a network covert channel embeds information in how traffic is structured, valued, timed, or ordered. The exhibit lists them as distinct categories so learners do not lump every hiding technique together: the carrier and the detection approach differ, even though both aim to conceal that a message exists.'
  },
  {
    id: 'detection-probabilistic',
    question:
      'The Detection Console flags suspicious traffic using statistics like entropy, timing regularity, and query volume. Why does the exhibit describe detection as probabilistic rather than certain?',
    choices: [
      'Because the console is a simulation and real tools always give definite answers',
      'Because these signals shift the likelihood of a covert channel but can also be produced by legitimate traffic, so results are evidence, not proof',
      'Because covert channels are undetectable, so any flag is a guess',
      'Because detection only works if you already know the secret key'
    ],
    answerIndex: 1,
    explanation:
      'Indicators such as high label entropy or unusually regular timing raise or lower suspicion, but benign systems can trigger the same signals, so a flag is evidence to investigate, not a verdict. The exhibit deliberately avoids words like undetectable and instead teaches defenders to reason with probabilities and false positives — a channel can be subtle without being impossible to spot.'
  },
  {
    id: 'cover-traffic',
    question:
      'A designer mixes hidden signaling into a large amount of ordinary-looking "cover traffic." What is the intended effect, and what is the cost?',
    choices: [
      'It makes the channel mathematically undetectable at no cost',
      'It lowers observability by blending signal into normal activity, but usually reduces effective capacity and adds overhead',
      'It increases capacity for free because there is more traffic',
      'It converts a storage channel into a timing channel'
    ],
    answerIndex: 1,
    explanation:
      'Cover traffic hides the signal among plausible, everyday events so it stands out less to an observer, reducing observability. The price is that most of the traffic carries no payload, so effective capacity drops and overhead rises. This is another face of the tradeoff triangle, and the exhibit notes that blending reduces — never eliminates — the chance of detection.'
  },
  {
    id: 'hopping-transition-tell',
    question:
      'A host encodes bits by choosing which protocol to speak next: each flow is a perfectly ordinary HTTPS, DNS, NTP, SMTP, or SSH flow, and the payload lives in the sequence of those choices. Which observation is most likely to expose it?',
    choices: [
      'Deep packet inspection of each flow, since one of them must contain the encoded payload',
      'That the transition matrix of protocol-to-protocol hops has an empty diagonal — the host never repeats a protocol, while real hosts are sticky',
      'An unusually high entropy in the payload bytes of the SSH flows',
      'The total volume of traffic, which must rise to carry the hidden bits'
    ],
    answerIndex: 1,
    explanation:
      'Nothing is wrong with any individual flow, so no per-packet inspector — no signature, no field check, no payload entropy test — can see anything: that is the whole point of the channel. The encoding must change protocol on every hop to stay decodable, which forces the diagonal of the transition matrix to be exactly empty, while ordinary hosts spend long runs on one protocol. The tell is a property of the SEQUENCE, not of any packet, and because it is forced by the encoding rather than estimated it holds up on small samples. Capacity is also tiny here, so volume barely moves.'
  },
  {
    id: 'hopping-pivot',
    question:
      'The same protocol-hopping channel is running, but its flows are mixed into a busy host\'s ordinary traffic. Aggregated across the whole host, the transition statistics look completely normal. What should the analyst do?',
    choices: [
      'Conclude the channel has stopped, since the aggregate statistics are clean',
      'Group the traffic by peer and re-run the statistics on each conversation separately',
      'Increase the observation window until the aggregate becomes anomalous',
      'Switch to inspecting packet payloads, since the sequence view has been exhausted'
    ],
    answerIndex: 1,
    explanation:
      'The covert walk all goes to one rendezvous peer, because the receiver has to be able to tell which flows are the channel. Ordinary traffic to other peers refills the diagonal and washes the signal out of any host-level average, so more observation of the aggregate does not help — the dilution is not a sampling problem. Grouping by conversation restores the signal immediately. The exhibit surfaces both views side by side to make that gap visible, and it is also why the cover-traffic slider does not move the anomaly score.'
  },
  {
    id: 'icmp-entropy-wrong-statistic',
    question:
      'A defender proposes flagging ICMP echo requests whose payload entropy is high, reasoning that encoded data looks random. Why does this statistic fail on ICMP specifically?',
    choices: [
      'ICMP payloads are encrypted, so entropy is always high',
      'A conventional ping fills its data area with an incrementing run of distinct bytes, whose entropy is already near-maximal — so entropy cannot separate it from message data',
      'ICMP payloads are too short for entropy to be computed at all',
      'Entropy only works on timing data, never on payload bytes'
    ],
    answerIndex: 1,
    explanation:
      'The reflex is to reach for entropy, and on ICMP it measures the wrong property. Ordinary ping fills the data area after its timestamp with a fixed incrementing pattern of distinct bytes, so its Shannon entropy is higher than plenty of real message data. What actually distinguishes them is that the conventional fill is PREDICTABLE and IDENTICAL in every echo — a structural test rather than a statistical one. The exhibit keeps this case because it is a clean example of a plausible statistic that measures something other than what the analyst intended.'
  },
  {
    id: 'icmp-two-carriers',
    question:
      'The ICMP module carries data two ways: message bytes in the echo data area, and one bit in the low bit of the Echo Identifier. A network deploys a normaliser that rewrites oversized payloads back to the conventional fill pattern. What happens?',
    choices: [
      'Both channels close, because both live inside the ICMP packet',
      'The data-area channel closes and the identifier channel keeps running untouched',
      'The identifier channel closes and the data-area channel keeps running untouched',
      'Neither closes, because a normaliser only inspects headers'
    ],
    answerIndex: 1,
    explanation:
      'The two carriers were paired precisely to make this point. Scrubbing the data area destroys the payload channel and does nothing at all to a bit hidden in a header field. The defence that closes the identifier channel is a different one — a NAT rewriting the Echo Identifier, which RFC 5508 requires so replies can be demultiplexed — and that in turn leaves the data area alone. No single normaliser closes ICMP, which is the general lesson: defences are carrier-specific, and enumerating the carriers has to come before choosing the control.'
  },
  {
    id: 'warden-disruption-not-detection',
    question:
      'An active warden normalises traffic at the network boundary and successfully closes several covert channels. What does the defender give up in exchange?',
    choices: [
      'Nothing — normalisation is a strictly better defence than detection',
      'Knowledge that anyone tried: when the channel is destroyed the anomaly indicator usually falls too, leaving no alert and no record of the attempt',
      'The ability to use encryption, since normalisation requires plaintext',
      'Reliability for legitimate users, but the defender still gets a full alert for every closed channel'
    ],
    answerIndex: 1,
    explanation:
      'Normalisation is disruption, not detection. Rewriting traffic to canonical form removes the degree of freedom the channel depended on, and with it the artifact a detector would have keyed on — so the attempt fails silently and nothing reaches an analyst. That is a genuine trade rather than a free win, which is why the Active Warden lab shows the anomaly score before and after in the same table. Detection and disruption are different defensive tools, and a defender who wants to know that someone tried needs both.'
  },
  {
    id: 'warden-out-of-path',
    question:
      'With every normaliser action switched on, the air-gap optical and shared-cache rows in the Active Warden lab do not move at all. Why?',
    choices: [
      'Those channels are too high-capacity for a normaliser to affect',
      'A normaliser rewrites packets on a network path, and neither of those carriers is on one — light across a room and cache occupancy inside one machine are not made of packets',
      'The simulation does not model those two channels under a warden',
      'They are encrypted, so the warden cannot read them to rewrite them'
    ],
    answerIndex: 1,
    explanation:
      'This is a structural blind spot, not a gap in the model. A network warden can only act on traffic that routes through it, and an air-gap optical channel carried by light, or a shared-cache channel carried by cache-line occupancy inside a single machine, never crosses that boundary. It is the exhibit\'s strongest argument against treating normalisation as a complete answer: it closes the channels that pass through it, is silent about the ones it closes, and cannot see the ones that do not.'
  },
  {
    id: 'residual-timing-channel',
    question:
      'A traffic shaper is applied to a covert timing channel. Its bit-error rate rises sharply but does not reach a coin flip. How should the defender describe the result?',
    choices: [
      'The channel is closed, because the error rate is now too high to be usable',
      'The channel is degraded but not closed — a residual channel remains, with real Shannon capacity C = 1 - H2(p) that ideal coding could still use',
      'The channel is unaffected, because shaping only changes latency',
      'The channel has become a storage channel, since timing no longer carries information'
    ],
    answerIndex: 1,
    explanation:
      'A shaper cannot delete a gap between packets, only blur it, so it raises the error rate without erasing the signal. Measuring what survives as Shannon capacity rather than as surviving goodput is the honest framing: the question is how much information could still cross with ideal coding, not how many bits happen to arrive intact. Timing channels degrade gracefully for this reason, and buying more suppression means buying more buffering and more latency for everyone — the one defence in the warden lab with an ongoing cost, and it still does not reach zero.'
  },
  {
    id: 'learned-detector-overfit',
    question:
      'A two-feature logistic regression is fitted on twelve labelled timing traces and separates them perfectly. What does that perfect score tell you about how it will perform in deployment?',
    choices: [
      'It will perform equally well, since the model has been validated on real data',
      'Very little on its own — the number that matters is how it scores on held-out cases, and especially on traffic drawn from a process it never saw',
      'It will perform better in deployment, because real traffic has more signal than training data',
      'Nothing can be said, because logistic regression cannot be evaluated'
    ],
    answerIndex: 1,
    explanation:
      'A score on the data a model was fitted to measures memorisation as much as generalisation, and two parameters over twelve cases are already enough to produce a gap between the fit score and a held-out score. The harder test is distribution shift: traffic from a generative process the model never saw, such as a scheduled poller that is clean but metronomic, or a channel with a narrower separation than any training case. The exhibit scores the hand-built detector on identical sets for the fair comparison — it was never fitted to anything, so it has nothing to shift away from, but it is also stuck with whatever weighting a person guessed.'
  },
  {
    id: 'side-vs-covert',
    question:
      'Cache timing leaks information about what a program touched, purely because of how the hardware is built \u2014 nobody chose to send anything. An attacker then deliberately arranges which cache lines get touched, so that a secret can be read out by timing reloads. What changed?',
    choices: [
      'Nothing changed; both are covert channels, since both leak information',
      'Nothing changed; both are side channels, since the mechanism is the same hardware',
      'It went from a SIDE channel to a COVERT channel: the leak was a by-product, and then someone deliberately modulated it in order to signal',
      'It went from a covert channel to a side channel, because the attacker no longer needs a receiver that knows the encoding'
    ],
    answerIndex: 2,
    explanation:
      'A side channel leaks as a by-product of doing the work \u2014 the information escapes whether or not anyone wants it to. A covert channel is somebody deliberately modulating a mechanism in order to signal, which means there is a sender, a receiver, and an agreed encoding. The same physics supports both, and Spectre is exactly the moment one becomes the other: cache timing already leaked, and the attack turns that leak into a transmitter. The distinction matters defensively because the remedies differ \u2014 you close a side channel by changing the system, and you catch a covert channel by noticing somebody using it.'
  },
  {
    id: 'pingback-sequence',
    question:
      'A reported ICMP backdoor carried command-and-control traffic in echo messages and reused only three sequence numbers. A defender watching payload entropy saw nothing unusual. Why not \u2014 and what would have spoken instead?',
    choices: [
      'Entropy was the right measure but the sample was too small; a longer capture would have shown it',
      'A conventional ping payload is already a high-entropy incrementing byte run, so entropy cannot separate it from data \u2014 but the sequence numbers no longer stepped by one',
      'ICMP payloads are encrypted, so entropy is always maximal and never informative',
      'Nothing would have spoken; an ICMP tunnel leaves no measurable trace'
    ],
    answerIndex: 1,
    explanation:
      'This is the trap the ICMP module is built around. The conventional fill is an incrementing run of DISTINCT bytes, so its Shannon entropy is already near the maximum for its length \u2014 higher than plenty of real message data. Entropy therefore separates nothing, and an entropy threshold can even flag benign ping while clearing a tunnel. What separates them is structure: ordinary ping repeats one identifier, one payload size, the same fill bytes, and a sequence that steps by one. A tool reusing a few fixed sequence numbers breaks that last property outright \u2014 and it is a statistic this lab already computes.'
  },
  {
    id: 'no-incident-record',
    question:
      'Inter-packet timing, packet ordering and protocol hopping have a large research literature but very little public incident reporting, while DNS carriers are rediscovered by campaign after campaign. What is the most defensible reading?',
    choices: [
      'The timing-style channels are undetectable, so incidents involving them are never found',
      'The research literature is wrong and those channels do not really work',
      'They are impractical rather than invisible: a few bits per event, fragile under ordinary network conditions, and pointless when DNS is already allowed out and rarely logged',
      'Incident reporting is classified, so no conclusion can be drawn at all'
    ],
    answerIndex: 2,
    explanation:
      'Absence of incident reporting is not evidence of undetectability \u2014 it is mostly evidence about incentives. The elegant low-capacity channels carry a handful of bits per event and collapse under jitter, reordering or loss, so an operator who can already reach DNS or ICMP has no reason to pay that cost. This is the capacity/reliability/observability triangle appearing as an operational fact rather than a chart, and it argues for enumerating carriers by how ATTRACTIVE they are rather than by how clever they are.'
  }
]
