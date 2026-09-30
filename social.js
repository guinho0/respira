'use strict';

/* ============================================================
 * Respira — ranking, perfil (nickname), nuvem (Supabase) e grupos de amigos.
 * Carregado depois do app.js e usa as globais dele (state, save, $, HOUR…).
 * Sem perfil criado, nada sai do aparelho.
 * ============================================================ */

// Nível pelo tempo sem fumar (desde o último cigarro).
const RANKS = [
  { id: 'fumaca', ms: 0, name: 'Fumaça', icon: '🌫️', text: 'Todo recomeço conta. O relógio já está correndo a seu favor.' },
  { id: 'bronze', ms: 8 * HOUR, name: 'Bronze', icon: '🥉', text: 'Metade do monóxido de carbono já saiu do seu sangue.' },
  { id: 'prata', ms: DAY, name: 'Prata', icon: '🥈', text: 'Um dia inteiro. Seu corpo já começou a limpeza.' },
  { id: 'ouro', ms: 3 * DAY, name: 'Ouro', icon: '🥇', text: 'Sem nicotina no corpo e com o fôlego voltando.' },
  { id: 'platina', ms: 7 * DAY, name: 'Platina', icon: '💠', text: 'Uma semana: a fase mais difícil está ficando para trás.' },
  { id: 'esmeralda', ms: 14 * DAY, name: 'Esmeralda', icon: '💚', text: 'Duas semanas. Caminhar e subir escadas já cansa menos.' },
  { id: 'diamante', ms: 30 * DAY, name: 'Diamante', icon: '💎', text: 'Um mês! Os pulmões voltaram a se limpar sozinhos.' },
  { id: 'mestre', ms: 90 * DAY, name: 'Mestre', icon: '🏅', text: 'Três meses. Sua função pulmonar pode ter melhorado até 10%.' },
  { id: 'grao-mestre', ms: 182 * DAY, name: 'Grão-mestre', icon: '👑', text: 'Meio ano livre. Inspiração para qualquer um.' },
  { id: 'lenda', ms: 365 * DAY, name: 'Lenda', icon: '🌟', text: 'Um ano sem fumar. O risco cardíaco caiu pela metade.' },
];

const NICK_RE = /^[\p{L}\p{N}_.-]{3,20}$/u;
const CLOUD_USER_KEY = 'respira:cloud-user';
const FRIENDS_SEEN_KEY = 'respira:friends-seen';

function rankFor(ms) {
  let i = 0;
  while (i + 1 < RANKS.length && RANKS[i + 1].ms <= ms) i++;
  return { rank: RANKS[i], next: RANKS[i + 1] || null };
}

const currentStreak = () => Date.now() - streakBase();

/** Maior intervalo sem fumar já registrado (incluindo o atual). */
function bestStreak() {
  let prev = state.logs.length ? Math.min(state.settings.startDate, state.logs[0].ts) : state.settings.startDate;
  let best = 0;
  for (const l of state.logs) {
    if (l.ts > prev) best = Math.max(best, l.ts - prev);
    prev = Math.max(prev, l.ts);
  }
  return Math.max(best, currentStreak());
}

/* ---------------- Aviso ao subir de nível ---------------- */

function checkRank() {
  const base = streakBase();
  const { rank } = rankFor(currentStreak());
  const n = state.notified;
  // Novo cigarro: volta ao nível correspondente sem comemorar.
  if (n.rankBase !== base) {
    n.rankBase = base;
    n.rank = rank.id;
    save();
    return;
  }
  if (n.rank === rank.id) return;
  n.rank = rank.id;
  save();
  toast(`${rank.icon} Você subiu para ${rank.name}!`);
  notify(`${rank.icon} Novo nível: ${rank.name}`, rank.text, { tag: 'rank' });
}

/* ---------------- Nuvem (Supabase) ---------------- */

const cloud = {
  client: null,
  user: null,
  profile: null,
  groups: [],       // [{ id, name, code }]
  members: {},      // group_id → [{ user_id, profile }]
  pushTimer: null,
  lastGroupsLoad: 0,
  busy: false,
};

