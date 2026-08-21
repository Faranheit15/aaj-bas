/**
 * Public-address classification: is this host somewhere on the open internet.
 *
 * Two questions, kept apart because only one of them has a real answer. Given
 * an ADDRESS, `classifyAddress` says exactly which reserved range it falls in,
 * and the tables behind it are complete enough to be worth trusting. Given a
 * HOSTNAME, `classifyHostname` says only what can be told from the text.
 *
 * A hostname is a NAME, not an address. Nothing about the text of a committed
 * file constrains what that name resolves to at fetch time, and a hostile
 * resolver can answer differently on each lookup (DNS rebinding). No
 * schema-time validation can prevent that. This module classifies literals and
 * known-private names; it cannot promise that fetching any entry stays inside
 * the public internet. AB-402's fetcher must resolve the name itself, check
 * EVERY returned address -- a mixed answer set is what an attack looks like, and
 * picking the good one hands the attacker a retry -- and connect to the checked
 * address rather than re-resolving the name.
 *
 * It lives here rather than inside `edition-validation` because AB-401's source
 * registry needs the same predicate the URL rules need. The choice was to
 * extract it or to duplicate it, and a duplicated section 19 control is two
 * controls that will disagree, quietly, in the direction of letting something
 * through.
 */
export type { AddressReach, IpAddress } from "./address";
export {
  classifyAddress,
  isPubliclyRoutable,
  parseIpAddress,
} from "./address";
export type { HostReach } from "./hostname";
export { canonicalHostname, classifyHostname } from "./hostname";
