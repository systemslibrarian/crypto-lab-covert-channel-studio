/**
 * caseStudies.js — real, documented incidents mapped onto this lab's modules.
 *
 * The exhibit teaches mechanisms. This section closes the loop by asking, of
 * five publicly documented cases: which carrier was it, which module here
 * models it, and WHICH NAMED STATISTIC in this lab would have fired?
 *
 * Three rules govern what is in here, because a case-study page about covert
 * channels could easily become an operational one:
 *
 *   1. Mapping only. No indicators of compromise, no tooling, no configuration,
 *      no reproduction steps. Each entry says what the carrier was and what a
 *      defender could have measured — the same defensive framing as every other
 *      section.
 *   2. Public sources only, named inline, and nothing asserted beyond them.
 *   3. The honest limits are part of the entry, not a footnote. Every case has
 *      a `caveat` saying what the matching detector would NOT have told you.
 *
 * The set is also chosen to make a distinction the rest of the lab only gestures
 * at: a SIDE channel leaks because of how a system is built, while a COVERT
 * channel is somebody deliberately signalling. Spectre is the first repurposed
 * as the second; printer tracking dots are neither, and are the more unsettling
 * for it.
 *
 * Pure data (no imports, no DOM, no side effects).
 */

export const CASE_INTRO = 'Five documented cases, each mapped to the module that models its carrier and to the specific statistic in this lab that speaks to it. The point is not that these detectors would have solved these cases — several ran for months against well-resourced defenders. It is that each one leaves a measurable trace of a kind you have now computed by hand.';

