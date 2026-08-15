/**
 * Whether a response says its body is JSON.
 *
 * One definition, spent on both sides of the same hazard. Cloudflare Pages
 * answers a path it cannot match with HTTP 200 and `text/html` -- the reader's
 * own shell, in place of a file that does not exist -- so a withdrawn edition
 * arrives looking exactly like a successful fetch.
 *
 * On the READ side that would report a missing edition as corrupt content.
 * On the WRITE side, in the service worker, it is worse and quieter: the worker
 * would overwrite a good cached edition with an HTML document, and the reader
 * would go offline the next day to a permanent "could not display this
 * edition". Nothing would have failed at any point.
 *
 * The two guards must agree, so there is one of them. This module imports
 * nothing, which is what lets the worker use it: `edition-repository.ts`, where
 * this predicate began, pulls in Zod and reads `import.meta.env`, neither of
 * which belongs in a service worker bundle.
 */
export function isJson(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }

  // Parameters are dropped before comparing: `application/json; charset=utf-8`
  // is JSON, and a whole-string comparison would refuse it.
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";

  return mediaType === "application/json" || mediaType.endsWith("+json");
}
