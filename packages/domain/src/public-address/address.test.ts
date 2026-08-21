/**
 * What counts as an address on the public internet.
 *
 * This file is the specification, not a description of the implementation.
 * Every reserved range the module knows about is asserted here by name,
 * because the module's default is `public` and a row quietly missing from its
 * table would produce no failure anywhere else -- it would produce a fetcher
 * that reaches the machine it runs on.
 *
 * Three kinds of claim, and all three are needed:
 *
 * - the ranges, so nothing reserved is called public;
 * - the boundaries, because `172.16/12` is not `172/8` and `198.18/15` is not
 *   `198.18/16`, and a check written one bit too wide silently blocks real
 *   publishers while a check one bit too narrow lets a private network through;
 * - the controls, because a predicate that returns false for everything passes
 *   every test in the first two groups and makes the product unable to fetch
 *   anything at all.
 */
import { describe, expect, it } from "vitest";
import type { AddressReach, IpAddress } from "./address";
import { classifyAddress, isPubliclyRoutable, parseIpAddress } from "./address";

function parsed(text: string): IpAddress {
  const address = parseIpAddress(text);
  if (address === null) {
    throw new Error(`${text} did not parse, so no claim below means anything`);
  }
  return address;
}

function reachOf(text: string): AddressReach {
  return classifyAddress(parsed(text));
}

function groupsOf(text: string): readonly number[] {
  const address = parsed(text);
  if (address.family !== "ipv6") {
    throw new Error(`${text} parsed as IPv4`);
  }
  return address.groups;
}

