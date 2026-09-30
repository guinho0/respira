'use strict';

/* ============================================================
 * Respira — app para acompanhar e reduzir o cigarro.
 * Os dados ficam no localStorage deste aparelho; com perfil criado,
 * também são sincronizados com o Supabase (ver social.js).
 * ============================================================ */

const STORAGE_KEY = 'respira:v1';
const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const LIFE_MIN_PER_CIG = 20; // UCL, 2025 (Journal of Addiction)

const TRIGGERS = ['Café', 'Estresse', 'Ansiedade', 'Álcool', 'Após refeição', 'Social', 'Tédio', 'Trabalho', 'Ao acordar', 'Outro'];

const CIG_TYPES = {
  industrializado: 'Industrializado (tradicional)',
  mentolado: 'Mentolado / aromatizado',
  palha: 'Cigarro de palha',
  enrolado: 'Enrolado (tabaco + seda)',
  cravo: 'Cigarro de cravo',
  outro: 'Outro',
};

// notify:false → aparece na lista de recuperação, mas não gera notificação
// (senão quem fuma muito receberia "20 minutos" várias vezes por dia).
const MILESTONES = [
  { id: '20m', ms: 20 * MIN, title: '20 minutos', notify: false, text: 'Sua frequência cardíaca e sua pressão arterial já começam a baixar.' },
  { id: '8h', ms: 8 * HOUR, title: '8 horas', notify: false, text: 'O monóxido de carbono no sangue caiu pela metade e o oxigênio está voltando ao normal.' },
  { id: '1d', ms: DAY, title: '1 dia', text: 'Um dia inteiro! O monóxido de carbono foi eliminado e seus pulmões começaram a expulsar muco e resíduos.' },
  { id: '2d', ms: 2 * DAY, title: '2 dias', text: 'Não há mais nicotina no seu corpo. Seu olfato e seu paladar já estão mais apurados.' },
  { id: '3d', ms: 3 * DAY, title: '3 dias', text: 'Seus brônquios relaxaram, respirar ficou mais fácil, sua circulação está melhor e seu fôlego está voltando.' },
  { id: '5d', ms: 5 * DAY, title: '5 dias', text: 'Os sintomas de abstinência começam a diminuir. Seu corpo está aprendendo a viver sem nicotina.' },
  { id: '1w', ms: 7 * DAY, title: '1 semana', text: 'Uma semana! A fase mais difícil está ficando para trás. Cada vontade dura só alguns minutos — e você está vencendo todas.' },
  { id: '10d', ms: 10 * DAY, title: '10 dias', text: 'As vontades ficam menos frequentes e muita gente relata dormir melhor nessa fase.' },
  { id: '2w', ms: 14 * DAY, title: '2 semanas', text: 'Sua circulação melhorou: caminhar e subir escadas já cansa menos.' },
  { id: '3w', ms: 21 * DAY, title: '3 semanas', text: 'Os receptores de nicotina do seu cérebro estão voltando ao normal. A vontade física está perdendo força.' },
  { id: '1mo', ms: 30 * DAY, title: '1 mês', text: 'A tosse e a falta de ar diminuem, e os cílios dos pulmões voltam a funcionar, reduzindo infecções.' },
  { id: '2mo', ms: 60 * DAY, title: '2 meses', text: 'Sua pele está mais oxigenada e a circulação continua melhorando.' },
  { id: '3mo', ms: 90 * DAY, title: '3 meses', text: 'Sua função pulmonar pode ter melhorado até 10%.' },
  { id: '6mo', ms: 182 * DAY, title: '6 meses', text: 'Menos tosse, menos catarro e menos crises de falta de ar.' },
  { id: '9mo', ms: 273 * DAY, title: '9 meses', text: 'Seus pulmões recuperaram boa parte da capacidade de se limpar sozinhos.' },
  { id: '1y', ms: 365 * DAY, title: '1 ano', text: 'Seu risco de doença coronariana caiu para metade do risco de um fumante.' },
  { id: '2y', ms: 730 * DAY, title: '2 anos', text: 'O risco de infarto continua caindo de forma significativa.' },
  { id: '5y', ms: 1826 * DAY, title: '5 anos', text: 'O risco de AVC e de cânceres de boca, garganta e esôfago caiu pela metade.' },
  { id: '10y', ms: 3652 * DAY, title: '10 anos', text: 'O risco de morrer de câncer de pulmão é cerca de metade do de quem continua fumando.' },
  { id: '15y', ms: 5479 * DAY, title: '15 anos', text: 'Seu risco de doença cardíaca é o mesmo de quem nunca fumou.' },
];

