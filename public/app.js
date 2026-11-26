/* Panorama — app de notícias. JavaScript puro, sem dependências. */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- Config */

  var SECTION_KEYS = ['world', 'us', 'brazil'];
  var SECTIONS = {
    world: { slug: 'mundo', label: 'Mundo', title: 'Mundo', icon: 'globe', blurb: 'Diplomacia, conflitos, clima e economia global: o que está mudando o planeta hoje.' },
    us: { slug: 'eua', label: 'EUA', title: 'Estados Unidos', icon: 'capitol', blurb: 'Washington, eleições, economia e a vida americana, em inglês e em português.' },
    brazil: { slug: 'brasil', label: 'Brasil', title: 'Brasil', icon: 'pin', blurb: 'Política em Brasília, economia, justiça e o cotidiano dos estados.' },
  };
  var VIEWS = ['inicio', 'mundo', 'eua', 'brasil', 'salvos'];
  var SLUG_TO_SECTION = { mundo: 'world', eua: 'us', brasil: 'brazil' };
  var CLOCKS = [
    { city: 'Brasília', tz: 'America/Sao_Paulo' },
    { city: 'Nova York', tz: 'America/New_York' },
    { city: 'Londres', tz: 'Europe/London' },
  ];
  var SOURCE_MARKS = {
    'BBC News': 'BBC', 'BBC News Brasil': 'BBC', 'The New York Times': 'NYT', 'The Guardian': 'G',
    'Al Jazeera': 'AJ', NPR: 'npr', g1: 'g1', 'Folha de S.Paulo': 'F', 'Agência Brasil': 'AB', 'CNN Brasil': 'CNN',
  };
  var PAGE_SIZE = 20;
  var REFRESH_MS = 10 * 60 * 1000;
  var STORE_PREFS = 'panorama:prefs';
  var STORE_SAVED = 'panorama:saved';
  var STORE_READ = 'panorama:read';

  /* ----------------------------------------------------------------- Ícones */

  var ICON_PATHS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.8 3.2 2.8 14.8 0 18M12 3c-2.8 3.2-2.8 14.8 0 18"/>',
    capitol: '<path d="M12 3v3"/><path d="M7 11a5 5 0 0 1 10 0"/><path d="M4 11h16"/><path d="M6 11v7M10 11v7M14 11v7M18 11v7"/><path d="M3 21h18M4 18h16"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
    bookmark: '<path d="M6 3.5h12V21l-6-4.2L6 21Z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    share: '<path d="M12 15V3.5"/><path d="m7.5 8 4.5-4.5L16.5 8"/><path d="M5 12v7.5h14V12"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10.5 13.5"/><path d="M18 14v6H4V6h6"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
    translate: '<path d="M4 5h9M8.5 3v2M6 5c.8 3.4 3 6 6 7.5M11 5c-.9 3.7-3.4 6.6-7 8"/><path d="m13 21 4-9 4 9M14.4 18h5.2"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  };
  function icon(name, cls) {
    return '<svg class="icon ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICON_PATHS[name] + '</svg>';
  }

  /* -------------------------------------------------------------- Utilidades */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) {
    return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '';
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function fold(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { return null; }
    return value;
  }
  function ts(a) { var t = Date.parse(a && a.published); return isNaN(t) ? 0 : t; }
  function byDate(a, b) { return ts(b) - ts(a); }
  function sourceMark(name) {
    if (SOURCE_MARKS[name]) return SOURCE_MARKS[name];
    return String(name || '?').split(/\s+/).filter(function (w) { return /^[A-ZÀ-Ú0-9]/.test(w); }).map(function (w) { return w[0]; }).join('').slice(0, 3) || String(name || '?')[0];
  }

  var dateLong = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  var dateShort = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });
  var dateFull = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  var timeOnly = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

  function ago(t) {
    if (!t) return '';
    var diff = Math.max(0, Date.now() - t);
    var m = Math.floor(diff / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return 'há ' + m + ' min';
    var h = Math.floor(m / 60);
    if (h < 24) return 'há ' + h + ' h';
    var d = Math.floor(h / 24);
    if (d === 1) return 'ontem';
    if (d < 7) return 'há ' + d + ' dias';
    return dateShort.format(t).replace('.', '');
  }
  function timeTag(t) {
    if (!t) return '';
    return '<time datetime="' + new Date(t).toISOString() + '" data-ts="' + t + '">' + ago(t) + '</time>';
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /* ----------------------------------------------------------------- Estado */

  var prefs = Object.assign({ theme: 'auto', size: 'm', lang: 'all' }, store(STORE_PREFS) || {});
  var saved = (store(STORE_SAVED) || []).filter(function (a) { return a && a.id; });
  var readIds = new Set(store(STORE_READ) || []);

  var state = {
    data: null,
    index: new Map(),
    view: null,
    lastView: 'inicio',
    readerOpen: false,
    readerFromApp: false,
    sourceFilter: { world: 'all', us: 'all', brazil: 'all' },
    pages: { world: 1, us: 1, brazil: 1 },
    loading: false,
    returnFocus: null,
  };

  function isSaved(id) { return saved.some(function (a) { return a.id === id; }); }
  function toggleSaved(article) {
    if (!article) return false;
    if (isSaved(article.id)) {
      saved = saved.filter(function (a) { return a.id !== article.id; });
    } else {
      saved.unshift(article);
      saved = saved.slice(0, 200);
    }
    store(STORE_SAVED, saved);
    var on = isSaved(article.id);
    $$('[data-save="' + article.id + '"]').forEach(function (b) {
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Remover dos salvos' : 'Salvar para ler depois');
    });
    return on;
  }
  function markRead(id) {
    readIds.add(id);
    if (readIds.size > 600) readIds = new Set(Array.from(readIds).slice(-500));
    store(STORE_READ, Array.from(readIds));
    $$('[data-story="' + id + '"]').forEach(function (el) { el.classList.add('is-read'); });
  }
  function visible(list) {
    list = list || [];
    return prefs.lang === 'all' ? list : list.filter(function (a) { return a.lang === prefs.lang; });
  }
  function allArticles() {
    if (!state.data) return [];
    return SECTION_KEYS.reduce(function (acc, k) { return acc.concat(visible(state.data.sections[k])); }, []).sort(byDate);
  }

  /* ------------------------------------------------------------------ Dados */

  function normalize(data) {
    var now = Date.now();
    var out = { generatedAt: data.generatedAt || new Date(now).toISOString(), mode: data.mode || 'live', notice: data.notice || '', sources: data.sources || [], sections: {} };
    SECTION_KEYS.forEach(function (k) {
      out.sections[k] = (data.sections && data.sections[k] || []).map(function (a) {
        if (a.minutesAgo != null) a = Object.assign({}, a, { published: new Date(now - a.minutesAgo * 60000).toISOString() });
        return Object.assign({ section: k, lang: 'pt', summary: '', image: null }, a);
      });
    });
    if (out.mode === 'demo') out.generatedAt = new Date(now).toISOString();
    return out;
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-cache', headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || !j.sections) throw new Error('formato inválido');
      var total = SECTION_KEYS.reduce(function (n, k) { return n + ((j.sections[k] || []).length); }, 0);
      if (!total) throw new Error('nenhuma matéria');
      return j;
    });
  }

  function loadNews(force) {
    if (window.__PANORAMA_DATA__) return Promise.resolve(normalize(window.__PANORAMA_DATA__));
    return fetchJson('api/news' + (force ? '?refresh=1' : ''))
      .catch(function () { return fetchJson('data/news.json'); })
      .catch(function () { return fetchJson('data/sample.json'); })
      .then(normalize);
  }

  function setData(data) {
    state.data = data;
    state.index = new Map();
    SECTION_KEYS.forEach(function (k) { data.sections[k].forEach(function (a) { state.index.set(a.id, a); }); });
    saved.forEach(function (a) { if (!state.index.has(a.id)) state.index.set(a.id, a); });
  }

  /* --------------------------------------------------------------- Cartões */

  function cover(a, sizes) {
    var img = safeUrl(a.image);
    return '<div class="cover" data-mark="' + esc(sourceMark(a.source)) + '">' +
      (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"' + (sizes ? ' sizes="' + sizes + '"' : '') + '>' : '') +
      '</div>';
  }

  function kicker(a, withSection) {
    return '<p class="kicker">' +
      (withSection ? '<span class="kicker__sec">' + esc(SECTIONS[a.section].label) + '</span>' : '') +
      '<span class="kicker__src">' + esc(a.source) + '</span>' +
      '</p>';
  }

  function saveButton(a) {
    var on = isSaved(a.id);
    return '<button class="save-btn' + (on ? ' is-on' : '') + '" type="button" data-save="' + esc(a.id) + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Remover dos salvos' : 'Salvar para ler depois') + '">' + icon('bookmark') + '</button>';
  }

  /**
   * variant: hero | lead | tile | row | brief
   */
  function story(a, variant, opts) {
    opts = opts || {};
    var t = ts(a);
    var hasCover = variant === 'hero' || variant === 'lead' || variant === 'tile' || variant === 'row';
    var showSummary = (variant === 'hero' || variant === 'lead') && a.summary;
    var cls = 'story story--' + variant + (readIds.has(a.id) ? ' is-read' : '') + (variant === 'row' && !a.image ? ' story--noimg' : '');
    var headingTag = variant === 'hero' ? 'h2' : 'h3';
    return '<article class="' + cls + '" data-story="' + esc(a.id) + '" style="--k: var(--sec-' + a.section + ')">' +
      '<a class="story__link" href="#a-' + esc(a.id) + '">' +
        (hasCover ? cover(a) : '') +
        '<div class="story__body">' +
          kicker(a, opts.section !== false) +
          '<' + headingTag + ' class="story__title">' + esc(a.title) + '</' + headingTag + '>' +
          (showSummary ? '<p class="story__summary">' + esc(a.summary) + '</p>' : '') +
          '<p class="story__meta">' + timeTag(t) + (a.lang === 'en' ? '<span class="lang-tag" title="Matéria em inglês">EN</span>' : '') + '</p>' +
        '</div>' +
      '</a>' +
      (variant !== 'brief' ? saveButton(a) : '') +
    '</article>';
  }

  /* ------------------------------------------------------------------ Shell */

  function navLinks(cls) {
    var items = [
      { view: 'inicio', label: 'Início', icon: 'home' },
      { view: 'mundo', label: 'Mundo', icon: 'globe' },
      { view: 'eua', label: 'EUA', icon: 'capitol' },
      { view: 'brasil', label: 'Brasil', icon: 'pin' },
      { view: 'salvos', label: 'Salvos', icon: 'bookmark' },
    ];
    return items.map(function (it) {
      return '<a class="' + cls + '" href="#' + it.view + '" data-nav="' + it.view + '">' + icon(it.icon) + '<span>' + it.label + '</span></a>';
    }).join('');
  }

  function renderShell() {
    var app = $('#app');
    app.innerHTML =
      '<a class="skip" href="#view">Pular para o conteúdo</a>' +
      '<header class="masthead" id="masthead">' +
        '<div class="masthead__bar wrap">' +
          '<a class="brand" href="#inicio" aria-label="Panorama, página inicial"><span class="brand__mark" aria-hidden="true"></span><span class="brand__name">Panorama</span></a>' +
          '<nav class="topnav" aria-label="Seções">' + navLinks('topnav__link') + '</nav>' +
          '<div class="masthead__actions">' +
            '<button class="icon-btn" type="button" data-action="search" aria-label="Buscar notícias (atalho: /)">' + icon('search') + '</button>' +
            '<button class="icon-btn" type="button" data-action="settings" aria-label="Ajustes">' + icon('sliders') + '</button>' +
          '</div>' +
        '</div>' +
      '</header>' +
      '<div class="notice" id="notice" hidden></div>' +
      '<main id="view" class="view wrap" tabindex="-1" aria-live="polite"></main>' +
      '<footer class="footer wrap" id="footer"></footer>' +
      '<nav class="tabbar" aria-label="Seções">' + navLinks('tabbar__link') + '</nav>' +

      // Leitor
      '<div class="reader" id="reader" hidden>' +
        '<div class="reader__scrim" data-action="close-reader"></div>' +
        '<div class="reader__panel" role="dialog" aria-modal="true" aria-labelledby="reader-title">' +
          '<div class="reader__bar">' +
            '<button class="icon-btn" type="button" data-action="close-reader" aria-label="Fechar matéria">' + icon('back', 'only-mobile') + icon('close', 'only-desktop') + '</button>' +
            '<span class="reader__bar-title" id="reader-bar-title"></span>' +
            '<span class="reader__bar-actions" id="reader-actions"></span>' +
          '</div>' +
          '<div class="reader__scroll" id="reader-scroll"></div>' +
        '</div>' +
      '</div>' +

      // Busca
      '<div class="search" id="search" hidden role="dialog" aria-modal="true" aria-label="Buscar notícias">' +
        '<div class="search__panel">' +
          '<div class="search__field wrap">' +
            icon('search', 'search__glyph') +
            '<input id="search-input" type="search" placeholder="Buscar em todas as notícias" autocomplete="off" spellcheck="false" aria-label="Termo de busca">' +
            '<button class="text-btn" type="button" data-action="close-search">Fechar</button>' +
          '</div>' +
          '<div class="search__results wrap" id="search-results"></div>' +
        '</div>' +
      '</div>' +

      // Ajustes
      '<div class="sheet" id="settings" hidden>' +
        '<div class="sheet__scrim" data-action="close-settings"></div>' +
        '<div class="sheet__panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">' +
          '<div class="sheet__head"><h2 id="settings-title">Ajustes</h2><button class="icon-btn" type="button" data-action="close-settings" aria-label="Fechar ajustes">' + icon('close') + '</button></div>' +
          '<div class="sheet__body" id="settings-body"></div>' +
        '</div>' +
      '</div>' +

      '<div class="toast" id="toast" role="status" aria-live="polite"></div>';
  }

  function setActiveNav(view) {
    $$('[data-nav]').forEach(function (a) {
      var on = a.getAttribute('data-nav') === view;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function renderNotice() {
    var el = $('#notice');
    var d = state.data;
    var msg = '';
    if (!navigator.onLine) {
      msg = '<strong>Sem conexão.</strong> Mostrando as últimas notícias carregadas.';
    } else if (d && d.mode === 'demo') {
      msg = d.notice || '<strong>Notícias de exemplo.</strong> As fontes reais não responderam. Rode <code>npm start</code> ou publique no GitHub Pages para receber as manchetes ao vivo.';
    }
    el.hidden = !msg;
    el.innerHTML = msg ? '<div class="wrap notice__inner">' + msg + '</div>' : '';
  }

  function renderFooter() {
    var d = state.data;
    var okSources = d ? d.sources.filter(function (s) { return s.ok; }) : [];
    var names = Array.from(new Set(okSources.map(function (s) { return s.name; })));
    $('#footer').innerHTML =
      '<div class="footer__brand"><span class="brand__mark" aria-hidden="true"></span> Panorama</div>' +
      '<p>' + (names.length ? 'Manchetes e resumos de ' + esc(names.join(', ')) + '. ' : '') +
      'Cada matéria pertence ao seu veículo; o Panorama mostra o resumo e leva você ao texto original.</p>';
  }

  /* ---------------------------------------------------------------- Início */

  function clocksHtml() {
    return CLOCKS.map(function (c) {
      return '<span class="clock"><span class="clock__city">' + c.city + '</span> <time class="clock__time" data-tz="' + c.tz + '">' + clockTime(c.tz) + '</time></span>';
    }).join('');
  }
  function clockTime(tz) {
    try { return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date()); }
    catch (e) { return ''; }
  }

  function updatedLabel() {
    var d = state.data;
    if (!d) return '';
    return 'Atualizado às ' + timeOnly.format(new Date(d.generatedAt));
  }

  function dateline() {
    return '<section class="dateline" aria-label="Data e horários">' +
      '<div class="dateline__date"><p class="dateline__day">' + esc(cap(dateLong.format(new Date()))) + '</p>' +
      '<p class="dateline__clocks">' + clocksHtml() + '</p></div>' +
      '<button class="refresh-btn" type="button" data-action="refresh" aria-label="Atualizar notícias">' + icon('refresh') + '<span id="updated-label">' + esc(updatedLabel()) + '</span></button>' +
    '</section>';
  }

  function ticker(items) {
    if (!items.length) return '';
    return '<section class="ticker" aria-labelledby="ticker-title">' +
      '<h2 class="ticker__label" id="ticker-title"><span class="live-dot" aria-hidden="true"></span>Última hora</h2>' +
      '<ol class="ticker__list">' + items.map(function (a) {
        return '<li><a class="ticker__item" href="#a-' + esc(a.id) + '" style="--k: var(--sec-' + a.section + ')">' +
          '<span class="ticker__meta"><span class="ticker__sec">' + esc(SECTIONS[a.section].label) + '</span> ' + timeTag(ts(a)) + '</span>' +
          '<span class="ticker__title">' + esc(a.title) + '</span></a></li>';
      }).join('') + '</ol>' +
    '</section>';
  }

  function sectionHead(key, title, link) {
    return '<header class="block__head" style="--k: var(--sec-' + key + ')">' +
      '<h2 class="block__title">' + esc(title) + '</h2>' +
      (link ? '<a class="block__more" href="#' + link + '">Ver tudo ' + icon('arrow') + '</a>' : '') +
    '</header>';
  }

  function renderHome() {
    var all = allArticles();
    if (!all.length) return emptyState('Nenhuma notícia por aqui', prefs.lang !== 'all' ? 'O filtro de idioma está escondendo todas as matérias. Ajuste em Ajustes → Idioma das fontes.' : 'As fontes não responderam. Tente atualizar em alguns instantes.', true);

    var used = new Set();
    function take(a) { if (a) used.add(a.id); return a; }
    function free(list) { return list.filter(function (a) { return !used.has(a.id); }); }

    var now = Date.now();
    var withImg = all.filter(function (a) { return a.image; });
    var hero = take(withImg.filter(function (a) { return now - ts(a) < 6 * 3600e3; })[0] || withImg[0] || all[0]);
    var latest = free(all).slice(0, 5); latest.forEach(take);

    // Destaques: alterna entre as seções, preferindo matérias com imagem.
    var featured = [];
    var pools = SECTION_KEYS.map(function (k) { return visible(state.data.sections[k]).filter(function (a) { return !used.has(a.id); }); });
    for (var round = 0; featured.length < 4 && round < 6; round++) {
      pools.forEach(function (pool) {
        if (featured.length >= 4) return;
        var pick = pool.filter(function (a) { return !used.has(a.id) && (round > 1 || a.image); })[0];
        if (pick) featured.push(take(pick));
      });
    }

    var html = dateline() + ticker(all.slice(0, 8));

    html += '<section class="top" aria-label="Principais notícias">' +
      '<div class="top__hero">' + story(hero, 'hero') + '</div>' +
      '<aside class="top__side" aria-labelledby="latest-title">' +
        '<h2 class="side-title" id="latest-title">Mais recentes</h2>' +
        '<div class="stack">' + latest.map(function (a) { return story(a, 'row'); }).join('') + '</div>' +
      '</aside>' +
    '</section>';

    if (featured.length) {
      html += '<section class="block block--featured" aria-label="Em destaque">' +
        sectionHead('accent', 'Em destaque') +
        '<div class="rail">' + featured.map(function (a) { return story(a, 'tile'); }).join('') + '</div>' +
      '</section>';
    }

    SECTION_KEYS.forEach(function (k) {
      var pool = free(visible(state.data.sections[k]));
      if (!pool.length) return;
      var lead = take(pool.filter(function (a) { return a.image; })[0] || pool[0]);
      var rest = free(pool).slice(0, 4); rest.forEach(take);
      html += '<section class="block block--section" aria-label="' + esc(SECTIONS[k].title) + '">' +
        sectionHead(k, SECTIONS[k].title, SECTIONS[k].slug) +
        '<div class="block__grid">' +
          '<div class="block__lead">' + story(lead, 'lead', { section: false }) + '</div>' +
          '<div class="block__list stack">' + rest.map(function (a) { return story(a, 'row', { section: false }); }).join('') + '</div>' +
        '</div>' +
      '</section>';
    });

    return html;
  }

  /* ---------------------------------------------------------------- Seções */

  function renderSection(key) {
    var meta = SECTIONS[key];
    var list = visible(state.data.sections[key]);
    var sources = Array.from(new Set(list.map(function (a) { return a.source; }))).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
    var filter = state.sourceFilter[key];
    if (filter !== 'all' && sources.indexOf(filter) === -1) filter = state.sourceFilter[key] = 'all';
    var items = filter === 'all' ? list : list.filter(function (a) { return a.source === filter; });

    var chips = sources.length > 1
      ? '<div class="chips" role="group" aria-label="Filtrar por fonte">' +
          ['all'].concat(sources).map(function (s) {
            var on = s === filter;
            return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-filter="' + esc(s) + '" data-section="' + key + '">' + (s === 'all' ? 'Todas as fontes' : esc(s)) + '</button>';
          }).join('') +
        '</div>'
      : '';

    var head = '<header class="page-head" style="--k: var(--sec-' + key + ')">' +
      '<p class="page-head__eyebrow">' + icon(meta.icon) + ' Editoria</p>' +
      '<h1 class="page-head__title">' + esc(meta.title) + '</h1>' +
      '<p class="page-head__blurb">' + esc(meta.blurb) + '</p>' +
      '<p class="page-head__count">' + list.length + ' matérias de ' + sources.length + (sources.length === 1 ? ' fonte' : ' fontes') + ' · ' + esc(updatedLabel().toLowerCase()) + '</p>' +
      chips +
    '</header>';

    if (!items.length) {
      return head + emptyState('Nada nesta editoria', prefs.lang !== 'all' ? 'Nenhuma fonte neste idioma cobre esta editoria. Mude o idioma em Ajustes.' : 'As fontes desta editoria não responderam agora.', true);
    }

    var lead = items.filter(function (a) { return a.image; })[0] || items[0];
    var rest = items.filter(function (a) { return a !== lead; });
    var tiles = rest.slice(0, 6);
    var more = rest.slice(6);
    var shown = more.slice(0, (state.pages[key] - 1) * PAGE_SIZE + PAGE_SIZE);

    var html = head +
      '<section class="section-top">' + story(lead, 'hero', { section: false }) + '</section>' +
      (tiles.length ? '<section class="tiles" aria-label="Destaques da editoria">' + tiles.map(function (a) { return story(a, 'tile', { section: false }); }).join('') + '</section>' : '');

    if (shown.length) {
      html += '<section class="more" aria-labelledby="more-title-' + key + '">' +
        '<h2 class="side-title" id="more-title-' + key + '">Todas as notícias</h2>' +
        '<div class="stack stack--wide">' + shown.map(function (a) { return story(a, 'row', { section: false }); }).join('') + '</div>' +
        (shown.length < more.length ? '<button class="more-btn" type="button" data-action="more" data-section="' + key + '">Carregar mais notícias</button>' : '<p class="end-note">Você chegou ao fim desta editoria.</p>') +
      '</section>';
    }
    return html;
  }

  function renderSaved() {
    var head = '<header class="page-head" style="--k: var(--accent)">' +
      '<p class="page-head__eyebrow">' + icon('bookmark') + ' Sua lista</p>' +
      '<h1 class="page-head__title">Salvos</h1>' +
      '<p class="page-head__blurb">Matérias guardadas para ler depois. Ficam neste aparelho, mesmo quando saem das capas.</p>' +
    '</header>';
    if (!saved.length) {
      return head + emptyState('Nada salvo ainda', 'Toque no marcador de qualquer matéria para guardá-la aqui.', false);
    }
    return head + '<div class="stack stack--wide">' + saved.map(function (a) { return story(a, 'row'); }).join('') + '</div>';
  }

  function emptyState(title, text, withRetry) {
    return '<div class="empty">' +
      '<div class="empty__art" aria-hidden="true">' + icon('globe') + '</div>' +
      '<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p>' +
      (withRetry ? '<button class="more-btn" type="button" data-action="refresh">Tentar de novo</button>' : '') +
    '</div>';
  }

  function skeleton() {
    var row = '<div class="sk-row"><div class="sk sk-line"></div><div class="sk sk-line sk-line--short"></div><div class="sk sk-thumb"></div></div>';
    return '<div class="skeleton" aria-busy="true" aria-label="Carregando notícias">' +
      '<div class="sk sk-line sk-line--date"></div>' +
      '<div class="sk-top"><div><div class="sk sk-cover"></div><div class="sk sk-title"></div><div class="sk sk-title sk-title--short"></div></div>' +
      '<div>' + row + row + row + '</div></div>' +
    '</div>';
  }

  /* ---------------------------------------------------------------- Render */

  function renderView(view, opts) {
    opts = opts || {};
    var main = $('#view');
    var keepScroll = opts.keepScroll ? window.scrollY : 0;
    state.view = view;
    state.lastView = view;
    setActiveNav(view);
    document.title = (view === 'inicio' ? 'Panorama Notícias' : (SLUG_TO_SECTION[view] ? SECTIONS[SLUG_TO_SECTION[view]].title : 'Salvos') + ' · Panorama');

    if (!state.data) {
      main.innerHTML = skeleton();
      return;
    }
    var html;
    if (view === 'salvos') html = renderSaved();
    else if (SLUG_TO_SECTION[view]) html = renderSection(SLUG_TO_SECTION[view]);
    else html = renderHome();
    main.innerHTML = html;
    main.setAttribute('data-view', view);
    if (opts.keepScroll) window.scrollTo(0, keepScroll);
    else if (!opts.noScroll) window.scrollTo(0, 0);
  }

  /* ----------------------------------------------------------------- Leitor */

  function openReader(id) {
    var a = state.index.get(id);
    if (!a) {
      toast('Esta matéria não está mais disponível.');
      goTo(state.lastView || 'inicio', true);
      return;
    }
    var reader = $('#reader');
    var t = ts(a);
    var link = safeUrl(a.link);
    var isDemo = state.data && state.data.mode === 'demo' && !link;
    var related = visible(state.data.sections[a.section] || []).filter(function (x) { return x.id !== a.id; }).slice(0, 4);

    $('#reader-bar-title').textContent = a.source;
    $('#reader-actions').innerHTML =
      '<button class="icon-btn" type="button" data-action="share" data-id="' + esc(a.id) + '" aria-label="Compartilhar">' + icon('share') + '</button>' +
      saveButton(a).replace('save-btn', 'icon-btn save-btn save-btn--bar');

    $('#reader-scroll').innerHTML =
      '<article class="article" style="--k: var(--sec-' + a.section + ')">' +
        (a.image ? '<figure class="article__cover">' + cover(a) + '</figure>' : '') +
        '<div class="article__body">' +
          '<p class="kicker"><a class="kicker__sec" href="#' + SECTIONS[a.section].slug + '" data-action="goto-section">' + esc(SECTIONS[a.section].title) + '</a><span class="kicker__src">' + esc(a.source) + '</span>' + (a.lang === 'en' ? '<span class="lang-tag">EN</span>' : '') + '</p>' +
          '<h1 class="article__title" id="reader-title">' + esc(a.title) + '</h1>' +
          '<p class="article__meta">' +
            (a.author ? '<span>Por ' + esc(a.author) + '</span>' : '') +
            (t ? '<span>' + esc(dateFull.format(new Date(t)).replace(/,(?=\s*\d{1,2}:)/, ' às')) + '</span><span>' + timeTag(t) + '</span>' : '') +
          '</p>' +
          (a.summary ? '<p class="article__lede">' + esc(a.summary) + '</p>' : '<p class="article__lede article__lede--muted">O veículo não publicou um resumo desta matéria.</p>') +
          '<div class="article__actions">' +
            (link
              ? '<a class="btn btn--primary" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Ler a matéria completa ' + icon('external') + '</a>' +
                (a.lang === 'en' ? '<a class="btn" href="https://translate.google.com/translate?sl=auto&amp;tl=pt&amp;u=' + encodeURIComponent(link) + '" target="_blank" rel="noopener noreferrer">' + icon('translate') + ' Ler traduzida</a>' : '')
              : '<span class="btn btn--disabled" aria-disabled="true">' + (isDemo ? 'Matéria de exemplo, sem link' : 'Link indisponível') + '</span>') +
          '</div>' +
          '<p class="article__note">Resumo publicado por <strong>' + esc(a.source) + '</strong>. O texto completo, fotos e vídeos estão no site do veículo.</p>' +
        '</div>' +
        (related.length
          ? '<section class="article__related" aria-labelledby="related-title"><h2 class="side-title" id="related-title">Mais em ' + esc(SECTIONS[a.section].title) + '</h2>' +
            '<div class="stack">' + related.map(function (x) { return story(x, 'row', { section: false }); }).join('') + '</div></section>'
          : '') +
      '</article>';

    $('#reader-scroll').scrollTop = 0;
    if (!state.readerOpen) {
      state.returnFocus = document.activeElement;
      reader.hidden = false;
      document.documentElement.classList.add('has-overlay');
      requestAnimationFrame(function () { reader.classList.add('is-open'); });
    }
    state.readerOpen = true;
    markRead(a.id);
    document.title = a.title + ' · Panorama';
    setTimeout(function () { var b = $('#reader [data-action="close-reader"].icon-btn'); if (b) b.focus({ preventScroll: true }); }, 30);
  }

  function hideReader() {
    if (!state.readerOpen) return;
    var reader = $('#reader');
    state.readerOpen = false;
    reader.classList.remove('is-open');
    document.documentElement.classList.remove('has-overlay');
    setTimeout(function () { if (!state.readerOpen) reader.hidden = true; }, 260);
    if (state.returnFocus && document.contains(state.returnFocus)) {
      try { state.returnFocus.focus({ preventScroll: true }); } catch (e) {}
    }
  }

  function closeReader() {
    if (state.readerFromApp) {
      state.readerFromApp = false;
      history.back();
    } else {
      goTo(state.lastView || 'inicio', true);
    }
  }

  /* ------------------------------------------------------------------ Busca */

  function openSearch() {
    var el = $('#search');
    el.hidden = false;
    document.documentElement.classList.add('has-overlay');
    requestAnimationFrame(function () { el.classList.add('is-open'); });
    var input = $('#search-input');
    input.focus();
    runSearch(input.value);
  }
  function closeSearch() {
    var el = $('#search');
    if (el.hidden) return;
    el.classList.remove('is-open');
    el.hidden = true;
    if (!state.readerOpen) document.documentElement.classList.remove('has-overlay');
  }
  function highlight(text, terms) {
    var out = esc(text);
    terms.forEach(function (term) {
      if (term.length < 2) return;
      // Destaca ignorando acentos: percorre o texto original comparando versões "dobradas".
      var folded = fold(out);
      var idx = folded.indexOf(term);
      if (idx === -1) return;
      out = out.slice(0, idx) + '<mark>' + out.slice(idx, idx + term.length) + '</mark>' + out.slice(idx + term.length);
    });
    return out;
  }
  function runSearch(q) {
    var box = $('#search-results');
    var all = allArticles();
    var terms = fold(q).split(/\s+/).filter(Boolean);
    if (!terms.length || fold(q).trim().length < 2) {
      var sources = state.data ? new Set(all.map(function (a) { return a.source; })).size : 0;
      box.innerHTML = '<p class="search__hint">Busque por pessoas, países, temas ou veículos entre ' + all.length + ' matérias de ' + sources + ' fontes.</p>' +
        '<div class="search__suggest">' + ['Economia', 'Eleições', 'Clima', 'Congresso', 'China', 'STF'].map(function (s) {
          return '<button type="button" class="chip" data-suggest="' + s + '">' + s + '</button>';
        }).join('') + '</div>';
      return;
    }
    var results = all.filter(function (a) {
      var hay = fold(a.title + ' ' + a.summary + ' ' + a.source + ' ' + SECTIONS[a.section].title);
      return terms.every(function (t) { return hay.indexOf(t) !== -1; });
    }).slice(0, 40);
    if (!results.length) {
      box.innerHTML = '<p class="search__hint">Nenhuma matéria encontrada para “' + esc(q) + '”. Tente outra palavra ou verifique o filtro de idioma em Ajustes.</p>';
      return;
    }
    box.innerHTML = '<p class="search__count">' + results.length + (results.length === 1 ? ' resultado' : ' resultados') + '</p>' +
      '<ol class="search__list">' + results.map(function (a) {
        return '<li><a class="result" href="#a-' + esc(a.id) + '" style="--k: var(--sec-' + a.section + ')">' +
          '<span class="kicker"><span class="kicker__sec">' + esc(SECTIONS[a.section].label) + '</span><span class="kicker__src">' + esc(a.source) + '</span></span>' +
          '<span class="result__title">' + highlight(a.title, terms) + '</span>' +
          '<span class="result__meta">' + timeTag(ts(a)) + '</span>' +
        '</a></li>';
      }).join('') + '</ol>';
  }

  /* ---------------------------------------------------------------- Ajustes */

  function segmented(name, label, options, current) {
    return '<fieldset class="field"><legend>' + label + '</legend><div class="segmented">' +
      options.map(function (o) {
        var id = 'pref-' + name + '-' + o[0];
        return '<input type="radio" name="' + name + '" id="' + id + '" value="' + o[0] + '"' + (o[0] === current ? ' checked' : '') + '>' +
          '<label for="' + id + '">' + o[1] + '</label>';
      }).join('') +
    '</div></fieldset>';
  }

  function renderSettings() {
    var d = state.data;
    var sources = d ? d.sources : [];
    var groups = SECTION_KEYS.map(function (k) {
      var list = sources.filter(function (s) { return s.section === k; });
      if (!list.length) return '';
      return '<div class="sources__group"><h4>' + SECTIONS[k].title + '</h4><ul>' + list.map(function (s) {
        var status = s.ok ? (s.count + ' matérias') : 'sem resposta';
        return '<li class="' + (s.ok ? 'is-ok' : 'is-off') + '"><span class="status-dot" aria-hidden="true"></span>' +
          (safeUrl(s.home) ? '<a href="' + esc(s.home) + '" target="_blank" rel="noopener noreferrer">' + esc(s.name) + '</a>' : esc(s.name)) +
          ' <span class="lang-tag">' + esc((s.lang || '').toUpperCase()) + '</span>' +
          '<span class="sources__status">' + status + '</span></li>';
      }).join('') + '</ul></div>';
    }).join('');

    $('#settings-body').innerHTML =
      segmented('theme', 'Aparência', [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']], prefs.theme) +
      segmented('size', 'Tamanho do texto', [['s', 'A−'], ['m', 'A'], ['l', 'A+'], ['xl', 'A++']], prefs.size) +
      segmented('lang', 'Idioma das fontes', [['all', 'Todos'], ['pt', 'Português'], ['en', 'Inglês']], prefs.lang) +
      '<section class="sources"><h3>Fontes</h3>' +
        '<p class="sources__lede">' + (d ? esc(updatedLabel()) + (d.mode === 'demo' ? ' · modo de exemplo' : '') + '.' : '') + ' Em inglês, use “Ler traduzida” para abrir a matéria em português.</p>' +
        (groups || '<p class="sources__lede">Nenhuma fonte carregada.</p>') +
      '</section>' +
      '<section class="about"><h3>Sobre</h3><p>Panorama reúne manchetes de veículos do Brasil, dos Estados Unidos e do mundo. As matérias são de seus autores; aqui você lê o resumo e segue para o texto original.</p>' +
      '<p class="about__keys">Atalhos: <kbd>/</kbd> busca · <kbd>Esc</kbd> fecha</p></section>';
  }

  function openSettings() {
    renderSettings();
    var el = $('#settings');
    el.hidden = false;
    document.documentElement.classList.add('has-overlay');
    requestAnimationFrame(function () { el.classList.add('is-open'); });
    setTimeout(function () { var b = $('#settings .sheet__head .icon-btn'); if (b) b.focus({ preventScroll: true }); }, 30);
  }
  function closeSettings() {
    var el = $('#settings');
    if (el.hidden) return;
    el.classList.remove('is-open');
    if (!state.readerOpen) document.documentElement.classList.remove('has-overlay');
    setTimeout(function () { el.hidden = true; }, 240);
  }

  function applyPrefs() {
    var root = document.documentElement;
    if (prefs.theme === 'light' || prefs.theme === 'dark') root.setAttribute('data-theme', prefs.theme);
    else root.removeAttribute('data-theme');
    root.setAttribute('data-size', prefs.size);
    store(STORE_PREFS, prefs);
  }

  /* ------------------------------------------------------------------ Toast */

  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 2600);
  }

  /* ----------------------------------------------------------------- Rotas */

  function currentHash() {
    try { return decodeURIComponent(location.hash.replace(/^#\/?/, '')); } catch (e) { return ''; }
  }

  function goTo(view, replace) {
    var hash = '#' + view;
    if (replace) {
      try { history.replaceState(null, '', hash); route(); return; } catch (e) { /* cai no hash */ }
    }
    if (location.hash === hash) route(); else location.hash = hash;
  }

  function route() {
    var h = currentHash();
    if (h.indexOf('a-') === 0) {
      if (!state.view) renderView(state.lastView || 'inicio');
      if (state.data) openReader(h.slice(2));
      return;
    }
    if (state.readerOpen) hideReader();
    closeSearch();
    var view = VIEWS.indexOf(h) !== -1 ? h : 'inicio';
    var restoring = view === state.view && state.data && $('#view').getAttribute('data-view') === view;
    if (!restoring) renderView(view);
  }

  /* --------------------------------------------------------------- Atualizar */

  function refresh(manual) {
    if (state.loading) return;
    state.loading = true;
    var btn = $('.refresh-btn');
    if (btn) btn.classList.add('is-spinning');
    var before = new Set(state.index.keys());
    loadNews(manual).then(function (data) {
      setData(data);
      var fresh = 0;
      state.index.forEach(function (_, id) { if (!before.has(id)) fresh++; });
      renderNotice();
      renderFooter();
      if (!state.readerOpen) renderView(state.view || 'inicio', { keepScroll: true });
      if (manual) toast(fresh ? fresh + (fresh === 1 ? ' notícia nova' : ' notícias novas') : 'Você está em dia');
      if (!$('#settings').hidden) renderSettings();
    }).catch(function () {
      if (manual) toast('Não foi possível atualizar. Verifique sua conexão.');
    }).then(function () {
      state.loading = false;
      var b = $('.refresh-btn');
      if (b) b.classList.remove('is-spinning');
    });
  }

  /* ---------------------------------------------------------------- Eventos */

  function share(a) {
    var url = safeUrl(a.link) || location.href;
    if (navigator.share) {
      navigator.share({ title: a.title, text: a.source, url: url }).catch(function (err) {
        if (err && err.name !== 'AbortError') copyLink(url);
      });
    } else {
      copyLink(url);
    }
  }
  function copyLink(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { toast('Link copiado'); }, function () { toast(url); });
    } else {
      toast(url);
    }
  }

  function bindEvents() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-save], [data-action], [data-filter], [data-suggest], a[href^="#a-"]');
      if (!t) return;

      if (t.hasAttribute('data-save')) {
        e.preventDefault();
        var a = state.index.get(t.getAttribute('data-save'));
        var on = toggleSaved(a);
        toast(on ? 'Salvo para ler depois' : 'Removido dos salvos');
        if (state.view === 'salvos' && !state.readerOpen) renderView('salvos', { keepScroll: true });
        return;
      }
      if (t.hasAttribute('data-filter')) {
        var key = t.getAttribute('data-section');
        state.sourceFilter[key] = t.getAttribute('data-filter');
        state.pages[key] = 1;
        renderView(state.view, { keepScroll: true });
        return;
      }
      if (t.hasAttribute('data-suggest')) {
        var input = $('#search-input');
        input.value = t.getAttribute('data-suggest');
        runSearch(input.value);
        input.focus();
        return;
      }
      if (t.matches('a[href^="#a-"]')) {
        if (state.readerOpen) {
          // Matéria relacionada dentro do leitor: troca sem empilhar histórico.
          e.preventDefault();
          var nextId = t.getAttribute('href').slice(3);
          try { history.replaceState(null, '', '#a-' + nextId); } catch (err) { /* segue */ }
          openReader(nextId);
          return;
        }
        // Abrir matéria a partir do app: o "voltar" deve fechar o leitor.
        state.readerFromApp = true;
        if (!$('#search').hidden) closeSearch();
        return;
      }

      var action = t.getAttribute('data-action');
      switch (action) {
        case 'search': openSearch(); break;
        case 'close-search': closeSearch(); break;
        case 'settings': openSettings(); break;
        case 'close-settings': closeSettings(); break;
        case 'close-reader': e.preventDefault(); closeReader(); break;
        case 'goto-section':
          e.preventDefault();
          state.readerFromApp = false;
          goTo(t.getAttribute('href').slice(1), true);
          break;
        case 'refresh': refresh(true); break;
        case 'more':
          var s = t.getAttribute('data-section');
          state.pages[s]++;
          renderView(state.view, { keepScroll: true });
          break;
        case 'share':
          var art = state.index.get(t.getAttribute('data-id'));
          if (art) share(art);
          break;
      }
    });

    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t.name === 'theme' || t.name === 'size' || t.name === 'lang') {
        prefs[t.name] = t.value;
        applyPrefs();
        if (t.name === 'lang') {
          renderView(state.view || 'inicio', { noScroll: true });
          renderSettings();
          var r = $('#pref-lang-' + t.value);
          if (r) r.focus();
        }
      }
    });

    var searchTimer;
    document.addEventListener('input', function (e) {
      if (e.target.id === 'search-input') {
        clearTimeout(searchTimer);
        var v = e.target.value;
        searchTimer = setTimeout(function () { runSearch(v); }, 90);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('#search').hidden) { closeSearch(); return; }
        if (!$('#settings').hidden) { closeSettings(); return; }
        if (state.readerOpen) { closeReader(); return; }
      }
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
        e.preventDefault();
        openSearch();
      }
    });

    // Imagens que falham viram a capa ilustrada da fonte.
    document.addEventListener('error', function (e) {
      var img = e.target;
      if (img && img.tagName === 'IMG' && img.parentNode && img.parentNode.classList.contains('cover')) {
        img.parentNode.classList.add('cover--fallback');
        img.remove();
      }
    }, true);
    document.addEventListener('load', function (e) {
      var img = e.target;
      if (img && img.tagName === 'IMG' && img.parentNode && img.parentNode.classList.contains('cover')) img.classList.add('is-loaded');
    }, true);

    window.addEventListener('hashchange', route);
    window.addEventListener('online', function () { renderNotice(); refresh(false); });
    window.addEventListener('offline', renderNotice);

    var header = $('#masthead');
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        header.classList.toggle('is-scrolled', window.scrollY > 6);
        ticking = false;
      });
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && state.data && state.data.mode !== 'demo' && Date.now() - Date.parse(state.data.generatedAt) > REFRESH_MS) refresh(false);
    });
  }

  function tick() {
    $$('time[data-ts]').forEach(function (el) { el.textContent = ago(+el.getAttribute('data-ts')); });
    $$('time[data-tz]').forEach(function (el) { el.textContent = clockTime(el.getAttribute('data-tz')); });
  }

  /* ----------------------------------------------------------------- Início */

  function start() {
    renderShell();
    applyPrefs();
    bindEvents();
    state.lastView = VIEWS.indexOf(currentHash()) !== -1 ? currentHash() : 'inicio';
    renderView(state.lastView);

    loadNews(false).then(function (data) {
      setData(data);
      renderNotice();
      renderFooter();
      state.view = null;
      route();
    }).catch(function () {
      $('#view').innerHTML = emptyState('Não foi possível carregar', 'Verifique sua conexão e tente de novo.', true);
    });

    setInterval(tick, 30000);
    setInterval(function () {
      if (document.visibilityState === 'visible' && state.data && state.data.mode !== 'demo') refresh(false);
    }, REFRESH_MS);

    if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.__PANORAMA_DATA__) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