describe("parsing an address", () => {
  it("accepts both spellings a caller can be handed", () => {
    // The URL parser brackets an IPv6 host and a resolver does not, and the two
    // have to produce the same value or the classification depends on which
    // code path found the address.
    expect(parseIpAddress("[::1]")).toEqual(parseIpAddress("::1"));
    expect(parseIpAddress("[2001:db8::1]")).toEqual(
      parseIpAddress("2001:db8::1"),
    );
    expect(parseIpAddress("127.0.0.1")).toEqual({
      family: "ipv4",
      octets: [127, 0, 0, 1],
    });
  });

  it("reads hex in either case, since a resolver answer is not lowercased", () => {
    expect(groupsOf("[::FFFF:7F00:1]")).toEqual(groupsOf("::ffff:7f00:1"));
  });

  it("expands :: at the start, in the middle, at the end, and alone", () => {
    expect(groupsOf("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(groupsOf("2001:db8::1")).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
    expect(groupsOf("fe80::")).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 0]);
    expect(groupsOf("::")).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(groupsOf("1:2:3:4:5:6:7:8")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("rejects an address it would have to guess about", () => {
    // Two runs of :: have more than one expansion, and a group of five hex
    // digits is not a group. Either one could be resolved by picking a reading,
    // and a security check that picks a reading is one an attacker picks for.
    expect(parseIpAddress("::1::2")).toBeNull();
    expect(parseIpAddress("12345::")).toBeNull();
    expect(parseIpAddress("1:2:3:4:5:6:7")).toBeNull();
    expect(parseIpAddress("1:2:3:4:5:6:7:8:9")).toBeNull();
    expect(parseIpAddress("1:2:3:4:5:6:7:8::")).toBeNull();
    expect(parseIpAddress("::g")).toBeNull();
    expect(parseIpAddress("[::1")).toBeNull();
    // Brackets are IPv6 notation; nothing writes an IPv4 address in them.
    expect(parseIpAddress("[127.0.0.1]")).toBeNull();
  });

  it("rejects a zone identifier rather than stripping it", () => {
    // Stripping `%eth0` would turn an address that means nothing without the
    // interface it names into one this module would classify and a caller
    // would then act on.
    expect(parseIpAddress("fe80::1%eth0")).toBeNull();
    expect(parseIpAddress("[fe80::1%25eth0]")).toBeNull();
  });

  it("refuses every obfuscated IPv4 spelling instead of decoding it", () => {
    // The URL parser normalises all of these to 127.0.0.1 before a hostname
    // reaches this module, so decoding them here would mean carrying a second
    // inet_aton -- and the second implementation is the one that reads 0177 as
    // decimal, or reads 0x7f as a label, and disagrees with the first.
    for (const text of [
      "2130706433",
      "0177.0.0.1",
      "0x7f.0.0.1",
      "127.1",
      "010.0.0.1",
      "127.0.0.1.",
      "1.2.3",
    ]) {
      expect(parseIpAddress(text), text).toBeNull();
    }
  });

  it("rejects an octet above 255", () => {
    expect(parseIpAddress("256.0.0.1")).toBeNull();
    expect(parseIpAddress("1.2.3.999")).toBeNull();
    expect(parseIpAddress("255.255.255.255")).not.toBeNull();
  });

  it("returns null for a name, which is not a safety verdict", () => {
    // `internal.corp` parses to null and so does `evil.example`, and so would a
    // name that resolves to 127.0.0.1. A caller reading null as "a name, so
    // fine" has written the bypass; `classifyHostname` is what has an opinion.
    expect(parseIpAddress("internal.corp")).toBeNull();
    expect(parseIpAddress("localhost")).toBeNull();
    expect(parseIpAddress("")).toBeNull();
  });
});

/** Every IPv4 range the module refuses, each named by its CIDR. */
const IPV4_RANGE_CASES: readonly (readonly [string, string, AddressReach])[] = [
  ["0.0.0.0/8", "0.0.0.0", "unspecified"],
  ["0.0.0.0/8 above its first address", "0.255.255.254", "unspecified"],
  ["10/8", "10.0.0.1", "private"],
  ["100.64/10 shared address space", "100.64.0.1", "shared"],
  ["127/8, the whole /8 and not one address", "127.255.255.254", "loopback"],
  ["169.254/16 link-local", "169.254.0.1", "link-local"],
  ["172.16/12", "172.16.0.1", "private"],
  ["192.0.0/24 protocol assignments", "192.0.0.8", "reserved"],
  ["192.0.2/24 documentation", "192.0.2.10", "documentation"],
  ["192.88.99/24 6to4 relay anycast", "192.88.99.1", "reserved"],
  ["192.168/16", "192.168.1.1", "private"],
  ["198.18/15 benchmarking", "198.18.0.1", "benchmarking"],
  ["198.51.100/24 documentation", "198.51.100.7", "documentation"],
  ["203.0.113/24 documentation", "203.0.113.7", "documentation"],
  ["224/4 multicast", "224.0.0.1", "multicast"],
  ["240/4 reserved", "240.0.0.1", "reserved"],
  ["255.255.255.255 broadcast", "255.255.255.255", "broadcast"],
];

describe("IPv4 ranges that are not the public internet", () => {
  for (const [label, text, reach] of IPV4_RANGE_CASES) {
    it(`classifies ${label} as ${reach}`, () => {
      expect(reachOf(text)).toBe(reach);
      expect(isPubliclyRoutable(parsed(text))).toBe(false);
    });
  }

  it("names the cloud metadata addresses this rule mostly exists for", () => {
    // A plain GET to 169.254.169.254 returns instance credentials on every
    // major cloud, and 169.254.170.2 is the ECS task metadata endpoint. They
    // are ordinary members of 169.254/16 and are asserted separately because
    // they are the reason the /16 is in the table at all.
    expect(reachOf("169.254.169.254")).toBe("link-local");
    expect(reachOf("169.254.170.2")).toBe("link-local");
  });
});

describe("IPv4 prefix boundaries", () => {
  it("keeps 172.16/12 to a /12, so 172.15 and 172.32 stay public", () => {
    // Read as 172/8 -- the mistake that looks safer -- this would refuse every
    // publisher in two hundred thousand ordinary addresses.
    expect(reachOf("172.15.255.255")).toBe("public");
    expect(reachOf("172.32.0.0")).toBe("public");
    expect(reachOf("172.16.0.0")).toBe("private");
    expect(reachOf("172.31.255.255")).toBe("private");
  });

  it("keeps 100.64/10 to a /10, so 100.63 and 100.128 stay public", () => {
    expect(reachOf("100.63.255.255")).toBe("public");
    expect(reachOf("100.128.0.0")).toBe("public");
    expect(reachOf("100.64.0.0")).toBe("shared");
    expect(reachOf("100.127.255.255")).toBe("shared");
  });

  it("keeps 198.18/15 to a /15, so 198.20 stays public", () => {
    expect(reachOf("198.17.255.255")).toBe("public");
    expect(reachOf("198.20.0.0")).toBe("public");
    expect(reachOf("198.19.255.255")).toBe("benchmarking");
  });
});

/** Every IPv6 range the module refuses, each named by its CIDR. */
const IPV6_RANGE_CASES: readonly (readonly [string, string, AddressReach])[] = [
  ["::/128 unspecified", "::", "unspecified"],
  ["::1/128 loopback", "::1", "loopback"],
  ["64:ff9b::/96 NAT64", "64:ff9b::7f00:1", "reserved"],
  ["64:ff9b:1::/48 local-use NAT64", "64:ff9b:1::7f00:1", "reserved"],
  ["100::/64 discard-only", "100::1", "reserved"],
  ["2001::/32 Teredo", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "reserved"],
  ["2001:10::/28 ORCHID", "2001:10::1", "reserved"],
  ["2001:20::/28 ORCHIDv2", "2001:20::1", "reserved"],
  ["2001:db8::/32 documentation", "2001:db8::1", "documentation"],
  ["2002::/16 6to4", "2002:7f00:1::", "reserved"],
  ["5f00::/16 SRv6", "5f00::1", "reserved"],
  ["fc00::/7 unique-local", "fd00:ec2::254", "unique-local"],
  ["fe80::/10 link-local", "fe80::1", "link-local"],
  ["fec0::/10 deprecated site-local", "fec0::1", "reserved"],
  ["ff00::/8 multicast", "ff02::1", "multicast"],
];

describe("IPv6 ranges that are not the public internet", () => {
  for (const [label, text, reach] of IPV6_RANGE_CASES) {
    it(`classifies ${label} as ${reach}`, () => {
      expect(reachOf(text)).toBe(reach);
      expect(isPubliclyRoutable(parsed(text))).toBe(false);
    });
  }

  it("names fd00:ec2::254, the EC2 IPv6 metadata address", () => {
    expect(reachOf("fd00:ec2::254")).toBe("unique-local");
  });
});

describe("IPv6 prefix boundaries", () => {
  it("does not let fec0:: fall through the link-local check", () => {
    // fec0::/10 is a different /10 from fe80::/10, so a module that knows only
    // about link-local calls every deprecated site-local address public. It
    // needs its own row, and this is the assertion that says so.
    expect(reachOf("fec0::")).toBe("reserved");
    expect(reachOf("fe80::")).toBe("link-local");
    expect(reachOf("febf:ffff::1")).toBe("link-local");
  });
});

describe("IPv6 forms that carry an IPv4 address", () => {
  // Both spellings of each, because the hex form is the one the URL parser
  // actually produces: `[::ffff:169.254.169.254]` comes back out of `new URL`
  // as `[::ffff:a9fe:a9fe]`, and a check that pattern-matched the dotted text
  // would have missed the cloud metadata address every single time.
  const EMBEDDED: readonly (readonly [string, string, AddressReach])[] = [
    ["IPv4-mapped loopback", "::ffff:127.0.0.1", "loopback"],
    [
      "IPv4-mapped loopback, as the parser respells it",
      "::ffff:7f00:1",
      "loopback",
    ],
    ["IPv4-mapped private", "::ffff:10.0.0.1", "private"],
    ["IPv4-mapped private, respelled", "::ffff:a00:1", "private"],
    ["IPv4-mapped metadata", "::ffff:169.254.169.254", "link-local"],
    ["IPv4-mapped metadata, respelled", "::ffff:a9fe:a9fe", "link-local"],
    ["IPv4-compatible loopback", "::127.0.0.1", "loopback"],
    ["IPv4-compatible loopback, respelled", "::7f00:1", "loopback"],
    ["IPv4-translated loopback", "::ffff:0:127.0.0.1", "loopback"],
    ["IPv4-translated loopback, respelled", "::ffff:0:7f00:1", "loopback"],
  ];

  for (const [label, text, reach] of EMBEDDED) {
    it(`unwraps ${label} to ${reach}`, () => {
      expect(reachOf(text)).toBe(reach);
      expect(isPubliclyRoutable(parsed(text))).toBe(false);
    });
  }

  it("refuses a transition prefix whatever address it carries", () => {
    // 6to4, NAT64 and Teredo carry an IPv4 address that may be perfectly
    // public. Reaching a publisher through a translator is still not a way to
    // name that publisher, and the prefix is what is being refused.
    expect(reachOf("2002:0101:0101::1")).toBe("reserved");
    expect(reachOf("64:ff9b::1.1.1.1")).toBe("reserved");
    expect(reachOf("::1.1.1.1")).toBe("reserved");
  });
});

describe("controls", () => {
  // Without these, a classifier that answered "not public" to everything would
  // satisfy every assertion above and ship a product that can fetch nothing.
  it("calls an ordinary public IPv4 address public", () => {
    expect(reachOf("1.1.1.1")).toBe("public");
    expect(reachOf("8.8.8.8")).toBe("public");
    expect(reachOf("151.101.1.140")).toBe("public");
    expect(isPubliclyRoutable(parsed("1.1.1.1"))).toBe(true);
  });

  it("calls an ordinary public IPv6 address public", () => {
    expect(reachOf("2606:4700:4700::1111")).toBe("public");
    expect(reachOf("[2606:4700:4700::1111]")).toBe("public");
    expect(isPubliclyRoutable(parsed("2606:4700:4700::1111"))).toBe(true);
  });

  it("keeps a mapped PUBLIC address public, in both spellings", () => {
    // The one embedded form where the embedded address decides the verdict. A
    // dual-stack resolver returns ::ffff:1.1.1.1 for an IPv4-only publisher, so
    // refusing the form would mean refusing every source such a resolver
    // answers for -- no feed would ever be fetched.
    expect(reachOf("::ffff:1.1.1.1")).toBe("public");
    expect(reachOf("::ffff:101:101")).toBe("public");
    expect(isPubliclyRoutable(parsed("::ffff:101:101"))).toBe(true);
  });
});

describe("isPubliclyRoutable and classifyAddress", () => {
  it("agrees with classifyAddress on every reach there is", () => {
    // Typed as a total record, so a reach added to the union without a sample
    // here fails to compile, and a reach added to the union without being
    // wired into the boolean fails right below. That pairing is the point: the
    // predicate must not be able to drift from the classification.
    const SAMPLES: Record<AddressReach, string> = {
      public: "1.1.1.1",
      unspecified: "0.0.0.0",
      loopback: "127.0.0.1",
      private: "10.0.0.1",
      shared: "100.64.0.1",
      "link-local": "169.254.169.254",
      "unique-local": "fd00:ec2::254",
      multicast: "224.0.0.1",
      broadcast: "255.255.255.255",
      documentation: "192.0.2.1",
      benchmarking: "198.18.0.1",
      reserved: "240.0.0.1",
    };

    for (const [reach, text] of Object.entries(SAMPLES)) {
      expect(reachOf(text), text).toBe(reach);
      expect(isPubliclyRoutable(parsed(text)), text).toBe(reach === "public");
    }
  });
});
