import * as cheerio from 'cheerio';

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function parse(html) {
  const $ = cheerio.load(html);
  const container = $('div.properties').first();
  if (container.length === 0) return null;

  const listings = [];
  container.find('div.property').each((_, el) => {
    const $el = $(el);
    const $a = $el.find('h3.property-title a').first();
    const url = $a.attr('href');
    const title = $a.text().trim();
    if (!url || !title) return;

    const m = url.match(UUID_RE);
    if (!m) return;
    const uuid = m[1].toLowerCase();

    const address = $el.find('.property-subtitle').first().text().trim();
    const thumbnailUrl = $el.find('a.thumbnail img').first().attr('src') ?? '';

    listings.push({ uuid, title, address, url, thumbnailUrl });
  });

  return { listings };
}
