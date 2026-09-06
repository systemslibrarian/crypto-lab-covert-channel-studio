// references.js — curated further-reading list for Covert Channel Studio.
// Real, verifiable primary sources grouped by category. URLs are best-effort
// canonical links; an empty string means no confident canonical URL is known.
// Pure data module: no imports, no DOM access, no side effects.

export const REFERENCES = [
  {
    category: 'Foundational concepts',
    items: [
      {
        title: 'A Note on the Confinement Problem',
        authors: 'Butler W. Lampson',
        year: 1973,
        venue: 'Communications of the ACM, 16(10)',
        note: 'The paper that named the covert channel problem, framing how a confined program can leak information through mechanisms never intended for communication — the core thesis of this exhibit.',
        url: 'https://doi.org/10.1145/362375.362389'
      },
      {
        title: 'Shared Resource Matrix Methodology: An Approach to Identifying Storage and Timing Channels',
        authors: 'Richard A. Kemmerer',
        year: 1983,
        venue: 'ACM Transactions on Computer Systems, 1(3)',
        note: 'Introduces the shared-resource-matrix method for systematically finding storage and timing channels, helping formalize the storage-versus-timing distinction this exhibit is organized around.',
        url: 'https://doi.org/10.1145/357369.357374'
      },
      {
        title: 'A Guide to Understanding Covert Channel Analysis of Trusted Systems (NCSC-TG-030, the "Light Pink Book")',
        authors: 'National Computer Security Center',
        year: 1993,
        venue: 'US Department of Defense Rainbow Series',
        note: 'The classic government guidance on identifying, measuring, and handling covert channels, including the bandwidth-estimation mindset behind the capacity/reliability/observability triangle.',
        url: 'https://irp.fas.org/nsa/rainbow/tg030.htm'
      }
    ]
  },
  {
    category: 'Standards (DNS & IP)',
    items: [
      {
        title: 'RFC 791: Internet Protocol',
        authors: 'Jon Postel (ed.)',
        year: 1981,
        venue: 'IETF RFC 791',
        note: 'Defines the IPv4 header fields (such as Identification and TTL) whose legitimate purposes the storage-channel section shows being repurposed to carry hidden values.',
        url: 'https://www.rfc-editor.org/rfc/rfc791'
      },
      {
        title: 'RFC 793: Transmission Control Protocol',
        authors: 'Jon Postel (ed.)',
        year: 1981,
        venue: 'IETF RFC 793',
        note: 'Specifies TCP fields and sequencing behavior, which grounds both the storage-channel examples and the packet-order channel in what the protocol actually intends.',
        url: 'https://www.rfc-editor.org/rfc/rfc793'
      },
      {
        title: 'RFC 1035: Domain Names - Implementation and Specification',
        authors: 'Paul Mockapetris',
        year: 1987,
        venue: 'IETF RFC 1035',
        note: 'The DNS message format, label rules, and length limits in this RFC explain exactly why the DNS-channel simulation must chunk and encode data into subdomain labels.',
        url: 'https://www.rfc-editor.org/rfc/rfc1035'
      },
      {
        title: 'RFC 2606: Reserved Top Level DNS Names',
        authors: 'Donald Eastlake 3rd, Aliza Panitz',
        year: 1999,
        venue: 'IETF RFC 2606 (BCP 32)',
        note: 'Reserves the .test TLD used throughout this exhibit, which is why the simulated domains can never resolve on the real Internet.',
        url: 'https://www.rfc-editor.org/rfc/rfc2606'
      }
    ]
  },
  {
    category: 'DNS tunneling & detection',
    items: [
      {
        title: 'Detecting DNS Tunnels Using Character Frequency Analysis',
        authors: 'Kenton Born, David Gustafson',
        year: 2010,
        venue: 'arXiv preprint arXiv:1004.4358',
        note: 'Shows that encoded tunnel labels have measurably different character statistics from ordinary hostnames, the same signal the Detection Console visualizes.',
        url: 'https://arxiv.org/abs/1004.4358'
      },
      {
        title: 'Detecting DNS Tunneling',
        authors: 'Greg Farnham',
        year: 2013,
        venue: 'SANS Institute Information Security Reading Room',
        note: 'A practitioner-oriented survey of payload and traffic-analysis indicators for DNS tunneling that maps closely onto the defender-side heuristics taught here.',
        url: ''
      },
      {
        title: 'Practical Comprehensive Bounds on Surreptitious Communication over DNS',
        authors: 'Vern Paxson, Mihai Christodorescu, Mobin Javed, Josyula Rao, Reiner Sailer, Douglas Schales, Marc Ph. Stoecklin, Kurt Thomas, Wietse Venema, Nicholas Weaver',
        year: 2013,
        venue: 'Proceedings of the 22nd USENIX Security Symposium',
        note: 'Demonstrates that defenders can bound how much information leaves via DNS, reinforcing the exhibit point that covert channels trade capacity against observability rather than escaping detection.',
        url: ''
      }
    ]
  },
  {
    category: 'Covert timing channels',
    items: [
      {
        title: 'IP Covert Timing Channels: Design and Detection',
        authors: 'Serdar Cabuk, Carla E. Brodley, Clay Shields',
        year: 2004,
        venue: 'Proceedings of the 11th ACM Conference on Computer and Communications Security (CCS)',
        note: 'A canonical study of encoding bits in packet inter-arrival times and of the regularity tests that expose them, mirroring both sides of the timing-channel simulation.',
        url: ''
      },
      {
        title: 'Detecting Covert Timing Channels: An Entropy-Based Approach',
        authors: 'Steven Gianvecchio, Haining Wang',
        year: 2007,
        venue: 'Proceedings of the 14th ACM Conference on Computer and Communications Security (CCS)',
        note: 'Uses entropy measures over inter-packet delays to separate covert timing traffic from legitimate traffic, the statistical idea behind the exhibit’s timing detector.',
        url: ''
      }
    ]
  },
  {
    category: 'Steganography',
    items: [
      {
        title: 'Information Hiding - A Survey',
        authors: 'Fabien A. P. Petitcolas, Ross J. Anderson, Markus G. Kuhn',
        year: 1999,
        venue: 'Proceedings of the IEEE, 87(7)',
        note: 'A widely cited taxonomy of information hiding that situates image steganography alongside covert channels, matching the category distinctions this exhibit draws.',
        url: 'https://doi.org/10.1109/5.771065'
      },
      {
        title: 'Steganography in Digital Media: Principles, Algorithms, and Applications',
        authors: 'Jessica Fridrich',
        year: 2009,
        venue: 'Cambridge University Press',
        note: 'The standard textbook on digital steganography and steganalysis, covering LSB embedding and the statistical attacks that motivate the image-steganography section.',
        url: ''
      }
    ]
  },
  {
    category: 'Defensive guidance',
    items: [
      {
        title: 'NIST SP 800-53 Rev. 5: Security and Privacy Controls for Information Systems and Organizations',
        authors: 'Joint Task Force, National Institute of Standards and Technology',
        year: 2020,
        venue: 'NIST Special Publication 800-53, Revision 5',
        note: 'Includes the Covert Channel Analysis control (SC-31, in the System and Communications Protection family), showing that covert-channel review is an established, standardized defensive practice rather than an exotic concern.',
        url: 'https://doi.org/10.6028/NIST.SP.800-53r5'
      },
      {
        title: 'MITRE ATT&CK Technique T1071.004: Application Layer Protocol: DNS',
        authors: 'The MITRE Corporation',
        year: 2020,
        venue: 'MITRE ATT&CK knowledge base',
        note: 'Documents real-world adversary abuse of DNS as a carrier protocol together with concrete detection and mitigation guidance for defenders.',
        url: 'https://attack.mitre.org/techniques/T1071/004/'
      }
    ]
  }
];