const SOS_TIPS = [
  'Beba um copo de água gelada, devagar.',
  'Escove os dentes ou masque um chiclete sem açúcar.',
  'Saia do lugar onde você está e caminhe por 5 minutos.',
  'Mande mensagem para alguém que torce por você.',
  'Coma algo crocante: cenoura, maçã, castanhas.',
  'Lave o rosto com água fria.',
  'Ocupe as mãos: aperte uma bolinha, desenhe, lave uma louça.',
  'Lembre por que você quer parar. Diga o motivo em voz alta.',
];

/* ---------------- Estado ---------------- */

function defaults() {
  return {
    version: 1,
    onboarded: false,
    updatedAt: 0,
    settings: {
      name: '',
      type: 'industrializado',
      packPrice: 12,
      perPack: 20,
      baselinePerDay: 15,
      dailyLimit: 10,
      waterPerCig: 250,
      waterBase: 2000,
      glassMl: 250,
      burstCount: 3,
      burstMinutes: 60,
      partyReminderMin: 30,
      notify: false,
      startDate: Date.now(),
    },
    logs: [],      // { id, ts, trigger, intensity, estimated, party }
    cravings: [],  // { id, ts }
    water: [],     // { ts, ml }
    party: null,   // { start, packStart, reminderMin, lastReminder }
    notified: { base: null, milestones: [], limitDay: null, limitLevel: 0, rank: null, rankBase: null },
  };
}

/** Completa um estado salvo (local, backup ou nuvem) com os campos padrão. */
function hydrate(s) {
  const d = defaults();
  return { ...d, ...s, settings: { ...d.settings, ...s.settings }, notified: { ...d.notified, ...s.notified } };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? hydrate(JSON.parse(raw)) : defaults();
  } catch {
    return defaults();
  }
}

let state = load();

function save({ touch = true } = {}) {
  if (touch) state.updatedAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Não foi possível salvar neste aparelho.');
  }
  if (touch) cloudSchedulePush();
}

/* ---------------- Utilidades ---------------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const money = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (n, d = 0) => (n || 0).toLocaleString('pt-BR', { maximumFractionDigits: d });
const timeHM = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function duration(ms, withSeconds = false) {
  ms = Math.max(0, ms);
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  const s = Math.floor((ms % MIN) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}min`;
  if (h > 0) return `${h}h ${m}min`;
  if (withSeconds) return `${m}min ${String(s).padStart(2, '0')}s`;
  return `${m} min`;
}

function startOfDay(ts = Date.now(), offsetDays = 0) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays).getTime();
}
function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toLocalInput(ts) {
  const d = new Date(ts);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/* ---------------- Cálculos ---------------- */

const pricePerCig = () => (state.settings.perPack > 0 ? state.settings.packPrice / state.settings.perPack : 0);
const lastLog = () => state.logs[state.logs.length - 1] || null;
const streakBase = () => (lastLog() ? lastLog().ts : state.settings.startDate);
const logsBetween = (a, b = Infinity) => state.logs.filter((l) => l.ts >= a && l.ts < b);
const todayLogs = () => logsBetween(startOfDay());

function waterToday() {
  const from = startOfDay();
  return state.water.filter((w) => w.ts >= from).reduce((sum, w) => sum + w.ml, 0);
}
const waterGoalToday = () => state.settings.waterBase + todayLogs().length * state.settings.waterPerCig;

function savings() {
  const s = state.settings;
  const days = Math.max(0, (Date.now() - s.startDate) / DAY);
  const expected = s.baselinePerDay * days;
  const actual = logsBetween(s.startDate).length;
  const avoided = expected - actual;
  return { days, expected, actual, avoided, value: avoided * pricePerCig() };
}

function avgPerDay(days = 7) {
  const from = Math.max(startOfDay(Date.now(), -(days - 1)), startOfDay(state.settings.startDate));
  const span = Math.max(1, Math.round((startOfDay(Date.now(), 1) - from) / DAY));
  return logsBetween(from).length / span;
}

/* ---------------- Ações sobre dados ---------------- */

function addLog({ ts = Date.now(), trigger = null, intensity = null, estimated = false, party = !!state.party } = {}) {
  const log = { id: uid(), ts, trigger, intensity, estimated, party };
  state.logs.push(log);
  state.logs.sort((a, b) => a.ts - b.ts);
  save();
  return log;
}

function removeLog(id) {
  state.logs = state.logs.filter((l) => l.id !== id);
  save();
}

function addWater(ml = state.settings.glassMl) {
  state.water.push({ ts: Date.now(), ml });
  save();
}

/** Espalha N cigarros estimados de forma uniforme entre dois instantes. */
function distributeLogs(qty, from, to, extra = {}) {
  for (let i = 1; i <= qty; i++) {
    addLog({ ts: Math.round(from + ((to - from) * i) / (qty + 1)), estimated: true, ...extra });
  }
}

/* ---------------- Notificações ---------------- */

let swReg = null;

