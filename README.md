# Panorama — notícias do Mundo, dos EUA e do Brasil

App de notícias com layout editorial, inspirado nos melhores apps do gênero. Ele reúne as manchetes das principais fontes em três editorias:

| Editoria | Fontes |
| --- | --- |
| **Mundo** | BBC News, The Guardian, The New York Times, Al Jazeera, BBC News Brasil, g1 Mundo, Folha Mundo |
| **Estados Unidos** | The New York Times (U.S. e Politics), NPR (National e Politics), BBC US & Canada, The Guardian US |
| **Brasil** | g1, g1 Política, Folha (Em cima da hora e Poder), Agência Brasil, CNN Brasil |

Matérias de feeds de "Mundo" cujo título trata dos EUA ou do Brasil são movidas para a editoria certa. Assim a aba EUA também recebe cobertura em português, e a aba Brasil recebe a cobertura internacional sobre o país.

## Recursos

- **Capa (Início):** data e relógios de Brasília, Nova York e Londres, faixa "Última hora", manchete principal, coluna "Mais recentes", carrossel "Em destaque" e um bloco para cada editoria.
- **Editorias:** página de cada região com filtro por fonte e paginação ("Carregar mais").
- **Leitor:** abre o resumo da matéria sem sair do app, com botões para ler o texto completo no site do veículo, abrir a versão **traduzida para o português** (matérias em inglês), compartilhar e salvar.
- **Salvos:** lista para ler depois, guardada no aparelho.
- **Busca** em todas as matérias, sem diferenciar acentos (atalho `/`).
- **Ajustes:** tema claro, escuro ou automático; tamanho do texto; idioma das fontes (todas, só português ou só inglês); status de cada fonte.
- **PWA:** pode ser instalado na tela inicial do celular e funciona offline com a última edição carregada.
- Matérias já lidas ficam marcadas. As notícias são atualizadas sozinhas a cada 10 minutos.
- Sem dependências: Node.js puro no servidor e JavaScript puro no navegador.

## Como rodar

Requer Node.js 18.17 ou mais recente.

```bash
npm start        # http://localhost:3000
npm test         # testes do parser de RSS e do agregador
```

O servidor busca os feeds e guarda o resultado em cache por 10 minutos (`CACHE_MINUTES` muda esse tempo e `PORT` muda a porta). O endpoint `GET /api/news` devolve tudo em JSON.

Se nenhuma fonte responder (sem internet, por exemplo), o app mostra **notícias de exemplo** com fontes fictícias e um aviso no topo.

## Publicar no GitHub Pages (grátis e com atualização automática)

O workflow `.github/workflows/pages.yml` gera uma versão estática do app com as notícias já coletadas e a publica no GitHub Pages. Ele roda a cada push na `main` e **a cada 30 minutos**.

1. Faça o merge deste código na branch `main`.
2. No GitHub, abra **Settings → Pages** e, em **Source**, escolha **GitHub Actions**.
3. Rode o workflow uma vez em **Actions → Publicar no GitHub Pages → Run workflow**.

O app fica em `https://<seu-usuário>.github.io/<repositório>/`. No celular, abra o link e use "Adicionar à Tela de Início" para instalá-lo como app.

Para gerar a versão estática localmente: `npm run build` (o resultado fica em `dist/`).

## Adicionar ou trocar fontes

Edite a lista `FEEDS` em `lib/feeds.js`. Cada fonte precisa de `id`, `name`, `section` (`world`, `us` ou `brazil`), `lang` (`pt` ou `en`), `url` do RSS e `home`. O parser lê RSS 2.0, RSS 0.91 e Atom, em UTF-8 ou ISO-8859-1.

## Estrutura

```
server.js            servidor HTTP: arquivos estáticos + /api/news com cache
lib/rss.js           parser de RSS/Atom (imagens, datas, entidades, charset)
lib/feeds.js         lista de fontes, coleta, deduplicação e classificação
scripts/build.js     gera dist/ com data/news.json para hospedagem estática
public/              o app (index.html, styles.css, app.js, sw.js, manifest)
public/data/sample.json  notícias de exemplo para quando não há conexão
test/                testes (node --test)
```

## Sobre o conteúdo

O Panorama mostra o título, o resumo e a imagem que cada veículo publica no próprio feed RSS, sempre com o nome da fonte e um link para a matéria original. O texto completo continua no site de cada veículo.