export const CASE_STUDIES = [
  {
    id: 'oilrig',
    name: 'OilRig DNS-tunnelling toolset',
    when: 'documented from 2016 onward',
    source: 'Palo Alto Networks Unit 42, "DNS Tunneling in the Wild: Overview of OilRig’s DNS Tunneling"',
    intent: 'deliberate',
    carrier: 'Data encoded into specially crafted subdomain labels, with the resolver’s answers carrying the return path — a request/response channel built entirely out of ordinary name lookups.',
    labModule: { section: 'dns', label: 'DNS Channel' },
    patternName: 'Payload-carrying, so outside the network hiding-pattern catalog',
    wouldFire: [
      'Character-frequency divergence (Born & Gustafson) — encoded labels do not have the character mix of hostnames',
      'Average label length and label entropy',
      'Unique-subdomain ratio: a tunnel almost never repeats a name, because repeats would be answered from cache',
    ],
    caveat: 'Only if DNS was being logged at the resolver at all. The reason this family worked for years is not that the traffic was invisible — it is that outbound DNS is frequently the one protocol nobody keeps records of.',
  },
  {
    id: 'pingback',
    name: 'Pingback backdoor',
    when: '2021',
    source: 'Trustwave SpiderLabs, "Backdoor At The End Of The ICMP Tunnel"',
    intent: 'deliberate',
    carrier: 'Command-and-control carried in ICMP echo messages. ICMP has no ports and is neither TCP nor UDP, and is commonly permitted outbound, so the traffic passes filters that reason about ports.',
    labModule: { section: 'icmp', label: 'ICMP Echo Channel' },
    patternName: 'Echo data area is payload (outside the catalog); the signalling used fixed sequence numbers',
    wouldFire: [
      'Fill-pattern conformance — the data area stops being the fixed incrementing bytes an ordinary ping sends',
      'Sequence-step fraction — Trustwave reports the malware used only the sequence numbers 1234, 1235 and 1236, so the "does the sequence increment by one" statistic collapses toward zero rather than sitting at 100%',
      'Per-destination pivot, since the echoes went to one peer',
    ],
    caveat: 'This is the case where the lab’s detector maps most directly onto reported behaviour — and it is worth noticing that the giveaway is the SEQUENCE field, not the payload. A defender watching only payload entropy would have learned nothing, which is the same trap the ICMP module is built around.',
  },
  {
    id: 'spectre',
    name: 'Spectre and Meltdown',
    when: '2018',
    source: 'Kocher et al., "Spectre Attacks: Exploiting Speculative Execution"; Lipp et al., "Meltdown: Reading Kernel Memory from User Space"',
    intent: 'side channel used as a covert channel',
    carrier: 'Speculative execution reads data the program was never allowed to read. That data cannot be returned directly — so it is encoded into which cache line gets touched, and recovered by timing reloads. The cache channel is how the secret gets OUT.',
    labModule: { section: 'cache', label: 'Shared-Cache Channel' },
    patternName: 'Not a network pattern at all — a micro-architectural resource, the concrete case of the Shared-Resource Matrix',
    wouldFire: [
      'Access-class balance — the transmitting side uses its fast and slow classes about equally, where ordinary code has locality and mostly hits',
      'Hit/miss separation (d′) — a channel meant to be read reliably keeps its two classes cleanly apart',
    ],
    caveat: 'None of this is visible at the network layer, and the lab’s network detectors are structurally blind to it — the same point the Active Warden lab makes when the shared-cache row refuses to move. This is also the cleanest example of the side-channel/covert-channel distinction: the cache leak is a property of the hardware, and the attack is somebody deliberately modulating it.',
  },
  {
    id: 'printer-mic',
    name: 'Printer tracking dots (Machine Identification Code)',
    when: 'developed by Xerox and Canon in the mid-1980s; public awareness from 2004',
    source: 'Electronic Frontier Foundation, "Investigating Machine Identification Code Technology in Color Laser Printers"',
    intent: 'unintentional from the user’s side; deliberate from the manufacturer’s',
    carrier: 'Many colour laser printers add a near-invisible grid of yellow dots to every page, encoding the device serial number and a timestamp. The carrier is the printed page itself.',
    labModule: { section: 'metadata', label: 'Library Records' },
    patternName: 'A watermark in output nobody asked for — the physical cousin of an unintended inference channel',
    wouldFire: [
      'Nothing in this lab. There is no detector here for it, and that is the entry’s purpose.',
    ],
    caveat: 'This is the case that does not fit. Nobody using the printer chose to signal anything, and no statistic in this exhibit would find it, because the channel is not in the traffic — it is in the artefact, added by the manufacturer. It belongs here as the boundary of the whole frame: a channel can be deliberate at one layer, invisible at another, and carry identifying data about a person who never consented to it. That is the same privacy argument the Library Records module makes, in hardware.',
  },
  {
    id: 'dns-c2-families',
    name: 'DNS as a C2 carrier, more broadly',
    when: 'recurring; documented across many campaigns',
    source: 'MITRE ATT&CK T1071.004 (Application Layer Protocol: DNS); families observed using DNS for command and control have been reported by several vendors independently — DarkHydrus and xHunt by Palo Alto Unit 42, SUNBURST by FireEye/Mandiant, Decoy Dog by Infoblox Threat Intelligence',
    intent: 'deliberate',
    carrier: 'The same carrier as OilRig, reached independently by many actors — which is the observation worth keeping.',
    labModule: { section: 'dns', label: 'DNS Channel' },
    patternName: 'Payload-carrying, outside the catalog',
    wouldFire: [
      'The same DNS statistics, with the same caveat about needing resolver logs',
      'Inter-arrival regularity, where the implant beacons on a timer rather than following human browsing',
    ],
    caveat: 'That a technique keeps being rediscovered is a statement about incentives, not sophistication: DNS is allowed out, rarely logged, and universally available. Enumerating carriers by how ATTRACTIVE they are, rather than by how clever they are, is the more useful defensive habit.',
  },
];

/**
 * What the case set does NOT contain, stated plainly. Several modules in this
 * lab have little or no documented in-the-wild incident record, and that
 * absence is informative rather than embarrassing.
 */
export const CASE_GAPS = {
  title: 'The modules with no case study',
  body: 'Inter-packet timing, packet ordering and protocol hopping have a large research literature and very little public incident reporting. The honest reading is not that they are undetectable — it is that they are impractical: they carry a few bits per event, they break under ordinary network conditions, and an operator who can already reach DNS or ICMP has no reason to accept that cost. Capacity and reliability are not academic axes on a chart; they are why some of the most elegant channels in this exhibit are the ones nobody appears to use.',
};