async function notify(title, body, { tag, actions, renotify = false } = {}) {
  if (!state.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return false;
  const opts = { body, tag, renotify: renotify && !!tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: 'pt-BR' };
  if (actions) opts.actions = actions;
  try {
    if (swReg) await swReg.showNotification(title, opts);
    else new Notification(title, opts);
    return true;
  } catch {
    return false;
  }
}

async function enableNotifications() {
  if (!('Notification' in window)) {
    toast('Este navegador não suporta notificações.');
    return;
  }
  const perm = await Notification.requestPermission();
  state.settings.notify = perm === 'granted';
  save();
  renderSettings();
  toast(perm === 'granted' ? 'Notificações ativadas.' : 'Permissão negada. Você pode liberar nas configurações do navegador.');
}

/* ---------------- Alertas de consumo ---------------- */

let banner = null; // { kind, text } — o alerta mais recente mostrado no início

function checkConsumptionAlerts() {
  const s = state.settings;
  const n = todayLogs().length;
  const today = dayKey();

  if (state.notified.limitDay !== today) {
    state.notified.limitDay = today;
    state.notified.limitLevel = 0;
  }

  if (s.dailyLimit > 0 && n >= s.dailyLimit && n > state.notified.limitLevel) {
    state.notified.limitLevel = n;
    const text = n === s.dailyLimit
      ? `Você chegou ao seu limite de ${s.dailyLimit} cigarros hoje. Daqui pra frente, cada um que você evitar é vitória.`
      : `Você já fumou ${n} cigarros hoje, ${n - s.dailyLimit} acima do seu limite. Hoje já custou ${money(n * pricePerCig())}.`;
    banner = { kind: n === s.dailyLimit ? 'warn' : 'danger', text };
    notify('Atenção ao consumo', text, { tag: 'limit', renotify: true });
  }

  const recent = logsBetween(Date.now() - s.burstMinutes * MIN).length;
  if (s.burstCount > 1 && recent >= s.burstCount) {
    const text = `${recent} cigarros nos últimos ${s.burstMinutes} min. Que tal um copo de água e 3 minutos de respiração antes do próximo?`;
    banner = { kind: 'danger', text };
    notify('Muitos cigarros em pouco tempo', text, { tag: 'burst', renotify: true });
  }
  save();
}

/* ---------------- Marcos ---------------- */

function checkMilestones() {
  const base = streakBase();
  const elapsed = Date.now() - base;

  // Novo "ponto zero" (cigarro registrado): marca silenciosamente o que já passou.
  if (state.notified.base !== base) {
    state.notified.base = base;
    state.notified.milestones = MILESTONES.filter((m) => m.ms <= elapsed).map((m) => m.id);
    save();
    return;
  }

  const fresh = MILESTONES.filter((m) => m.ms <= elapsed && !state.notified.milestones.includes(m.id));
  if (!fresh.length) return;
  fresh.forEach((m) => state.notified.milestones.push(m.id));
  save();

  const m = [...fresh].reverse().find((x) => x.notify !== false);
  if (!m) return;
  const saved = (state.settings.baselinePerDay * elapsed / DAY) * pricePerCig();
  const moneyText = saved > 0 ? `Nesse tempo você deixou de gastar ${money(saved)}.` : '';
  $('#ms-title').textContent = `Você está há ${m.title} sem fumar!`;
  $('#ms-text').textContent = m.text;
  $('#ms-money').textContent = moneyText;
  openDialog('#dlg-milestone');
  notify(`🎉 ${m.title} sem fumar!`, `${m.text} ${moneyText}`.trim(), { tag: 'milestone' });
}

/* ---------------- Modo festa ---------------- */

let partyEndPrompted = false;

function startParty(packStart, reminderMin) {
  state.party = { start: Date.now(), packStart, reminderMin, lastReminder: Date.now() };
  save();
  render();
  toast('Modo festa ativo. Um toque no botão = um cigarro.');
  if (!state.settings.notify) toast('Ative as notificações em Ajustes para receber os lembretes.');
}

function checkParty() {
  const p = state.party;
  if (!p) return;
  if (Date.now() - p.lastReminder >= p.reminderMin * MIN) {
    p.lastReminder = Date.now();
    save();
    notify('🍻 Fumou algum?', 'Se fumou desde o último lembrete, toque em “+1 cigarro”. Não esqueça da água!', {
      tag: 'party',
      renotify: true,
      actions: [{ action: 'add', title: '+1 cigarro' }, { action: 'dismiss', title: 'Não fumei' }],
    });
  }
  // Festa esquecida ligada: pede para fechar a conta no dia seguinte.
  if (!partyEndPrompted && Date.now() - p.start > 10 * HOUR && document.visibilityState === 'visible') {
    partyEndPrompted = true;
    openPartyEnd();
  }
}

function partyLogs() {
  return state.party ? logsBetween(state.party.start) : [];
}

function openPartyEnd() {
  const p = state.party;
  const n = partyLogs().length;
  $('#party-end-summary').textContent = `Desde ${timeHM(p.start)} você registrou ${n} cigarro${n === 1 ? '' : 's'}.` +
    (p.packStart != null ? ` Você começou com ${p.packStart} no maço — conte quantos sobraram para completarmos a conta.` : '');
  $('#party-pack-fields').hidden = p.packStart == null;
  const f = $('#party-end-form');
  f.reset();
  openDialog('#dlg-party-end');
}

function endParty({ packEnd, bought = 0, others = 0 }) {
  const p = state.party;
  const registered = partyLogs().length;
  let estimated = registered + others;
  if (p.packStart != null && Number.isFinite(packEnd)) {
    estimated = Math.max(0, p.packStart + bought - packEnd) + others;
  }
  const missing = Math.max(0, estimated - registered);
  const end = Date.now();
  if (missing > 0) distributeLogs(missing, p.start, end, { trigger: 'Álcool', party: true });
  state.party = null;
  partyEndPrompted = false;
  save();
  render();
  checkConsumptionAlerts();
  const total = registered + missing;
  toast(missing > 0
    ? `Festa encerrada: ${total} cigarros (${missing} adicionados pela contagem).`
    : `Festa encerrada: ${total} cigarro${total === 1 ? '' : 's'}.`);
  render();
}

/* ---------------- Registro ---------------- */

let pendingLog = null;

function registerNow({ quick = false } = {}) {
  const log = addLog({ trigger: state.party ? 'Álcool' : null });
  checkConsumptionAlerts();
  render();
  if (quick || state.party) {
    toast(`Registrado · ${todayLogs().length} hoje · beba ${state.settings.waterPerCig} ml de água`, {
      label: 'Desfazer',
      onClick: () => { removeLog(log.id); render(); },
    });
    return;
  }
  openLogDetails(log);
}

function openLogDetails(log) {
  pendingLog = log;
  $('#log-water-tip').textContent = `💧 Beba ${state.settings.waterPerCig} ml de água agora. Ajuda a hidratar, aliviar a garganta e ocupa o lugar do cigarro seguinte.`;
  renderChips('#log-triggers', TRIGGERS, log.trigger);
  renderChips('#log-intensity', ['1', '2', '3', '4', '5'], log.intensity ? String(log.intensity) : null);
  $('#log-water').checked = false;
  openDialog('#dlg-log');
}

function renderChips(sel, options, selected) {
  const box = $(sel);
  box.innerHTML = options.map((o) => `<button type="button" class="chip" aria-pressed="${o === selected}" data-value="${esc(o)}">${esc(o)}</button>`).join('');
  box.onclick = (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const on = chip.getAttribute('aria-pressed') !== 'true';
    box.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
    chip.setAttribute('aria-pressed', String(on));
  };
}
const chipValue = (sel) => $(sel).querySelector('.chip[aria-pressed="true"]')?.dataset.value ?? null;

/* ---------------- SOS ---------------- */

let sosTimer = null;
let breathTimer = null;

function openSOS() {
  const endAt = Date.now() + 3 * MIN;
  $('#sos-tip').textContent = '💡 ' + SOS_TIPS[Math.floor(Math.random() * SOS_TIPS.length)];
  const sv = savings();
  $('#sos-money').textContent = sv.value > 0 ? `Você já economizou ${money(sv.value)} desde que começou.` : `Cada cigarro custa ${money(pricePerCig())} e cerca de ${LIFE_MIN_PER_CIG} minutos de vida.`;
  const tick = () => {
    const left = Math.max(0, endAt - Date.now());
    const m = Math.floor(left / MIN);
    const s = Math.floor((left % MIN) / 1000);
    $('#sos-timer').textContent = left > 0 ? `${m}:${String(s).padStart(2, '0')}` : 'Passou! 🎉';
    if (left <= 0) clearInterval(sosTimer);
  };
  tick();
  sosTimer = setInterval(tick, 250);
  runBreath();
  openDialog('#dlg-sos');
}

function runBreath() {
  const c = $('#breath-circle');
  const t = $('#breath-text');
  const steps = [['grow', 'Inspire', 4000], ['hold', 'Segure', 4000], ['shrink', 'Solte', 6000]];
  let i = 0;
  const step = () => {
    const [cls, label, dur] = steps[i % steps.length];
    c.className = 'breath-circle ' + cls;
    t.textContent = label;
    i++;
    breathTimer = setTimeout(step, dur);
  };
  step();
}

function closeSOS() {
  clearInterval(sosTimer);
  clearTimeout(breathTimer);
  $('#breath-circle').className = 'breath-circle';
  $('#dlg-sos').close();
}

/* ---------------- Renderização ---------------- */

function render() {
  document.body.classList.toggle('party-on', !!state.party);
  $('#party-pill').hidden = !state.party;
  renderHome();
  renderHistory();
  renderHealth();
  renderSocial();
}

function nextMilestone(elapsed) {
  const i = MILESTONES.findIndex((m) => m.ms > elapsed);
  if (i === -1) return null;
  return { m: MILESTONES[i], prev: i > 0 ? MILESTONES[i - 1].ms : 0 };
}

function renderLive() {
  const elapsed = Date.now() - streakBase();
  $('#streak-timer').textContent = duration(elapsed, true);
  const nx = nextMilestone(elapsed);
  if (nx) {
    const pct = ((elapsed - nx.prev) / (nx.m.ms - nx.prev)) * 100;
    $('#next-bar').style.width = clamp(pct, 0, 100) + '%';
    $('#next-text').textContent = `Próximo marco: ${nx.m.title} · faltam ${duration(nx.m.ms - elapsed)}`;
  } else {
    $('#next-bar').style.width = '100%';
    $('#next-text').textContent = 'Todos os marcos conquistados. Que orgulho!';
  }
  renderRankLive();
  if (state.party) {
    const p = state.party;
    const nextIn = p.reminderMin * MIN - (Date.now() - p.lastReminder);
    const n = partyLogs().length;
    $('#party-info').textContent = `Desde ${timeHM(p.start)} · ${n} registrado${n === 1 ? '' : 's'} · próximo lembrete em ${duration(nextIn)}`;
  }
}

function renderHome() {
  const s = state.settings;
  const n = todayLogs().length;
  const price = pricePerCig();

  $('#greeting').textContent = s.name ? `Olá, ${s.name}. Um dia de cada vez.` : 'Um dia de cada vez.';
  $('#register-label').textContent = state.party ? '1 cigarro (um toque)' : 'Fumei um cigarro';
  $('#party-card').hidden = !state.party;
  $('#btn-party').hidden = !!state.party;

  $('#today-count').textContent = n;
  const bar = $('#today-bar');
  const lim = s.dailyLimit;
  bar.style.width = lim > 0 ? clamp((n / lim) * 100, 0, 100) + '%' : '0';
  bar.parentElement.className = 'bar' + (lim > 0 && n > lim ? ' over' : lim > 0 && n >= lim * 0.8 ? ' near' : '');
  $('#today-limit').textContent = lim > 0 ? `limite: ${lim}` : 'sem limite';
  $('#today-spent').textContent = money(n * price);
  $('#price-each').textContent = `${money(price)} cada`;
  $('#cravings-won').textContent = state.cravings.length;

  // Banner: alerta recente, ou um incentivo calculado
  const b = $('#alert-banner');
  let current = banner;
  if (!current) {
    const avg = avgPerDay(7);
    if (lim > 0 && n > lim) current = { kind: 'danger', text: `Você passou ${n - lim} do seu limite hoje.` };
    else if (n === 0 && lastLog()) current = { kind: 'ok', text: 'Nenhum cigarro hoje até agora. Continue assim!' };
    else if (avg >= 1 && n < avg) current = { kind: 'ok', text: `Você está abaixo da sua média de ${num(avg, 1)} por dia. Bom trabalho.` };
  }
  b.hidden = !current;
  if (current) {
    b.className = 'banner ' + current.kind;
    b.textContent = current.text;
  }

  // Água
  const drunk = waterToday();
  const goal = waterGoalToday();
  $('#water-text').textContent = `${num(drunk)} / ${num(goal)} ml`;
  $('#water-bar').style.width = goal > 0 ? clamp((drunk / goal) * 100, 0, 100) + '%' : '0';
  $('#water-hint').textContent = n > 0
    ? `Inclui ${num(n * s.waterPerCig)} ml extras pelos ${n} cigarro${n === 1 ? '' : 's'} de hoje (${s.waterPerCig} ml cada).`
    : `A cada cigarro, sua meta aumenta ${s.waterPerCig} ml.`;
  $('[data-action="water"]').textContent = `+ ${s.glassMl} ml`;

  // Economia
  const sv = savings();
  const card = $('.savings');
  const since = new Date(s.startDate).toLocaleDateString('pt-BR');
  card.classList.toggle('negative', sv.value < 0);
  $('#savings-label').textContent = sv.value >= 0 ? `Economia desde ${since}` : `Gasto acima do seu normal desde ${since}`;
  $('#savings-value').textContent = money(Math.abs(sv.value));
  $('#savings-detail').textContent = sv.value >= 0
    ? `${num(Math.max(0, sv.avoided))} cigarros a menos que os ${s.baselinePerDay}/dia de antes.`
    : `${num(Math.abs(sv.avoided))} cigarros acima dos ${s.baselinePerDay}/dia de antes.`;

  renderLive();
}

function renderHistory() {
  const s = state.settings;
  const price = pricePerCig();

  // Semana
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const from = startOfDay(Date.now(), -i);
    const to = startOfDay(Date.now(), -i + 1);
    days.push({ from, n: logsBetween(from, to).length, today: i === 0 });
  }
  const max = Math.max(1, s.dailyLimit, ...days.map((d) => d.n));
  const chart = $('#week-chart');
  chart.innerHTML = days.map((d) => {
    const wd = new Date(d.from).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    const cls = ['col', d.today && 'today', s.dailyLimit > 0 && d.n > s.dailyLimit && 'over'].filter(Boolean).join(' ');
    return `<div class="${cls}"><b>${d.n}</b><i style="height:${(d.n / max) * 100}px"></i><small>${wd}</small></div>`;
  }).join('') + (s.dailyLimit > 0 ? `<div class="limit-line" style="bottom:${(s.dailyLimit / max) * 100 + 21}px" title="Limite diário"></div>` : '');

  const week = days.reduce((a, d) => a + d.n, 0);
  $('#avg7').textContent = num(avgPerDay(7), 1);
  $('#spent7').textContent = money(week * price);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  $('#spentMonth').textContent = money(logsBetween(monthStart).length * price);

  // Horários (30 dias)
  const recent = logsBetween(Date.now() - 30 * DAY);
  const hours = Array(24).fill(0);
  recent.forEach((l) => hours[new Date(l.ts).getHours()]++);
  const hmax = Math.max(1, ...hours);
  $('#hour-chart').innerHTML = hours.map((h, i) => `<i style="height:${(h / hmax) * 100}%" title="${i}h: ${h}"></i>`).join('');

  // Gatilhos
  const counts = {};
  recent.forEach((l) => { const k = l.trigger || 'Sem gatilho'; counts[k] = (counts[k] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  $('#trigger-list').innerHTML = entries.length
    ? entries.map(([k, v]) => `<li><span>${esc(k)}</span><div class="bar"><span style="width:${(v / recent.length) * 100}%"></span></div><b>${Math.round((v / recent.length) * 100)}%</b></li>`).join('')
    : '<li class="empty" style="display:block">Sem registros nos últimos 30 dias.</li>';

  // Lista
  const list = [...state.logs].reverse().slice(0, 80);
  let html = '';
  let lastDay = null;
  for (const l of list) {
    const k = dayKey(l.ts);
    if (k !== lastDay) {
      lastDay = k;
      const label = k === dayKey() ? 'Hoje' : k === dayKey(Date.now() - DAY) ? 'Ontem' : new Date(l.ts).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
      html += `<div class="day">${label}</div>`;
    }
    const tags = (l.estimated ? '<span class="tag">estimado</span>' : '') + (l.party ? '<span class="tag party">festa</span>' : '');
    const intensity = l.intensity ? ` · vontade ${l.intensity}/5` : '';
    html += `<div class="log-item"><time>${timeHM(l.ts)}</time><span class="meta">${esc(l.trigger || '—')}${intensity}${tags}</span><button class="del" data-del="${l.id}" aria-label="Apagar registro">✕</button></div>`;
  }
  $('#log-list').innerHTML = html || '<p class="empty">Nenhum cigarro registrado ainda.</p>';
}

function renderHealth() {
  const price = pricePerCig();
  const total = state.logs.length;
  const lifeMin = total * LIFE_MIN_PER_CIG;
  $('#imp-total').textContent = num(total);
  $('#imp-life').textContent = lifeMin >= DAY / MIN ? `${num(lifeMin / 1440, 1)} dias` : lifeMin >= 60 ? `${num(lifeMin / 60, 1)} horas` : `${lifeMin} min`;
  $('#imp-spent').textContent = money(total * price);
  $('#imp-year').textContent = money(avgPerDay(30) * price * 365);

  const elapsed = Date.now() - streakBase();
  const nx = nextMilestone(elapsed);
  $('#milestone-list').innerHTML = MILESTONES.map((m) => {
    let cls = 'locked';
    let extra = '';
    if (m.ms <= elapsed) cls = 'done';
    else if (nx && nx.m.id === m.id) {
      cls = 'current';
      const pct = clamp(((elapsed - nx.prev) / (m.ms - nx.prev)) * 100, 0, 100);
      extra = `<div class="bar"><span style="width:${pct}%"></span></div><small>faltam ${duration(m.ms - elapsed)}</small>`;
    }
    return `<li class="${cls}"><strong>${m.title}</strong><p>${m.text}</p>${extra}</li>`;
  }).join('');
}

function fillTypeSelect(sel) {
  $(sel).innerHTML = Object.entries(CIG_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
}

function renderSettings() {
  const f = $('#settings-form');
  const s = state.settings;
  for (const [k, v] of Object.entries(s)) {
    if (f.elements[k]) f.elements[k].value = v;
  }
  updatePricePreview();
  const st = $('#notif-status');
  if (!('Notification' in window)) st.textContent = 'Este navegador não suporta notificações.';
  else if (Notification.permission === 'granted' && s.notify) st.textContent = '✅ Notificações ativadas.';
  else if (Notification.permission === 'denied') st.textContent = '🚫 Bloqueadas no navegador. Libere nas configurações do site.';
  else st.textContent = 'Notificações desativadas.';
}

function updatePricePreview() {
  const f = $('#settings-form');
  const p = Number(f.elements.packPrice.value) / Math.max(1, Number(f.elements.perPack.value));
  $('#price-preview').textContent = `Cada cigarro custa ${money(p)}.`;
}

/* ---------------- UI geral ---------------- */

let toastTimer = null;
function toast(text, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(text)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.onClick(); t.hidden = true; };
    t.appendChild(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 6000 : 3500);
}

function openDialog(sel) {
  const d = $(sel);
  if (!d.open) d.showModal();
}

function showTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  if (name === 'settings') renderSettings();
  if (name === 'social') cloudRefresh();
  window.scrollTo({ top: 0 });
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `respira-backup-${dayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.logs) || typeof data.settings !== 'object') throw new Error('formato');
    state = hydrate(data);
    save();
    render();
    renderSettings();
    toast(`Backup importado: ${state.logs.length} registros.`);
  } catch {
    toast('Arquivo inválido.');
  }
}

/* ---------------- Eventos ---------------- */

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) return showTab(tab.dataset.tab);

  const del = e.target.closest('[data-del]');
  if (del) {
    const log = state.logs.find((l) => l.id === del.dataset.del);
    if (log && confirm(`Apagar o registro das ${timeHM(log.ts)}?`)) { removeLog(log.id); render(); }
    return;
  }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  switch (btn.dataset.action) {
    case 'register': registerNow(); break;
    case 'water': addWater(); render(); toast(`+${state.settings.glassMl} ml de água 💧`); break;
    case 'sos': openSOS(); break;
    case 'sos-won':
      state.cravings.push({ id: uid(), ts: Date.now() });
      save(); closeSOS(); render();
      toast(`Mais uma vontade vencida! Já são ${state.cravings.length}. 💪`);
      break;
    case 'sos-smoked': closeSOS(); registerNow(); break;
    case 'party-start': {
      const f = $('#party-start-form');
      f.reset();
      f.elements.every.value = state.settings.partyReminderMin;
      openDialog('#dlg-party-start');
      break;
    }
    case 'party-end': openPartyEnd(); break;
    case 'backfill': {
      const f = $('#backfill-form');
      f.reset();
      f.elements.from.value = toLocalInput(Date.now() - 3 * HOUR);
      f.elements.to.value = toLocalInput(Date.now());
      $('#backfill-trigger').innerHTML = ['<option value="">Sem gatilho</option>', ...TRIGGERS.map((t) => `<option>${t}</option>`)].join('');
      openDialog('#dlg-backfill');
      break;
    }
    case 'notif-enable': enableNotifications(); break;
    case 'notif-test':
      notify('Respira', 'As notificações estão funcionando. 🫁', { tag: 'test' }).then((ok) => {
        if (!ok) toast('Ative as notificações primeiro.');
      });
      break;
    case 'export': exportData(); break;
    case 'reset':
      if (confirm(cloud.user
        ? 'Apagar TODOS os registros e ajustes deste aparelho e da nuvem, incluindo seu perfil e grupos? Isso não pode ser desfeito.'
        : 'Apagar TODOS os registros e ajustes deste aparelho? Isso não pode ser desfeito.')) {
        cloudWipe().finally(() => {
          localStorage.removeItem(STORAGE_KEY);
          location.reload();
        });
      }
      break;
  }
});

$('#alert-banner').addEventListener('click', () => { banner = null; renderHome(); });

/**
 * Os formulários dos diálogos usam method="dialog": o botão clicado define a ação.
 * Tratamos no "submit" (síncrono) em vez do evento "close" do <dialog>.
 */
function onSheet(formSel, handler) {
  $(formSel).addEventListener('submit', (e) => handler(e.submitter?.value || '', e.target));
}

function finishLogDetails(action) {
  const log = pendingLog;
  pendingLog = null;
  if (!log) return;
  if (action === 'undo') {
    removeLog(log.id);
    banner = null;
    render();
    toast('Registro desfeito.');
    return;
  }
  const trigger = chipValue('#log-triggers');
  const intensity = chipValue('#log-intensity');
  const target = state.logs.find((l) => l.id === log.id);
  if (target) {
    target.trigger = trigger;
    target.intensity = intensity ? Number(intensity) : null;
  }
  if ($('#log-water').checked) addWater(state.settings.waterPerCig);
  save();
  render();
}

onSheet('#dlg-log form', (action) => finishLogDetails(action));
// Fechou com Esc/voltar: mantém o registro com o que foi marcado.
$('#dlg-log').addEventListener('close', () => finishLogDetails('save'));

onSheet('#backfill-form', (action, f) => {
  if (action !== 'ok') return;
  const qty = clamp(parseInt(f.elements.qty.value, 10) || 0, 1, 60);
  let from = new Date(f.elements.from.value).getTime();
  let to = new Date(f.elements.to.value).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return toast('Datas inválidas.');
  if (from > to) [from, to] = [to, from];
  to = Math.min(to, Date.now());
  distributeLogs(qty, from, to, { trigger: f.elements.trigger.value || null, party: false });
  checkConsumptionAlerts();
  render();
  toast(`${qty} cigarro${qty === 1 ? '' : 's'} adicionado${qty === 1 ? '' : 's'}.`);
});

onSheet('#party-start-form', (action, f) => {
  if (action !== 'ok') return;
  const pack = f.elements.pack.value === '' ? null : parseInt(f.elements.pack.value, 10);
  const every = clamp(parseInt(f.elements.every.value, 10) || 30, 10, 240);
  startParty(Number.isFinite(pack) ? pack : null, every);
});

onSheet('#party-end-form', (action, f) => {
  if (action !== 'ok' || !state.party) return;
  const packEnd = f.elements.packEnd.value === '' ? NaN : parseInt(f.elements.packEnd.value, 10);
  endParty({
    packEnd,
    bought: parseInt(f.elements.bought.value, 10) || 0,
    others: parseInt(f.elements.others.value, 10) || 0,
  });
});

$('#dlg-sos').addEventListener('cancel', () => closeSOS());

$('#settings-form').addEventListener('input', (e) => {
  if (e.target.name === 'packPrice' || e.target.name === 'perPack') updatePricePreview();
});

$('#settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const s = state.settings;
  s.name = f.elements.name.value.trim();
  s.type = f.elements.type.value;
  for (const k of ['packPrice', 'perPack', 'baselinePerDay', 'dailyLimit', 'waterPerCig', 'waterBase', 'glassMl', 'burstCount', 'burstMinutes', 'partyReminderMin']) {
    const v = Number(f.elements[k].value);
    if (Number.isFinite(v) && v >= 0) s[k] = v;
  }
  s.perPack = Math.max(1, s.perPack);
  save();
  render();
  toast('Ajustes salvos.');
});

$('#import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) importData(file);
  e.target.value = '';
});

$('#onboarding-form').addEventListener('submit', (e) => {
  const f = e.target;
  const s = state.settings;
  s.name = f.elements.name.value.trim();
  s.type = f.elements.type.value;
  s.packPrice = Number(f.elements.packPrice.value) || 0;
  s.perPack = Math.max(1, Number(f.elements.perPack.value) || 20);
  s.baselinePerDay = Number(f.elements.baselinePerDay.value) || 0;
  s.dailyLimit = Number(f.elements.dailyLimit.value) || 0;
  s.startDate = Date.now();
  if (f.elements.last.value) {
    const ts = new Date(f.elements.last.value).getTime();
    if (Number.isFinite(ts) && ts <= Date.now()) addLog({ ts, estimated: true, party: false });
  }
  state.onboarded = true;
  save();
  render();
});
$('#dlg-onboarding').addEventListener('cancel', (e) => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    render();
    checkMilestones();
    checkRank();
    checkParty();
  }
});

/* ---------------- Service worker ---------------- */

async function setupSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
  } catch {
    swReg = null;
  }
  // Toque em "+1 cigarro" numa notificação com o app já aberto
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'add') registerNow({ quick: true });
  });
}

/* ---------------- Início ---------------- */

function init() {
  fillTypeSelect('#type-select');
  fillTypeSelect('#onb-type');
  setupSW();
  setupSocial();

  // Aberto por "+1 cigarro" numa notificação com o app fechado
  const params = new URLSearchParams(location.search);
  if (params.get('action') === 'add') {
    history.replaceState(null, '', location.pathname);
    if (state.onboarded) setTimeout(() => registerNow({ quick: true }), 300);
  }

  render();
  if (!state.onboarded) openDialog('#dlg-onboarding');
  else { checkMilestones(); checkRank(); }

  setInterval(renderLive, 1000);
  setInterval(() => {
    checkMilestones();
    checkRank();
    checkParty();
    // vira o dia com o app aberto
    if (state.notified.limitDay && state.notified.limitDay !== dayKey()) { banner = null; render(); }
  }, 20 * 1000);
}

// Espera o social.js (carregado depois deste arquivo).
document.addEventListener('DOMContentLoaded', init);
