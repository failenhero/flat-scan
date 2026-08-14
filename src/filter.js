const GERNSHEIM_POSTCODE = /\b64579\b/;

export function gernsheimOnly(listings) {
  return listings.filter((l) => GERNSHEIM_POSTCODE.test(l.address ?? ''));
}
