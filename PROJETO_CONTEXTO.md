# Respira — contexto do projeto (para continuidade)

> Documento escrito em 2026-11-24 para que o Claude Code (ou o Thiago) retome o projeto numa máquina nova, sem o histórico antigo.
> Fontes: git log, README, código, uma memória antiga do Claude (de 2026-09-28) e menções ao projeto numa conversa sobre LinkedIn/currículo. As conversas em que o app foi construído **não existem mais**. Por isso as decisões abaixo vêm sobretudo das mensagens de commit e do README.

## Resumo

- **O que é:** "Respira — pare de fumar". É um PWA (app web instalável no celular), em pt-BR, para quem quer acompanhar e reduzir o cigarro ou parar de fumar. Tem registro de cada cigarro, alertas de excesso, marcos de recuperação, economia, SOS de vontade, "modo festa", ranking por tempo sem fumar e grupos de amigos com placar (via Supabase).
- **Para quem:** uso pessoal do Thiago e de amigos. Também aparece no portfólio/LinkedIn dele como "PWA de saúde publicado em 3 dias". Numa versão posterior do currículo, o Respira saiu da lista para abrir espaço.
- **Status:** **em produção** (v1 + recursos sociais) em https://guinho0.github.io/respira/. Há uma suíte de testes em andamento que **não foi commitada**.
- **Última atividade:** último commit em 2026-09-30. Arquivos de teste criados em 2026-10-06 (não commitados).

## Stack e arquitetura

