'use strict';

const crypto = require('crypto');
const { parseFeed, decodeBody } = require('./rss');

/**
 * Fontes de notícia. Para adicionar uma fonte, basta incluir um objeto aqui.
 * section: 'world' | 'us' | 'brazil'   lang: 'pt' | 'en'
 */
const FEEDS = [
  // Mundo
  { id: 'bbc-world', name: 'BBC News', section: 'world', lang: 'en', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', home: 'https://www.bbc.com/news/world' },
  { id: 'guardian-world', name: 'The Guardian', section: 'world', lang: 'en', url: 'https://www.theguardian.com/world/rss', home: 'https://www.theguardian.com/world' },
  { id: 'nyt-world', name: 'The New York Times', section: 'world', lang: 'en', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', home: 'https://www.nytimes.com/section/world' },
  { id: 'aljazeera', name: 'Al Jazeera', section: 'world', lang: 'en', url: 'https://www.aljazeera.com/xml/rss/all.xml', home: 'https://www.aljazeera.com' },
  { id: 'bbc-brasil', name: 'BBC News Brasil', section: 'world', lang: 'pt', url: 'https://feeds.bbci.co.uk/portuguese/rss.xml', home: 'https://www.bbc.com/portuguese' },
  { id: 'g1-mundo', name: 'g1', section: 'world', lang: 'pt', url: 'https://g1.globo.com/rss/g1/mundo/', home: 'https://g1.globo.com/mundo/' },
  { id: 'folha-mundo', name: 'Folha de S.Paulo', section: 'world', lang: 'pt', url: 'https://feeds.folha.uol.com.br/mundo/rss091.xml', home: 'https://www1.folha.uol.com.br/mundo/' },

  // Estados Unidos
  { id: 'nyt-us', name: 'The New York Times', section: 'us', lang: 'en', url: 'https://rss.nytimes.com/services/xml/rss/nyt/US.xml', home: 'https://www.nytimes.com/section/us' },
  { id: 'nyt-politics', name: 'The New York Times', section: 'us', lang: 'en', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml', home: 'https://www.nytimes.com/section/politics' },
  { id: 'npr-national', name: 'NPR', section: 'us', lang: 'en', url: 'https://feeds.npr.org/1003/rss.xml', home: 'https://www.npr.org/sections/national/' },
  { id: 'npr-politics', name: 'NPR', section: 'us', lang: 'en', url: 'https://feeds.npr.org/1014/rss.xml', home: 'https://www.npr.org/sections/politics/' },
  { id: 'bbc-us', name: 'BBC News', section: 'us', lang: 'en', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', home: 'https://www.bbc.com/news/us-canada' },
  { id: 'guardian-us', name: 'The Guardian', section: 'us', lang: 'en', url: 'https://www.theguardian.com/us-news/rss', home: 'https://www.theguardian.com/us-news' },

  // Brasil
  { id: 'g1', name: 'g1', section: 'brazil', lang: 'pt', url: 'https://g1.globo.com/rss/g1/', home: 'https://g1.globo.com' },
  { id: 'g1-politica', name: 'g1', section: 'brazil', lang: 'pt', url: 'https://g1.globo.com/rss/g1/politica/', home: 'https://g1.globo.com/politica/' },
  { id: 'folha', name: 'Folha de S.Paulo', section: 'brazil', lang: 'pt', url: 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml', home: 'https://www.folha.uol.com.br' },
  { id: 'folha-poder', name: 'Folha de S.Paulo', section: 'brazil', lang: 'pt', url: 'https://feeds.folha.uol.com.br/poder/rss091.xml', home: 'https://www1.folha.uol.com.br/poder/' },
  { id: 'agencia-brasil', name: 'Agência Brasil', section: 'brazil', lang: 'pt', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', home: 'https://agenciabrasil.ebc.com.br' },
  { id: 'cnn-brasil', name: 'CNN Brasil', section: 'brazil', lang: 'pt', url: 'https://www.cnnbrasil.com.br/feed/', home: 'https://www.cnnbrasil.com.br' },
];

const SECTIONS = ['world', 'us', 'brazil'];
const PER_FEED = 20;
const PER_SECTION = 90;
const MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;
const USER_AGENT = 'Mozilla/5.0 (compatible; PanoramaNewsReader/1.0; +https://github.com/)';

// Matérias de feeds "Mundo" que tratam dos EUA ou do Brasil vão para a editoria certa.
const BRAZIL_RE = /\b(Brazil|Brazil's|Brazilian|Brasília|Brasilia|São Paulo|Sao Paulo|Rio de Janeiro|Lula|Bolsonaro)\b/i;
const US_PT_RE = /(\bEUA\b|\bEstados Unidos\b|\bnorte-american[oa]s?\b|\bCasa Branca\b|\bWashington\b|\bPentágono\b|\bWall Street\b|\bNova York\b|\bTrump\b)/;
const US_EN_RE = /(\bUS\b|\bU\.S\.|\bAmerica's\b|\bWhite House\b|\bWashington\b|\bPentagon\b|\bCongress\b|\bUS Senate\b|\bTrump\b)/;

function classify(feed, item) {
  if (feed.section !== 'world') return feed.section;
  if (BRAZIL_RE.test(item.title)) return 'brazil';
  if ((feed.lang === 'pt' ? US_PT_RE : US_EN_RE).test(item.title)) return 'us';
  return 'world';
}

function articleId(link) {
  return crypto.createHash('sha1').update(link).digest('base64url').slice(0, 11).replace(/[^A-Za-z0-9]/g, 'x');
}

function normTitle(t) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

async function fetchFeed(feed, { timeoutMs = 12000, fetchImpl = fetch } = {}) {
  const started = Date.now();
  try {
    const res = await fetchImpl(feed.url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = decodeBody(await res.arrayBuffer(), res.headers.get('content-type'));
    const items = parseFeed(xml).slice(0, PER_FEED);
    if (!items.length) throw new Error('feed sem itens');
    return { feed, items, ok: true, ms: Date.now() - started };
  } catch (err) {
    const msg = err && err.name === 'TimeoutError' ? 'tempo esgotado' : String((err && err.message) || err);
    return { feed, items: [], ok: false, error: msg, ms: Date.now() - started };
  }
}

function buildPayload(results, now = Date.now()) {
  const sections = { world: [], us: [], brazil: [] };
  const seenLinks = new Set();
  const seenTitles = new Set();

  for (const { feed, items } of results) {
    for (const item of items) {
      const linkKey = item.link.replace(/[?#].*$/, '').replace(/\/$/, '');
      const titleKey = normTitle(item.title);
      if (seenLinks.has(linkKey) || seenTitles.has(titleKey)) continue;
      if (item.published && now - Date.parse(item.published) > MAX_AGE_MS) continue;
      // Datas no futuro (fuso errado no feed) são limitadas ao "agora".
      const published = item.published && Date.parse(item.published) > now ? new Date(now).toISOString() : item.published;
      seenLinks.add(linkKey);
      seenTitles.add(titleKey);
      const section = classify(feed, item);
      sections[section].push({
        id: articleId(item.link),
        title: item.title,
        summary: item.summary,
        link: item.link,
        image: item.image,
        author: item.author || '',
        published,
        source: feed.name,
        sourceId: feed.id,
        lang: feed.lang,
        section,
      });
    }
  }

  for (const key of SECTIONS) {
    sections[key].sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0));
    sections[key] = sections[key].slice(0, PER_SECTION);
  }

  return {
    generatedAt: new Date(now).toISOString(),
    mode: 'live',
    sections,
    sources: results.map(({ feed, items, ok, error }) => ({
      id: feed.id,
      name: feed.name,
      section: feed.section,
      lang: feed.lang,
      home: feed.home,
      ok,
      count: items.length,
      ...(error ? { error } : {}),
    })),
  };
}

async function collectNews(options = {}) {
  const feeds = options.feeds || FEEDS;
  const results = await Promise.all(feeds.map((f) => fetchFeed(f, options)));
  return buildPayload(results);
}

module.exports = { FEEDS, SECTIONS, collectNews, fetchFeed, buildPayload, classify };
