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
  }
]
