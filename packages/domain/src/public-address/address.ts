/**
 * Classifying an IP address by how far it can be reached from.
 *
 * The question this answers is narrow on purpose: given an address, is it on
 * the public internet, or is it somewhere only a machine inside a network can
 * get to. Section 19 asks the fetcher to block private-network addresses, and
 * "private" there is not one range but a long tail of them -- loopback, the
 * cloud metadata link-local address, carrier-grade NAT, IPv6 forms that carry
 * an IPv4 address inside them. Every one of those is a way to point a fetch at
 * the machine doing the fetching, and a check that knows about ten of them and
 * not the eleventh is the same as no check at all.
 *
 * So the ranges are a table rather than a chain of conditions, each row naming
 * the RFC it comes from, and `classifyAddress` is total: every address gets a
 * verdict, and only the addresses that match no reserved range are `public`.
 * The default is the safe direction only because the table is complete, which
 * is why the test file asserts every row of it by name.
 *
 * `parseIpAddress` deliberately does NOT accept the obfuscated IPv4 spellings
 * -- `2130706433`, `0177.0.0.1`, `0x7f.0.0.1`, `127.1`. The WHATWG URL parser
 * has already normalised all of them to `127.0.0.1` before a hostname reaches
 * here, so accepting them again would mean carrying a second inet_aton, and a
 * second implementation of octal-with-a-leading-zero is precisely where this
 * class of bug lives. A leading zero in an octet is rejected outright for the
 * same reason: there is no spelling of it this module is willing to guess at.
 */

/** A parsed address. Numeric, so `::ffff:a00:1` and `::ffff:10.0.0.1` are one
 *  value rather than two strings that have to be compared as text. */
export type IpAddress =
  | { readonly family: "ipv4"; readonly octets: readonly number[] }
  | { readonly family: "ipv6"; readonly groups: readonly number[] };

/**
 * How far an address can be reached from.
 *
 * Finer than a boolean because the caller has to be able to say WHICH range it
 * refused -- "points at the cloud metadata service" and "points at a
 * documentation range" are different mistakes with different fixes, and an
 * error that says only "not public" leaves an editor guessing (section 37).
 */
export type AddressReach =
  | "public"
  | "unspecified"
  | "loopback"
  | "private"
  | "shared"
  | "link-local"
  | "unique-local"
  | "multicast"
  | "broadcast"
  | "documentation"
  | "benchmarking"
  | "reserved";

const IPV4_OCTETS = 4;
const IPV6_GROUPS = 8;
const OCTET_BITS = 8;
const GROUP_BITS = 16;

/** One reserved range. `base` carries only its significant leading parts; the
 *  rest are zero, because a row is easier to check against an RFC when it is
 *  written the way the RFC writes it. */
interface AddressRange {
  readonly base: readonly number[];
  readonly bits: number;
  readonly reach: AddressReach;
}

/**
 * IPv4 ranges that are not the public internet, first match winning.
 *
 * Ordered most-specific-first only where rows genuinely nest; the rest are in
 * numeric order so a reader can check the table against the RFCs by scanning
 * it. The prefix lengths are the whole point of several rows and are easy to
 * get wrong in the safe-looking direction, so the boundaries are asserted.
 */
