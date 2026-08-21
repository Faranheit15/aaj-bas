/**
 * What can be told about a host from its name, and what cannot.
 *
 * Half of this file asserts that the classification works. The other half
 * asserts its limit, on purpose: `metadata.goog` is an ordinary name here, and
 * that is written down as a passing test rather than left as a gap someone
 * discovers later. A denylist of private names can never be complete, because
 * the attacker chooses the name -- so the useful thing is to know exactly how
 * far the list goes and to put the real control somewhere else.
 */
import { describe, expect, it } from "vitest";
import { canonicalHostname, classifyHostname } from "./hostname";

describe("canonicalHostname", () => {
  it("drops the DNS root's trailing dot and folds case", () => {
    // `example.com.` and `example.com` are the same host, and every rule below
    // has to agree about that or the dot is a way past all of them.
    expect(canonicalHostname("example.com.")).toBe("example.com");
    expect(canonicalHostname("EXAMPLE.com")).toBe("example.com");
    expect(canonicalHostname("Router.Home.Arpa.")).toBe("router.home.arpa");
    expect(canonicalHostname("example.com")).toBe("example.com");
  });
});

describe("classifying a host that is an address", () => {
  it("reports the literal and its reach rather than only a name", () => {
    expect(classifyHostname("169.254.169.254")).toEqual({
      kind: "address",
      address: { family: "ipv4", octets: [169, 254, 169, 254] },
      reach: "link-local",
    });

    const bracketed = classifyHostname("[::ffff:a9fe:a9fe]");
    expect(bracketed.kind).toBe("address");
    expect(bracketed).toMatchObject({ reach: "link-local" });
  });

  it("sees an address through a trailing dot and through upper case", () => {
    // The URL parser strips the dot from `127.0.0.1.` but keeps it on
    // `localhost.`, so canonicalisation cannot be assumed to have happened.
    expect(classifyHostname("127.0.0.1.")).toMatchObject({
      kind: "address",
      reach: "loopback",
    });
    expect(classifyHostname("[::FFFF:7F00:1]")).toMatchObject({
      kind: "address",
      reach: "loopback",
    });
  });

  it("calls a public literal an address, not a refusal", () => {
    expect(classifyHostname("1.1.1.1")).toMatchObject({
      kind: "address",
      reach: "public",
    });
  });
});

describe("classifying a host that is a name", () => {
  it("recognises the names that resolve inside the build network", () => {
    for (const host of [
      "localhost",
      "cache.localhost",
      "archive.local",
      "wiki.internal",
      "router.home.arpa",
      "metadata.google.internal",
    ]) {
      expect(classifyHostname(host), host).toEqual({
        kind: "private-name",
        hostname: host,
      });
    }
  });

  it("matches a private suffix only at a label boundary", () => {
    // Suffix matching without the dot is how `notlocalhost` becomes
    // unreachable: a real publisher refused by a rule aimed at a private
    // network is the same kind of failure as a private network let through.
    for (const host of ["notlocalhost", "mylocal", "evil-internal.com"]) {
      expect(classifyHostname(host), host).toEqual({
        kind: "name",
        hostname: host,
      });
    }
  });

  it("lowercases before classifying", () => {
    expect(classifyHostname("LOCALHOST")).toEqual({
      kind: "private-name",
      hostname: "localhost",
    });
    expect(classifyHostname("Wiki.INTERNAL.")).toEqual({
      kind: "private-name",
      hostname: "wiki.internal",
    });
  });

  it("treats a trailing dot as the same host it would be without one", () => {
    expect(classifyHostname("localhost.")).toEqual({
      kind: "private-name",
      hostname: "localhost",
    });
    expect(classifyHostname("intranet.internal.")).toEqual({
      kind: "private-name",
      hostname: "intranet.internal",
    });
    expect(classifyHostname("example.com.")).toEqual({
      kind: "reserved-name",
      hostname: "example.com",
    });
  });

  it("recognises the documentation names from RFC 2606 and RFC 6761", () => {
    for (const host of [
      "example.com",
      "example.net",
      "archive.example.org",
      "publisher.invalid",
      "wire.test",
      "news.example",
    ]) {
      expect(classifyHostname(host), host).toEqual({
        kind: "reserved-name",
        hostname: host,
      });
    }
  });

  it("says nothing about a name it does not recognise", () => {
    // `name` is an absence of knowledge, not approval. This host may resolve
    // to 127.0.0.1; nothing in the text says otherwise, and no amount of
    // reading the text could.
    expect(classifyHostname("news.publisher-one.co")).toEqual({
      kind: "name",
      hostname: "news.publisher-one.co",
    });
  });
});

describe("the limit of a name denylist", () => {
  it("calls metadata.goog an ordinary name, and that is the limit", () => {
    // `metadata.google.internal` is caught, by the `.internal` suffix rather
    // than by anyone having listed it. `metadata.goog` is the same service
    // under a name no suffix here covers, and adding it would not fix the
    // shape of the problem: the list is chosen by whoever is writing the
    // rules and the name is chosen by whoever is attacking them. Documented as
    // a passing assertion so that nobody reads a `name` verdict as a promise.
    expect(classifyHostname("metadata.goog")).toEqual({
      kind: "name",
      hostname: "metadata.goog",
    });
    expect(classifyHostname("metadata.google.internal").kind).toBe(
      "private-name",
    );
  });

  it("classifies a punycode host as a name and never decodes it", () => {
    // Decoding would mean carrying an IDNA implementation and then comparing
    // Unicode that has more than one spelling of several Latin letters. The
    // host is passed through exactly as written; whoever renders it is the one
    // that has to deal with what it looks like.
    expect(classifyHostname("xn--80ak6aa92e.com")).toEqual({
      kind: "name",
      hostname: "xn--80ak6aa92e.com",
    });
  });

  it("gives an empty host no verdict a caller can lean on", () => {
    // `file:///etc/passwd`, `javascript:alert(1)` and `data:text/html,x` all
    // parse successfully with an empty hostname, and an empty host satisfies
    // every private-address check vacuously. A protocol allowlist therefore
    // has to run BEFORE any host check; this asserts that the host check does
    // not quietly stand in for one.
    expect(classifyHostname("")).toEqual({ kind: "name", hostname: "" });
  });
});