const cloudOn = () => !!cloud.client;
const cloudConfigured = () => !!(window.RESPIRA_CONFIG?.supabaseUrl && window.RESPIRA_CONFIG?.supabaseAnonKey);
const redirectUrl = () => location.origin + location.pathname;

function setupCloud() {
  const cfg = window.RESPIRA_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase?.createClient) return;
  cloud.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  cloud.client.auth.onAuthStateChange((event, session) => {
    const user = session?.user || null;
    const changed = user?.id !== cloud.user?.id;
    cloud.user = user;
    if (!user) {
      cloud.profile = null;
      cloud.groups = [];
      cloud.members = {};
      renderSocial();
      return;
    }
    // Chamadas ao Supabase dentro deste callback podem travar; roda depois.
    if (changed || event === 'SIGNED_IN') setTimeout(onSignedIn, 0);
    else renderSocial();
  });
}

async function onSignedIn() {
  const c = cloud.client;
  const uid = cloud.user.id;
  const lastUid = localStorage.getItem(CLOUD_USER_KEY);

  const { data: remote } = await c.from('user_data').select('state, updated_at').eq('user_id', uid).maybeSingle();
  const remoteTs = remote ? new Date(remote.updated_at).getTime() : 0;
  // Conta diferente da última usada aqui (ex.: entrou por e-mail num aparelho novo): vale a da nuvem.
  if (remote && (lastUid !== uid || remoteTs > (state.updatedAt || 0))) {
    state = hydrate(remote.state);
    state.updatedAt = remoteTs;
    save({ touch: false });
    if (state.onboarded && $('#dlg-onboarding').open) $('#dlg-onboarding').close();
    render();
    toast('Seus dados foram carregados da nuvem.');
  }
  localStorage.setItem(CLOUD_USER_KEY, uid);

  const { data: profile } = await c.from('profiles').select('*').eq('id', uid).maybeSingle();
  cloud.profile = profile || cloud.profile;
  if (cloud.profile) {
    await cloudPush();
    await loadGroups();
  }
  renderSocial();
}

function profileSummary() {
  return {
    streak_base: new Date(streakBase()).toISOString(),
    best_streak_ms: Math.round(bestStreak()),
    cravings_won: state.cravings.length,
    avg7: Math.round(avgPerDay(7) * 10) / 10,
    updated_at: new Date().toISOString(),
  };
}

/** Chamado pelo save() do app: envia as mudanças alguns segundos depois. */
function cloudSchedulePush() {
  if (!cloud.user || !cloud.profile) return;
  clearTimeout(cloud.pushTimer);
  cloud.pushTimer = setTimeout(cloudPush, 3000);
}

async function cloudPush() {
  clearTimeout(cloud.pushTimer);
  cloud.pushTimer = null;
  if (!cloud.user || !cloud.profile) return;
  const c = cloud.client;
  const uid = cloud.user.id;
  const at = new Date(state.updatedAt || Date.now()).toISOString();
  const [r1, r2] = await Promise.all([
    c.from('user_data').upsert({ user_id: uid, state, updated_at: at }),
    c.from('profiles').update(profileSummary()).eq('id', uid).select().maybeSingle(),
  ]);
  if (r2.data) cloud.profile = r2.data;
  cloud.syncError = !!(r1.error || r2.error);
  renderAccount();
}

async function ensureSession() {
  if (cloud.user) return true;
  const { data, error } = await cloud.client.auth.signInAnonymously();
  if (error) {
    toast('Não foi possível criar sua conta agora. Tente de novo mais tarde.');
    return false;
  }
  cloud.user = data.user;
  return true;
}