const IPV4_RANGES: readonly AddressRange[] = [
  // Inside 240/4, and named separately because a limited broadcast is a real
  // destination a misconfigured fetcher can be pointed at.
  { base: [255, 255, 255, 255], bits: 32, reach: "broadcast" },
  // RFC 1122: "this host on this network". 0.0.0.0 also means "every local
  // interface" to a socket, which is how it becomes a way to reach loopback.
  { base: [0, 0, 0, 0], bits: 8, reach: "unspecified" },
  { base: [10, 0, 0, 0], bits: 8, reach: "private" },
  // RFC 6598 carrier-grade NAT. Also the range several container platforms
  // hand to pod networks, so it reaches neighbours, not only the internet.
  { base: [100, 64, 0, 0], bits: 10, reach: "shared" },
  // The WHOLE of 127/8, not 127.0.0.1: every address in it is the local host.
  { base: [127, 0, 0, 0], bits: 8, reach: "loopback" },
  // RFC 3927, and the single most valuable row here: 169.254.169.254 is the
  // cloud instance metadata service -- credentials to anyone who can make a
  // plain GET to it -- and 169.254.170.2 is the ECS task metadata endpoint.
  { base: [169, 254, 0, 0], bits: 16, reach: "link-local" },
  // RFC 1918, /12 and not /8. 172.15.255.255 and 172.32.0.0 are ordinary
  // public addresses, and a rule that blocks them is a rule that blocks news.
  { base: [172, 16, 0, 0], bits: 12, reach: "private" },
  // RFC 6890 IETF protocol assignments, which includes 192.0.0.8 and friends.
  { base: [192, 0, 0, 0], bits: 24, reach: "reserved" },
  { base: [192, 0, 2, 0], bits: 24, reach: "documentation" },
  // RFC 7526: 6to4 relay anycast, deprecated and still routed at.
  { base: [192, 88, 99, 0], bits: 24, reach: "reserved" },
  { base: [192, 168, 0, 0], bits: 16, reach: "private" },
  // RFC 2544, /15 and not /16: 198.20.0.0 is public.
  { base: [198, 18, 0, 0], bits: 15, reach: "benchmarking" },
  { base: [198, 51, 100, 0], bits: 24, reach: "documentation" },
  { base: [203, 0, 113, 0], bits: 24, reach: "documentation" },
  { base: [224, 0, 0, 0], bits: 4, reach: "multicast" },
  { base: [240, 0, 0, 0], bits: 4, reach: "reserved" },
];

/**
 * IPv6 ranges that are not the public internet, first match winning.
 *
 * The forms that embed an IPv4 address are handled before this table, because
 * their verdict depends on what they carry rather than on the prefix alone.
 */
const IPV6_RANGES: readonly AddressRange[] = [
  // RFC 6052 NAT64. The well-known prefix and the local-use /48 both mean "an
  // IPv4 destination reached through a translator", so whatever they carry the
  // address is a translator's business and not a source anyone can attribute.
  { base: [0x0064, 0xff9b], bits: 96, reach: "reserved" },
  { base: [0x0064, 0xff9b, 0x0001], bits: 48, reach: "reserved" },
  // RFC 6666 discard-only prefix: a black hole, deliberately.
  { base: [0x0100], bits: 64, reach: "reserved" },
  // Before Teredo below, though they do not overlap: 2001::/32 fixes the second
  // group at zero, and writing the documentation range first keeps the row a
  // reader is most likely to look for at the top of the 2001 block.
  { base: [0x2001, 0x0db8], bits: 32, reach: "documentation" },
  // RFC 4843 and RFC 7343 ORCHID: overlay identifiers, never routed.
  { base: [0x2001, 0x0010], bits: 28, reach: "reserved" },
  { base: [0x2001, 0x0020], bits: 28, reach: "reserved" },
  // RFC 4380 Teredo. It carries an IPv4 server and client address in its
  // bits, and is reserved whatever those turn out to be -- see below.
  { base: [0x2001, 0x0000], bits: 32, reach: "reserved" },
  { base: [0x2002], bits: 16, reach: "reserved" },
  // RFC 9602 SRv6 SIDs.
  { base: [0x5f00], bits: 16, reach: "reserved" },
  // RFC 4193 unique local, which is where fd00:ec2::254 -- the EC2 IPv6
  // instance metadata address -- lives.
  { base: [0xfc00], bits: 7, reach: "unique-local" },
  { base: [0xfe80], bits: 10, reach: "link-local" },
  // Deprecated site-local (RFC 3879), and it needs its own row: fec0::/10 is
  // NOT inside fe80::/10, so a check written against link-local alone lets
  // every site-local address through as public.
  { base: [0xfec0], bits: 10, reach: "reserved" },
  { base: [0xff00], bits: 8, reach: "multicast" },
];

