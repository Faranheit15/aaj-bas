/**
 * Classifying a hostname, and being honest about what that can mean.
 *
 * A hostname is a NAME, not an address. Nothing about the text of a committed
 * file constrains what that name resolves to at fetch time, and a hostile
 * resolver can answer differently on each lookup (DNS rebinding). No
 * schema-time validation can prevent that. This module classifies literals and
 * known-private names; it cannot promise that fetching any entry stays inside
 * the public internet.
 *
 * That is why the name lists below are short and why the tests fix their limit
 * as a fact rather than apologising for it. A denylist of private names can
 * never be complete, because the attacker chooses the name.
 *
 * What this function is good for is the mistake and the obvious attempt: a
 * source pointing at `localhost`, at `169.254.169.254`, at an internal mirror
 * someone was reading while editing. Refusing those at validation time is
 * worth doing and is not the SSRF control.
 *
 * The SSRF control is AB-402's fetcher, and the shape it has to take follows
 * from the paragraph above: resolve the name itself, check EVERY address the
 * resolver returned -- a mixed answer set is what an attack looks like, and
 * picking the good one out of it hands the attacker a retry -- and then connect
 * to the address it checked rather than re-resolving the name.
 *
 * One ordering note for every caller: a protocol allowlist must run BEFORE any
 * host check. `file:///etc/passwd`, `javascript:alert(1)`, and `data:text/html,x`
 * all parse successfully with an empty hostname, and an empty hostname passes
 * every private-address predicate vacuously.
 */
import type { AddressReach, IpAddress } from "./address";
import { classifyAddress, parseIpAddress } from "./address";

/** Hostnames that resolve inside the network running the build. Matched at a
 *  label boundary, so `notlocalhost` and `mylocal` are ordinary names. */
const PRIVATE_HOST_SUFFIXES: readonly string[] = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
];

/** Hosts a real edition may not use, from RFC 2606 and RFC 6761. */
const RESERVED_TLDS: readonly string[] = ["invalid", "test", "example"];
const RESERVED_DOMAINS: readonly string[] = [
  "example.com",
  "example.net",
  "example.org",
];

export type HostReach =
  | {
      readonly kind: "address";
      readonly address: IpAddress;
      readonly reach: AddressReach;
    }
  | { readonly kind: "private-name"; readonly hostname: string }
  | { readonly kind: "reserved-name"; readonly hostname: string }
  /** Not a safety verdict. See the module comment: an unrecognised name is a
   *  name nobody here knows anything about, including whether it resolves to
   *  loopback. */
  | { readonly kind: "name"; readonly hostname: string };

/**
 * The hostname lowercased, with the DNS root's optional trailing dot removed.
 *
 * `https://example.com./x` and `https://example.com/x` address the same host
 * and the schema accepts both, so every classification has to agree about them.
 * Without this, one character on the end of a hostname walks past every
 * reserved-domain and private-network rule: the last label of `example.com.` is
 * the empty string, and `intranet.internal.` ends with no suffix in the list.
 *
 * Case is folded for the same reason. The URL parser lowercases a hostname
 * already, but a name read from a registry file or a resolver answer has not
 * been through it, and `LOCALHOST` is `localhost`.
 */
export function canonicalHostname(hostname: string): string {
  const lowered = hostname.toLowerCase();
  return lowered.endsWith(".") ? lowered.slice(0, -1) : lowered;
}

function isPrivateName(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

function isReservedName(hostname: string): boolean {
  const labels = hostname.split(".");
  const tld = labels[labels.length - 1];
  if (tld !== undefined && RESERVED_TLDS.includes(tld)) {
    return true;
  }
  return RESERVED_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

/**
 * One verdict per hostname, in the order the checks have to run.
 *
 * A literal is decided first because it is the only kind of host whose reach
 * this module can actually know. The name lists follow, and everything else is
 * `name` -- reported as an absence of knowledge rather than as approval.
 */
export function classifyHostname(hostname: string): HostReach {
  const canonical = canonicalHostname(hostname);
  const address = parseIpAddress(canonical);
  if (address !== null) {
    return { kind: "address", address, reach: classifyAddress(address) };
  }
  if (isPrivateName(canonical)) {
    return { kind: "private-name", hostname: canonical };
  }
  if (isReservedName(canonical)) {
    return { kind: "reserved-name", hostname: canonical };
  }
  return { kind: "name", hostname: canonical };
}
