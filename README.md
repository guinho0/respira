# Respira — app para parar de fumar (v1)

**Acesse:** https://guinho0.github.io/respira/

PWA (app web instalável no celular) em HTML/CSS/JS puro, sem etapa de build.
Os dados ficam no aparelho (localStorage), com exportar/importar backup. Quem cria um perfil na aba **Amigos** passa a ter uma cópia na nuvem (Supabase).

## Funcionalidades
- **Registro de cada cigarro** com um toque; depois, opcionalmente, gatilho (café, estresse, álcool…) e intensidade da vontade.
- **Alertas de excesso**: ao atingir/passar o limite diário e quando fuma N cigarros em M minutos.
- **Marcos de recuperação** (1 dia, 3 dias, 1 semana, 1 mês… 15 anos) com mensagem de benefício à saúde e valor economizado.
- **Ajustes**: tipo de cigarro, preço do maço, cigarros por maço, consumo anterior, limite diário, água.
- **Água**: meta diária que aumenta a cada cigarro (padrão 250 ml por cigarro) e lembrete ao registrar.
- **Modo festa** (quando for beber): registro com um toque, lembretes periódicos com botão “+1 cigarro” na notificação, e fechamento pela **contagem do maço** (quantos tinha no início − quantos sobraram + comprados + filados). Os que faltarem são adicionados como estimados.
- **Esqueci de registrar**: adiciona N cigarros distribuídos num intervalo de tempo.
- **SOS vontade**: respiração guiada + cronômetro de 3 minutos + dica; conta “vontades vencidas”.
- **Histórico**: últimos 7 dias, horários em que mais fuma, gatilhos, lista editável.
- **Impacto**: total gasto, projeção anual e estimativa de vida perdida (~20 min/cigarro, UCL 2025).
- **Ranking com fumaça**: o nível sobe com o tempo sem fumar acumulado — Fumaça → Bronze (8h) → Prata (1 dia) → Ouro (3 dias) → Platina (1 semana) → Esmeralda (2 semanas) → Diamante (1 mês) → Mestre (3 meses) → Grão-mestre (6 meses) → Lenda (1 ano). Um cigarro não derruba o nível: cada um cobre o ícone de fumaça, e no 3º você cai um nível (para o início dele) e a fumaça zera. Subir de nível limpa a fumaça.
- **Instalar app**: botão “Instalar” no Android/Chrome e passo a passo do Compartilhar → Adicionar à Tela de Início no iPhone.
- **Amigos**: nickname, grupos com código/link de convite e placar ordenado por tempo sem fumar. Os amigos veem só nickname, nível, tempo sem fumar, recorde e vontades vencidas.
- **Avisos dos amigos**: notificação quando alguém entra num grupo seu e quando um amigo completa um marco (1 dia, 3 dias, 1 semana…), dizendo se subiu de nível. Pode ser desligado em Ajustes → Notificações.
- **Tema** claro, escuro ou automático (segue o celular), em Ajustes → Aparência.

## Configurar o Supabase (grátis)
1. Crie um projeto em https://supabase.com (plano Free).
2. **SQL Editor → New query**: cole e rode [supabase/schema.sql](supabase/schema.sql).
3. **Authentication → Sign In / Providers**: ative **Allow anonymous sign-ins** (o perfil é criado sem pedir e-mail). Deixe o provedor **Email** ligado (para quem quiser recuperar a conta em outro aparelho).
4. **Authentication → URL Configuration**: em *Site URL* e *Redirect URLs* coloque `https://guinho0.github.io/respira/` (e `http://localhost:8080/` para testes).
5. **Project Settings → API**: copie a *Project URL* e a chave *anon/publishable* para [config.js](config.js). A chave é pública por design — a proteção vem das regras RLS do schema. Nunca use a chave *service_role/secret*.
6. Projetos criados antes do ranking com fumaça: rode também [supabase/002_ranking_fumaca.sql](supabase/002_ranking_fumaca.sql).

Sem `config.js` preenchido, o app funciona normalmente, só sem perfil e grupos.
No plano Free, o projeto é pausado após 7 dias sem nenhum acesso; basta reativar no painel.

## Rodar localmente
```bash
python -m http.server 8080
# abra http://localhost:8080
```
(Service worker e notificações exigem `localhost` ou HTTPS.)

## Publicação
O site é publicado automaticamente pelo **GitHub Pages** a cada `git push` na branch `main`.

### Alternativa: Vercel
1. Crie um repositório no GitHub e envie esta pasta.
2. Em vercel.com → **Add New → Project** → importe o repositório.
3. Framework preset: **Other**. Sem build command, output directory = raiz. Deploy.

Sem GitHub: com Node instalado, `npx vercel` nesta pasta. Alternativa sem instalar nada: arrastar a pasta em https://app.netlify.com/drop.

## Limitações da v1
- Notificações são disparadas pelo próprio app: funcionam com o app aberto ou recém-minimizado. Com o app fechado por horas, o marco é avisado na próxima abertura. Para lembretes confiáveis com o app fechado (ex.: modo festa, “1 dia sem fumar”), a v2 precisa de **Web Push com um backend** (ex.: Railway + VAPID).
- iPhone: notificações só com o app instalado na Tela de Início (iOS 16.4+).
- Sincronização "o mais recente vence": se o mesmo perfil for usado em dois aparelhos ao mesmo tempo, as mudanças de um podem sobrescrever as do outro.
- Os avisos dos amigos são verificados pelo próprio app (a cada minuto com ele aberto, e ao abrir). Com o app fechado, a novidade aparece na próxima abertura; para avisar com o app fechado é preciso Web Push (Supabase Edge Function + VAPID).
- Contas sem e-mail ficam presas ao aparelho: limpar os dados do navegador perde o acesso ao perfil (adicione um e-mail em Amigos → Conta).
