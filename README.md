# Respira — app para parar de fumar (v1)

**Acesse:** https://guinho0.github.io/respira/

PWA (app web instalável no celular) em HTML/CSS/JS puro, sem etapa de build.
Os dados ficam salvos só no aparelho (localStorage), com exportar/importar backup.

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
- Os dados não sincronizam entre aparelhos (v2: contas + banco).