- **Front:** HTML/CSS/JS puro, **sem build**. Scripts globais (não usam módulos ES) carregados em `index.html`, nesta ordem: `config.js` → supabase-js v2 via CDN (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`, versão não fixada) → `app.js` → `social.js`.
- **Dados:** `localStorage`, chave `respira:v1` (o estado inteiro em JSON; `hydrate()` completa os campos que faltam). Também existe a chave `respira:install-dismissed`. Há exportar/importar backup.
- **Nuvem (opcional):** Supabase. Login anônimo, com e-mail opcional para recuperar a conta. Tabelas `profiles`, `user_data` (backup privado), `groups` e `group_members`, todas com RLS. Os amigos veem só nickname, nível, tempo sem fumar, recorde e vontades vencidas. A sincronização é do tipo "o mais recente vence".
- **Service worker** (`sw.js`): rede primeiro, cache como fallback. Trata os cliques nas notificações (ação "+1 cigarro" → `?action=add`). O nome do cache é `respira-vN` (atualmente `respira-v5`).

Mapa dos arquivos:
| Arquivo | Papel |
|---|---|
| `index.html` | Toda a UI (abas, diálogos). Script inline que aplica o tema antes do primeiro desenho |
| `app.js` (~40 KB) | Núcleo: estado, registros, alertas, marcos, modo festa, SOS, histórico, impacto, ajustes, card de instalação |
| `social.js` (~28 KB) | Ranking/níveis (`rankReplay`, `rankNow`, `friendRank`, `bestStreak`), perfil/nickname (`NICK_RE`), grupos, sincronização com Supabase, avisos dos amigos |
| `config.js` | `window.RESPIRA_CONFIG = { supabaseUrl, supabaseAnonKey }` (commitado; a chave é a publishable/anon, pública por design) |
| `styles.css` | Estilos, com tema claro/escuro |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA |
| `supabase/schema.sql` | Schema completo com as políticas RLS. Rodar no SQL Editor |
| `supabase/002_ranking_fumaca.sql` | Migração: colunas `rank_ms`, `rank_at`, `smoke` em `profiles` |
| `vercel.json` | Só `Cache-Control: no-cache` para `/sw.js` (Vercel é alternativa, não é o deploy atual) |
| `tests/` | **Não commitado.** Vitest + jsdom (ver "Onde parei") |

## Como rodar

- Sem Node: `python -m http.server 8080` e abrir http://localhost:8080. O service worker e as notificações exigem localhost ou HTTPS.
- Com Node (a máquina atual tem Node v24):
  - `npm install` (só devDependencies: `vitest`, `jsdom`, `serve`)
  - `npm start` → `serve . -l 3000`
  - `npm test` → `vitest run`; `npm run test:watch`
  - `npm run check` → `node --check` em app.js, social.js, sw.js e config.js
- **Variáveis de ambiente:** nenhuma. A única configuração é `config.js`, com `supabaseUrl` e `supabaseAnonKey`, que vêm de Supabase → Project Settings → API (Project URL e chave anon/publishable). Os valores atuais já estão no repositório. **Nunca** use a chave `service_role`/secret. Com `config.js` vazio, o app funciona só no aparelho, sem perfil nem grupos.

## Infra, deploy e serviços externos

- **GitHub:** https://github.com/guinho0/respira (branch `main`). A conta é `guinho0`.
- **Hospedagem:** GitHub Pages, publicado automaticamente a cada `git push` na `main`. URL: https://guinho0.github.io/respira/
- **Supabase:** projeto no plano Free da conta do Thiago (a URL do projeto está em `config.js`). Configuração necessária, descrita no README:
  - Anonymous sign-ins ligado e provedor Email ligado.
  - Em Site URL e Redirect URLs: `https://guinho0.github.io/respira/` e `http://localhost:8080/`.
  - Rodar `schema.sql` e, em projetos antigos, `002_ranking_fumaca.sql`.
  - O plano Free **pausa o projeto após 7 dias sem acesso**; basta reativar no painel.
- **Vercel:** só alternativa documentada (`vercel.json` existe). Não é o deploy em uso.
- **Deploy:** `git push origin main`. Ao mudar arquivos cacheados, suba a versão do cache em `sw.js` (`respira-v5` → `v6`). Os commits anteriores sempre fizeram isso.

## Histórico e decisões importantes

- **2026-09-28: v1** (commit `9255f37`). O app foi criado originalmente em outra pasta (`Desktop\projeto`, segundo a memória do Claude) e depois movido para `Projetos_pessoais\Respira_App`. Decisões:
  - **Sem build e sem Node:** na época não havia Node instalado na máquina, e a v1 era para "explorar ideias rápido".
  - O Thiago pediu pesquisa de apps parecidos (QuitNow, Kwit, Smoke Free) para se inspirar.
  - Funcionalidades que ele pediu explicitamente: registro por cigarro, alertas de excesso, notificações motivacionais de marcos, preço/economia, água por cigarro e "modo festa" (registro quando está bebendo, fechando a conta pela contagem do maço).
  - O deploy planejado era Vercel/Railway, mas acabou indo para o **GitHub Pages** (commit `5108cef`, no mesmo dia).
- **2026-09-30** (4 commits no mesmo dia):
  - `7d29311`: ranking por tempo sem fumar (Fumaça → Lenda), nickname, grupos com código/link de convite, Supabase com login anônimo e RLS.
  - `2c1aa6c`: tema claro/escuro/automático sem piscar; avisos quando alguém entra num grupo seu e quando um amigo completa um marco; grupos atualizados a cada minuto.
  - `a120482`: **"ranking com fumaça"**. O nível passou a vir do tempo acumulado sem fumar: um cigarro não derruba o nível, só cobre o ícone de fumaça, e subir de nível limpa a fumaça. O perfil publica `rank_ms`, `rank_at` e `smoke` (migração 002). Entrou também o card "Instale o Respira".
  - `60710f7`: **o 3º cigarro passou a zerar tudo** (volta para Fumaça com progresso zero). Antes, caía só um nível. Os erros de e-mail passaram a mostrar o motivo real (e-mail em uso, limite de envio do Supabase etc.).
- **2026-10-06:** criada uma suíte de testes (Vitest + jsdom) e `package.json`. **Não commitada.**
- **Descartado ou adiado:** a v2 com **Web Push de backend** (Railway + VAPID, ou Supabase Edge Function + VAPID), para que os lembretes e avisos funcionem com o app fechado. Nunca foi feita. Contas e sincronização foram feitas via Supabase, e não com um backend próprio.

## Onde parei

1. **Testes automatizados em andamento (não commitados)**, criados em 2026-10-06:
   - `package.json` e `package-lock.json` (novos): scripts `start`, `check`, `test`, `test:watch`; devDeps `vitest ^3.2.4`, `jsdom ^26.1.0`, `serve ^14.2.4`. Note que `"type": "module"` vale só para os testes; o app não usa módulos.
   - `tests/load-app.js`: carrega `index.html` + `app.js` + `social.js` num jsdom, sem Supabase e sem rodar `init()`, com relógio fixo. `run(code)` avalia uma expressão no escopo global do app.
   - `tests/app.test.js`: utilidades, hydrate/load, cálculos (preço, economia, média), `distributeLogs`, `endParty`, alertas, marcos.
   - `tests/social.test.js`: níveis/fumaça, `friendRank`, `bestStreak`, `NICK_RE`.
   - `.gitignore` modificado: acrescentado `node_modules`.
2. **Estado dos testes (rodados em 2026-11-24): 20 passam e 1 falha.** Falha `social.test.js > níveis > "fumaça acumula enquanto não sobe de nível"`: o teste espera `progress = 90 min`, mas o app retorna 120 min. Pelo código de `rankReplay()`, o progresso soma todo o tempo entre cigarros desde `startDate` (30 + 30 + 60 min = 120), o que bate com o README ("tempo sem fumar acumulado"). **Provavelmente o erro está no teste, e não no app.** Confirmar com o Thiago antes de mudar a regra.
3. `npm run check` passa.
4. Não há indício de outra tarefa pela metade no código (nenhum TODO/FIXME).

## Próximos passos

1. Corrigir a expectativa do teste que falha (ou a regra, se o Thiago quiser outra semântica). Rodar `npm test` e commitar `package.json`, `package-lock.json`, `tests/` e `.gitignore`.
2. Atualizar o README com a seção de testes (`npm install && npm test`).
3. Opcional: um GitHub Action rodando `npm test` em cada push.
4. Opcional: fixar a versão do supabase-js no CDN (hoje é `@2`, flutuante).
5. v2, se o projeto continuar: Web Push com o app fechado (Supabase Edge Function + VAPID) para o modo festa, os marcos e os avisos dos amigos.
6. Verificar se o projeto Supabase não foi pausado por inatividade (plano Free).

## Preferências do Thiago neste projeto

- Toda a UI e os textos em **pt-BR**, com tom acolhedor. Mensagens de commit também em pt-BR: título curto e corpo em bullets explicando o que mudou e o porquê.
- Gosta de **simplicidade, sem build**: arquivos estáticos que rodam direto no GitHub Pages.
- Pede funcionalidades práticas do próprio dia a dia (modo festa, "esqueci de registrar", água) e iterou rápido, com vários commits num mesmo dia.
- Mensagens de erro úteis, com a causa real, e não genéricas (motivação do commit `60710f7`).
- Todos os commits saíram com coautoria do Claude.

## Armadilhas

- **Cache do service worker:** sem subir a versão de `CACHE` em `sw.js`, os usuários podem continuar vendo a versão antiga. A estratégia é rede primeiro, mas a lista `ASSETS` é pré-cacheada.
- **Notificações** só funcionam com o app aberto ou recém-minimizado. No iPhone, só com o app instalado na Tela de Início (iOS 16.4+).
- **Contas anônimas ficam presas ao aparelho:** limpar os dados do navegador perde o perfil, a menos que um e-mail tenha sido vinculado.
- **Sincronização "o mais recente vence":** usar o mesmo perfil em dois aparelhos ao mesmo tempo pode sobrescrever dados.
- **Mudanças no ranking exigem migração SQL** no Supabase. As colunas de `profiles` são lidas pelos amigos, e `smoke` tem `check (smoke between 0 and 2)`.
- O **limite de envio de e-mail** do Supabase Free é baixo (aparece como erro ao vincular ou entrar por e-mail).
- O Supabase Free pausa após 7 dias sem acesso.
- `config.js` é commitado de propósito, porque a chave é pública e a segurança vem do RLS. Nunca coloque a `service_role` ali.
- Os testes dependem de nomes globais de `app.js`/`social.js` (`state`, `hydrate`, `rankCache`, `banner`, `$` …). Renomear funções quebra os testes.
