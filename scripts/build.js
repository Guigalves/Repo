'use strict';

/**
 * Gera uma versão estática do app em ./dist, com as notícias já coletadas
 * em dist/data/news.json. Usado pelo GitHub Actions para publicar no GitHub Pages.
 *
 *   node scripts/build.js            -> coleta as fontes e gera dist/
 *   node scripts/build.js --no-fetch -> só copia os arquivos (usa os dados de exemplo)
 */

const fs = require('fs');
const path = require('path');
const { collectNews } = require('../lib/feeds');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'dist');

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(SRC, OUT, { recursive: true });

  if (process.argv.includes('--no-fetch')) {
    console.log('dist/ gerado sem coletar notícias.');
    return;
  }

  const payload = await collectNews();
  const total = Object.values(payload.sections).flat().length;
  for (const s of payload.sources) {
    console.log(`${s.ok ? '✓' : '✗'} ${s.id.padEnd(16)} ${String(s.count).padStart(3)} ${s.error || ''}`);
  }
  if (!total) {
    console.error('Nenhuma matéria coletada; abortando para não publicar um app vazio.');
    process.exit(1);
  }
  payload.mode = 'static';
  fs.writeFileSync(path.join(OUT, 'data', 'news.json'), JSON.stringify(payload));
  console.log(`dist/data/news.json: ${total} matérias.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
