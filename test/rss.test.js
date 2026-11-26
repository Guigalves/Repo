'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFeed, decodeBody, decodeEntities, stripTags } = require('../lib/rss');
const { buildPayload, classify, fetchFeed } = require('../lib/feeds');

const BBC = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
<channel><title><![CDATA[BBC News]]></title><atom:link href="https://feeds.bbci.co.uk/news/world/rss.xml" rel="self"/>
<item>
  <title><![CDATA[Leaders meet for climate talks]]></title>
  <description><![CDATA[Delegates gather to discuss emissions targets.]]></description>
  <link>https://www.bbc.com/news/articles/abc123</link>
  <guid isPermaLink="false">https://www.bbc.com/news/articles/abc123#0</guid>
  <pubDate>Thu, 26 Nov 2026 18:40:00 GMT</pubDate>
  <media:thumbnail width="240" height="135" url="https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/1234/live/photo.jpg"/>
</item>
</channel></rss>`;

const GUARDIAN = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" version="2.0"><channel>
<item>
  <title>Markets rally &amp; recover after week of losses</title>
  <link>https://www.theguardian.com/business/2026/nov/26/markets</link>
  <description>&lt;p&gt;Shares rose sharply on Thursday.&lt;/p&gt; &lt;a href="https://www.theguardian.com/x"&gt;Continue reading...&lt;/a&gt;</description>
  <pubDate>Thu, 26 Nov 2026 17:05:12 GMT</pubDate>
  <dc:creator>Jane Doe</dc:creator>
  <media:content width="140" url="https://i.guim.co.uk/img/media/a/master.jpg?width=140&amp;s=1"/>
  <media:content width="460" url="https://i.guim.co.uk/img/media/a/master.jpg?width=460&amp;s=2"/>
</item>
</channel></rss>`;

const G1 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<item>
  <title><![CDATA[Câmara aprova projeto que muda regras do setor elétrico]]></title>
  <link>https://g1.globo.com/politica/noticia/2026/11/26/camara.ghtml</link>
  <description><![CDATA[ <img src="https://s2-g1.glbimg.com/foto.jpg" /><br />   Texto segue para o Senado.  ]]></description>
  <pubDate>Thu, 26 Nov 2026 15:12:00 -0300</pubDate>
</item>
<item>
  <title>Sem link</title>
</item>
</channel></rss>`;

const FOLHA_LATIN1 = Buffer.from(
  `<?xml version="1.0" encoding="ISO-8859-1"?>
<rss version="0.91"><channel>
<item>
<title>Governo anuncia programa de renegociação de dívidas</title>
<link>https://www1.folha.uol.com.br/mercado/2026/11/governo.shtml</link>
<description>Condições incluem descontos e prazo de até dez anos para pequenas empresas.</description>
<pubDate>26 Nov 2026 14:30:00 -0300</pubDate>
</item>
</channel></rss>`,
  'latin1'
);

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom</title>
  <entry>
    <title type="html">Science &amp;amp; space: probe reaches orbit</title>
    <link rel="alternate" href="https://example.org/space/probe"/>
    <updated>2026-11-26T12:00:00Z</updated>
    <summary>The probe entered a stable orbit early on Thursday.</summary>
    <author><name>A. Writer</name></author>
  </entry>
</feed>`;

test('decodifica entidades nomeadas, numéricas e acentos', () => {
  assert.equal(decodeEntities('S&atilde;o Paulo &amp; Bras&iacute;lia &#8212; &#x2019; &ccedil;'), 'São Paulo & Brasília — ’ ç');
  assert.equal(decodeEntities('&naoexiste;'), '&naoexiste;');
});

test('remove tags e normaliza espaços', () => {
  assert.equal(stripTags('<p>Olá<br/>mundo</p>  <script>x()</script>!'), 'Olá mundo !');
});

test('RSS da BBC: CDATA, miniatura ampliada e data', () => {
  const [item] = parseFeed(BBC);
  assert.equal(item.title, 'Leaders meet for climate talks');
  assert.equal(item.link, 'https://www.bbc.com/news/articles/abc123');
  assert.equal(item.summary, 'Delegates gather to discuss emissions targets.');
  assert.equal(item.image, 'https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/1234/live/photo.jpg');
  assert.equal(item.published, '2026-11-26T18:40:00.000Z');
});