async function saveNickname(nick) {
  if (!NICK_RE.test(nick)) return toast('Use de 3 a 20 letras, números, _ . ou -');
  if (!cloudOn()) return toast('Amigos indisponível: o app não está conectado ao servidor.');
  if (cloud.busy) return;
  cloud.busy = true;
  try {
    if (!(await ensureSession())) return;
    const { data, error } = await cloud.client
      .from('profiles')
      .upsert({ id: cloud.user.id, nickname: nick, ...profileSummary() })
      .select()
      .single();
    if (error) {
      const msg = { '23505': 'Esse nickname já está em uso. Tente outro.', '23514': 'Nickname inválido.' }[error.code];
      toast(msg || 'Não foi possível salvar o nickname. Verifique sua conexão.');
      return;
    }
    const first = !cloud.profile;
    cloud.profile = data;
    localStorage.setItem(CLOUD_USER_KEY, cloud.user.id);
    await cloudPush();
    if (first) await loadGroups();
    renderSocial();
    toast(first ? `Pronto, ${nick}! Agora crie um grupo ou entre com um código.` : 'Nickname atualizado.');
  } finally {
    cloud.busy = false;
  }
}

/* ---------------- Grupos ---------------- */

async function loadGroups() {
  if (!cloud.user || !cloud.profile) return;
  const c = cloud.client;
  cloud.lastGroupsLoad = Date.now();
  const { data: mine, error } = await c.from('group_members').select('groups(id, name, code)').eq('user_id', cloud.user.id);
  if (error) return;
  cloud.groups = mine.map((r) => r.groups).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  cloud.members = {};
  const ids = cloud.groups.map((g) => g.id);
  if (ids.length) {
    const { data: rows } = await c
      .from('group_members')
      .select('group_id, user_id, profiles(nickname, streak_base, best_streak_ms, cravings_won, avg7, updated_at)')
      .in('group_id', ids);
    for (const r of rows || []) (cloud.members[r.group_id] ||= []).push(r);
  }
  renderGroups();
  checkFriendEvents();
}

/** Atualiza os grupos se os dados tiverem mais de 1 min. */
function cloudRefresh(force = false) {
  if (!cloud.profile) return;
  if (force || Date.now() - cloud.lastGroupsLoad > MIN) loadGroups();
}

/* ---------------- Avisos dos amigos ---------------- */

// Os mesmos marcos que geram notificação para você (1 dia, 2 dias, 3 dias…).
const FRIEND_MILESTONES = MILESTONES.filter((m) => m.notify !== false);
const milestoneIndex = (ms) => FRIEND_MILESTONES.filter((m) => m.ms <= ms).length - 1;

/**
 * Compara os grupos com o que este aparelho viu da última vez e avisa sobre
 * quem entrou e quem completou um marco. Na primeira vez só registra o estado.
 */
function checkFriendEvents() {
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(FRIENDS_SEEN_KEY)); } catch { /* recomeça */ }
  if (seen?.owner !== cloud.user.id) seen = { owner: cloud.user.id, groups: {}, users: {} };
  const me = cloud.user.id;
  const events = [];

  const friends = new Map();
  for (const g of cloud.groups) {
    const members = (cloud.members[g.id] || []).filter((m) => m.profiles);
    const known = seen.groups[g.id];
    for (const m of members) {
      if (m.user_id === me) continue;
      friends.set(m.user_id, m.profiles);
      if (known && !known.includes(m.user_id)) {
        const nick = m.profiles.nickname;
        events.push({ key: `join-${g.id}-${m.user_id}`, title: `👋 ${nick} entrou no grupo`, body: `${nick} agora faz parte de “${g.name}”. Dê as boas-vindas!` });
      }
    }
    seen.groups[g.id] = members.map((m) => m.user_id);
  }

  for (const [id, p] of friends) {
    if (!p.streak_base) continue;
    const elapsed = Date.now() - new Date(p.streak_base).getTime();
    const idx = milestoneIndex(elapsed);
    const { rank } = rankFor(elapsed);
    const prev = seen.users[id];
    // Mesmo "ponto zero" e marco maior que o último visto. Se o amigo fumou, recomeça sem aviso.
    if (prev && prev.base === p.streak_base && idx > prev.idx) {
      const m = FRIEND_MILESTONES[idx];
      events.push({
        key: `ms-${id}-${m.id}`,
        title: `🎉 ${p.nickname} completou ${m.title} sem fumar`,
        body: prev.rank !== rank.id ? `Subiu para ${rank.icon} ${rank.name}. Mande um incentivo!` : 'Mande um incentivo!',
      });
    }
    seen.users[id] = { base: p.streak_base, idx, rank: rank.id };
  }

  try { localStorage.setItem(FRIENDS_SEEN_KEY, JSON.stringify(seen)); } catch { /* sem espaço */ }
  if (!events.length || !state.settings.friendNotify) return;

  toast(events.length === 1 ? events[0].title : `${events[0].title} e mais ${events.length - 1} novidade${events.length > 2 ? 's' : ''}`);
  if (events.length > 3) {
    notify('Novidades nos seus grupos', events.slice(0, 3).map((e) => e.title).join('\n') + '\n…', { tag: 'friends' });
  } else {
    events.forEach((e) => notify(e.title, e.body, { tag: e.key }));
  }
}

