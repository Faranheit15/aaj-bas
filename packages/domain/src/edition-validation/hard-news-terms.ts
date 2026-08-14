/**
 * The lexicon behind `diversity/all-hard-news`.
 *
 * PRD section 5.4 forbids an edition "composed entirely of conflict, crime,
 * disaster, or political confrontation". The four groups below are exactly those
 * four categories and nothing else: a term that does not belong to one of them
 * is not a hard-news term for this rule's purposes, however grim it reads.
 *
 * This list is an editorial decision, not an implementation detail. Section 22
 * requires editorial rules to be inspectable, so it is checked in as data rather
 * than hidden in a prompt or a model call, and adding or removing a term belongs
 * in a reviewed pull request with the reasoning in the description.
 *
 * Terms are matched on word boundaries with an optional trailing `s`, against
 * text that has already been lowercased and stripped of punctuation. That is why
 * plurals are absent here and why multi-word terms are written with single
 * spaces. Matching is deliberately literal: no stemming, no synonym expansion,
 * nothing that would make a reader unable to predict what fires.
 */
export const HARD_NEWS_TERMS: readonly string[] = [
  // Conflict — armed hostilities and their conduct.
  "air strike",
  "airstrike",
  "artillery",
  "bombardment",
  "casualties",
  "ceasefire",
  "combat",
  "drone strike",
  "front line",
  "insurgency",
  "invasion",
  "militant",
  "missile",
  "offensive",
  "shelling",
  "troops",
  "war",
  "warfare",

  // Crime — offences and the criminal process reported as events.
  "abduction",
  "arrest",
  "assault",
  "homicide",
  "indictment",
  "kidnapping",
  "manslaughter",
  "murder",
  "robbery",
  "shooting",
  "stabbing",
  "trafficking",

  // Disaster — sudden physical harm at scale, natural or industrial.
  "cyclone",
  "derailment",
  "drought",
  "earthquake",
  "evacuation",
  "explosion",
  "famine",
  "flood",
  "flooding",
  "landslide",
  "stampede",
  "tsunami",
  "wildfire",

  // Political confrontation — politics conducted as a standoff.
  "boycott",
  "censure",
  "coup",
  "crackdown",
  "defection",
  "impeachment",
  "no confidence",
  "protest",
  "purge",
  "sanctions",
  "standoff",
  "ultimatum",
  "walkout",
];