test('RSS do Guardian: HTML escapado, maior imagem, autor e "Continue reading" removido', () => {
  const [item] = parseFeed(GUARDIAN);
  assert.equal(item.title, 'Markets rally & recover after week of losses');
  assert.equal(item.summary, 'Shares rose sharply on Thursday.');
  assert.equal(item.image, 'https://i.guim.co.uk/img/media/a/master.jpg?width=460&s=2');
  assert.equal(item.author, 'Jane Doe');
});

test('RSS do g1: imagem dentro da descrição e itens sem link ignorados', () => {
  const items = parseFeed(G1);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Câmara aprova projeto que muda regras do setor elétrico');
  assert.equal(items[0].image, 'https://s2-g1.glbimg.com/foto.jpg');
  assert.equal(items[0].summary, 'Texto segue para o Senado.');
  assert.equal(items[0].published, '2026-11-26T18:12:00.000Z');
});

test('Folha em ISO-8859-1 é decodificada corretamente', () => {
  const xml = decodeBody(FOLHA_LATIN1, 'text/xml');
  const [item] = parseFeed(xml);
  assert.equal(item.title, 'Governo anuncia programa de renegociação de dívidas');
  assert.match(item.summary, /até dez anos/);
  assert.equal(item.image, null);
});

test('Atom: link alternate, updated e entidades duplas', () => {
  const [item] = parseFeed(ATOM);
  assert.equal(item.title, 'Science & space: probe reaches orbit');
  assert.equal(item.link, 'https://example.org/space/probe');
  assert.equal(item.published, '2026-11-26T12:00:00.000Z');
});

test('reclassifica matérias de "Mundo" sobre EUA e Brasil', () => {
  const ptWorld = { section: 'world', lang: 'pt' };
  const enWorld = { section: 'world', lang: 'en' };
  assert.equal(classify(ptWorld, { title: 'EUA anunciam novas tarifas' }), 'us');
  assert.equal(classify(ptWorld, { title: 'Acordo sul-americano avança' }), 'world');
  assert.equal(classify(enWorld, { title: "Brazil's president visits Asia" }), 'brazil');
  assert.equal(classify(enWorld, { title: 'US and China resume trade talks' }), 'us');
  assert.equal(classify(enWorld, { title: 'Floods hit southern Europe' }), 'world');
  assert.equal(classify({ section: 'brazil', lang: 'pt' }, { title: 'EUA e Brasil' }), 'brazil');
});

test('monta o payload: remove duplicadas, ordena por data e descarta antigas', () => {
  const now = Date.parse('2026-11-26T20:00:00Z');
  const feedA = { id: 'a', name: 'Fonte A', section: 'brazil', lang: 'pt', home: '' };
  const feedB = { id: 'b', name: 'Fonte B', section: 'brazil', lang: 'pt', home: '' };
  const results = [
    { feed: feedA, ok: true, items: [
      { title: 'Notícia um', link: 'https://a.com/1', summary: '', image: null, published: '2026-11-26T10:00:00Z' },
      { title: 'Notícia velha', link: 'https://a.com/old', summary: '', image: null, published: '2026-11-10T10:00:00Z' },
    ] },
    { feed: feedB, ok: true, items: [
      { title: 'Notícia UM!', link: 'https://b.com/1', summary: '', image: null, published: '2026-11-26T11:00:00Z' },
      { title: 'Notícia dois', link: 'https://b.com/2', summary: '', image: null, published: '2026-11-26T19:00:00Z' },
    ] },
    { feed: { id: 'c', name: 'Fonte C', section: 'us', lang: 'en', home: '' }, ok: false, error: 'HTTP 500', items: [] },
  ];
  const payload = buildPayload(results, now);
  assert.deepEqual(payload.sections.brazil.map((a) => a.title), ['Notícia dois', 'Notícia um']);
  assert.equal(payload.sections.brazil[0].source, 'Fonte B');
  assert.match(payload.sections.brazil[0].id, /^[A-Za-z0-9]{11}$/);
  assert.equal(payload.sources.find((s) => s.id === 'c').error, 'HTTP 500');
});

test('fetchFeed devolve erro sem lançar exceção', async () => {
  const feed = { id: 'x', name: 'X', section: 'world', lang: 'en', url: 'https://x.invalid/rss' };
  const failing = async () => { throw new Error('rede indisponível'); };
  const res = await fetchFeed(feed, { fetchImpl: failing });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'rede indisponível');

  const ok = async () => new Response(BBC, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
  const good = await fetchFeed(feed, { fetchImpl: ok });
  assert.equal(good.ok, true);
  assert.equal(good.items.length, 1);
});