const RPC_ERRORS = {
  invalid_code: 'Código não encontrado. Confira com quem te convidou.',
  group_full: 'Esse grupo já está cheio (50 pessoas).',
  no_profile: 'Escolha um nickname primeiro.',
};

async function groupRpc(fn, args, okText) {
  if (cloud.busy) return;
  cloud.busy = true;
  try {
    const { data, error } = await cloud.client.rpc(fn, args);
    if (error) {
      const key = Object.keys(RPC_ERRORS).find((k) => error.message?.includes(k));
      toast(RPC_ERRORS[key] || 'Não foi possível concluir. Verifique sua conexão.');
      return null;
    }
    await loadGroups();
    toast(okText(data));
    return data;
  } finally {
    cloud.busy = false;
  }
}

const createGroup = (name) => groupRpc('create_group', { p_name: name }, (g) => `Grupo “${g.name}” criado. Convide seus amigos com o código ${g.code}.`);
const joinGroup = (code) => groupRpc('join_group', { p_code: code }, (g) => `Você entrou em “${g.name}”.`);

async function leaveGroup(id) {
  const g = cloud.groups.find((x) => x.id === id);
  if (!g || !confirm(`Sair do grupo “${g.name}”?`)) return;
  const { error } = await cloud.client.from('group_members').delete().match({ group_id: id, user_id: cloud.user.id });
  if (error) return toast('Não foi possível sair do grupo.');
  await loadGroups();
  toast(`Você saiu de “${g.name}”.`);
}

async function inviteToGroup(code) {
  const g = cloud.groups.find((x) => x.code === code);
  const url = `${redirectUrl()}?join=${code}`;
  const text = `Vamos parar de fumar juntos? Entre no grupo “${g?.name ?? ''}” no Respira com o código ${code}: ${url}`;
  try {
    if (navigator.share) return await navigator.share({ title: 'Respira', text });
  } catch {
    return; // compartilhamento cancelado
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Convite copiado. Cole numa conversa com seus amigos.');
  } catch {
    prompt('Copie o convite:', text);
  }
}

/* ---------------- Conta (e-mail opcional) ---------------- */

async function linkEmail(email) {
  const { error } = await cloud.client.auth.updateUser({ email }, { emailRedirectTo: redirectUrl() });
  toast(error ? 'Não foi possível usar esse e-mail. Ele já pode estar em outra conta.' : `Enviamos um link de confirmação para ${email}.`);
}

async function loginWithEmail(email) {
  if (!cloudOn()) return toast('O app não está conectado ao servidor.');
  const { error } = await cloud.client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectUrl() },
  });
  toast(error ? 'Não encontramos uma conta com esse e-mail.' : `Enviamos um link de acesso para ${email}. Abra-o neste aparelho.`);
  return !error;
}

async function logout() {
  const anon = cloud.user?.is_anonymous;
  const msg = anon
    ? 'Sua conta não tem e-mail. Se sair, não vai conseguir voltar para este perfil e seus grupos. Sair mesmo assim?'
    : 'Sair da conta neste aparelho? Seus registros continuam aqui e na nuvem.';
  if (!confirm(msg)) return;
  await cloudPush();
  await cloud.client.auth.signOut();
  localStorage.removeItem(CLOUD_USER_KEY);
  toast('Você saiu da conta.');
}

