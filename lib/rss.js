'use strict';

/**
 * Parser leve de RSS 2.0 / RSS 0.91 / Atom, sem dependências.
 * Feito para os formatos usados pelos grandes portais de notícia
 * (media:content, media:thumbnail, enclosure, <img> no HTML da descrição).
 */

const BASIC_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’',
  sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', laquo: '«', raquo: '»',
  middot: '·', bull: '•', copy: '©', reg: '®', trade: '™', deg: '°',
  ordf: 'ª', ordm: 'º', euro: '€', pound: '£', iexcl: '¡', iquest: '¿',
  szlig: 'ß', eth: 'ð', thorn: 'þ', aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø',
  aring: 'å', Aring: 'Å', shy: '',
};

// Gera &aacute; &atilde; &ccedil; etc. a partir de marcas combinantes.
const COMBINING = { acute: '́', grave: '̀', circ: '̂', tilde: '̃', uml: '̈', cedil: '̧' };
const ENTITIES = { ...BASIC_ENTITIES };
for (const base of 'aeiouyAEIOUYcCnN') {
  for (const [name, mark] of Object.entries(COMBINING)) {
    const composed = (base + mark).normalize('NFC');
    if (composed.length === 1) ENTITIES[base + name] = composed;
  }
}

function decodeEntities(str) {
  if (!str || str.indexOf('&') === -1) return str || '';
  return str.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return match;
      try { return String.fromCodePoint(n); } catch { return match; }
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, code) ? ENTITIES[code] : match;
  });
}

const CDATA_RE = /<!\[CDATA\[([\s\S]*?)\]\]>/g;

/** Conteúdo bruto de um nó XML -> HTML/texto já sem CDATA e com entidades XML resolvidas. */
function unwrap(raw) {
  if (raw == null) return '';
  if (raw.includes('<![CDATA[')) {
    // Partes dentro de CDATA ficam literais; partes fora são decodificadas.
    let out = '';
    let last = 0;
    raw.replace(CDATA_RE, (m, inner, offset) => {
      out += decodeEntities(raw.slice(last, offset)) + inner;
      last = offset + m.length;
      return m;
    });
    return out + decodeEntities(raw.slice(last));
  }
  return decodeEntities(raw);
}