/** True when `parts` and `base` agree on their first `bits` bits, reading
 *  `width` bits from each element and treating a missing element as zero. */
function sharesPrefix(
  parts: readonly number[],
  base: readonly number[],
  bits: number,
  width: number,
): boolean {
  let remaining = bits;
  let index = 0;
  while (remaining > 0) {
    const used = Math.min(width, remaining);
    const mask = (1 << width) - 1 - ((1 << (width - used)) - 1);
    if (((parts[index] ?? 0) & mask) !== ((base[index] ?? 0) & mask)) {
      return false;
    }
    remaining -= used;
    index += 1;
  }
  return true;
}

function parseIpv4(text: string): readonly number[] | null {
  const parts = text.split(".");
  if (parts.length !== IPV4_OCTETS) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    // A leading zero is octal to some resolvers and decimal to others, so the
    // same text names two different hosts. Refusing it is the only reading
    // that cannot be wrong.
    if (!/^(?:0|[1-9]\d{0,2})$/.test(part)) {
      return null;
    }
    const value = Number.parseInt(part, 10);
    if (value > 255) {
      return null;
    }
    octets.push(value);
  }
  return octets;
}

/** Colon-separated segments as 16-bit groups. A dotted segment is an embedded
 *  IPv4 address and is only legal as the last one. */
function segmentsToGroups(
  segments: readonly string[],
  lastMayBeIpv4: boolean,
): number[] | null {
  const groups: number[] = [];
  for (const [index, segment] of segments.entries()) {
    if (segment.includes(".")) {
      if (!lastMayBeIpv4 || index !== segments.length - 1) {
        return null;
      }
      const octets = parseIpv4(segment);
      if (octets === null) {
        return null;
      }
      groups.push(
        ((octets[0] ?? 0) << OCTET_BITS) | (octets[1] ?? 0),
        ((octets[2] ?? 0) << OCTET_BITS) | (octets[3] ?? 0),
      );
      continue;
    }
    // Four hex digits at most, which is what rejects a group above ffff: there
    // is no such group, and a parser that truncated one would be inventing an
    // address the author did not write.
    if (!/^[0-9a-f]{1,4}$/i.test(segment)) {
      return null;
    }
    groups.push(Number.parseInt(segment, 16));
  }
  return groups;
}

function parseIpv6(text: string): readonly number[] | null {
  const compressedAt = text.indexOf("::");
  // Two `::` runs make the expansion ambiguous, and an ambiguous address is
  // one this module would have to guess about.
  if (compressedAt !== text.lastIndexOf("::")) {
    return null;
  }
  const head = compressedAt === -1 ? text : text.slice(0, compressedAt);
  const tail = compressedAt === -1 ? "" : text.slice(compressedAt + 2);
  const headSegments = head === "" ? [] : head.split(":");
  const tailSegments = tail === "" ? [] : tail.split(":");
  const headGroups = segmentsToGroups(headSegments, tailSegments.length === 0);
  const tailGroups = segmentsToGroups(tailSegments, true);
  if (headGroups === null || tailGroups === null) {
    return null;
  }
  const present = headGroups.length + tailGroups.length;
  if (compressedAt === -1) {
    return present === IPV6_GROUPS ? headGroups : null;
  }
  // `::` stands for one group at minimum, so a full-length address may not
  // also carry one.
  if (present >= IPV6_GROUPS) {
    return null;
  }
  return [
    ...headGroups,
    ...Array.from({ length: IPV6_GROUPS - present }, () => 0),
    ...tailGroups,
  ];
}