/** Usado ao apagar todos os dados: remove também a cópia na nuvem. */
async function cloudWipe() {
  if (!cloud.user) return;
  const c = cloud.client;
  const uid = cloud.user.id;
  await c.from('user_data').delete().eq('user_id', uid);
  await c.from('profiles').delete().eq('id', uid);
  await c.auth.signOut();
  localStorage.removeItem(CLOUD_USER_KEY);
  localStorage.removeItem(FRIENDS_SEEN_KEY);
}

/* ---------------- Renderização ---------------- */

function renderRankLive() {
  const elapsed = currentStreak();
  const { rank, next } = rankFor(elapsed);
  const chip = $('#rank-chip');
  chip.textContent = `${rank.icon} ${rank.name}`;

  $('#rank-icon').textContent = rank.icon;
  $('#rank-name').textContent = rank.name;
  $('#rank-text').textContent = rank.text;
  if (next) {
    const pct = ((elapsed - rank.ms) / (next.ms - rank.ms)) * 100;
    $('#rank-bar').style.width = clamp(pct, 0, 100) + '%';
    $('#rank-next').textContent = `Próximo: ${next.icon} ${next.name} em ${duration(next.ms - elapsed)}`;
  } else {
    $('#rank-bar').style.width = '100%';
    $('#rank-next').textContent = 'Nível máximo. Você é inspiração!';
  }
  const best = rankFor(bestStreak()).rank;
  $('#rank-best').textContent = `Seu recorde: ${duration(bestStreak())} (${best.icon} ${best.name})`;

  // Tempo sem fumar no placar dos grupos, atualizado ao vivo.
  $$('[data-since]').forEach((el) => {
    const since = Number(el.dataset.since);
    el.textContent = since ? duration(Date.now() - since) : '—';
  });
}

function renderRankList() {
  const elapsed = currentStreak();
  $('#rank-list').innerHTML = RANKS.map((r, i) => {
    const next = RANKS[i + 1];
    const cls = elapsed >= r.ms ? (next && elapsed >= next.ms ? 'done' : 'current') : 'locked';
    const at = r.ms === 0 ? 'logo após o último cigarro' : `com ${duration(r.ms).replace(/ 0h 0min$/, '').replace(/ 0min$/, '')} sem fumar`;
    return `<li class="${cls}"><span class="rk">${r.icon}</span><div><strong>${r.name}</strong><small>${at}</small></div></li>`;
  }).join('');
}

function renderSocial() {
  renderRankLive();
  renderRankList();

  const on = cloudOn();
  $('#cloud-off').hidden = on;
  $('#cloud-off p').textContent = cloudConfigured()
    ? 'Sem conexão com a internet. Perfil e grupos voltam quando você estiver on-line.'
    : 'Perfil e grupos de amigos ainda não estão disponíveis nesta instalação do app.';
  $('#nick-form').hidden = !on;
  const f = $('#nick-form');
  if (document.activeElement !== f.elements.nickname) f.elements.nickname.value = cloud.profile?.nickname || '';
  $('#nick-submit').textContent = cloud.profile ? 'Atualizar nickname' : 'Salvar e ativar amigos';
  $('#nick-privacy').hidden = !!cloud.profile;
  $('#login-hint').hidden = !on || !!cloud.profile;
  $('#groups-area').hidden = !cloud.profile;
  $('#onb-login').hidden = !on;

  renderGroups();
  renderAccount();
}