function stripTags(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<(script|style|figure|figcaption)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h\d)>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Texto do primeiro elemento <name>…</name> dentro do bloco. */
function tagContent(block, name) {
  const re = new RegExp(`<${escapeRe(name)}(?:\\s[^>]*?)?(?<!/)>([\\s\\S]*?)</${escapeRe(name)}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : null;
}

function parseAttrs(str) {
  const attrs = {};
  const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(str))) attrs[m[1].toLowerCase()] = decodeEntities(m[3] !== undefined ? m[3] : m[4]);
  return attrs;
}

/** Atributos de todos os elementos <name …> (abertos ou auto-fechados) no bloco. */
function tagAttrs(block, name) {
  const re = new RegExp(`<${escapeRe(name)}(\\s[^>]*?)?\\/?>`, 'gi');
  const list = [];
  let m;
  while ((m = re.exec(block))) list.push(parseAttrs(m[1] || ''));
  return list;
}

const IMG_EXT_RE = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;

function isHttpUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u.trim());
}

function upgradeImage(url) {
  if (!url) return url;
  let u = url.trim();
  if (u.startsWith('//')) u = 'https:' + u;
  // BBC entrega miniaturas de 240px no RSS; o mesmo caminho existe em 976px.
  u = u.replace(/(ichef\.bbci\.co\.uk\/(?:ace\/(?:standard|ws)|news))\/\d{2,4}\//, '$1/976/');
  return u;
}

function pickLargest(candidates) {
  if (!candidates.length) return null;
  const sorted = candidates
    .map((c) => ({ url: c.url, w: parseInt(c.width, 10) || 0 }))
    .sort((a, b) => b.w - a.w);
  return sorted[0].url;
}

function findImage(block, html) {
  const media = tagAttrs(block, 'media:content').filter(
    (a) => isHttpUrl(a.url) && (a.medium === 'image' || /^image\//i.test(a.type || '') || (!a.medium && !a.type && IMG_EXT_RE.test(a.url)) || (!a.medium && !a.type && a.width))
  );
  let img = pickLargest(media);
  if (!img) img = pickLargest(tagAttrs(block, 'media:thumbnail').filter((a) => isHttpUrl(a.url)));
  if (!img) {
    const enc = tagAttrs(block, 'enclosure').find((a) => isHttpUrl(a.url) && (/^image\//i.test(a.type || '') || IMG_EXT_RE.test(a.url)));
    if (enc) img = enc.url;
  }
  if (!img) {
    const it = tagAttrs(block, 'itunes:image').find((a) => isHttpUrl(a.href));
    if (it) img = it.href;
  }
  if (!img && html) {
    const m = html.match(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i);
    if (m && (isHttpUrl(m[1]) || m[1].startsWith('//'))) img = decodeEntities(m[1]);
  }
  if (img && img.startsWith('//')) img = 'https:' + img;
  return isHttpUrl(img) ? upgradeImage(img) : null;
}

function truncate(text, max) {
  if (!text || text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, '') + '…';
}

const TRAILING_NOISE = [
  /\s*Continue reading\.{0,3}\s*$/i,
  /\s*Read more\.{0,3}\s*$/i,
  /\s*Leia mais\.{0,3}\s*$/i,
  /\s*The post .+ appeared first on .+\.?$/i,
  /\s*O post .+ apareceu primeiro em .+\.?$/i,
];

function cleanSummary(text, title) {
  let t = text || '';
  for (const re of TRAILING_NOISE) t = t.replace(re, '');
  t = t.trim();
  if (title && t.toLowerCase() === title.toLowerCase()) return '';
  return truncate(t, 340);
}

function parseDate(str) {
  if (!str) return null;
  const s = stripTags(unwrap(str)).trim();
  if (!s) return null;
  let d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    // Ex.: "26/11/2026 18:40:00" usado por alguns portais brasileiros.
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] + 3, +m[5], +(m[6] || 0))); // assume horário de Brasília
  }
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function textOf(block, name) {
  const raw = tagContent(block, name);
  return raw == null ? '' : stripTags(unwrap(raw));
}

function htmlOf(block, name) {
  const raw = tagContent(block, name);
  return raw == null ? '' : unwrap(raw);
}

function parseItem(block, isAtom) {
  const title = textOf(block, 'title');

  let link = '';
  if (isAtom) {
    const links = tagAttrs(block, 'link');
    const alt = links.find((l) => !l.rel || l.rel === 'alternate') || links[0];
    link = alt && alt.href ? alt.href : '';
  } else {
    link = textOf(block, 'link');
    if (!isHttpUrl(link)) {
      const guid = textOf(block, 'guid');
      if (isHttpUrl(guid)) link = guid;
    }
    if (!isHttpUrl(link)) {
      const atomLink = tagAttrs(block, 'atom:link').find((l) => isHttpUrl(l.href));
      if (atomLink) link = atomLink.href;
    }
  }

  const descHtml = isAtom
    ? htmlOf(block, 'summary') || htmlOf(block, 'content')
    : htmlOf(block, 'description') || htmlOf(block, 'content:encoded');
  const contentHtml = htmlOf(block, 'content:encoded') || htmlOf(block, 'content');

  const author = textOf(block, 'dc:creator') || textOf(block, 'author') || '';

  return {
    title,
    link: link.trim(),
    summary: cleanSummary(stripTags(descHtml), title),
    image: findImage(block, descHtml + ' ' + contentHtml),
    author: truncate(author.replace(/\s*\([^)]*\)\s*$/, ''), 80),
    published:
      parseDate(tagContent(block, 'pubDate')) ||
      parseDate(tagContent(block, 'dc:date')) ||
      parseDate(tagContent(block, 'published')) ||
      parseDate(tagContent(block, 'updated')),
  };
}

function parseFeed(xml) {
  const src = String(xml || '');
  const isAtom = /<feed[\s>]/i.test(src) && !/<rss[\s>]/i.test(src);
  const re = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi;
  const items = [];
  for (const block of src.match(re) || []) {
    const item = parseItem(block, isAtom);
    if (item.title && isHttpUrl(item.link)) items.push(item);
  }
  return items;
}

/** Detecta o charset (cabeçalho HTTP ou declaração XML) e decodifica o buffer. */
function decodeBody(buffer, contentType) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let charset = ((contentType || '').match(/charset=["']?([\w-]+)/i) || [])[1];
  if (!charset) {
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
    charset = (head.match(/encoding=["']([\w-]+)["']/i) || [])[1];
  }
  try {
    return new TextDecoder((charset || 'utf-8').toLowerCase()).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

module.exports = { parseFeed, decodeBody, decodeEntities, stripTags, truncate };
