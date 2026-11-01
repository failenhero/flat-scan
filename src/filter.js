// 64579 Gernsheim am Rhein, 64584 Biebesheim am Rhein,
// 64589 Stockstadt am Rhein, 68647 Biblis
const TARGET_POSTCODES = /\b(?:64579|64584|64589|68647)\b/;

export function targetAreasOnly(listings) {
  return listings.filter((l) => TARGET_POSTCODES.test(l.address ?? ''));
}
