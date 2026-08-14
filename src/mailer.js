import nodemailer from 'nodemailer';

export function buildTransporter({ host, port, user, pass }) {
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export function buildEmail(listing) {
  const subject = `Neue Gernsheim-Wohnung: ${listing.title}`;
  const t = escapeHtml(listing.title);
  const a = escapeHtml(listing.address);
  const u = escapeHtml(listing.url);
  const th = escapeHtml(listing.thumbnailUrl);
  const html =
    `<p>Eine neue Wohnung in Gernsheim ist verfügbar:</p>\n` +
    `<p><strong>${t}</strong></p>\n` +
    `<p>${a}</p>\n` +
    `<p><a href="${u}">Zum Inserat</a></p>\n` +
    `<p><img src="${th}" alt="${t}" style="max-width:480px"></p>`;
  const text =
    `Eine neue Wohnung in Gernsheim ist verfügbar:\n\n` +
    `${listing.title}\n${listing.address}\n${listing.url}\n`;
  return { subject, html, text };
}

export async function send(transporter, message) {
  await transporter.sendMail(message);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
}
