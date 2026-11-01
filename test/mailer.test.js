import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmail, send, buildTransporter } from '../src/mailer.js';

const sample = {
  uuid: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  title: 'Schöne 3-Zimmer Wohnung',
  address: 'Beispielstraße 5, 64579 Gernsheim am Rhein',
  url: 'https://bgr.immomio.online/immobilien/example/',
  thumbnailUrl: 'https://bgr.immomio.online/wp-content/uploads/example.jpg',
};

test('buildEmail produces subject, html and text bodies', () => {
  const { subject, html, text } = buildEmail(sample);
  assert.match(subject, /^Neue Wohnung:/);
  assert.match(subject, /Schöne 3-Zimmer Wohnung/);

  assert.match(html, /<strong>Schöne 3-Zimmer Wohnung<\/strong>/);
  assert.match(html, /Beispielstraße 5, 64579 Gernsheim/);
  assert.match(html, /<a href="https:\/\/bgr.immomio.online\/immobilien\/example\/">/);
  assert.match(html, /<img src="https:\/\/bgr.immomio.online\/wp-content\/uploads\/example.jpg"/);

  assert.match(text, /Schöne 3-Zimmer Wohnung/);
  assert.match(text, /Beispielstraße 5, 64579 Gernsheim/);
  assert.match(text, /https:\/\/bgr.immomio.online\/immobilien\/example\//);
});

test('buildEmail escapes HTML-special characters in title and address', () => {
  const evil = {
    ...sample,
    title: 'Wohnung "Sonne" & <span>',
    address: 'Foo<bar>',
  };
  const { html } = buildEmail(evil);
  assert.ok(!html.includes('<span>'), 'raw <span> must not appear');
  assert.ok(html.includes('&lt;span&gt;'), 'span tags must be escaped');
  assert.ok(html.includes('&quot;Sonne&quot;'), 'quotes must be escaped');
  assert.ok(html.includes('&amp;'), 'ampersand must be escaped');
  assert.ok(html.includes('Foo&lt;bar&gt;'), 'address tags must be escaped');
});

test('send forwards the message to the injected transporter', async () => {
  const calls = [];
  const fakeTransporter = {
    sendMail: async (msg) => {
      calls.push(msg);
      return { messageId: 'fake' };
    },
  };
  await send(fakeTransporter, {
    from: 'a@b.c',
    to: 'd@e.f',
    subject: 'hi',
    html: '<p>hi</p>',
    text: 'hi',
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    from: 'a@b.c',
    to: 'd@e.f',
    subject: 'hi',
    html: '<p>hi</p>',
    text: 'hi',
  });
});

test('send rethrows transporter errors', async () => {
  const fakeTransporter = {
    sendMail: async () => {
      throw new Error('SMTP rejected');
    },
  };
  await assert.rejects(
    () => send(fakeTransporter, { from: 'a', to: 'b', subject: 's', html: '', text: '' }),
    /SMTP rejected/,
  );
});

test('buildTransporter returns an object with sendMail (smoke test)', () => {
  const t = buildTransporter({
    host: 'smtp.example.com',
    port: 465,
    user: 'u',
    pass: 'p',
  });
  assert.equal(typeof t.sendMail, 'function');
});

test('buildEmail escapes ampersand in URL query strings', () => {
  const withQuery = {
    ...sample,
    url: 'https://bgr.immomio.online/immobilien/example/?ref=a&utm=b',
    thumbnailUrl: 'https://bgr.immomio.online/wp-content/uploads/example.jpg?v=1&w=2',
  };
  const { html, text } = buildEmail(withQuery);
  assert.match(html, /href="https:\/\/bgr\.immomio\.online\/immobilien\/example\/\?ref=a&amp;utm=b"/);
  assert.match(html, /src="https:\/\/bgr\.immomio\.online\/wp-content\/uploads\/example\.jpg\?v=1&amp;w=2"/);
  // Plain-text body keeps the raw URL
  assert.match(text, /\?ref=a&utm=b/);
});