function renderGroups() {
  const box = $('#group-list');
  if (!cloud.profile) { box.innerHTML = ''; return; }
  if (!cloud.groups.length) {
    box.innerHTML = '<p class="empty">Você ainda não está em nenhum grupo. Crie um e mande o código para seus amigos.</p>';
    return;
  }
  const me = cloud.user.id;
  box.innerHTML = cloud.groups.map((g) => {
    const members = (cloud.members[g.id] || [])
      .filter((m) => m.profiles)
      .map((m) => {
        const p = m.profiles;
        // Para você, usa os dados locais (sempre atualizados).
        const since = m.user_id === me ? streakBase() : new Date(p.streak_base || Date.now()).getTime();
        return { ...p, me: m.user_id === me, since, best: m.user_id === me ? bestStreak() : Number(p.best_streak_ms) || 0 };
      })
      .sort((a, b) => a.since - b.since);
    const rows = members.map((p, i) => {
      const { rank } = rankFor(Date.now() - p.since);
      const stale = !p.me && Date.now() - new Date(p.updated_at).getTime() > 2 * DAY
        ? ` · visto ${new Date(p.updated_at).toLocaleDateString('pt-BR')}` : '';
      return `<li class="${p.me ? 'me' : ''}">
        <span class="pos">${i + 1}º</span>
        <span class="rk" title="${rank.name}">${rank.icon}</span>
        <div class="who"><b>${esc(p.nickname)}${p.me ? ' <small>(você)</small>' : ''}</b>
          <small>${rank.name} · recorde ${duration(p.best)} · ${p.cravings_won} vontades vencidas${stale}</small></div>
        <time data-since="${p.since}">${duration(Date.now() - p.since)}</time>
      </li>`;
    }).join('');
    return `<div class="card group">
      <div class="group-head">
        <div><strong>${esc(g.name)}</strong><small>${members.length} pessoa${members.length === 1 ? '' : 's'} · código <b class="code">${esc(g.code)}</b></small></div>
        <button class="btn btn-soft" data-invite="${esc(g.code)}">Convidar</button>
      </div>
      <ol class="leaderboard">${rows}</ol>
      <button class="btn btn-ghost btn-leave" data-leave="${g.id}">Sair do grupo</button>
    </div>`;
  }).join('');
}

function renderAccount() {
  if (!cloud.user) return;
  const anon = cloud.user.is_anonymous;
  const pendingEmail = cloud.user.new_email;
  $('#account-status').textContent = anon
    ? (pendingEmail
      ? `Aguardando confirmação de ${pendingEmail}. Abra o link que enviamos.`
      : 'Sua conta está só neste aparelho. Adicione um e-mail para recuperá-la se trocar de celular.')
    : `Conta protegida: ${cloud.user.email}.`;
  $('#link-email-form').hidden = !anon;
  $('#sync-status').textContent = cloud.syncError
    ? '⚠️ Última sincronização falhou. Tentaremos de novo na próxima mudança.'
    : '☁️ Seus registros estão salvos na nuvem.';
}

/* ---------------- Eventos ---------------- */

function setupSocial() {
  setupCloud();

  // Link de convite: ?join=CODIGO
  const params = new URLSearchParams(location.search);
  const join = params.get('join');
  if (join) {
    history.replaceState(null, '', location.pathname);
    $('#join-form').elements.code.value = join.toUpperCase();
    if (state.onboarded) showTab('social');
    toast('Convite recebido! Em Amigos, escolha um nickname (se ainda não tiver) e toque em “Entrar”.');
  }

  $('#nick-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveNickname(e.target.elements.nickname.value.trim());
  });

  $('#join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = e.target.elements.code.value.trim();
    if (code.length < 4) return toast('Digite o código do convite.');
    if (await joinGroup(code)) e.target.reset();
  });

  $('#create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.elements.name.value.trim();
    if (name.length < 2) return toast('Dê um nome ao grupo.');
    if (await createGroup(name)) e.target.reset();
  });

  $('#link-email-form').addEventListener('submit', (e) => {
    e.preventDefault();
    linkEmail(e.target.elements.email.value.trim());
  });

  $('#login-form').addEventListener('submit', async (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    if (await loginWithEmail(e.target.elements.email.value.trim())) $('#dlg-login').close();
  });

  document.addEventListener('click', (e) => {
    const inv = e.target.closest('[data-invite]');
    if (inv) return inviteToGroup(inv.dataset.invite);
    const leave = e.target.closest('[data-leave]');
    if (leave) return leaveGroup(leave.dataset.leave);
    const act = e.target.closest('[data-action]')?.dataset.action;
    if (act === 'cloud-login') openDialog('#dlg-login');
    if (act === 'cloud-logout') logout();
    if (act === 'groups-refresh') cloudRefresh(true);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && cloud.pushTimer) cloudPush();
    if (document.visibilityState === 'visible') cloudRefresh();
  });

  // Busca novidades dos grupos (e dispara os avisos) mesmo fora da aba Amigos.
  setInterval(() => cloudRefresh(), 60 * 1000);
}