/**
 * Accepts what the URL parser emits (`127.0.0.1`, `[::1]`) and what a DNS
 * resolver emits (`127.0.0.1`, `::1`). One optional bracket pair.
 *
 * Returns null for a NAME. NULL IS NOT A SAFETY VERDICT: `internal.corp` and
 * `evil.example` both parse to null, and so does every hostname that resolves
 * to a loopback address. A caller that reads null as "fine, it is a name" has
 * built the bypass. `classifyHostname` is the function that has an opinion
 * about names, and section 19's fetcher has to check what the name resolves to.
 */
export function parseIpAddress(text: string): IpAddress | null {
  const bracketed = text.startsWith("[");
  if (bracketed !== text.endsWith("]")) {
    return null;
  }
  const literal = bracketed ? text.slice(1, -1) : text;
  // A zone identifier is rejected rather than stripped. `fe80::1%eth0` is
  // meaningless without the interface it names, and dropping the suffix turns
  // an address nothing can route into one this module would happily classify.
  if (literal.includes("%")) {
    return null;
  }
  if (literal.includes(":")) {
    const groups = parseIpv6(literal);
    return groups === null ? null : { family: "ipv6", groups };
  }
  // Brackets are IPv6 notation. `[127.0.0.1]` is not an address anyone writes.
  if (bracketed) {
    return null;
  }
  const octets = parseIpv4(literal);
  return octets === null ? null : { family: "ipv4", octets };
}

function classifyIpv4(octets: readonly number[]): AddressReach {
  for (const range of IPV4_RANGES) {
    if (sharesPrefix(octets, range.base, range.bits, OCTET_BITS)) {
      return range.reach;
    }
  }
  return "public";
}

/** The IPv4 address an embedding form carries in its last two groups. */
function embeddedIpv4(groups: readonly number[]): readonly number[] {
  const high = groups[6] ?? 0;
  const low = groups[7] ?? 0;
  return [high >> OCTET_BITS, high & 0xff, low >> OCTET_BITS, low & 0xff];
}

function classifyIpv6(groups: readonly number[]): AddressReach {
  const matches = (base: readonly number[], bits: number): boolean =>
    sharesPrefix(groups, base, bits, GROUP_BITS);

  // Before ::/96 below, both of which they would otherwise fall into as an
  // embedded 0.0.0.0 or 0.0.0.1.
  if (matches([0, 0, 0, 0, 0, 0, 0, 0], 128)) {
    return "unspecified";
  }
  if (matches([0, 0, 0, 0, 0, 0, 0, 1], 128)) {
    return "loopback";
  }

  // The bypass family. The URL parser re-spells an embedded IPv4 address in
  // hex -- `[::ffff:169.254.169.254]` comes back as `[::ffff:a9fe:a9fe]` --
  // so a check that matched the dotted text would miss every one of these,
  // and the address it missed is the cloud metadata service.
  //
  // IPv4-mapped is the one form where a public embedded address stays public:
  // it is what a dual-stack resolver legitimately returns for an IPv4-only
  // host, so rejecting it would reject every such source. The rest are
  // transition and translation mechanisms; carrying a public address through
  // one is still not a way to name a publisher.
  if (matches([0, 0, 0, 0, 0, 0xffff], 96)) {
    return classifyIpv4(embeddedIpv4(groups));
  }
  if (matches([0, 0, 0, 0, 0xffff, 0], 96) || matches([0, 0, 0, 0, 0, 0], 96)) {
    const embedded = classifyIpv4(embeddedIpv4(groups));
    return embedded === "public" ? "reserved" : embedded;
  }

  for (const range of IPV6_RANGES) {
    if (matches(range.base, range.bits)) {
      return range.reach;
    }
  }
  return "public";
}

export function classifyAddress(address: IpAddress): AddressReach {
  return address.family === "ipv4"
    ? classifyIpv4(address.octets)
    : classifyIpv6(address.groups);
}

/** True only for an address on the public internet. Every other reach is a
 *  refusal, so a range added to the tables above is blocked by both functions
 *  or by neither. */
export function isPubliclyRoutable(address: IpAddress): boolean {
  return classifyAddress(address) === "public";
}
