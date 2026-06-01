/* =============================================
   STUDYQUEST — SCRIPT.JS
   Sistema de gamificação completo
   ============================================= */

'use strict';

// ============================================================
// PWA — Service Worker + Botão de instalação
// ============================================================

// Registra o service worker e detecta atualizações automaticamente
if ('serviceWorker' in navigator) {
  // Guarda se já havia um SW ativo antes desta sessão
  const _hadSwController = !!navigator.serviceWorker.controller;

  // controllerchange dispara quando um NOVO SW assume controle da página
  // (acontece após skipWaiting + clients.claim do novo SW)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_hadSwController) {
      // Havia um SW antigo → esta é uma atualização real → mostra banner
      _showSwUpdateBanner();
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => {
        console.log('[SW] Registrado. Scope:', reg.scope);
        // Verifica por novo SW a cada carregamento de página
        reg.update();
      })
      .catch(err => console.warn('[SW] Falha ao registrar:', err));
  });
}

/** Exibe banner de "Nova versão disponível" no rodapé da tela */
function _showSwUpdateBanner() {
  if (document.getElementById('sw-update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.innerHTML = `
    <span>🚀 Nova versão disponível!</span>
    <button onclick="window.location.reload()" style="background:#fff;color:#7c3aed;border:none;border-radius:8px;padding:.3rem .8rem;font-weight:700;cursor:pointer;">Atualizar</button>
    <button onclick="document.getElementById('sw-update-banner').remove()" style="background:transparent;color:rgba(255,255,255,.7);border:none;font-size:1.1rem;cursor:pointer;padding:0 .25rem;">✕</button>
  `;
  banner.style.cssText = [
    'position:fixed', 'bottom:72px', 'left:50%', 'transform:translateX(-50%)',
    'background:var(--primary, #7c3aed)', 'color:#fff',
    'padding:.6rem 1rem', 'border-radius:12px',
    'display:flex', 'align-items:center', 'gap:.75rem',
    'z-index:9999', 'font-size:.88rem', 'font-weight:600',
    'box-shadow:0 4px 24px rgba(0,0,0,.45)', 'white-space:nowrap',
  ].join(';');
  document.body.appendChild(banner);
  // Some automaticamente após 30s se o usuário ignorar
  setTimeout(() => banner.remove(), 30000);
}

// Armazena o evento beforeinstallprompt para usar depois
let _pwaInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();   // impede o mini-infobar automático do Chrome
  _pwaInstallPrompt = e;
  _showInstallButtons();
  console.log('[PWA] App pode ser instalado — botão exibido.');
});

// Remove os botões se o usuário já instalou
window.addEventListener('appinstalled', () => {
  _pwaInstallPrompt = null;
  _hideInstallButtons();
  console.log('[PWA] App instalado com sucesso!');
  showNotification('✅ StudyQuest instalado! Procure o ícone na tela inicial.', 'success');
});

function _showInstallButtons() {
  const topbar   = document.getElementById('install-btn-topbar');
  const section  = document.getElementById('pwa-install-section');
  const login    = document.getElementById('install-btn-login');
  const register = document.getElementById('install-btn-register');
  if (topbar)    topbar.style.display   = '';
  if (section)   section.style.display  = '';
  if (login)     login.style.display    = '';
  if (register)  register.style.display = '';
}

function _hideInstallButtons() {
  const topbar   = document.getElementById('install-btn-topbar');
  const section  = document.getElementById('pwa-install-section');
  const login    = document.getElementById('install-btn-login');
  const register = document.getElementById('install-btn-register');
  if (topbar)    topbar.style.display   = 'none';
  if (section)   section.style.display  = 'none';
  if (login)     login.style.display    = 'none';
  if (register)  register.style.display = 'none';
}

async function triggerPWAInstall() {
  if (!_pwaInstallPrompt) return;
  _pwaInstallPrompt.prompt();
  const { outcome } = await _pwaInstallPrompt.userChoice;
  console.log('[PWA] Resposta do usuário:', outcome);
  if (outcome === 'accepted') {
    _pwaInstallPrompt = null;
    _hideInstallButtons();
  }
}

// ============================================================
// SUPABASE — ID único do usuário + cliente (topo do script)
// ============================================================

// ID persistido no localStorage — fallback para quando não há login Google
const userId = localStorage.getItem('user_id') || crypto.randomUUID();
localStorage.setItem('user_id', userId);

// ID do usuário autenticado via Google (Supabase Auth). Null = não logado com Google.
// Definido em handleSupabaseSession() após login/restauração de sessão.
let authUserId = null;

/**
 * Retorna o ID correto para operações no banco:
 *   • login Google → user.id do Supabase Auth  (dados sincronizados entre dispositivos)
 *   • sem login    → UUID do localStorage       (dados locais, não requerem login)
 */
function getEffectiveUserId() {
  return authUserId || userId;
}

// Cliente Supabase inicializado imediatamente (CDN carregado antes deste script)
// Nota: "window.supabase" é o namespace da biblioteca; "sb" é o nosso cliente.
// Não podemos usar "const supabase" porque o CDN já declara "var supabase" globalmente.
const sb = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(
      'https://gwenrlqhxzcnwlmvwszj.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZW5ybHFoeHpjbndsbXZ3c3pqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTA0NjgsImV4cCI6MjA5MjAyNjQ2OH0.3sBTMvxu1Z7ASBPHrDrBWfUUy6Ruyzfo9PbKOpzFUe8'
    )
  : null;

if (sb) console.log('[Supabase] Cliente pronto. userId:', userId);
else    console.warn('[Supabase] SDK não disponível — apenas localStorage.');

// ============================================================
// CONSTANTES & CONFIGURAÇÕES
// ============================================================

const XP_REWARDS = { easy: 10, medium: 20, hard: 40 };
const COIN_REWARDS = { easy: 5, medium: 10, hard: 20 };
const POMODORO_FOCUS = 25 * 60;
const POMODORO_BREAK = 5 * 60;

// XP necessário para cada nível (nível N precisa de N * 80 XP)
const xpForLevel = n => Math.floor(50 * n * 1.3);

// Itens da loja
const SHOP_ITEMS = [
  { id: 'xp_boost', name: 'Poção de XP Duplo', icon: '⚡', desc: 'Próximas 3 tarefas dão XP em dobro', cost: 50, type: 'xp_boost', charges: 3 },
  { id: 'coin_boost', name: 'Amuleto de Ouro', icon: '💰', desc: 'Próximas 3 tarefas dão moedas em dobro', cost: 40, type: 'coin_boost', charges: 3 },
  { id: 'streak_shield', name: 'Escudo de Streak', icon: '🛡️', desc: 'Protege seu streak por 1 dia', cost: 80, type: 'streak_shield', charges: 1 },
  { id: 'exam_boost', name: 'Bênção das Provas', icon: '📜', desc: 'Próxima prova dá recompensa máxima', cost: 60, type: 'exam_boost', charges: 1 },
  { id: 'study_tip', name: 'Grimório de Dicas', icon: '📖', desc: 'Revela dicas especiais de estudo', cost: 30, type: 'study_tip', charges: 1 },
  { id: 'lootbox', name: 'Caixa Misteriosa', icon: '🎁', desc: 'Recompensa surpresa aleatória!', cost: 35, type: 'lootbox', charges: 1 },
];

// ── Cosméticos ────────────────────────────────────────────────
const COSMETIC_FRAMES = [
  { id: 'frame_silver',  name: 'Moldura Prata',     icon: '⬜', cost: 100, desc: 'Um toque elegante de prata.' },
  { id: 'frame_gold',    name: 'Moldura Ouro',      icon: '🟡', cost: 250, desc: 'Brilho de campeão.' },
  { id: 'frame_diamond', name: 'Moldura Diamante',  icon: '💎', cost: 500, desc: 'Para os verdadeiros estudiosos.' },
  { id: 'frame_fire',    name: 'Moldura de Fogo',   icon: '🔥', cost: 350, desc: 'Arde com determinação.' },
  { id: 'frame_rainbow', name: 'Moldura Arco-íris', icon: '🌈', cost: 700, desc: 'Raro e deslumbrante.' },
];
const COSMETIC_BANNERS = [
  { id: 'banner_purple', name: 'Banner Roxo',    icon: '🟣', cost:  80, desc: 'Clássico StudyQuest.' },
  { id: 'banner_fire',   name: 'Banner Chamas',  icon: '🔥', cost: 120, desc: 'Intensidade total.' },
  { id: 'banner_ocean',  name: 'Banner Oceano',  icon: '🌊', cost: 120, desc: 'Calmo e profundo.' },
  { id: 'banner_forest', name: 'Banner Floresta',icon: '🌿', cost: 100, desc: 'Natural e revigorante.' },
  { id: 'banner_galaxy', name: 'Banner Galáxia', icon: '🌌', cost: 200, desc: 'Infinito e misterioso.' },
];

// ── IA — custos por modo ─────────────────────────────────────
const IA_COSTS = { chat_normal: 1, explicar: 5, resumo: 5, quiz: 5, prova: 10 };
const IA_MODES = [
  { id: 'chat_normal', label: '💬 Chat',     cost: 1  },
  { id: 'explicar',    label: '📖 Explicar',  cost: 5  },
  { id: 'resumo',      label: '📝 Resumo',    cost: 5  },
  { id: 'quiz',        label: '❓ Quiz',      cost: 5  },
  { id: 'prova',       label: '📋 Prova',     cost: 10 },
];

const WEEKDAY_NAMES = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const WEEKDAY_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

const DAILY_TASK_TYPES = [
  { id: 'resumo',  icon: '📝', label: 'Mini Resumo',    mkDesc: s => `Escreva um resumo curto sobre ${s} estudado hoje.` },
  { id: 'revisao', icon: '⚡', label: 'Revisão Rápida', mkDesc: s => `Revise rapidamente o conteúdo de ${s} visto hoje.` },
  { id: 'feynman', icon: '🧠', label: 'Método Feynman', mkDesc: s => `Explique ${s} com suas próprias palavras como se ensinasse alguém.` },
];

// ============================================================
// RANKING & MEDALHAS DOS GRUPOS
// ============================================================

/** Definições das 9 medalhas de grupo */
const GROUP_MEDAL_DEFS = [
  {
    type: 'xp_master',    icon: '📈', label: 'Mestre do XP',
    desc: 'Mais XP ganho no grupo esta semana',
    scoreKey: 'totalXp',
    rarityThresholds: { bronze: 50, silver: 200, gold: 500, legendary: 1000 },
  },
  {
    type: 'most_active',  icon: '⚡', label: 'Mais Ativo',
    desc: 'Mais sessões de estudo registradas',
    scoreKey: 'sessionCount',
    rarityThresholds: { bronze: 3, silver: 7, gold: 15, legendary: 25 },
  },
  {
    type: 'revisao_king', icon: '📚', label: 'Mestre da Revisão',
    desc: 'Mais revisões rápidas concluídas',
    scoreKey: 'revisaoCount',
    rarityThresholds: { bronze: 1, silver: 3, gold: 5, legendary: 7 },
  },
  {
    type: 'feynman_king', icon: '🧠', label: 'Feynman Master',
    desc: 'Mais tarefas Método Feynman concluídas',
    scoreKey: 'feynmanCount',
    rarityThresholds: { bronze: 1, silver: 2, gold: 4, legendary: 6 },
  },
  {
    type: 'resumo_king',  icon: '📝', label: 'Rei dos Resumos',
    desc: 'Mais mini resumos concluídos',
    scoreKey: 'resumoCount',
    rarityThresholds: { bronze: 1, silver: 3, gold: 5, legendary: 7 },
  },
  {
    type: 'streak',       icon: '🔥', label: 'Sequência Suprema',
    desc: 'Maior sequência de dias de estudo',
    scoreKey: 'streak',
    rarityThresholds: { bronze: 3, silver: 7, gold: 14, legendary: 30 },
  },
  {
    type: 'focus',        icon: '🎯', label: 'Foco Total',
    desc: 'Maior XP acumulado em um único dia',
    scoreKey: 'maxDayXp',
    rarityThresholds: { bronze: 50, silver: 150, gold: 300, legendary: 500 },
  },
  {
    type: 'evolution',    icon: '🚀', label: 'Evolução Rápida',
    desc: 'Maior crescimento de XP na semana',
    scoreKey: 'totalXp',
    rarityThresholds: { bronze: 100, silver: 300, gold: 700, legendary: 1500 },
  },
  {
    type: 'explorer',     icon: '📖', label: 'Explorador',
    desc: 'Estudou mais matérias diferentes',
    scoreKey: 'subjectCount',
    rarityThresholds: { bronze: 2, silver: 4, gold: 6, legendary: 8 },
  },
];

/** Recompensas e cores de cada raridade */
const MEDAL_RARITIES = {
  bronze:    { label: 'Bronze',   color: '#cd7f32', bg: 'rgba(205,127,50,.12)',  xp: 10,  coins: 5  },
  silver:    { label: 'Prata',    color: '#9e9e9e', bg: 'rgba(158,158,158,.12)', xp: 25,  coins: 15 },
  gold:      { label: 'Ouro',     color: '#f9a825', bg: 'rgba(249,168,37,.12)',  xp: 50,  coins: 30 },
  legendary: { label: 'Lendária', color: '#9b59b6', bg: 'rgba(155,89,182,.15)', xp: 100, coins: 60 },
};

// ── Frases motivacionais ──────────────────────────────────────
// Presentes surpresa diários gerados pelo sistema
const SURPRISE_GIFTS_POOL = [
  { id: 'sg_xp_sm',    icon: '🧪', name: 'Poção de XP',         type: 'xp',    value: 50  },
  { id: 'sg_xp_lg',    icon: '⚗️', name: 'Grande Poção de XP',  type: 'xp',    value: 150 },
  { id: 'sg_coins_sm', icon: '💰', name: 'Saco de Moedas',       type: 'coins', value: 75  },
  { id: 'sg_coins_lg', icon: '💎', name: 'Tesouro do Dia',       type: 'coins', value: 200 },
  { id: 'sg_xp_boost', icon: '⚡', name: 'Boost de XP (+100)',   type: 'xp',    value: 100 },
  { id: 'sg_coins_bonus',icon:'🪙', name: 'Moedas Bônus',        type: 'coins', value: 50  },
];

const MOTIVATION_PHRASES = [
  '💪 Você consegue! Continue assim!',
  '🔥 Tô na torcida por você!',
  '⭐ Cada dia de estudo é uma vitória!',
  '⚔️ Vai lá, herói! Você é capaz!',
  '🏆 Seu esforço vai te levar longe!',
  '🚀 Um passo de cada vez — você tá voando!',
  '🧠 Estudar hoje é vencer amanhã!',
  '💎 Você é mais forte do que pensa!',
  '🌟 Orgulho de você! Segue firme!',
  '📚 Conhecimento é o melhor investimento!',
  '🎯 Foco total, resultado garantido!',
  '🌈 Depois da luta, vem a glória!',
];

// Conquistas disponíveis
const ACHIEVEMENTS_DEF = [
  { id: 'first_task', name: 'Primeiro Passo', icon: '🌱', desc: 'Conclua sua primeira tarefa', condition: s => s.totalTasksDone >= 1 },
  { id: 'ten_tasks', name: 'Em Progresso', icon: '📋', desc: 'Conclua 10 tarefas', condition: s => s.totalTasksDone >= 10 },
  { id: 'fifty_tasks', name: 'Máquina de Tarefas', icon: '⚙️', desc: 'Conclua 50 tarefas', condition: s => s.totalTasksDone >= 50 },
  { id: 'hundred_tasks', name: 'Lendário', icon: '👑', desc: 'Conclua 100 tarefas', condition: s => s.totalTasksDone >= 100 },
  { id: 'grade_10', name: 'Nota Máxima', icon: '🌟', desc: 'Tire nota 10 em uma prova', condition: s => s.maxGradeEver >= 10 },
  { id: 'streak_3', name: 'Em Chamas', icon: '🔥', desc: 'Mantenha streak de 3 dias', condition: s => s.maxStreak >= 3 },
  { id: 'streak_7', name: 'Uma Semana Épica', icon: '💪', desc: 'Mantenha streak de 7 dias', condition: s => s.maxStreak >= 7 },
  { id: 'streak_30', name: 'Mestre da Consistência', icon: '🏔️', desc: 'Mantenha streak de 30 dias', condition: s => s.maxStreak >= 30 },
  { id: 'level_5', name: 'Aventureiro', icon: '⚔️', desc: 'Alcance o nível 5', condition: s => s.level >= 5 },
  { id: 'level_10', name: 'Herói', icon: '🦸', desc: 'Alcance o nível 10', condition: s => s.level >= 10 },
  { id: 'level_20', name: 'Lenda Viva', icon: '🐉', desc: 'Alcance o nível 20', condition: s => s.level >= 20 },
  { id: 'pomodoro_first', name: 'Focado', icon: '⏱️', desc: 'Complete sua primeira sessão Pomodoro', condition: s => s.totalPomodoros >= 1 },
  { id: 'pomodoro_10', name: 'Mestre do Foco', icon: '🧘', desc: 'Complete 10 sessões Pomodoro', condition: s => s.totalPomodoros >= 10 },
  { id: 'five_subjects', name: 'Estudante Completo', icon: '📚', desc: 'Crie 5 matérias', condition: s => s.subjects.length >= 5 },
  { id: 'first_exam', name: 'Bravura', icon: '📝', desc: 'Registre sua primeira prova', condition: s => s.exams.length >= 1 },
  { id: 'shop_buy', name: 'Comerciante', icon: '🛒', desc: 'Compre um item da loja', condition: s => s.totalPurchases >= 1 },
  { id: 'total_xp_1000', name: 'Mil Estrelas', icon: '✨', desc: 'Acumule 1000 XP total', condition: s => s.totalXpEarned >= 1000 },
  { id: 'total_xp_5000',  name: 'Supernova',         icon: '💫', desc: 'Acumule 5000 XP total',       condition: s => s.totalXpEarned >= 5000 },
  { id: 'first_study',    name: 'Primeiro Estudo',   icon: '📘', desc: 'Estude seu primeiro conteúdo', condition: s => (s.totalStudied||0) >= 1 },
  { id: 'ten_study',      name: 'Dedicação',         icon: '🎓', desc: 'Estude 10 conteúdos',         condition: s => (s.totalStudied||0) >= 10 },
  { id: 'fifty_study',    name: 'Estudante Modelo',  icon: '🏅', desc: 'Estude 50 conteúdos',         condition: s => (s.totalStudied||0) >= 50 },
];

// Missões diárias — valid(state) retorna false se a missão for impossível
const DAILY_MISSIONS_DEF = [
  { id: 'dm_3tasks',   name: 'Completar 3 tarefas',             icon: '✅', goal: 3,  reward: 30, key: 'tasksToday',
    valid: s => s.tasks.filter(t => !t.done).length >= 1 },
  { id: 'dm_2subjects',name: 'Estudar 2 matérias diferentes',   icon: '📚', goal: 2,  reward: 25, key: 'subjectsToday',
    valid: s => s.subjects.length >= 2 },
  { id: 'dm_50xp',     name: 'Ganhar 50 XP',                    icon: '⚡', goal: 50, reward: 20, key: 'xpToday' },
  { id: 'dm_1exam',    name: 'Registrar 1 prova',               icon: '📝', goal: 1,  reward: 35, key: 'examsToday' },
  { id: 'dm_pomodoro', name: 'Completar 1 sessão Pomodoro',     icon: '⏱️', goal: 1,  reward: 20, key: 'pomodorosToday' },
  { id: 'dm_2study',   name: 'Estudar 2 conteúdos',             icon: '📘', goal: 2,  reward: 25, key: 'studiedToday',
    valid: s => (s.studyItems || []).filter(i => !i.done).length >= 1 },
];

// valid(state, currentProgress) — missão semanal só some se progresso=0 e impossível
const WEEKLY_MISSIONS_DEF = [
  { id: 'wm_10tasks', name: 'Completar 10 tarefas esta semana', icon: '🔥', goal: 10, reward: 100, key: 'tasksThisWeek',
    valid: (s, p) => s.tasks.filter(t => !t.done).length >= 1 || (p || 0) > 0 },
  { id: 'wm_5days',   name: 'Estudar 5 dias seguidos',          icon: '📅', goal: 5,  reward: 80,  key: 'daysThisWeek' },
  { id: 'wm_3exams',  name: 'Registrar 3 provas',               icon: '📝', goal: 3,  reward: 90,  key: 'examsThisWeek' },
  { id: 'wm_5study',  name: 'Estudar 5 conteúdos esta semana',  icon: '📘', goal: 5,  reward: 75,  key: 'studiedThisWeek',
    valid: (s, p) => (s.studyItems || []).filter(i => !i.done).length >= 1 || (p || 0) > 0 },
];

// ============================================================
// ESTADO GLOBAL
// ============================================================

let state = {
  setup: false,
  name: '',
  avatar: '🧙',
  avatarType: 'emoji',  // 'emoji' | 'google' | 'url'
  avatarUrl: '',        // URL para google photo ou foto personalizada
  xp: 0,
  totalXpEarned: 0,
  coins: 0,
  level: 1,
  streak: 0,
  maxStreak: 0,
  lastStudyDate: null,
  dailyXp: 0,
  dailyGoal: 100,
  lastResetDate: null,
  lastWeeklyResetKey: null,  // rastreia semana do último reset semanal
  subjects: [],
  tasks: [],
  taskHistory: [],       // NEW: tarefas concluídas arquivadas
  exams: [],
  achievements: [],
  boosts: [],
  dailyMissions: {},
  weeklyMissions: {},
  dynamicMissions: [],   // NEW: missões dinâmicas
  totalTasksDone: 0,
  totalPomodoros: 0,
  maxGradeEver: 0,
  totalPurchases: 0,
  xpHistory: {},
  studyDays: [],
  records: { maxDailyXp: 0, maxStreak: 0, fastestLevelup: null, topGrade: 0 },
  gradeTypes: {},
  gradeEntries: {},
  studyItems: [],
  totalStudied: 0,
  favoriteSubject: '',
  cosmetics: { ownedFrames: [], ownedBanners: [], equippedFrame: null, equippedBanner: null },
  childrenWithoutAccounts: [],  // [{id, name}] — filhos sem conta própria
  childrenTasksLocal: [],       // [{id, childId, title, description, difficulty, xp_reward, due_date, completed, created_at}] — tarefas locais para crianças sem conta
  localNotifs: [],          // [{id, icon, message, timestamp, read}] — notifs de desempenho
  surpriseGifts: [],        // [{uid, icon, name, type, value, timestamp}] — presentes do sistema
  lastSurpriseGiftDate: '', // 'YYYY-MM-DD' — controla 1 presente por dia
  lastCheckedGrades: {},    // {subjectId: lastGrade} — detecta mudanças de nota
  iacoins: 0,               // moeda para usar a IA
  isAdmin: false,           // lido do Supabase (coluna is_admin)
  isSuspect: false,         // lido do Supabase (coluna is_suspect)
  penaltyType: null,        // null | 'limit' | 'warn'
  aiHistory: [],            // histórico do chat IA [{role,content}]
  schedule:        {},   // { 0:['Matéria',...], 1:[...], ... } — 0=Dom
  dailyTasks:      [],   // tarefas geradas hoje [{id,type,icon,label,subject,title,description,done,doneAt,createdDate}]
  dailyTasksDate:  '',   // 'YYYY-MM-DD' — data da última geração
  username:        '',   // @username do usuário
  settings: {
    schoolAverage:       7,       // média escolar padrão
    notificationsEnabled: true,   // notificações visuais
    soundsEnabled:        true,   // sons de XP/level
    confirmDeletes:       true,   // pedir confirmação ao excluir
    theme:               'dark',  // 'dark' | 'light'
    focusMode:           false,   // modo foco persistido
  },
};

let pomodoroTimer    = null;
let pomodoroSeconds  = POMODORO_FOCUS;
let pomodoroRunning  = false;
let pomodoroIsBreak  = false;
let pomodoroAngle    = 0;
let _pomodoroEndTime = null;   // timestamp (ms) em que a fase atual termina
const _POMO_LS = 'sq_pomo_v1';
let calDate = new Date();
let currentFilter = 'all';
let focusMode = false;
let pendingExamId = null; // id do exame aguardando nota

// ── Sort preferences (persisted in localStorage) ──────────
const SORT_DEFAULTS = {
  tasks:  'due-asc',
  exams:  'date-asc',
  grades: 'date-desc',
  study:  'status',
};
const sortPrefs = (function() {
  try {
    const saved = JSON.parse(localStorage.getItem('sq_sort') || '{}');
    return Object.assign({}, SORT_DEFAULTS, saved);
  } catch(e) { return Object.assign({}, SORT_DEFAULTS); }
})();

function saveSortPrefs() {
  localStorage.setItem('sq_sort', JSON.stringify(sortPrefs));
}

function onSortChange(page) {
  const el = document.getElementById('sort-' + page);
  if (!el) return;
  sortPrefs[page] = el.value;
  saveSortPrefs();
  if (page === 'tasks')  { autoArchiveTasks(); generateDynamicMissions(); renderTasks(); }
  if (page === 'exams')  renderExams();
  if (page === 'grades') { populateGradeFilters(); renderAllGradesHistory(); }
  if (page === 'study')  renderStudyPage();
}

function applySortSelect(page) {
  const el = document.getElementById('sort-' + page);
  if (el && sortPrefs[page]) el.value = sortPrefs[page];
}

// Helper: school average (reads from settings)
function getSchoolAverage() {
  return (state.settings && state.settings.schoolAverage != null)
    ? Number(state.settings.schoolAverage) : 7;
}

// ── Sort helper functions ──────────────────────────────────
const DIFF_ORDER = { easy: 0, medium: 1, hard: 2 };

function subjName(subjectId) {
  if (!subjectId) return 'zzz';
  const s = (state.subjects||[]).find(x => x.id === subjectId);
  return s ? s.name.toLowerCase() : 'zzz';
}

function sortArray(arr, type) {
  const today = todayStr();
  return arr.slice().sort(function(a, b) {
    switch (type) {

      /* ─── TASKS ─────────────────────────────── */
      case 'due-asc':
        if (!a.dueDate && !b.dueDate) return (b.createdAt||0) - (a.createdAt||0);
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);

      case 'due-desc':
        if (!a.dueDate && !b.dueDate) return (b.createdAt||0) - (a.createdAt||0);
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return b.dueDate.localeCompare(a.dueDate);

      case 'created-desc': return (b.createdAt||0) - (a.createdAt||0);
      case 'created-asc':  return (a.createdAt||0) - (b.createdAt||0);

      case 'diff-asc':  return (DIFF_ORDER[a.difficulty]||0) - (DIFF_ORDER[b.difficulty]||0);
      case 'diff-desc': return (DIFF_ORDER[b.difficulty]||0) - (DIFF_ORDER[a.difficulty]||0);

      case 'status-pending': {
        // pending (no date or future) = 0, overdue = 1, done = 2
        function tRank(t) {
          if (t.done) return 2;
          if (t.dueDate && t.dueDate < today) return 1;
          return 0;
        }
        var ra = tRank(a), rb = tRank(b);
        if (ra !== rb) return ra - rb;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return (b.createdAt||0) - (a.createdAt||0);
      }

      case 'status-overdue': {
        // overdue = 0, pending = 1, done = 2
        function oRank(t) {
          if (t.done) return 2;
          if (t.dueDate && t.dueDate < today) return 0;
          return 1;
        }
        var oa = oRank(a), ob = oRank(b);
        if (oa !== ob) return oa - ob;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return (b.createdAt||0) - (a.createdAt||0);
      }

      /* ─── EXAMS ──────────────────────────────── */
      case 'date-asc': {
        // works for both exams (.examDate) and study items (.date)
        var da = a.examDate || a.date || '';
        var db = b.examDate || b.date || '';
        if (!da && !db) return (b.timestamp||b.createdAt||0) - (a.timestamp||a.createdAt||0);
        if (!da) return 1;
        if (!db) return -1;
        return da.localeCompare(db);
      }

      case 'date-desc': {
        var da = a.examDate || a.date || '';
        var db = b.examDate || b.date || '';
        if (!da && !db) return (b.timestamp||b.createdAt||0) - (a.timestamp||a.createdAt||0);
        if (!da) return 1;
        if (!db) return -1;
        return db.localeCompare(da);
      }

      case 'registered-desc': return (b.timestamp||b.createdAt||0) - (a.timestamp||a.createdAt||0);
      case 'registered-asc':  return (a.timestamp||a.createdAt||0) - (b.timestamp||b.createdAt||0);

      case 'grade-desc': {
        var ga = (a.grade != null) ? Number(a.grade) : -1;
        var gb = (b.grade != null) ? Number(b.grade) : -1;
        return gb - ga;
      }
      case 'grade-asc': {
        var ga = (a.grade != null) ? Number(a.grade) : 99;
        var gb = (b.grade != null) ? Number(b.grade) : 99;
        return ga - gb;
      }

      case 'status': {
        // exam status: pending = 0, done = 1
        var sa = (a.status === 'pending') ? 0 : 1;
        var sb = (b.status === 'pending') ? 0 : 1;
        if (sa !== sb) return sa - sb;
        var da = a.examDate || a.date || '';
        var db = b.examDate || b.date || '';
        if (!da && !db) return (b.timestamp||0) - (a.timestamp||0);
        if (!da) return 1; if (!db) return -1;
        return da.localeCompare(db);
      }

      /* ─── SHARED ────────────────────────────── */
      case 'subject-az': return subjName(a.subjectId).localeCompare(subjName(b.subjectId), 'pt-BR');
      case 'subject-za': return subjName(b.subjectId).localeCompare(subjName(a.subjectId), 'pt-BR');

      default: return 0;
    }
  });
}


// ============================================================
// PERSISTÊNCIA — localStorage
// ============================================================

// Chave única e canônica. Usada em TODAS as leituras e escritas.
// Nunca use a string 'studyquest_v3' ou 'studyquest_save' diretamente.
const LS_SAVE_KEY = 'studyquest_save';

// ── saveLocalData(data) ───────────────────────────────────
// Serializa `data` e persiste na chave canônica.
// Chamado por saveState() e por loadUserDataFromAPI() após sync.
function saveLocalData(data) {
  try {
    localStorage.setItem(LS_SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('[Data] Erro ao salvar no localStorage:', e);
  }
}

// ── loadLocalData() ───────────────────────────────────────
// Lê e parseia os dados salvos.
// Inclui migração automática da chave legada 'studyquest_v3'.
// Retorna o objeto parseado, ou null se não houver dados.
function loadLocalData() {
  // Tenta a chave nova primeiro; se vazia, tenta a legada (migração)
  const raw = localStorage.getItem(LS_SAVE_KEY)
           || localStorage.getItem('studyquest_v3');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('[Data] Erro ao parsear localStorage:', e);
    return null;
  }
}

// ── applyDataToUI(data) ───────────────────────────────────
// Mescla `data` no state global e renderiza toda a interface.
// Chamado sempre que os dados locais são carregados.
function applyDataToUI(data) {
  if (!data || typeof data !== 'object') {
    console.warn('[Data] applyDataToUI: sem dados para aplicar.');
    return;
  }
  state = { ...state, ...data };
  console.log('[Data] Aplicando dados na interface — XP:', state.xp,
    '| Nível:', state.level, '| Moedas:', state.coins);
  updateAllUI();
}

// ── API pública — nomes exatos usados no projeto ──────────
// Estas são as funções canônicas que todo o código deve usar.
// saveLocalData / loadLocalData / applyDataToUI são os internos.

const STORAGE_KEY = LS_SAVE_KEY; // "studyquest_save"

function saveData(data)  { saveLocalData(data); }
function loadData()      { return loadLocalData(); }
function applyData(data) {
  if (!data) return;
  // Garante que o XP salvo aparece no elemento correto do HTML
  // (o projeto usa id="stat-xp", não id="xp")
  const el = document.getElementById('stat-xp')
          || document.getElementById('xp');
  if (el) el.textContent = data.xp ?? 0;
  // Aplica todos os outros campos na interface completa
  applyDataToUI(data);
}

// ── saveState() ───────────────────────────────────────────
// Salva SEMPRE no localStorage (modo online e offline).
// Em modo online: agenda sincronização com o backend (debounced).
// Sempre: agenda sincronização com Supabase (XP + level).
function saveState() {
  saveData(state);                  // localStorage primeiro — nunca perde dado
  scheduleSyncToAPI();              // backend: só envia se tiver token e conexão
  scheduleSyncToSupabase();         // Supabase: XP + level (sem necessidade de login)
}

// ── loadState() ───────────────────────────────────────────
// Carrega dados do localStorage e mescla no state global.
// NÃO chama updateAllUI — quem chama loadState() decide quando renderizar.
function loadState() {
  const parsed = loadLocalData();
  if (!parsed) {
    console.log('[Data] Nenhum dado encontrado no localStorage (novo usuário).');
    return false;
  }
  state = { ...state, ...parsed };
  console.log('[Data] Dados carregados do localStorage:', {
    xp: state.xp, level: state.level, coins: state.coins,
    streak: state.streak, name: state.name, setup: state.setup,
  });
  // Migração: se os dados estavam na chave legada, grava na nova chave agora
  if (!localStorage.getItem(LS_SAVE_KEY) && localStorage.getItem('studyquest_v3')) {
    saveLocalData(state);
    console.log('[Data] Migração studyquest_v3 → studyquest_save concluída.');
  }
  return true;
}

// ============================================================
// PERSISTÊNCIA — Supabase (state completo, sem login obrigatório)
// ============================================================

/**
 * Carrega o state completo do Supabase para este userId.
 * Retorna o objeto state salvo, ou null se não houver dados / falhar.
 *
 * A coluna `data` (jsonb) contém o state completo.
 * As colunas `xp`, `level`, `name`, `coins` são cópias superficiais
 * para facilitar consultas futuras no painel do Supabase.
 */
async function loadUserData() {
  if (!sb) return null;
  const uid = getEffectiveUserId();
  console.log('[Supabase] loadUserData() — buscando id:', uid);
  try {
    const { data, error } = await sb
      .from('users')
      .select('*')
      .eq('id', uid)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Nenhum registro ainda (primeiro acesso) — normal
        console.log('[Supabase] Nenhum dado na nuvem para este usuário (primeiro acesso).');
      } else {
        // Outro erro — pode ser RLS bloqueando ou tabela errada
        console.warn('[Supabase] Erro ao carregar (código:', error.code, '):', error.message);
      }
      return null;
    }

    if (!data) {
      console.warn('[Supabase] Query retornou vazio inesperadamente.');
      return null;
    }

    // `data.data` é a coluna JSONB com o state completo
    if (data.data && typeof data.data === 'object') {
      console.log('[Supabase] ✅ State completo carregado — XP:', data.data.xp, '| Setup:', data.data.setup, '| Nome:', data.data.name);
      const merged = { ...data.data };
      // Lê colunas de admin/penalidade que ficam fora do JSONB
      if (data.iacoins    != null) merged.iacoins     = data.iacoins;
      if (data.is_admin   != null) merged.isAdmin      = !!data.is_admin;
      if (data.is_suspect != null) merged.isSuspect    = !!data.is_suspect;
      if (data.penalty_type    )   merged.penaltyType  = data.penalty_type;
      if (data.username        )   merged.username     = data.username;
      return merged;
    }

    // Fallback: coluna `data` vazia — usa só as colunas básicas
    console.warn('[Supabase] Coluna data vazia — retornando apenas dados básicos (XP, level, name).');
    return { xp: data.xp, level: data.level, name: data.name, coins: data.coins };

  } catch (e) {
    console.warn('[Supabase] Exceção ao carregar:', e);
    return null;
  }
}

/**
 * Salva o state completo na tabela `users` (upsert por userId).
 * - Colunas top-level (xp, level, name, coins): fáceis de consultar no painel
 * - Coluna `data` (jsonb): state inteiro para restore completo
 *
 * Silencia erros — localStorage já garantiu a persistência local.
 */
async function saveUserData(data) {
  if (!sb) return;

  // Proteção anti-sobrescrita: nunca salva um state vazio/padrão por cima de dados reais
  // Um state válido tem nome preenchido OU setup já feito OU XP > 0
  if (!data.name && !data.setup && (!data.xp || data.xp === 0)) {
    console.warn('[Supabase] ⚠️ Ignorando save de state vazio/padrão — protegendo dados na nuvem.');
    return;
  }

  const uid = getEffectiveUserId();
  console.log('[Supabase] saveUserData() — salvando id:', uid);
  try {
    const { error } = await sb
      .from('users')
      .upsert({
        id:         uid,
        name:       data.name    || '',
        xp:         data.xp      || 0,
        level:      data.level   || 1,
        coins:      data.coins   || 0,
        iacoins:    data.iacoins || 0,
        username:   data.username || _generateUsername(uid),
        data:       { ...data },
        updated_at: new Date().toISOString(), // ← rastreia último acesso para estatísticas
      });
    if (error) console.warn('[Supabase] ❌ Erro ao salvar (código:', error.code, '):', error.message);
    else       console.log('[Supabase] ✅ State salvo — XP:', data.xp, '| Nível:', data.level, '| Nome:', data.name);
  } catch (e) {
    console.warn('[Supabase] Exceção ao salvar:', e);
  }
}

/**
 * Mescla dados da nuvem (API ou Supabase) no state local de forma inteligente.
 *
 * Problema: a nuvem pode ter uma versão DESATUALIZADA de certas propriedades
 * (ex: schedule, dailyTasks) porque o debounce de 3s ainda não tinha disparado
 * quando a sessão anterior encerrou. Um spread simples `{ ...state, ...cloud }`
 * sobrescreveria dados locais mais recentes com versões antigas.
 *
 * Regra para `schedule`: ganha a versão com MAIS matérias cadastradas.
 * Regra para `dailyTasks`: ganha a versão com mais tarefas ou a local (tarefas são
 *   regeneradas diariamente, então não faz sentido sobrescrever com lista vazia).
 * Todas as outras propriedades: a nuvem vence (comportamento padrão).
 */
function _mergeCloudState(localState, cloudData) {
  const merged = { ...localState, ...cloudData };

  // ── Schedule: preserva o mais rico ─────────────────────────────────────
  const localSched = localState.schedule || {};
  const cloudSched = cloudData.schedule  || {};
  const countSubjects = (s) => Object.values(s).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
  if (countSubjects(localSched) > countSubjects(cloudSched)) {
    merged.schedule = localSched;
  }

  // ── Daily tasks: preserva local se nuvem está vazia ou do dia anterior ─
  const localTasks = localState.dailyTasks     || [];
  const cloudTasks = cloudData.dailyTasks      || [];
  const localDate  = localState.dailyTasksDate || '';
  const cloudDate  = cloudData.dailyTasksDate  || '';
  const today      = new Date().toISOString().slice(0, 10);
  if (localDate === today && cloudDate !== today && localTasks.length > 0) {
    merged.dailyTasks     = localTasks;
    merged.dailyTasksDate = localDate;
  }

  return merged;
}

/** Debounce: sincroniza state completo com Supabase 3s após qualquer mudança. */
let _supabaseSyncTimer = null;
function scheduleSyncToSupabase() {
  clearTimeout(_supabaseSyncTimer);
  _supabaseSyncTimer = setTimeout(async () => {
    await saveUserData(state);
    syncPublicProfile(); // atualiza dados públicos (perfil, amigos, grupos)
  }, 3000);
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

// ── Botão Voltar/Avançar do browser ──────────────────────────
// Quando o usuário navega pelo histórico, o popstate dispara e
// restauramos a página correta sem recarregar.
window.addEventListener('popstate', (e) => {
  const page = e.state?.page;
  if (page && _SPA_PAGES.has(page)) {
    // Chama navigateTo sem fazer pushState de novo (já foi feito)
    _navigateUI(page);
  }
});

/** Aplica a UI de navegação sem alterar o histórico do browser */
function _navigateUI(page) {
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.page').forEach(el =>
    el.classList.toggle('active', el.id === `page-${page}`));
  document.querySelectorAll('.bottom-nav-item[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page));
  closeSidebar();
  if (page === 'subjects')     renderSubjects();
  if (page === 'tasks')        { autoArchiveTasks(); generateDynamicMissions(); renderTasks(); }
  if (page === 'exams')        renderExams();
  if (page === 'missions')     { generateDynamicMissions(); renderMissions(); }
  if (page === 'achievements') renderAchievements();
  if (page === 'shop')         renderShop();
  if (page === 'grades')       { initGradesPage(); renderGradesPage(); populateGradeFilters(); }
  if (page === 'study')        { initStudyPage(); renderStudyPage(); }
  if (page === 'stats')        renderStats();
  if (page === 'calendar')     renderCalendar();
  if (page === 'settings')     initSettingsPage();
  if (page === 'profile')      renderProfilePage();
  if (page === 'friends')      renderFriendsPage();
  if (page === 'groups')       renderGroupsPage();
  if (page === 'ai')           renderAIPage();
  if (page === 'admin')        renderAdminPage();
  if (page === 'familia')      renderFamiliaPage();
  if (authUserId) updateNotifBell();
}

window.addEventListener('DOMContentLoaded', async () => {
  // Always init UI components first
  initSetup();
  initNavigation();
  _restoreNavGroups();   // restaura grupos abertos da sidebar
  initModals();
  initPomodoro();
  initCalendar();
  initTheme();
  initExportImport();
  initEditDelete();
  initEditProfile();
  initAuth();          // telas de login/cadastro (inclui botões Google)
  initOfflineStatus(); // indicador online/offline + listeners de rede
  initPWAButtons();    // botões de instalação do PWA
  initSocialModals();  // modais de amigos e grupos

  if (sb) {
    // onAuthStateChange: APENAS para detectar logout.
    // O lançamento do app é feito EXCLUSIVAMENTE por startApp() via getSession().
    // Isso evita a corrida entre os dois caminhos que causava dupla chamada de launchApp().
    sb.auth.onAuthStateChange((event, session) => {
      console.log('[Supabase Auth]', event, '|', session?.user?.email ?? '—');
      if (event === 'SIGNED_OUT') {
        authUserId = null;
      }
    });

    await startApp();
    return;
  }

  // ── Sem Supabase: fluxo normal (JWT / modo offline) ────
  if (isLoggedIn()) {
    launchApp();
  } else {
    showAuthScreen();
  }
});

function initSetup() {
  // Avatar picker
  document.querySelectorAll('.avatar-opt').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.avatar-opt').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    });
  });

  document.getElementById('start-btn').addEventListener('click', () => {
    const name = document.getElementById('setup-name').value.trim();
    if (!name) return showNotification('Digite seu nome de herói!', 'warning');
    const avatar = document.querySelector('.avatar-opt.selected')?.dataset.av || '🧙';
    state.name = name;
    state.avatar = avatar;
    state.setup = true;
    state.lastResetDate = todayStr();
    state.taskHistory = [];
    state.dynamicMissions = [];
    initDailyMissions();
    initWeeklyMissions();
    saveState();           // salva no localStorage
    syncStateToAPI();      // salva no backend imediatamente (sem debounce)
    showApp();
    updateAllUI();
    showNotification(`Bem-vindo à aventura, ${name}! 🎉`, 'success');
  });
}

function showApp() {
  const setup = document.getElementById('setup-screen');
  const app   = document.getElementById('app');
  if (setup) { setup.classList.remove('active'); setup.style.display = 'none'; }
  if (app)   {
    app.classList.add('active');
    app.style.display = ''; // limpa qualquer display:none inline (definido por showAuthScreen/logout)
  }
  initShop();
  navigateTo('dashboard');
}

// ============================================================
// NAVEGAÇÃO
// ============================================================

function initNavigation() {
  document.querySelectorAll('.nav-item, .link-btn[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      const page = el.dataset.page;
      if (page) navigateTo(page);
    });
  });

  document.getElementById('menu-btn').addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

  // Bottom nav: botões de página
  document.querySelectorAll('.bottom-nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.page));
  });
  // Bottom nav: botão "Mais" abre a sidebar
  const moreBtn = document.getElementById('bottom-nav-more');
  if (moreBtn) moreBtn.addEventListener('click', toggleSidebar);

  // Botões de página
  document.getElementById('add-subject-btn').addEventListener('click', () => openModal('modal-subject'));
  document.getElementById('add-task-btn').addEventListener('click', () => {
    populateSubjectSelect('task-subject-select');
    // Set default due date to today
    document.getElementById('task-due-date').value = todayStr();
    openModal('modal-task');
  });
  document.getElementById('add-exam-btn').addEventListener('click', () => {
    populateSubjectSelect('exam-subject-select');
    document.getElementById('exam-date-input').value = todayStr();
    openModal('modal-exam');
  });
  document.getElementById('set-goal-btn').addEventListener('click', () => openModal('modal-goal'));

  // Focus mode
  document.getElementById('focus-mode-btn').addEventListener('click', toggleFocusMode);

  // Filtro de tarefas
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderTasks();
    });
  });
}

// Páginas válidas para roteamento por URL
const _SPA_PAGES = new Set([
  'dashboard','tasks','study','subjects','missions','achievements',
  'shop','grades','stats','exams','calendar','settings',
  'profile','friends','groups','ai','admin','familia',
]);

// Flag: primeira navegação usa replaceState (não cria entrada extra no histórico),
// as seguintes usam pushState. Não depende de history.state (que pode ser
// sobrescrito pelo Supabase Auth internamente).
let _navInitialized = false;

function navigateTo(page) {
  // ── Atualiza a URL do browser sem recarregar a página ──
  if (_SPA_PAGES.has(page)) {
    try {
      if (_navInitialized) {
        history.pushState({ page }, '', '/' + page);
      } else {
        history.replaceState({ page }, '', '/' + page);
        _navInitialized = true;
      }
      // Salva a página atual para que persista entre refreshes
      localStorage.setItem('sq_current_page', page);
    } catch(e) {}
  }

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.querySelectorAll('.page').forEach(el => {
    el.classList.toggle('active', el.id === `page-${page}`);
  });
  // Sincroniza bottom nav
  document.querySelectorAll('.bottom-nav-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  // Abre o grupo da sidebar que contém esta página
  _openNavGroupForPage(page);
  closeSidebar();

  if (page === 'subjects') renderSubjects();
  if (page === 'tasks') { autoArchiveTasks(); generateDynamicMissions(); renderTasks(); }
  if (page === 'exams') renderExams();
  if (page === 'missions') { generateDynamicMissions(); renderMissions(); }
  if (page === 'achievements') renderAchievements();
  if (page === 'shop') renderShop();
  if (page === 'grades') { initGradesPage(); renderGradesPage(); populateGradeFilters(); }
  if (page === 'study')  { initStudyPage();  renderStudyPage(); }
  if (page === 'stats') renderStats();
  if (page === 'calendar') renderCalendar();
  if (page === 'settings') initSettingsPage();
  if (page === 'profile') renderProfilePage();
  if (page === 'friends') renderFriendsPage();
  if (page === 'groups')  renderGroupsPage();
  if (page === 'ai')      renderAIPage();
  if (page === 'admin')   renderAdminPage();
  if (page === 'familia') renderFamiliaPage();
  if (authUserId) updateNotifBell();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('active');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
}

/* ── Grupos colapsáveis da sidebar ───────────────────────── */
// Mapa: página → id do grupo
const _NAV_GROUP_MAP = {
  tasks:'escola', exams:'escola', grades:'escola', study:'escola', ai:'escola',
  missions:'hub', shop:'hub', achievements:'hub',
  friends:'conexoes', groups:'conexoes', familia:'conexoes',
  subjects:'organizacao', stats:'organizacao', calendar:'organizacao',
};

function toggleNavGroup(groupId) {
  const el = document.getElementById('navgroup-' + groupId);
  if (!el) return;
  const isOpen = el.classList.contains('open');
  // Fecha todos os outros grupos
  document.querySelectorAll('.nav-group.open').forEach(g => {
    if (g !== el) g.classList.remove('open');
  });
  el.classList.toggle('open', !isOpen);
  // Persiste estado dos grupos
  try {
    const opened = [...document.querySelectorAll('.nav-group.open')].map(g => g.id.replace('navgroup-',''));
    localStorage.setItem('sq_nav_groups', JSON.stringify(opened));
  } catch(e) {}
}

function _openNavGroupForPage(page) {
  const groupId = _NAV_GROUP_MAP[page];
  if (!groupId) return;
  const el = document.getElementById('navgroup-' + groupId);
  if (el && !el.classList.contains('open')) {
    document.querySelectorAll('.nav-group.open').forEach(g => g.classList.remove('open'));
    el.classList.add('open');
  }
}

function _restoreNavGroups() {
  try {
    const saved = JSON.parse(localStorage.getItem('sq_nav_groups') || '[]');
    saved.forEach(id => {
      const el = document.getElementById('navgroup-' + id);
      if (el) el.classList.add('open');
    });
  } catch(e) {}
}

// ============================================================
// MODAIS
// ============================================================

function initModals() {
  // Fechar modais
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Emoji picker matéria
  document.querySelectorAll('#subject-emoji-grid .emoji-opt').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#subject-emoji-grid .emoji-opt').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    });
  });

  // Dificuldade tarefa
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Grade slider (for the grade modal)
  const slider = document.getElementById('grade-slider');
  const gradeDisplay = document.getElementById('grade-display');
  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    gradeDisplay.textContent = val.toFixed(1);
    updateGradeClassificationDisplay(val);
  });

  // Salvar matéria
  document.getElementById('save-subject-btn').addEventListener('click', saveSubject);

  // Salvar tarefa
  document.getElementById('save-task-btn').addEventListener('click', saveTask);

  // Salvar prova (agendamento)
  document.getElementById('save-exam-btn').addEventListener('click', saveExam);

  // Confirmar nota de prova
  document.getElementById('confirm-exam-grade-btn').addEventListener('click', confirmExamGrade);

  // Meta diária
  document.getElementById('save-goal-btn').addEventListener('click', () => {
    const val = parseInt(document.getElementById('goal-input').value);
    if (val >= 10) {
      state.dailyGoal = val;
      saveState();
      closeModal('modal-goal');
      updateDashboard();
      showNotification(`Meta definida: ${val} XP por dia! 🎯`, 'success');
    } else {
      showNotification('Meta mínima: 10 XP', 'warning');
    }
  });
}

function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// ============================================================
// MATÉRIAS
// ============================================================

function saveSubject() {
  const name = document.getElementById('subject-name-input').value.trim();
  if (!name) return showNotification('Digite o nome da matéria!', 'warning');
  const emoji = document.querySelector('#subject-emoji-grid .emoji-opt.selected')?.dataset.e || '📖';

  const subject = {
    id: Date.now().toString(),
    name,
    emoji,
    xp: 0,
    level: 1,
    tasksCount: 0,
    avgGrade: null,
    grades: [],
    createdAt: Date.now(),
  };

  state.subjects.push(subject);
  saveState();
  closeModal('modal-subject');
  document.getElementById('subject-name-input').value = '';
  renderSubjects();
  checkAchievements();
  showNotification(`Matéria "${name}" criada! 📚`, 'success');
}

function renderSubjects() {
  const container = document.getElementById('subjects-list');
  if (!state.subjects.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">📚</span><p>Nenhuma matéria ainda. Crie uma para começar!</p></div>`;
    return;
  }

  container.innerHTML = state.subjects.map(s => {
    const xpNeeded = xpForLevel(s.level);
    const pct = Math.min(100, Math.round((s.xp % xpNeeded) / xpNeeded * 100));
    const avgStr = s.grades.length ? (s.grades.reduce((a,b)=>a+b,0)/s.grades.length).toFixed(1) : '—';
    return `
    <div class="subject-card">
      <button class="delete-btn" onclick="deleteSubject('${s.id}')">✕</button>
      <div class="subject-header">
        <span class="subject-icon">${s.emoji}</span>
        <div>
          <div class="subject-name">${s.name}</div>
          <span class="subject-level">Nível ${s.level}</span>
        </div>
      </div>
      <div class="subject-xp-bar">
        <div class="subject-xp-fill" style="width:${pct}%"></div>
      </div>
      <div class="subject-stats">
        <span>⚡ ${s.xp} XP</span>
        <span>📝 ${s.grades.length} provas</span>
        <span>📊 Média: ${avgStr}</span>
      </div>
    </div>`;
  }).join('');
}

function deleteSubject(id) {
  state.subjects = state.subjects.filter(s => s.id !== id);
  saveState();
  renderSubjects();
}

// ============================================================
// TAREFAS
// ============================================================

function saveTask() {
  const name = document.getElementById('task-name-input').value.trim();
  const subjectId = document.getElementById('task-subject-select').value;
  const difficulty = document.querySelector('.diff-btn.active')?.dataset.diff || 'easy';
  const dueDate = document.getElementById('task-due-date').value || null;

  if (!name) return showNotification('Digite o nome da tarefa!', 'warning');

  const task = {
    id: Date.now().toString(),
    name,
    subjectId,
    difficulty,
    done: false,
    createdAt: Date.now(),
    doneAt: null,
    dueDate,   // NEW: 'YYYY-MM-DD' ou null
  };

  state.tasks.push(task);
  _recordTaskCreation(task.id); // para fraud detection
  saveState();
  closeModal('modal-task');
  document.getElementById('task-name-input').value = '';
  document.getElementById('task-due-date').value = '';
  renderTasks();
  generateDynamicMissions();
  showNotification(`Tarefa "${name}" criada! ✅`, 'info');
}

// ============================================================
// TASK STATUS HELPERS
// ============================================================

function getTaskStatus(task) {
  if (task.done) return 'done';
  if (!task.dueDate) return 'pending';
  if (task.dueDate < todayStr()) return 'overdue';
  if (task.dueDate === todayStr()) return 'today';
  return 'future';
}

function toggleFocusMode() {
  focusMode = !focusMode;
  const btn = document.getElementById('focus-mode-btn');
  btn.textContent = focusMode ? '🔓 Sair do Foco' : '🎯 Modo Foco';
  btn.className = focusMode ? 'btn-primary' : 'btn-secondary';
  renderTasks();
}

// Auto-arquivar tarefas concluídas com data vencida
function autoArchiveTasks() {
  if (!state.taskHistory) state.taskHistory = [];
  const today = todayStr();
  const toArchive = state.tasks.filter(t => t.done && t.dueDate && t.dueDate < today);
  if (toArchive.length) {
    toArchive.forEach(t => {
      if (!state.taskHistory.find(h => h.id === t.id)) {
        state.taskHistory.push({...t});
      }
    });
    state.tasks = state.tasks.filter(t => !(t.done && t.dueDate && t.dueDate < today));
    saveState();
  }
}

/* ── CRONOGRAMA SEMANAL ──────────────────────────────────────────────────── */

function renderScheduleEditor() {
  const el = document.getElementById('schedule-editor');
  if (!el) return;
  const schedule = state.schedule || {};
  const today = new Date().getDay();

  el.innerHTML = `
    <div class="page-header" style="margin-top:1.5rem">
      <h2 style="font-size:1.1rem;margin:0">📚 Meu Cronograma Semanal</h2>
      <p class="page-subtitle" style="margin:0">Defina as matérias de cada dia para gerar tarefas diárias automaticamente</p>
    </div>
    <div class="schedule-grid">
      ${WEEKDAY_NAMES.map((name, day) => {
        const subjects = schedule[day] || [];
        const isToday = day === today;
        return `
        <div class="schedule-day-card ${isToday ? 'schedule-day-today' : ''}">
          <div class="schedule-day-header">
            <span class="schedule-day-name">${WEEKDAY_SHORT[day]}${isToday ? ' <span class="schedule-today-badge">Hoje</span>' : ''}</span>
            <button class="btn-sm btn-ghost schedule-add-btn" onclick="promptAddSubject(${day})">+</button>
          </div>
          <div class="schedule-subjects" id="sched-day-${day}">
            ${subjects.length
              ? subjects.map((s, i) => `
                <div class="schedule-tag">
                  <span>${escHtml(s)}</span>
                  <button onclick="removeScheduleSubject(${day},${i})" title="Remover">×</button>
                </div>`).join('')
              : '<span class="schedule-empty">Nenhuma</span>'}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function promptAddSubject(day) {
  const name = prompt(`Adicionar matéria para ${WEEKDAY_NAMES[day]}:`);
  if (!name || !name.trim()) return;
  addScheduleSubject(day, name.trim());
}

function addScheduleSubject(day, subject) {
  if (!state.schedule) state.schedule = {};
  if (!state.schedule[day]) state.schedule[day] = [];
  if (state.schedule[day].some(s => s.toLowerCase() === subject.toLowerCase())) {
    showNotification('Essa matéria já está no cronograma!', 'warning'); return;
  }
  state.schedule[day].push(subject);
  saveState(); scheduleSyncToSupabase();
  renderScheduleEditor();
  showNotification(`📚 ${subject} adicionada ao ${WEEKDAY_NAMES[day]}!`, 'success');
}

function removeScheduleSubject(day, idx) {
  if (!state.schedule?.[day]) return;
  state.schedule[day].splice(idx, 1);
  saveState(); scheduleSyncToSupabase();
  renderScheduleEditor();
}

/* ── GERAÇÃO DE TAREFAS DIÁRIAS ─────────────────────────────────────────── */

function generateDailyTasks() {
  const today = todayStr();
  if (state.dailyTasksDate === today && (state.dailyTasks || []).length) return; // já gerou hoje

  const weekday  = new Date().getDay();
  const subjects = (state.schedule || {})[weekday] || [];
  if (!subjects.length) { state.dailyTasksDate = today; saveState(); return; }

  // Offset diário: soma year+month+day para rotacionar o tipo de tarefa
  // Ex: 2026+5+25=2056 → 2056%3=1 (revisao), na semana seguinte 2056+7=2063 → 2063%3=2 (feynman)
  const [y, mo, d] = today.split('-').map(Number);
  const typeOffset = (y + mo + d) % DAILY_TASK_TYPES.length;

  // Gera 1 tarefa por matéria (máximo 3), rotacionando o tipo baseado na data
  const tasks = subjects.slice(0, 3).map((subject, i) => {
    const type = DAILY_TASK_TYPES[(i + typeOffset) % DAILY_TASK_TYPES.length];
    return {
      id:          'dt_' + Date.now() + '_' + i,
      type:        type.id,
      icon:        type.icon,
      label:       type.label,
      subject,
      title:       `${type.label} — ${subject}`,
      description: type.mkDesc(subject),
      done:        false,
      doneAt:      null,
      createdDate: today,
    };
  });

  state.dailyTasks    = tasks;
  state.dailyTasksDate = today;
  saveState();
}

function renderDailyTasksSection() {
  const el = document.getElementById('daily-tasks-section');
  if (!el) return;

  generateDailyTasks();
  const tasks = state.dailyTasks || [];
  if (!tasks.length) { el.innerHTML = ''; return; }

  const today = todayStr();
  if (state.dailyTasksDate !== today) { el.innerHTML = ''; return; }

  const done  = tasks.filter(t => t.done).length;
  const total = tasks.length;

  el.innerHTML = `
    <div class="daily-tasks-section">
      <div class="daily-tasks-header">
        <div>
          <span class="daily-tasks-title">⚡ Tarefas do Dia</span>
          <span class="daily-tasks-progress">${done}/${total} concluídas</span>
        </div>
        <div class="daily-tasks-bar-wrap">
          <div class="daily-tasks-bar" style="width:${total ? Math.round(done/total*100) : 0}%"></div>
        </div>
      </div>
      <div class="daily-tasks-list">
        ${tasks.map(t => `
          <div class="daily-task-card ${t.done ? 'daily-task-done' : ''}" onclick="toggleDailyTask('${t.id}')">
            <div class="daily-task-icon">${t.icon}</div>
            <div class="daily-task-info">
              <div class="daily-task-title">${escHtml(t.title)}</div>
              <div class="daily-task-desc">${escHtml(t.description)}</div>
            </div>
            <div class="daily-task-check">${t.done ? '✅' : '⬜'}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function toggleDailyTask(id) {
  const task = (state.dailyTasks || []).find(t => t.id === id);
  if (!task || task.done) return;
  task.done   = true;
  task.doneAt = Date.now();

  // Recompensa modesta (tarefas diárias são simples)
  addXp(20, `${task.icon} ${task.label} concluído!`);
  addCoins(8);

  // Conta como dia de estudo → mantém streak e missões semanais
  markStudyToday();

  // Registra no ranking dos grupos com source específico da tarefa
  const taskSource = `task_${task.type || 'general'}`;
  logGroupXP(20, taskSource).catch(() => {});

  saveState();
  generateDynamicMissions();
  renderDailyTasksSection();
  showNotification(`${task.icon} ${task.label} concluído! +20 XP`, 'success');
}

function renderTaskItem(t, inHistory) {
  inHistory = inHistory || false;
  const subj     = state.subjects.find(s => s.id === t.subjectId);
  const xpReward = XP_REWARDS[t.difficulty];
  const diffLabels = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' };
  const status   = getTaskStatus(t);

  let dueDateTag = '';
  if (t.dueDate) {
    if (t.done) {
      const doneDate = t.doneAt ? new Date(t.doneAt).toISOString().slice(0,10) : todayStr();
      dueDateTag = doneDate < t.dueDate
        ? '<span class="task-due-date due-done-early">✨ Antecipada</span>'
        : '<span class="task-due-date due-done-early">✅ ' + t.dueDate + '</span>';
    } else if (status === 'overdue') {
      dueDateTag = '<span class="task-due-date due-overdue">⚠️ Atrasada (' + t.dueDate + ')</span>';
    } else if (status === 'today') {
      dueDateTag = '<span class="task-due-date due-today">🔔 Vence hoje</span>';
    } else {
      dueDateTag = '<span class="task-due-date due-future">📅 ' + t.dueDate + '</span>';
    }
  }

  if (inHistory) {
    const doneDate = t.doneAt ? new Date(t.doneAt).toLocaleDateString('pt-BR') : '—';
    return '<div class="history-item">' +
      '<span style="font-size:1.2rem">✅</span>' +
      '<div class="task-info" style="flex:1">' +
      '<div class="task-name">' + t.name + '</div>' +
      '<div class="task-meta">' + (subj ? subj.emoji + ' ' + subj.name + ' · ' : '') + 'Concluída em ' + doneDate + '</div>' +
      '</div>' + dueDateTag +
      '<span class="history-badge">+' + xpReward + ' XP</span>' +
      '</div>';
  }

  return '<div class="task-item' + (t.done ? ' done' : '') + (status === 'overdue' ? ' task-overdue' : '') + '" data-task-id="' + t.id + '">' +
    '<div class="task-check" data-action="toggle-task" data-id="' + t.id + '">' + (t.done ? '✅' : '') + '</div>' +
    '<div class="task-info">' +
    '<div class="task-name">' + t.name + ' ' + dueDateTag + '</div>' +
    '<div class="task-meta">' + (subj ? subj.emoji + ' ' + subj.name + ' · ' : '') + (t.done ? 'Concluída · ' : '') + '⚡ +' + xpReward + ' XP</div>' +
    '</div>' +
    '<span class="task-badge badge-' + t.difficulty + (status === 'overdue' ? ' badge-overdue' : '') + '">' + diffLabels[t.difficulty] + '</span>' +
    '<div class="item-actions">' +
    '<button class="btn-icon-edit"   data-action="edit-task"   data-id="' + t.id + '" title="Editar">✏️</button>' +
    '<button class="btn-icon-delete" data-action="delete-task" data-id="' + t.id + '" title="Excluir">🗑️</button>' +
    '</div>' +
    '</div>';
}
function renderTasks() {
  applySortSelect('tasks');
  const sectionsEl = document.getElementById('tasks-sections');
  const listEl = document.getElementById('tasks-list');
  renderDailyTasksSection();
  // Carrega tarefas dos responsáveis (assíncrono, não bloqueia)
  if (authUserId) loadParentalTasksSection().catch(()=>{});
  sectionsEl.innerHTML = '';
  listEl.innerHTML = '';

  if (focusMode) {
    sectionsEl.innerHTML = '<div class="focus-mode-banner">🎯 Modo Foco Ativo — Mostrando apenas tarefas urgentes <button class="btn-small" onclick="toggleFocusMode()">Desativar</button></div>';
  }

  if (currentFilter === 'history') {
    const hist = (state.taskHistory || []).slice().sort(function(a,b){ return (b.doneAt||0)-(a.doneAt||0); });
    if (!hist.length) {
      listEl.innerHTML = '<div class="empty-state"><span class="empty-icon">📜</span><p>Nenhuma tarefa no histórico ainda.</p></div>';
    } else {
      listEl.innerHTML = hist.map(function(t){ return renderTaskItem(t, true); }).join('');
    }
    return;
  }

  const today = todayStr();
  let tasks = state.tasks.filter(function(t) {
    if (currentFilter === 'pending') return !t.done;
    if (currentFilter === 'done') return t.done;
    if (currentFilter === 'overdue') return !t.done && t.dueDate && t.dueDate < today;
    if (currentFilter === 'today') return !t.done && t.dueDate === today;
    return true;
  });

  if (focusMode) {
    tasks = tasks.filter(function(t) {
      var s = getTaskStatus(t);
      return s === 'overdue' || s === 'today';
    });
  }

  // Sort options that cross sections → flat sorted list
  var flatSorts = ['created-desc','created-asc','diff-asc','diff-desc','status-pending','status-overdue'];
  var useFlatList = flatSorts.indexOf(sortPrefs['tasks']) !== -1;

  if (currentFilter === 'all' && !useFlatList) {
    // Section view — apply sort within each section
    var overdue  = sortArray(tasks.filter(function(t){ return getTaskStatus(t) === 'overdue';  }), sortPrefs['tasks']);
    var todayT   = sortArray(tasks.filter(function(t){ return getTaskStatus(t) === 'today';    }), sortPrefs['tasks']);
    var future   = sortArray(tasks.filter(function(t){ return getTaskStatus(t) === 'future';   }), sortPrefs['tasks']);
    var pending  = sortArray(tasks.filter(function(t){ return getTaskStatus(t) === 'pending';  }), sortPrefs['tasks']);
    var done     = sortArray(tasks.filter(function(t){ return t.done; }), 'created-desc');

    var html = '';
    if (overdue.length) {
      html += '<div class="task-section-header overdue-header">⚠️ Atrasadas <span class="task-section-badge">' + overdue.length + '</span></div>';
      html += '<div class="tasks-list">' + overdue.map(function(t){ return renderTaskItem(t); }).join('') + '</div>';
    }
    if (todayT.length) {
      html += '<div class="task-section-header today-header">🔔 Vencem Hoje <span class="task-section-badge">' + todayT.length + '</span></div>';
      html += '<div class="tasks-list">' + todayT.map(function(t){ return renderTaskItem(t); }).join('') + '</div>';
    }
    if (future.length) {
      html += '<div class="task-section-header future-header">📅 Próximas <span class="task-section-badge">' + future.length + '</span></div>';
      html += '<div class="tasks-list">' + future.map(function(t){ return renderTaskItem(t); }).join('') + '</div>';
    }
    if (pending.length) {
      html += '<div class="task-section-header">📋 Pendentes <span class="task-section-badge">' + pending.length + '</span></div>';
      html += '<div class="tasks-list">' + pending.map(function(t){ return renderTaskItem(t); }).join('') + '</div>';
    }
    if (done.length) {
      html += '<div class="task-section-header done-header">✅ Concluídas <span class="task-section-badge">' + done.length + '</span></div>';
      html += '<div class="tasks-list">' + done.map(function(t){ return renderTaskItem(t); }).join('') + '</div>';
    }
    if (!html) html = '<div class="empty-state"><span class="empty-icon">✅</span><p>Nenhuma tarefa ainda. Crie sua primeira tarefa!</p></div>';
    sectionsEl.innerHTML += html;

  } else {
    // Flat sorted list
    if (!tasks.length) {
      listEl.innerHTML = '<div class="empty-state"><span class="empty-icon">✅</span><p>Nenhuma tarefa aqui.</p></div>';
    } else {
      tasks = sortArray(tasks, sortPrefs['tasks']);
      listEl.innerHTML = tasks.map(function(t){ return renderTaskItem(t); }).join('');
    }
  }
}

function toggleTask(id) {
  id = String(id);
  const task = state.tasks.find(t => t.id === id);
  if (!task || task.done) return;

  task.done = true;
  task.doneAt = Date.now();
  state.totalTasksDone++;

  // Fraud detection: verifica se a tarefa foi concluída muito rápido
  _checkTaskFraud(id);

  let xpGain = XP_REWARDS[task.difficulty];
  let coinGain = COIN_REWARDS[task.difficulty];

  // Bônus por antecipação
  if (task.dueDate) {
    const today = todayStr();
    if (today < task.dueDate) {
      const daysEarly = Math.ceil((new Date(task.dueDate) - new Date(today)) / 86400000);
      const bonus = Math.min(daysEarly * 3, 15);
      xpGain += bonus;
      coinGain += Math.floor(bonus / 2);
      showNotification('✨ Antecipou em ' + daysEarly + ' dia(s)! +' + bonus + ' XP bônus!', 'success');
    } else if (today > task.dueDate) {
      // Penalidade por atraso
      xpGain = Math.max(2, Math.floor(xpGain * 0.5));
      coinGain = Math.max(1, Math.floor(coinGain * 0.5));
      showNotification('⚠️ Tarefa atrasada! Recompensa reduzida.', 'warning');
    }
  }

  const xpBoost = consumeBoost('xp_boost');
  const coinBoost = consumeBoost('coin_boost');
  if (xpBoost) xpGain *= 2;
  if (coinBoost) coinGain *= 2;

  markStudyToday();

  if (task.subjectId) {
    const subj = state.subjects.find(s => s.id === task.subjectId);
    if (subj) {
      subj.xp += xpGain;
      subj.tasksCount = (subj.tasksCount || 0) + 1;
      levelUpSubject(subj);
    }
  }

  addXp(xpGain, task.difficulty === 'hard' ? '🔥 Tarefa difícil!' : null);
  addCoins(coinGain);

  updateMissionProgress('tasksToday', 1);
  updateMissionProgress('xpToday', xpGain);
  if (task.difficulty === 'hard') updateMissionProgress('hardTasksToday', 1);
  if (task.subjectId) updateSubjectsStudiedToday(task.subjectId);
  updateWeeklyMissionProgress('tasksThisWeek', 1);

  // Auto-arquivar se data já passou
  autoArchiveTasks();
  generateDynamicMissions();

  saveState();
  renderTasks();
  updateDashboard();
  checkAchievements();

  showXpPopup(xpGain, xpBoost);
  playSound('complete');

  // 🔔 Notifica responsáveis
  familyNotifyTaskDone(task.title);
}

function deleteTask(id) {
  id = String(id);
  state.tasks = state.tasks.filter(t => t.id !== id);
  // também remove do histórico se estiver lá
  if (state.taskHistory) state.taskHistory = state.taskHistory.filter(t => t.id !== id);
  saveState();
  renderTasks();
}

// ============================================================
// PROVAS — Sistema com pendente/concluída e média 7
// ============================================================

// Salva a prova como PENDENTE (sem nota ainda)
function saveExam() {
  const name = document.getElementById('exam-name-input').value.trim();
  const subjectId = document.getElementById('exam-subject-select').value;
  const examDate = document.getElementById('exam-date-input').value || todayStr();

  if (!name) return showNotification('Digite o nome da prova!', 'warning');

  const exam = {
    id: Date.now().toString(),
    name,
    subjectId,
    examDate,
    grade: null,
    status: 'pending',   // 'pending' | 'done'
    xpGain: 0,
    coinGain: 0,
    gradeClass: '',
    gradeLabel: '',
    date: todayStr(),
    timestamp: Date.now(),
  };

  state.exams.push(exam);
  saveState();
  closeModal('modal-exam');
  document.getElementById('exam-name-input').value = '';
  renderExams();
  generateDynamicMissions();
  updateDashboard();
  checkAchievements();
  showNotification('📝 Prova agendada para ' + examDate + '!', 'info');
}

// Abre modal para lançar nota de uma prova pendente
function openExamGrade(examId) {
  pendingExamId = String(examId);
  const exam = state.exams.find(e => e.id === pendingExamId);
  if (!exam) return;
  document.getElementById('exam-grade-title').textContent = '"' + exam.name + '" — ' + (exam.examDate || exam.date);
  const slider = document.getElementById('grade-slider');
  slider.value = 7;
  document.getElementById('grade-display').textContent = '7.0';
  updateGradeClassificationDisplay(7);
  openModal('modal-exam-grade');
}

function updateGradeClassificationDisplay(val) {
  const el = document.getElementById('grade-classification');
  if (!el) return;
  const avg = getSchoolAverage();
  if (val >= Math.min(9, avg + 2)) {
    el.className = 'grade-classification gc-excellent';
    el.textContent = '🌟 Excelente! Nota acima da média!';
  } else if (val >= avg) {
    el.className = 'grade-classification gc-approved';
    el.textContent = '✅ Aprovado! Você passou na média ' + avg + '.';
  } else if (val >= avg - 2) {
    el.className = 'grade-classification gc-recovery';
    el.textContent = '⚠️ Recuperação — abaixo da média ' + avg + '.';
  } else {
    el.className = 'grade-classification gc-fail';
    el.textContent = '❌ Resultado crítico. Revise urgente!';
  }
}

// Confirma a nota e calcula recompensas
function confirmExamGrade() {
  if (!pendingExamId) return;
  const grade = parseFloat(document.getElementById('grade-slider').value);
  const exam = state.exams.find(e => e.id === pendingExamId);
  if (!exam) return;

  const examBoost = hasBoost('exam_boost');
  let xpGain, coinGain, gradeClass, gradeLabel;

  const avg = getSchoolAverage();
  if (grade >= Math.min(9, avg + 2)) {
    xpGain = examBoost ? 120 : 60;
    coinGain = examBoost ? 50 : 25;
    gradeClass = grade === 10 ? 'grade-10' : 'grade-high';
    gradeLabel = 'Excelente';
    showNotification('🌟 Nota ' + grade + '! Desempenho excelente! +' + xpGain + ' XP', 'success');
  } else if (grade >= avg) {
    xpGain = examBoost ? 80 : 40;
    coinGain = examBoost ? 30 : 15;
    gradeClass = 'grade-high';
    gradeLabel = 'Aprovado';
    showNotification('✅ Nota ' + grade + '! Aprovado na média ' + avg + '! +' + xpGain + ' XP', 'success');
  } else if (grade >= avg - 2) {
    xpGain = examBoost ? 30 : 15;
    coinGain = examBoost ? 15 : 7;
    gradeClass = 'grade-mid';
    gradeLabel = 'Recuperação';
    showNotification('⚠️ Nota ' + grade + ' — Recuperação (média: ' + avg + '). Revise ' + (exam.subjectId ? 'a matéria' : 'o conteúdo') + '!', 'warning');
    triggerRevisionMission(exam);
  } else {
    xpGain = examBoost ? 15 : 8;
    coinGain = 3;
    gradeClass = 'grade-low';
    gradeLabel = 'Resultado Crítico';
    showNotification('❌ Nota ' + grade + ' — Muito abaixo da média ' + avg + '. Não desista!', 'error');
    triggerRevisionMission(exam);
  }

  if (examBoost) consumeBoost('exam_boost');

  exam.grade = grade;
  exam.status = 'done';
  exam.xpGain = xpGain;
  exam.coinGain = coinGain;
  exam.gradeClass = gradeClass;
  exam.gradeLabel = gradeLabel;
  exam.completedAt = Date.now();

  state.maxGradeEver = Math.max(state.maxGradeEver, grade);
  if (grade > state.records.topGrade) state.records.topGrade = grade;

  if (exam.subjectId) {
    const subj = state.subjects.find(s => s.id === exam.subjectId);
    if (subj) {
      subj.grades.push(grade);
      subj.xp += xpGain;
      subj.avgGrade = subj.grades.reduce((a,b)=>a+b,0) / subj.grades.length;
      levelUpSubject(subj);
    }
  }

  markStudyToday();
  addXp(xpGain);
  addCoins(coinGain);

  updateMissionProgress('examsToday', 1);
  updateMissionProgress('xpToday', xpGain);
  updateWeeklyMissionProgress('examsThisWeek', 1);

  // Bônus de streak por nota ≥ média
  if (grade >= getSchoolAverage()) {
    const streakBonus = Math.min(state.streak * 2, 20);
    if (streakBonus > 0) {
      addXp(streakBonus);
      showNotification('🔥 Bônus de streak: +' + streakBonus + ' XP!', 'success');
    }
  }

  pendingExamId = null;
  saveState();
  closeModal('modal-exam-grade');
  renderExams();
  updateDashboard();
  checkAchievements();
  showXpPopup(xpGain);
  playSound('complete');
}

function triggerRevisionMission(_exam) {
  // Missões de revisão foram removidas — a notificação de nota baixa já informa o aluno.
}

function renderExams() {
  const container = document.getElementById('exams-list');
  if (!state.exams.length) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">📝</span><p>Nenhuma prova agendada ainda. Clique em "+ Agendar Prova"!</p></div>';
    return;
  }

  applySortSelect('exams');
  const allSorted = sortArray(state.exams, sortPrefs['exams']);
  const pending = allSorted.filter(e => e.status === 'pending');
  const done    = allSorted.filter(e => e.status === 'done');

  let html = '';

  if (pending.length) {
    html += '<div class="task-section-header today-header" style="margin-bottom:0.75rem">⏳ Aguardando Nota <span class="task-section-badge">' + pending.length + '</span></div>';
    html += pending.map(e => renderExamItem(e)).join('');
  }
  if (done.length) {
    html += '<div class="task-section-header done-header" style="margin:1rem 0 0.75rem">✅ Concluídas <span class="task-section-badge">' + done.length + '</span></div>';
    html += done.map(e => renderExamItem(e)).join('');
  }

  container.innerHTML = html;
}

function renderExamItem(e) {
  const subj = state.subjects.find(s => s.id === e.subjectId);
  const isPending = e.status === 'pending';
  const today = todayStr();
  const isPast = e.examDate && e.examDate < today;

  let dateTag = '';
  if (e.examDate) {
    const pastClass = isPast && isPending ? 'past' : '';
    dateTag = '<span class="exam-date-tag ' + pastClass + '">' + (isPast && isPending ? '⚠️ ' : '📅 ') + e.examDate + '</span>';
  }

  if (isPending) {
    return '<div class="exam-item exam-pending" data-exam-id="' + e.id + '">' +
      '<div class="exam-grade-circle grade-mid" style="font-size:1.1rem">?</div>' +
      '<div class="exam-info">' +
      '<div class="exam-name">' + e.name + ' ' + dateTag + '</div>' +
      '<div class="exam-meta">' + (subj ? subj.emoji + ' ' + subj.name + ' · ' : '') + 'Aguardando nota</div>' +
      '</div>' +
      '<span class="exam-status-badge status-pending">Pendente</span>' +
      '<div class="item-actions">' +
      '<button class="complete-exam-btn" data-action="grade-exam" data-id="' + e.id + '">🎯 Lançar Nota</button>' +
      '<button class="btn-icon-edit"    data-action="edit-exam"  data-id="' + e.id + '" title="Editar">✏️</button>' +
      '<button class="btn-icon-delete"  data-action="del-exam"   data-id="' + e.id + '" title="Excluir">🗑️</button>' +
      '</div>' +
      '</div>';
  }

  const statusBadgeClass = { 'Excelente': 'status-excellent', 'Aprovado': 'status-approved', 'Recuperação': 'status-recovery', 'Resultado Crítico': 'status-fail' };
  const badgeClass = statusBadgeClass[e.gradeLabel] || 'status-approved';

  return '<div class="exam-item exam-done" data-exam-id="' + e.id + '">' +
    '<div class="exam-grade-circle ' + e.gradeClass + '">' + e.grade + '</div>' +
    '<div class="exam-info">' +
    '<div class="exam-name">' + e.name + ' ' + dateTag + '</div>' +
    '<div class="exam-meta">' + (subj ? subj.emoji + ' ' + subj.name + ' · ' : '') + (e.date || '') + '</div>' +
    '</div>' +
    '<span class="exam-status-badge ' + badgeClass + '">' + (e.gradeLabel || '') + '</span>' +
    '<span class="exam-xp">+' + e.xpGain + ' XP</span>' +
    '<div class="item-actions">' +
    '<button class="btn-icon-edit"   data-action="edit-exam" data-id="' + e.id + '" title="Editar">✏️</button>' +
    '<button class="btn-icon-delete" data-action="del-exam"  data-id="' + e.id + '" title="Excluir">🗑️</button>' +
    '</div>' +
    '</div>';
}

function deleteExam(id) {
  id = String(id);
  state.exams = state.exams.filter(e => e.id !== id);
  saveState();
  renderExams();
}

// ============================================================
// XP & LEVEL SYSTEM
// ============================================================

function addXp(amount, bonusMsg = null) {
  if (state.penaltyType === 'limit') amount = Math.max(1, Math.floor(amount * 0.5));
  state.xp += amount;
  state.totalXpEarned += amount;
  state.dailyXp += amount;

  // Histórico de XP
  const today = todayStr();
  state.xpHistory[today] = (state.xpHistory[today] || 0) + amount;

  // Recorde diário
  if (state.dailyXp > state.records.maxDailyXp) {
    state.records.maxDailyXp = state.dailyXp;
  }

  // Verificar level up
  while (true) {
    const needed = xpForLevel(state.level);
    if (state.xp >= needed) {
      state.xp -= needed;
      state.level++;
      showLevelUp(state.level);
      break;
    }
    break;
  }

  updateDashboard();
  checkMissionGoals();
  scheduleSyncToSupabase(); // → Supabase: XP + level em 3s (debounced)

  // Registra no ranking dos grupos (fire-and-forget, não bloqueia UI)
  logGroupXP(amount, 'general').catch(() => {});
}

function addCoins(amount) {
  if (state.penaltyType === 'limit') amount = Math.max(1, Math.floor(amount * 0.5));
  state.coins += amount;
  updateDashboard();
}

// ── IACoin ────────────────────────────────────────────────────
function addIACoins(amount) {
  state.iacoins = (state.iacoins || 0) + amount;
  _updateIACoinDisplay();
  scheduleSyncToSupabase();
}

function spendIACoins(amount) {
  if ((state.iacoins || 0) < amount) return false;
  state.iacoins -= amount;
  _updateIACoinDisplay();
  scheduleSyncToSupabase();
  return true;
}

function convertCoinsToIACoins() {
  if (state.coins < 100) {
    showNotification('Você precisa de pelo menos 100 💰 para converter.', 'warning');
    return;
  }
  state.coins -= 100;
  addIACoins(10);
  showNotification('✅ Convertido: 100 💰 → 10 🧠 IACoin!', 'success');
  saveState();
}

function _updateIACoinDisplay() {
  document.querySelectorAll('.iacoin-count').forEach(el => {
    el.textContent = state.iacoins || 0;
  });
}

function levelUpSubject(subj) {
  const needed = xpForLevel(subj.level);
  if (subj.xp >= needed) {
    subj.xp -= needed;
    subj.level++;
    showNotification(`${subj.emoji} ${subj.name} subiu para nível ${subj.level}!`, 'success');
  }
}

function showLevelUp(newLevel) {
  document.getElementById('new-level-num').textContent = newLevel;
  const perks = ['', 'Iniciante', 'Aprendiz', 'Estudante', 'Dedicado', 'Aventureiro', 'Explorador', 'Veterano', 'Expert', 'Mestre', 'Grandmestre'][Math.min(newLevel, 10)] || `Lenda nv.${newLevel}`;
  document.getElementById('level-up-perks').textContent = `Você é agora um ${perks}!`;

  createConfetti(document.getElementById('celebration-bg'), 40);
  openModal('modal-levelup');
  playSound('levelup');

  if (newLevel > state.records.maxStreak) state.records.maxStreak = state.streak;
  saveState();
}

// ============================================================
// STREAK SYSTEM
// ============================================================

function markStudyToday() {
  const today = todayStr();
  if (state.studyDays && !state.studyDays.includes(today)) {
    state.studyDays.push(today);
    updateStreak();
  }

  updateWeeklyMissionProgress('daysThisWeek', 1);
}

function updateStreak() {
  const today = todayStr();
  const yesterday = dayStr(-1);

  if (state.lastStudyDate === yesterday || state.lastStudyDate === today) {
    if (state.lastStudyDate !== today) {
      state.streak++;
      if (state.streak > state.maxStreak) {
        state.maxStreak = state.streak;
        state.records.maxStreak = state.maxStreak;
      }
      // Bônus de streak
      if (state.streak >= 7) {
        const bonus = Math.floor(state.streak * 2);
        addXp(bonus);
        showNotification(`🔥 Streak de ${state.streak} dias! +${bonus} XP bônus!`, 'success');
      }
      // 🔔 Notifica responsáveis em marcos de streak (7, 14, 30, 60...)
      const streakMilestones = [3, 7, 14, 30, 60, 100];
      if (streakMilestones.includes(state.streak)) familyNotifyStreak(state.streak);
    }
  } else if (state.lastStudyDate !== today) {
    // Streak quebrado?
    const hasShield = consumeBoost('streak_shield');
    if (!hasShield && state.lastStudyDate && state.lastStudyDate !== yesterday) {
      const oldStreak = state.streak;
      state.streak = 1;
      if (oldStreak > 0) showNotification(`💔 Streak quebrado após ${oldStreak} dias!`, 'error');
    }
  }

  state.lastStudyDate = today;
}

function checkStreakIntegrity() {
  if (!state.lastStudyDate) return;
  const today = todayStr();
  const yesterday = dayStr(-1);
  const hasShield = state.boosts.some(b => b.type === 'streak_shield');

  if (state.lastStudyDate !== today && state.lastStudyDate !== yesterday && !hasShield) {
    if (state.streak > 0) {
      showNotification(`💔 Streak perdido! Você não estudou ontem.`, 'error');
      state.streak = 0;
      saveState();
    }
  }
}

// ============================================================
// MISSÕES
// ============================================================

function initDailyMissions() {
  state.dailyMissions = {};
  DAILY_MISSIONS_DEF.forEach(m => {
    state.dailyMissions[m.id] = { progress: 0, completed: false };
  });
  if (!state.weeklyMissions) state.weeklyMissions = {};
  WEEKLY_MISSIONS_DEF.forEach(m => {
    if (!state.weeklyMissions[m.id]) state.weeklyMissions[m.id] = { progress: 0, completed: false };
  });
  if (!state.dynamicMissions) state.dynamicMissions = [];
}

function initWeeklyMissions() {
  state.weeklyMissions = {};
  WEEKLY_MISSIONS_DEF.forEach(m => {
    state.weeklyMissions[m.id] = { progress: 0, completed: false };
  });
}

function checkDailyReset() {
  const today = todayStr();

  // ── Reset diário ────────────────────────────────────────────────
  if (state.lastResetDate !== today) {
    state.dailyXp = 0;
    // Reinicia apenas missões diárias, preserva semanais e dinâmicas
    state.dailyMissions = {};
    DAILY_MISSIONS_DEF.forEach(m => {
      state.dailyMissions[m.id] = { progress: 0, completed: false };
    });
    state.lastResetDate = today;
    const yesterday = dayStr(-1);
    if (state.lastStudyDate && state.lastStudyDate !== yesterday && state.lastStudyDate !== today) {
      const hasShield = state.boosts && state.boosts.some(b => b.type === 'streak_shield');
      if (!hasShield) state.streak = 0;
    }
    saveState();
    showNotification('🌅 Novo dia! Missões diárias renovadas!', 'info');
  }

  // ── Reset semanal (segunda-feira de cada semana) ────────────────
  const currentWeekKey = _isoWeekKey();
  if (state.lastWeeklyResetKey !== currentWeekKey) {
    const isFirstEver = state.lastWeeklyResetKey === null;
    state.weeklyMissions = {};
    WEEKLY_MISSIONS_DEF.forEach(m => {
      state.weeklyMissions[m.id] = { progress: 0, completed: false };
    });
    state.lastWeeklyResetKey = currentWeekKey;
    saveState();
    if (!isFirstEver) {
      // Só notifica se for troca real de semana, não primeira inicialização
      showNotification('📅 Nova semana! Missões semanais renovadas!', 'info');
    }
  }
}

// Gera missões dinâmicas baseadas no estado atual
function generateDynamicMissions() {
  if (!state.dynamicMissions) state.dynamicMissions = [];
  const today = todayStr();

  // Remove concluídas e missões de revisão legadas
  state.dynamicMissions = state.dynamicMissions.filter(m =>
    !m.completed && m.type !== 'revision'
  );

  const pendingTasks  = state.tasks.filter(t => !t.done);
  const overdueTasks  = state.tasks.filter(t => !t.done && t.dueDate && t.dueDate < today);
  const todayTasks    = state.tasks.filter(t => !t.done && t.dueDate === today);
  const hardTasks     = pendingTasks.filter(t => t.difficulty === 'hard');
  const pendingExams  = state.exams.filter(e => e.status === 'pending');
  const pendingStudy  = (state.studyItems || []).filter(i => !i.done);
  const existingIds   = state.dynamicMissions.map(m => m.id);

  // Tarefas com prazo HOJE — prioridade máxima
  if (todayTasks.length >= 1 && !existingIds.includes('dm_dyn_today')) {
    const g = Math.min(todayTasks.length, 3);
    state.dynamicMissions.push({
      id: 'dm_dyn_today', icon: '🔔',
      name: g === 1 ? 'Entregar a tarefa que vence hoje' : `Entregar ${g} tarefas que vencem hoje`,
      goal: g, progress: 0, reward: 35, key: 'tasksToday', completed: false, type: 'auto',
    });
  }

  // Tarefas atrasadas
  if (overdueTasks.length >= 1 && !existingIds.includes('dm_dyn_overdue')) {
    state.dynamicMissions.push({
      id: 'dm_dyn_overdue', icon: '⚠️',
      name: 'Concluir 1 tarefa atrasada',
      goal: 1, progress: 0, reward: 40, key: 'tasksToday', completed: false, type: 'auto',
    });
  }

  // Tarefas pendentes — adapta o objetivo ao total disponível
  if (pendingTasks.length >= 1 && !existingIds.includes('dm_dyn_tasks')) {
    const g = Math.min(3, pendingTasks.length);
    state.dynamicMissions.push({
      id: 'dm_dyn_tasks', icon: '✅',
      name: g === 1 ? 'Concluir a tarefa pendente' : `Concluir ${g} tarefas pendentes`,
      goal: g, progress: 0, reward: 10 * g, key: 'tasksToday', completed: false, type: 'auto',
    });
  }

  // Tarefa difícil — bônus especial
  if (hardTasks.length >= 1 && !existingIds.includes('dm_dyn_hard')) {
    state.dynamicMissions.push({
      id: 'dm_dyn_hard', icon: '⚡',
      name: 'Encarar 1 tarefa difícil',
      goal: 1, progress: 0, reward: 45, key: 'hardTasksToday', completed: false, type: 'auto',
    });
  }

  // Conteúdos de estudo — adapta ao total disponível
  if (pendingStudy.length >= 1 && !existingIds.includes('dm_dyn_study')) {
    const g = Math.min(3, pendingStudy.length);
    state.dynamicMissions.push({
      id: 'dm_dyn_study', icon: '📘',
      name: g === 1 ? 'Estudar o conteúdo pendente' : `Estudar ${g} conteúdos pendentes`,
      goal: g, progress: 0, reward: 15 * g, key: 'studiedToday', completed: false, type: 'auto',
    });
  }

  // Prova com nota pendente
  if (pendingExams.length >= 1 && !existingIds.includes('dm_dyn_exam')) {
    state.dynamicMissions.push({
      id: 'dm_dyn_exam', icon: '📝',
      name: 'Lançar nota de 1 prova pendente',
      goal: 1, progress: 0, reward: 35, key: 'examsToday', completed: false, type: 'auto',
    });
  }

  // Missões de tarefas diárias
  const dailyTasks   = state.dailyTasks || [];
  const dailyDone    = dailyTasks.filter(t => t.done && t.createdDate === today).length;
  const dailyTotal   = dailyTasks.filter(t => t.createdDate === today).length;
  const hasFeynman   = dailyTasks.some(t => t.done && t.type === 'feynman' && t.createdDate === today);
  const hasRevisao   = dailyTasks.some(t => t.done && t.type === 'revisao' && t.createdDate === today);

  if (dailyTotal >= 1 && !existingIds.includes('daily_1')) {
    state.dynamicMissions.push({ id: 'daily_1', icon: '⚡', name: 'Tarefa do Dia', goal: 1, progress: Math.min(dailyDone, 1), reward: 30, key: 'dailyTasksToday', completed: dailyDone >= 1, type: 'auto' });
  }
  if (dailyTotal >= 2 && !existingIds.includes('daily_2')) {
    state.dynamicMissions.push({ id: 'daily_2', icon: '🎯', name: 'Aluno Dedicado', goal: 2, progress: Math.min(dailyDone, 2), reward: 60, key: 'dailyTasksToday', completed: dailyDone >= 2, type: 'auto' });
  }
  if (dailyTotal >= 3 && !existingIds.includes('daily_all')) {
    state.dynamicMissions.push({ id: 'daily_all', icon: '🏆', name: 'Dia Perfeito!', goal: dailyTotal, progress: Math.min(dailyDone, dailyTotal), reward: 100, key: 'dailyTasksToday', completed: dailyDone >= dailyTotal, type: 'auto' });
  }
  if (dailyTasks.some(t => t.type === 'feynman' && t.createdDate === today) && !existingIds.includes('daily_feynman')) {
    state.dynamicMissions.push({ id: 'daily_feynman', icon: '🧠', name: 'Método Feynman', goal: 1, progress: hasFeynman ? 1 : 0, reward: 50, key: 'dailyTasksToday', completed: hasFeynman, type: 'auto' });
  }
  if (dailyTasks.some(t => t.type === 'revisao' && t.createdDate === today) && !existingIds.includes('daily_revisao')) {
    state.dynamicMissions.push({ id: 'daily_revisao', icon: '⚡', name: 'Revisão Rápida', goal: 1, progress: hasRevisao ? 1 : 0, reward: 40, key: 'dailyTasksToday', completed: hasRevisao, type: 'auto' });
  }

  saveState();
}

function updateMissionProgress(key, amount) {
  // Missões fixas diárias
  DAILY_MISSIONS_DEF.forEach(m => {
    if (m.key === key && state.dailyMissions[m.id]) {
      const mission = state.dailyMissions[m.id];
      if (!mission.completed) {
        mission.progress = Math.min(m.goal, (mission.progress || 0) + amount);
        if (mission.progress >= m.goal) {
          mission.completed = true;
          addXp(m.reward);
          addCoins(Math.floor(m.reward / 2));
          showNotification('🎯 Missão concluída: ' + m.name + '! +' + m.reward + ' XP', 'success');
          playSound('achievement');
        }
      }
    }
  });
  // Missões dinâmicas
  if (state.dynamicMissions) {
    state.dynamicMissions.forEach(m => {
      if (m.key === key && !m.completed) {
        m.progress = Math.min(m.goal, (m.progress || 0) + amount);
        if (m.progress >= m.goal) {
          m.completed = true;
          addXp(m.reward);
          addCoins(Math.floor(m.reward / 2));
          showNotification('⭐ Missão dinâmica: ' + m.name + '! +' + m.reward + ' XP', 'success');
          playSound('achievement');
        }
      }
    });
  }
}

function updateSubjectsStudiedToday(subjectId) {
  if (!state._subjectsStudiedToday) state._subjectsStudiedToday = [];
  if (!Array.isArray(state._subjectsStudiedToday)) state._subjectsStudiedToday = [];
  if (!state._subjectsStudiedToday.includes(subjectId)) {
    state._subjectsStudiedToday.push(subjectId);
  }
  DAILY_MISSIONS_DEF.forEach(m => {
    if (m.key === 'subjectsToday' && state.dailyMissions[m.id]) {
      const mission = state.dailyMissions[m.id];
      if (!mission.completed) {
        mission.progress = state._subjectsStudiedToday.length;
        if (mission.progress >= m.goal) {
          mission.completed = true;
          addXp(m.reward);
          addCoins(Math.floor(m.reward / 2));
          showNotification('🎯 Missão concluída: ' + m.name + '! +' + m.reward + ' XP', 'success');
        }
      }
    }
  });
}

function updateWeeklyMissionProgress(key, amount) {
  if (!state.weeklyMissions) state.weeklyMissions = {};
  WEEKLY_MISSIONS_DEF.forEach(m => {
    if (m.key === key) {
      if (!state.weeklyMissions[m.id]) state.weeklyMissions[m.id] = { progress: 0, completed: false };
      const mission = state.weeklyMissions[m.id];
      if (!mission.completed) {
        mission.progress = Math.min(m.goal, (mission.progress || 0) + amount);
        if (mission.progress >= m.goal) {
          mission.completed = true;
          addXp(m.reward);
          addCoins(Math.floor(m.reward / 2));
          showNotification('🌟 Missão semanal: ' + m.name + '! +' + m.reward + ' XP', 'success');
        }
      }
    }
  });
}

function checkMissionGoals() {
  DAILY_MISSIONS_DEF.forEach(m => {
    if (m.key === 'xpToday' && state.dailyMissions[m.id]) {
      const mission = state.dailyMissions[m.id];
      if (!mission.completed) {
        mission.progress = Math.min(m.goal, state.dailyXp);
        if (mission.progress >= m.goal && !mission.completed) {
          mission.completed = true;
          addXp(m.reward);
          showNotification('🎯 Missão XP concluída! +' + m.reward + ' XP', 'success');
        }
      }
    }
  });
  // Dinâmicas de XP
  if (state.dynamicMissions) {
    state.dynamicMissions.forEach(m => {
      if (m.key === 'xpToday' && !m.completed) {
        m.progress = Math.min(m.goal, state.dailyXp);
        if (m.progress >= m.goal) {
          m.completed = true;
          addXp(m.reward);
          showNotification('⭐ ' + m.name + ' concluída! +' + m.reward + ' XP', 'success');
        }
      }
    });
  }
}

function renderMissions() {
  renderDailyMissions();
  renderWeeklyMissions();
}

function renderDailyMissions() {
  const container = document.getElementById('missions-list');
  if (!state.dailyMissions) return;

  let html = '';

  // Missões fixas — filtra apenas as possíveis no estado atual
  const validDaily = DAILY_MISSIONS_DEF.filter(m => !m.valid || m.valid(state));
  if (validDaily.length === 0) {
    html += '<div class="mission-empty">📋 Adicione tarefas, matérias ou conteúdos para desbloquear missões!</div>';
  }
  html += validDaily.map(m => {
    const data = state.dailyMissions[m.id] || { progress: 0, completed: false };
    const pct = Math.min(100, Math.round((data.progress / m.goal) * 100));
    return '<div class="mission-item ' + (data.completed ? 'completed' : '') + '">' +
      '<div class="mission-header">' +
      '<span class="mission-name">' + m.icon + ' ' + m.name + '</span>' +
      '<span class="mission-reward">+' + m.reward + ' XP</span>' +
      '</div>' +
      '<div class="mission-bar-track"><div class="mission-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="mission-progress-text">' + (data.completed ? '✅ Concluída!' : data.progress + ' / ' + m.goal) + '</div>' +
      '</div>';
  }).join('');

  // Missões dinâmicas ativas
  const activeDynamic = (state.dynamicMissions || []).filter(m => !m.completed);
  if (activeDynamic.length) {
    html += '<div class="task-section-header" style="margin:1rem 0 0.5rem">⭐ Missões Dinâmicas <span class="task-section-badge">' + activeDynamic.length + '</span></div>';
    html += activeDynamic.map(m => {
      const pct = Math.min(100, Math.round(((m.progress||0) / m.goal) * 100));
      return '<div class="mission-item dynamic">' +
        '<div class="mission-header">' +
        '<span class="mission-name">' + m.icon + ' ' + m.name + '</span>' +
        '<span class="mission-reward">+' + m.reward + ' XP</span>' +
        '</div>' +
        '<div class="mission-bar-track"><div class="mission-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="mission-progress-text">' + (m.progress||0) + ' / ' + m.goal + '</div>' +
        '</div>';
    }).join('');
  }

  container.innerHTML = html;
}

function renderWeeklyMissions() {
  const container = document.getElementById('weekly-missions-list');
  if (!state.weeklyMissions) return;
  const validWeekly = WEEKLY_MISSIONS_DEF.filter(m => {
    if (!m.valid) return true;
    return m.valid(state, state.weeklyMissions[m.id]?.progress);
  });
  container.innerHTML = validWeekly.map(m => {
    const data = state.weeklyMissions[m.id] || { progress: 0, completed: false };
    const pct = Math.min(100, Math.round((data.progress / m.goal) * 100));
    return '<div class="mission-item ' + (data.completed ? 'completed' : '') + '">' +
      '<div class="mission-header">' +
      '<span class="mission-name">' + m.icon + ' ' + m.name + '</span>' +
      '<span class="mission-reward">+' + m.reward + ' XP</span>' +
      '</div>' +
      '<div class="mission-bar-track"><div class="mission-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="mission-progress-text">' + (data.completed ? '✅ Concluída!' : data.progress + ' / ' + m.goal) + '</div>' +
      '</div>';
  }).join('');
}
function renderMissionsPreview() {
  const container = document.getElementById('missions-preview-list');
  if (!container) return;
  // Show up to 2 valid daily missions + first dynamic mission
  let missions = [];
  DAILY_MISSIONS_DEF.filter(m => !m.valid || m.valid(state)).slice(0, 2).forEach(m => {
    const data = state.dailyMissions && state.dailyMissions[m.id] || { progress: 0, completed: false };
    missions.push({ name: m.icon + ' ' + m.name, progress: data.progress, goal: m.goal, reward: m.reward, completed: data.completed });
  });
  const firstDyn = state.dynamicMissions && state.dynamicMissions.find(m => !m.completed);
  if (firstDyn) {
    missions.push({ name: firstDyn.icon + ' ' + firstDyn.name, progress: firstDyn.progress||0, goal: firstDyn.goal, reward: firstDyn.reward, completed: false, dynamic: true });
  }
  container.innerHTML = missions.map(m => {
    const pct = Math.min(100, Math.round(((m.progress||0) / m.goal) * 100));
    return '<div class="mission-item ' + (m.completed ? 'completed' : '') + (m.dynamic ? ' dynamic' : '') + '">' +
      '<div class="mission-header">' +
      '<span class="mission-name">' + m.name + '</span>' +
      '<span class="mission-reward">+' + m.reward + ' XP</span>' +
      '</div>' +
      '<div class="mission-bar-track"><div class="mission-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="mission-progress-text">' + (m.completed ? '✅ Concluída!' : (m.progress||0) + ' / ' + m.goal) + '</div>' +
      '</div>';
  }).join('');
}


// ============================================================
// CONQUISTAS
// ============================================================

function checkAchievements() {
  let newUnlocks = [];

  ACHIEVEMENTS_DEF.forEach(ach => {
    if (!state.achievements.includes(ach.id)) {
      if (ach.condition(state)) {
        state.achievements.push(ach.id);
        newUnlocks.push(ach);
      }
    }
  });

  if (newUnlocks.length > 0) {
    saveState();
    // Mostrar uma conquista por vez
    showAchievementModal(newUnlocks[0]);
    newUnlocks.forEach(ach => {
      addXp(25);
      addCoins(15);
      // 🔔 Notifica responsáveis
      familyNotifyAchievement(ach.name);
    });
  }

  // Loot box surpresa aleatória (5% chance por tarefa)
  if (Math.random() < 0.05) {
    triggerLootBox();
  }
}

function showAchievementModal(ach) {
  document.getElementById('ach-unlock-icon').textContent = ach.icon;
  document.getElementById('ach-unlock-name').textContent = ach.name;
  document.getElementById('ach-unlock-desc').textContent = ach.desc;
  openModal('modal-achievement');
  playSound('achievement');
}

function renderAchievements() {
  const container = document.getElementById('achievements-list');
  const count = state.achievements.length;
  document.getElementById('achievements-count').textContent = `${count} / ${ACHIEVEMENTS_DEF.length}`;

  container.innerHTML = ACHIEVEMENTS_DEF.map(ach => {
    const unlocked = state.achievements.includes(ach.id);
    return `
    <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
      <span class="achievement-icon">${ach.icon}</span>
      <div class="achievement-name">${ach.name}</div>
      <div class="achievement-desc">${unlocked ? ach.desc : '???'}</div>
    </div>`;
  }).join('');
}

// ============================================================
// LOJA
// ============================================================

function initShop() {
  renderShop();
}

function renderShop(tab = null) {
  document.getElementById('shop-coins').textContent = state.coins;

  if (!tab) {
    tab = document.querySelector('.shop-tab-btn.active')?.dataset.tab || 'items';
  }
  document.querySelectorAll('.shop-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  const itemsEl     = document.getElementById('shop-list');
  const cosmeticsEl = document.getElementById('cosmetics-shop');
  const redeemEl    = document.getElementById('shop-redeem');
  if (!itemsEl || !cosmeticsEl) return;

  itemsEl.style.display     = tab === 'items'     ? '' : 'none';
  cosmeticsEl.style.display = tab === 'cosmetics' ? '' : 'none';
  if (redeemEl) redeemEl.style.display = tab === 'redeem' ? '' : 'none';

  if (tab === 'items') {
    itemsEl.innerHTML = SHOP_ITEMS.map(item => {
      const canBuy = state.coins >= item.cost;
      return `<div class="shop-item">
        <span class="shop-icon">${item.icon}</span>
        <div class="shop-name">${item.name}</div>
        <div class="shop-desc">${item.desc}</div>
        <button class="shop-buy-btn" onclick="buyItem('${item.id}')" ${!canBuy ? 'disabled' : ''}>
          💰 ${item.cost} moedas
        </button>
      </div>`;
    }).join('');
  } else if (tab === 'cosmetics') {
    renderCosmeticsShop();
  }
  // aba redeem não precisa renderizar — HTML é estático
}

function buyItem(itemId) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item || state.coins < item.cost) return showNotification('Moedas insuficientes!', 'error');

  state.coins -= item.cost;
  state.totalPurchases++;

  if (item.type === 'lootbox') {
    triggerLootBox();
  } else if (item.type === 'study_tip') {
    showStudyTip();
  } else {
    // Adicionar boost
    state.boosts.push({
      type: item.type,
      name: item.name,
      icon: item.icon,
      charges: item.charges,
    });
    updateBoostsBar();
    showNotification(`${item.icon} ${item.name} ativado!`, 'success');
  }

  saveState();
  renderShop();
  checkAchievements();
}

function hasBoost(type) {
  return state.boosts.some(b => b.type === type && b.charges > 0);
}

function consumeBoost(type) {
  const idx = state.boosts.findIndex(b => b.type === type && b.charges > 0);
  if (idx === -1) return false;
  state.boosts[idx].charges--;
  if (state.boosts[idx].charges <= 0) state.boosts.splice(idx, 1);
  updateBoostsBar();
  return true;
}

function updateBoostsBar() {
  const bar = document.getElementById('boosts-bar');
  if (!state.boosts.length) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  bar.innerHTML = `<strong>⚡ Boosts Ativos:</strong>` +
    state.boosts.map(b => `<span class="boost-item">${b.icon} ${b.name} (${b.charges}x)</span>`).join('');
}

function triggerLootBox() {
  const rewards = [
    { text: '+30 XP Grátis!', icon: '⚡', action: () => addXp(30) },
    { text: '+20 Moedas!', icon: '💰', action: () => addCoins(20) },
    { text: 'Boost de XP Duplo!', icon: '🔮', action: () => state.boosts.push({ type: 'xp_boost', name: 'XP Duplo', icon: '🔮', charges: 2 }) },
    { text: '+50 XP Surpresa!', icon: '🌟', action: () => addXp(50) },
    { text: '+15 Moedas Mágicas!', icon: '✨', action: () => addCoins(15) },
    { text: 'Escudo de Streak!', icon: '🛡️', action: () => state.boosts.push({ type: 'streak_shield', name: 'Escudo', icon: '🛡️', charges: 1 }) },
  ];
  const reward = rewards[Math.floor(Math.random() * rewards.length)];
  reward.action();

  document.getElementById('loot-icon').textContent = reward.icon;
  document.getElementById('loot-reward').textContent = reward.text;
  document.getElementById('loot-text').textContent = 'Você recebeu uma recompensa mágica!';
  openModal('modal-lootbox');
  playSound('levelup');
  saveState();
  updateBoostsBar();
}

function showStudyTip() {
  const tips = [
    '🧠 Técnica Pomodoro: 25min foco + 5min pausa = máxima produtividade!',
    '📝 Revise o conteúdo logo após aprender — sua memória retém 90% mais!',
    '🌙 Dormir bem consolida a memória. 8 horas = mente afiada!',
    '✍️ Escrever à mão ajuda a memorizar 2x mais que digitar.',
    '🎯 Divide e conquista: quebre matérias difíceis em partes pequenas.',
    '🔄 Espaçamento: revisar após 1 dia, 3 dias, 1 semana, 1 mês.',
    '💡 Ensinar o conteúdo para alguém = maior fixação garantida!',
  ];
  const tip = tips[Math.floor(Math.random() * tips.length)];
  showNotification(tip, 'info');
}

// ============================================================
// POMODORO
// ============================================================

// ── Helpers de persistência ──────────────────────────────────
function _savePomodoroLS() {
  try {
    localStorage.setItem(_POMO_LS, JSON.stringify({
      endTime  : _pomodoroEndTime,
      isBreak  : pomodoroIsBreak,
      running  : pomodoroRunning,
    }));
  } catch (_) {}
}

function _clearPomodoroLS() {
  try { localStorage.removeItem(_POMO_LS); } catch (_) {}
}

function _restorePomodoroState() {
  try {
    const raw = localStorage.getItem(_POMO_LS);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || !saved.endTime) return;

    pomodoroIsBreak  = !!saved.isBreak;
    _pomodoroEndTime = saved.endTime;

    const remaining = Math.ceil((_pomodoroEndTime - Date.now()) / 1000);

    if (saved.running && remaining > 0) {
      // Timer estava rodando e ainda não terminou → retoma
      pomodoroSeconds = remaining;
      pomodoroRunning = true;
      document.getElementById('pomo-start').textContent = '⏸ Pausar';
      document.getElementById('pomodoro-circle').classList.add('active');
      document.getElementById('pomodoro-mode').textContent = pomodoroIsBreak ? 'PAUSA' : 'FOCO';
      pomodoroTimer = setInterval(tickPomodoro, 500);
    } else if (saved.running && remaining <= 0) {
      // Terminou enquanto estava em segundo plano → conclui a fase
      pomodoroSeconds = 0;
      _completePomodoroPhase();
    } else {
      // Estava pausado → restaura tempo restante
      pomodoroSeconds = Math.max(0, remaining);
      pomodoroRunning = false;
      document.getElementById('pomodoro-mode').textContent = pomodoroIsBreak ? 'PAUSA' : 'FOCO';
    }
  } catch (_) {}
}

// ── Conclusão de fase (foco ou pausa) ───────────────────────
function _completePomodoroPhase() {
  clearInterval(pomodoroTimer);
  pomodoroTimer   = null;
  pomodoroRunning = false;
  document.getElementById('pomo-start').textContent = '▶ Iniciar';
  document.getElementById('pomodoro-circle').classList.remove('active');

  if (!pomodoroIsBreak) {
    // Sessão de foco concluída
    state.totalPomodoros = (state.totalPomodoros || 0) + 1;
    addXp(15);
    addCoins(8);
    updateMissionProgress('pomodorosToday', 1);
    markStudyToday();
    showNotification('⏱️ Sessão de foco completa! +15 XP 🎉', 'success');
    playSound('complete');
    checkAchievements();
    // 🔔 Notifica responsáveis a cada 3 Pomodoros para não ser spam
    if (state.totalPomodoros % 3 === 0) familyNotifyPomodoro(state.totalPomodoros);

    // Passa para pausa
    pomodoroIsBreak  = true;
    pomodoroSeconds  = POMODORO_BREAK;
    _pomodoroEndTime = null;
    document.getElementById('pomodoro-mode').textContent = 'PAUSA';
  } else {
    // Pausa concluída
    pomodoroIsBreak  = false;
    pomodoroSeconds  = POMODORO_FOCUS;
    _pomodoroEndTime = null;
    document.getElementById('pomodoro-mode').textContent = 'FOCO';
    showNotification('☕ Pausa terminada! Hora de focar!', 'info');
  }

  _clearPomodoroLS();
  updatePomodoroDisplay();
  saveState();
}

// ── Funções principais ───────────────────────────────────────
function initPomodoro() {
  document.getElementById('pomo-start').addEventListener('click', togglePomodoro);
  document.getElementById('pomo-reset').addEventListener('click', resetPomodoro);

  // Restaura estado salvo (timer rodando em background ou pausado)
  _restorePomodoroState();
  updatePomodoroDisplay();

  // Quando o usuário volta para a aba, recalcula o tempo restante
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!pomodoroRunning || !_pomodoroEndTime) return;

    const remaining = Math.ceil((_pomodoroEndTime - Date.now()) / 1000);
    if (remaining <= 0) {
      pomodoroSeconds = 0;
      _completePomodoroPhase();
    } else {
      pomodoroSeconds = remaining;
      updatePomodoroDisplay();
    }
  });
}

function togglePomodoro() {
  if (pomodoroRunning) {
    // ── Pausar ──
    clearInterval(pomodoroTimer);
    pomodoroTimer    = null;
    pomodoroRunning  = false;

    // Guarda quantos segundos restavam quando pausou
    if (_pomodoroEndTime) {
      pomodoroSeconds = Math.max(0, Math.ceil((_pomodoroEndTime - Date.now()) / 1000));
    }
    _pomodoroEndTime = null;

    document.getElementById('pomo-start').textContent = '▶ Iniciar';
    document.getElementById('pomodoro-circle').classList.remove('active');
    _savePomodoroLS();          // salva estado pausado
  } else {
    // ── Iniciar / Retomar ──
    pomodoroRunning  = true;
    _pomodoroEndTime = Date.now() + pomodoroSeconds * 1000;

    document.getElementById('pomo-start').textContent = '⏸ Pausar';
    document.getElementById('pomodoro-circle').classList.add('active');

    _savePomodoroLS();          // salva antes de iniciar (proteção contra crash)
    pomodoroTimer = setInterval(tickPomodoro, 500);
  }
}

function tickPomodoro() {
  if (!_pomodoroEndTime) return;

  const remaining = Math.ceil((_pomodoroEndTime - Date.now()) / 1000);

  if (remaining <= 0) {
    pomodoroSeconds = 0;
    updatePomodoroDisplay();
    _completePomodoroPhase();
    return;
  }

  if (remaining !== pomodoroSeconds) {
    pomodoroSeconds = remaining;
    updatePomodoroDisplay();
    // Persiste a cada 5 s para não sobrecarregar o storage
    if (remaining % 5 === 0) _savePomodoroLS();
  }
}

function resetPomodoro() {
  clearInterval(pomodoroTimer);
  pomodoroTimer    = null;
  pomodoroRunning  = false;
  pomodoroIsBreak  = false;
  pomodoroSeconds  = POMODORO_FOCUS;
  _pomodoroEndTime = null;

  _clearPomodoroLS();

  document.getElementById('pomo-start').textContent = '▶ Iniciar';
  document.getElementById('pomodoro-mode').textContent = 'FOCO';
  document.getElementById('pomodoro-circle').classList.remove('active');
  updatePomodoroDisplay();
}

function updatePomodoroDisplay() {
  const s    = Math.max(0, pomodoroSeconds);
  const mins = Math.floor(s / 60).toString().padStart(2, '0');
  const secs = (s % 60).toString().padStart(2, '0');
  document.getElementById('pomodoro-time').textContent = `${mins}:${secs}`;

  const total = pomodoroIsBreak ? POMODORO_BREAK : POMODORO_FOCUS;
  const pct   = 1 - (s / total);
  const deg   = Math.round(pct * 360);
  document.getElementById('pomodoro-circle').style.background =
    `conic-gradient(var(--primary) ${deg}deg, var(--bg-base) ${deg}deg)`;
}

// ============================================================
// ESTATÍSTICAS
// ============================================================

function renderStats() {
  renderXpChart();
  renderGradeChart();
  renderFreqChart();
  renderSubjectPerformance();
}

function renderXpChart() {
  const canvas = document.getElementById('xp-chart');
  const ctx = canvas.getContext('2d');
  const days = [];
  const values = [];
  for (let i = 6; i >= 0; i--) {
    const d = dayStr(-i);
    days.push(d.slice(5)); // MM-DD
    values.push(state.xpHistory[d] || 0);
  }
  drawBarChart(ctx, canvas, days, values, '#7c3aed', 'XP');
}

function renderGradeChart() {
  const canvas = document.getElementById('grade-chart');
  const ctx = canvas.getContext('2d');
  const sorted = [...state.exams].sort((a,b) => a.timestamp - b.timestamp).slice(-10);
  if (!sorted.length) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawEmpty(ctx, canvas, 'Sem provas registradas');
    return;
  }
  const labels = sorted.map(e => e.name.slice(0, 8));
  const values = sorted.map(e => e.grade);
  drawLineChart(ctx, canvas, labels, values, '#10b981');
}

function renderFreqChart() {
  const canvas = document.getElementById('freq-chart');
  const ctx = canvas.getContext('2d');
  const days = [];
  const values = [];
  for (let i = 13; i >= 0; i--) {
    const d = dayStr(-i);
    days.push(d.slice(5));
    values.push(state.studyDays && state.studyDays.includes(d) ? 1 : 0);
  }
  drawBarChart(ctx, canvas, days, values, '#06b6d4', 'Estudo');
}

function drawBarChart(ctx, canvas, labels, values, color, label) {
  const W = canvas.offsetWidth || 600;
  const H = 200;
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const isDark = document.documentElement.dataset.theme !== 'light';
  const textColor = isDark ? '#8892b0' : '#4a5278';
  const bgColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  const pad = { top: 20, bottom: 35, left: 40, right: 10 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;
  const max = Math.max(...values, 1);
  const barW = Math.floor(chartW / labels.length) - 4;

  ctx.font = '11px Nunito, sans-serif';
  ctx.fillStyle = textColor;

  labels.forEach((lbl, i) => {
    const x = pad.left + i * (chartW / labels.length) + (chartW / labels.length - barW) / 2;
    const barH = Math.max(2, (values[i] / max) * chartH);
    const y = pad.top + chartH - barH;

    // Bar background
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(x, pad.top, barW, chartH, 4);
    ctx.fill();

    // Bar fill
    const gradient = ctx.createLinearGradient(0, y, 0, y + barH);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, color + '66');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, 4);
    ctx.fill();

    // Value
    if (values[i] > 0) {
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.fillText(values[i], x + barW / 2, y - 4);
    }

    // Label
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.fillText(lbl, x + barW / 2, H - 8);
  });
}

function drawLineChart(ctx, canvas, labels, values, color) {
  const W = canvas.offsetWidth || 600;
  const H = 200;
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const isDark = document.documentElement.dataset.theme !== 'light';
  const textColor = isDark ? '#8892b0' : '#4a5278';

  const pad = { top: 20, bottom: 35, left: 40, right: 10 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;
  const max = 10;
  const stepX = chartW / (labels.length - 1 || 1);

  const points = values.map((v, i) => ({
    x: pad.left + i * stepX,
    y: pad.top + chartH - (v / max) * chartH,
  }));

  // Line
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // Fill
  const gradient = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom);
  gradient.addColorStop(0, color + '40');
  gradient.addColorStop(1, color + '00');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length-1].x, H - pad.bottom);
  ctx.lineTo(pad.left, H - pad.bottom);
  ctx.fill();

  // Dots & labels
  ctx.font = '11px Nunito, sans-serif';
  points.forEach((p, i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.fillText(values[i], p.x, p.y - 10);
    ctx.fillText(labels[i], p.x, H - 8);
  });

  // Linha de referência nota 6
  const y6 = pad.top + chartH - (6 / max) * chartH;
  ctx.strokeStyle = 'rgba(239,68,68,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.left, y6);
  ctx.lineTo(W - pad.right, y6);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawEmpty(ctx, canvas, msg) {
  const isDark = document.documentElement.dataset.theme !== 'light';
  ctx.fillStyle = isDark ? '#4a5278' : '#8892b0';
  ctx.font = '14px Nunito, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
}

function renderSubjectPerformance() {
  const container = document.getElementById('subject-performance');
  if (!state.subjects.length) {
    container.innerHTML = '';
    return;
  }

  const suggestions = [];

  const items = state.subjects.map(s => {
    const avg = s.grades.length ? s.grades.reduce((a,b)=>a+b,0) / s.grades.length : null;
    const pct = avg !== null ? (avg / 10) * 100 : 50;
    const color = avg === null ? '#7c3aed' : avg >= 8 ? '#10b981' : avg >= 6 ? '#f59e0b' : '#ef4444';
    const avgStr = avg !== null ? avg.toFixed(1) : '—';

    if (avg !== null && avg < 6) suggestions.push(`⚠️ ${s.emoji} ${s.name}: média baixa (${avgStr}). Dedique mais tempo a esta matéria!`);
    else if (avg !== null && avg >= 9) suggestions.push(`✅ ${s.emoji} ${s.name}: excelente desempenho (${avgStr})! Continue assim!`);

    return `
    <div class="perf-item">
      <span class="perf-label">${s.emoji} ${s.name}</span>
      <div class="perf-bar-track">
        <div class="perf-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="perf-grade" style="color:${color}">${avgStr}</span>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div class="perf-title">📊 Desempenho por Matéria</div>
    ${items}
    ${suggestions.length ? `<div class="suggestion-box">💡 ${suggestions.join('<br>')}</div>` : ''}
  `;
}

// ============================================================
// CALENDÁRIO
// ============================================================

function initCalendar() {
  document.getElementById('cal-prev').addEventListener('click', () => { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); });
  document.getElementById('cal-next').addEventListener('click', () => { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); });
}

function renderCalendar() {
  const year = calDate.getFullYear();
  const month = calDate.getMonth();

  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  document.getElementById('cal-month-year').textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();

  const weekdays = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  let html = weekdays.map(d => `<div class="cal-weekday">${d}</div>`).join('');

  // Dias vazios antes
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="cal-day other-month"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday   = dateStr === today;
    const studied   = state.studyDays && state.studyDays.includes(dateStr);
    const hasXp     = state.xpHistory[dateStr] > 0;

    // ── Coleta bolinhas do dia ───────────────────────────────────
    const dotEntries = []; // { type: 'task'|'exam'|'study' }

    // Tarefas com prazo neste dia
    const dayTasks = state.tasks.filter(t => t.dueDate === dateStr);
    dayTasks.forEach(() => dotEntries.push('task'));

    // Provas marcadas para este dia
    const dayExams = state.exams.filter(e => e.examDate === dateStr);
    dayExams.forEach(() => dotEntries.push('exam'));

    // Dia de estudo
    if (studied) dotEntries.push('study');

    const MAX_DOTS  = 5;
    const visible   = dotEntries.slice(0, MAX_DOTS);
    const hasMore   = dotEntries.length > MAX_DOTS;

    const dotsHtml = visible.length
      ? `<div class="cal-dots">${visible.map(t => `<div class="cal-dot cal-dot-${t}"></div>`).join('')}${hasMore ? '<div class="cal-dot-more">+</div>' : ''}</div>`
      : '';

    html += `
    <div class="cal-day ${isToday ? 'today' : ''} ${studied ? 'studied' : ''} ${hasXp ? 'has-activity' : ''}"
         onclick="showCalDay('${dateStr}', this)">
      <span class="cal-day-num">${d}</span>
      ${dotsHtml}
    </div>`;
  }

  document.getElementById('cal-grid').innerHTML = html;
  renderScheduleEditor();
}

function showCalDay(dateStr, el) {
  // Marca dia selecionado visualmente
  document.querySelectorAll('.cal-day.selected').forEach(c => c.classList.remove('selected'));
  if (el) el.classList.add('selected');

  const xp      = state.xpHistory[dateStr] || 0;
  const studied = state.studyDays && state.studyDays.includes(dateStr);

  // Tarefas com prazo neste dia
  const dayTasks = state.tasks.filter(t => t.dueDate === dateStr);
  // Provas com data neste dia
  const dayExams = state.exams.filter(e => e.examDate === dateStr);

  // Formata data legível
  const [y, m, dNum] = dateStr.split('-');
  const dayNames   = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  const monthNames = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const dateObj    = new Date(+y, +m - 1, +dNum);
  const formatted  = `${dayNames[dateObj.getDay()]}, ${+dNum} de ${monthNames[+m - 1]}`;

  const taskRows = dayTasks.map(t => {
    const subj    = state.subjects.find(s => s.id === t.subjectId);
    const subjTag = subj ? `<span class="cal-detail-subj">${subj.emoji} ${subj.name}</span>` : '';
    const icon    = t.done ? '✅' : '📌';
    const diff    = t.difficulty === 'hard' ? ' 🔴' : t.difficulty === 'medium' ? ' 🟡' : '';
    return `<div class="cal-detail-item">
      <div class="cal-dot cal-dot-task"></div>
      <div><span class="cal-detail-name">${icon} ${t.name}${diff}</span>${subjTag}</div>
    </div>`;
  }).join('');

  const examRows = dayExams.map(e => {
    const subj    = state.subjects.find(s => s.id === e.subjectId);
    const subjTag = subj ? `<span class="cal-detail-subj">${subj.emoji} ${subj.name}</span>` : '';
    const status  = e.grade != null
      ? `<span class="cal-detail-grade">Nota: ${e.grade}</span>`
      : `<span class="cal-detail-pending">Pendente</span>`;
    return `<div class="cal-detail-item">
      <div class="cal-dot cal-dot-exam"></div>
      <div><span class="cal-detail-name">📝 ${e.name}</span>${subjTag}${status}</div>
    </div>`;
  }).join('');

  const studyRow = studied ? `<div class="cal-detail-item">
    <div class="cal-dot cal-dot-study"></div>
    <div><span class="cal-detail-name">📚 Dia de estudo</span>${xp ? `<span class="cal-detail-xp"> +${xp} XP</span>` : ''}</div>
  </div>` : '';

  const isEmpty = !dayTasks.length && !dayExams.length && !studied;

  document.getElementById('cal-day-detail').innerHTML = `
    <div class="cal-detail-header">
      <span class="cal-detail-date">${formatted}</span>
      ${xp ? `<span class="cal-detail-xp-badge">⚡ ${xp} XP</span>` : ''}
    </div>
    <div class="cal-detail-legend">
      <span><span class="cal-dot cal-dot-task"></span> Tarefas</span>
      <span><span class="cal-dot cal-dot-exam"></span> Provas</span>
      <span><span class="cal-dot cal-dot-study"></span> Estudo</span>
    </div>
    ${isEmpty ? '<p class="cal-detail-empty">Nenhum evento neste dia.</p>' : ''}
    ${taskRows}${examRows}${studyRow}
  `;
}

// ============================================================
// TEMA
// ============================================================

function initTheme() {
  const saved = (state.settings && state.settings.theme) || localStorage.getItem('sq_theme') || 'dark';
  setTheme(saved);
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme;
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
  }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('sq_theme', theme);
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) toggleBtn.textContent = theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Escuro';
  // Sync settings state
  if (state.settings) { state.settings.theme = theme; saveState(); }
  // Sync settings page toggle if visible
  const cfgToggle = document.getElementById('cfg-dark-mode');
  if (cfgToggle) cfgToggle.checked = (theme === 'dark');
}

// ============================================================
// UPDATE UI GERAL
// ============================================================

function updateAllUI() {
  // Garante que todas as chaves necessárias existem (compatibilidade com saves antigos)
  if (!state.taskHistory)    state.taskHistory    = [];
  if (!state.dynamicMissions)state.dynamicMissions= [];
  if (!state.weeklyMissions) state.weeklyMissions = {};
  if (!state.dailyMissions)  state.dailyMissions  = {};
  if (!state.gradeTypes)     state.gradeTypes     = {};
  if (!state.gradeEntries)   state.gradeEntries   = {};
  if (!state.studyItems)     state.studyItems     = [];
  if (!state.totalStudied)   state.totalStudied   = 0;
  if (!state.settings)       state.settings       = {};
  state.settings = Object.assign(
    { schoolAverage: 7, notificationsEnabled: true, soundsEnabled: true,
      confirmDeletes: true, theme: 'dark', focusMode: false },
    state.settings
  );

  console.log('[Data] Aplicando dados na interface — XP:', state.xp, '| Nível:', state.level, '| Moedas:', state.coins);
  generateDynamicMissions();
  updateDashboard();
  updateBoostsBar();
}

// Helper: atualiza textContent/style de um elemento se ele existir
function _setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
  else console.warn('[UI] Elemento não encontrado:', id);
}
function _setStyle(id, prop, value) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = value;
  else console.warn('[UI] Elemento não encontrado:', id);
}

function updateDashboard() {
  // Nome e avatar
  _setText('dash-name', state.name);
  _setText('nav-name',  state.name);
  _renderNavAvatar();
  _setText('nav-level', `Nível ${state.level}`);

  // Stats
  _setText('stat-xp',     state.xp);
  _setText('stat-coins',  state.coins);
  _setText('stat-streak', `${state.streak} ${state.streak === 1 ? 'dia' : 'dias'}`);
  _setText('stat-level',  state.level);

  // Top bar mobile
  _setText('top-streak', state.streak);
  _setText('top-coins',  state.coins);

  // IACoin display
  _updateIACoinDisplay();

  // Link admin: só aparece se is_admin
  const adminLink = document.getElementById('sidebar-admin-link');
  if (adminLink) adminLink.style.display = state.isAdmin ? '' : 'none';

  // XP Bar
  const xpNeeded = xpForLevel(state.level);
  const pct = Math.min(100, Math.round((state.xp / xpNeeded) * 100));
  _setStyle('xp-bar-fill', 'width', pct + '%');
  _setText('xp-current',    state.xp);
  _setText('xp-needed',     xpNeeded);
  _setText('xp-curr-level', state.level);
  _setText('xp-next-level', state.level + 1);

  // Meta diária
  const goalPct = state.dailyGoal > 0 ? Math.min(100, Math.round((state.dailyXp / state.dailyGoal) * 100)) : 0;
  _setStyle('goal-bar-fill', 'width', goalPct + '%');
  _setText('goal-text', `${state.dailyXp} / ${state.dailyGoal} XP hoje (${goalPct}%)`);

  // Feedback inteligente
  updateFeedback();

  // Missões preview
  renderMissionsPreview();

  // Recordes
  renderRecords();
}

function updateFeedback() {
  const el = document.getElementById('dash-feedback');
  const messages = [];

  if (state.streak >= 7) messages.push(`🔥 Incrível! ${state.streak} dias de streak!`);
  else if (state.streak >= 3) messages.push(`💪 ${state.streak} dias de streak! Continue assim!`);

  const recentExams = state.exams.slice(-3);
  if (recentExams.length) {
    const avgRecent = recentExams.reduce((a,b) => a + b.grade, 0) / recentExams.length;
    if (avgRecent >= 8) messages.push(`📈 Seu desempenho nas provas está excelente!`);
    else if (avgRecent < 6) messages.push(`⚠️ Suas notas recentes estão baixas. Hora de estudar mais!`);
  }

  // Verificar melhoria por matéria
  state.subjects.forEach(s => {
    if (s.grades.length >= 2) {
      const last = s.grades[s.grades.length - 1];
      const prev = s.grades[s.grades.length - 2];
      if (last > prev) messages.push(`📈 Você melhorou em ${s.name}! Nota ${last} vs ${prev} antes.`);
      else if (last < prev - 1) messages.push(`📉 Seu desempenho em ${s.name} caiu. Revise o conteúdo!`);
    }
  });

  if (state.dailyXp >= state.dailyGoal && state.dailyGoal > 0) messages.push(`🎯 Meta diária batida! Você é incrível!`);

  el.textContent = messages.length ? messages[Math.floor(Math.random() * messages.length)] : 'Continue sua jornada épica! ⚔️';
}

function renderRecords() {
  const el = document.getElementById('records-list');
  const tasksToday = state.tasks.filter(t => {
    if (!t.done || !t.doneAt) return false;
    return new Date(t.doneAt).toISOString().slice(0,10) === todayStr();
  }).length;

  el.innerHTML = `
    <div class="record-item">
      <div class="record-icon">⚡</div>
      <span class="record-val text-xp">${state.records.maxDailyXp}</span>
      <span class="record-label">Maior XP/dia</span>
    </div>
    <div class="record-item">
      <div class="record-icon">🔥</div>
      <span class="record-val text-warning">${state.maxStreak}</span>
      <span class="record-label">Maior Streak</span>
    </div>
    <div class="record-item">
      <div class="record-icon">🌟</div>
      <span class="record-val text-success">${state.records.topGrade}</span>
      <span class="record-label">Maior Nota</span>
    </div>
    <div class="record-item">
      <div class="record-icon">✅</div>
      <span class="record-val">${state.totalTasksDone}</span>
      <span class="record-label">Total Tarefas</span>
    </div>
    <div class="record-item">
      <div class="record-icon">⏱️</div>
      <span class="record-val">${state.totalPomodoros}</span>
      <span class="record-label">Pomodoros</span>
    </div>
    <div class="record-item">
      <div class="record-icon">📅</div>
      <span class="record-val">${state.studyDays ? state.studyDays.length : 0}</span>
      <span class="record-label">Dias estudados</span>
    </div>
    <div class="record-item">
      <div class="record-icon">📘</div>
      <span class="record-val">${state.totalStudied || 0}</span>
      <span class="record-label">Conteúdos</span>
    </div>
  `;
}

// ============================================================
// UTILITÁRIOS
// ============================================================

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function dayStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function populateSubjectSelect(selectId) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">Sem matéria específica</option>' +
    state.subjects.map(s => `<option value="${s.id}">${s.emoji} ${s.name}</option>`).join('');
}

// ============================================================
// NOTIFICAÇÕES
// ============================================================

function showNotification(msg, type = 'info') {
  if (state.settings && state.settings.notificationsEnabled === false) return;
  const area = document.getElementById('notifications-area');
  if (!area) return;
  const el = document.createElement('div');
  el.className = `notification ${type}`;
  el.textContent = msg;
  area.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'slide-out 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ============================================================
// XP POPUP
// ============================================================

function showXpPopup(amount, boosted = false) {
  const popup = document.createElement('div');
  popup.className = 'xp-popup';
  popup.textContent = `+${amount} XP${boosted ? ' 🔮×2' : ''}`;
  popup.style.left = `${30 + Math.random() * 40}%`;
  popup.style.top = `${window.scrollY + 100 + Math.random() * 100}px`;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 1500);
}

// ============================================================
// CONFETTI
// ============================================================

function createConfetti(container, count = 30) {
  const colors = ['#7c3aed','#06b6d4','#f59e0b','#10b981','#ef4444','#a78bfa','#fbbf24'];
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-particle';
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 50}%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      animation-delay: ${Math.random() * 0.5}s;
      animation-duration: ${1 + Math.random()}s;
    `;
    container.appendChild(p);
  }
}

// ============================================================
// SONS (Web Audio API)
// ============================================================

function playSound(type) {
  if (state.settings && state.settings.soundsEnabled === false) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    if (type === 'complete') {
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
    } else if (type === 'levelup') {
      osc.frequency.setValueAtTime(392, ctx.currentTime);
      osc.frequency.setValueAtTime(523, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.2);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.3);
    } else if (type === 'achievement') {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1108, ctx.currentTime + 0.15);
    }

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) { /* sem suporte */ }
}

// ============================================================
// PENALIDADE POR PROCRASTINAÇÃO (suave)
// ============================================================

function checkProcrastination() {
  const lastDate = state.lastStudyDate;
  if (!lastDate) return;
  const daysDiff = Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff >= 3 && daysDiff < 7) {
    showNotification(`😴 ${daysDiff} dias sem estudar! Suas habilidades estão enferrujando...`, 'warning');
  } else if (daysDiff >= 7) {
    showNotification(`💀 ${daysDiff} dias sem estudar! O vilão da procrastinação está ganhando!`, 'error');
  }
}

// Verificar procrastinação ao iniciar
setTimeout(checkProcrastination, 2000);



// ============================================================
// EDIT & DELETE — Tarefas e Provas
// ============================================================

let pendingDeleteAction = null; // { type: 'task'|'exam', id: string }

function initEditDelete() {
  // ── Task list delegation ──────────────────────────────────
  function bindTaskList(el) {
    if (!el || el._editBound) return;
    el._editBound = true;
    el.addEventListener('click', function(ev) {
      const btn = ev.target.closest('[data-action]');
      if (!btn) return;
      const id  = btn.dataset.id;
      const act = btn.dataset.action;
      if (act === 'toggle-task')  toggleTask(id);
      if (act === 'edit-task')    openEditTask(id);
      if (act === 'delete-task')  confirmDelete('task', id);
    });
  }

  // ── Exam list delegation ──────────────────────────────────
  function bindExamList(el) {
    if (!el || el._editBound) return;
    el._editBound = true;
    el.addEventListener('click', function(ev) {
      const btn = ev.target.closest('[data-action]');
      if (!btn) return;
      const id  = btn.dataset.id;
      const act = btn.dataset.action;
      if (act === 'grade-exam') openExamGrade(id);
      if (act === 'edit-exam')  openEditExam(id);
      if (act === 'del-exam')   confirmDelete('exam', id);
    });
  }

  // Bind on existing containers
  bindTaskList(document.getElementById('tasks-sections'));
  bindTaskList(document.getElementById('tasks-list'));
  bindExamList(document.getElementById('exams-list'));

  // Re-bind after navigateTo renders (observe DOM changes)
  const observer = new MutationObserver(function() {
    bindTaskList(document.getElementById('tasks-sections'));
    bindTaskList(document.getElementById('tasks-list'));
    bindExamList(document.getElementById('exams-list'));
  });
  const main = document.querySelector('.main-content');
  if (main) observer.observe(main, { childList: true, subtree: true });

  // ── Edit Task modal wiring ────────────────────────────────
  document.querySelectorAll('#edit-diff-opts .diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#edit-diff-opts .diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('edit-grade-slider').addEventListener('input', function() {
    const v = parseFloat(this.value);
    document.getElementById('edit-grade-display').textContent = v.toFixed(1);
  });

  document.getElementById('edit-has-grade').addEventListener('change', function() {
    document.getElementById('edit-grade-picker').style.opacity = this.checked ? '1' : '0.4';
    document.getElementById('edit-grade-slider').disabled = !this.checked;
  });

  document.getElementById('save-edit-task-btn').addEventListener('click', saveEditTask);
  document.getElementById('save-edit-exam-btn').addEventListener('click', saveEditExam);

  // ── Confirm delete ────────────────────────────────────────
  document.getElementById('confirm-delete-btn').addEventListener('click', function() {
    if (!pendingDeleteAction) return;
    const { type, id } = pendingDeleteAction;
    if (type === 'task')  deleteTask(id);
    if (type === 'exam')  deleteExam(id);
    if (type === 'study') deleteStudyItem(id);
    pendingDeleteAction = null;
    closeModal('modal-confirm-delete');
  });

  // Close modals on overlay click
  ['modal-edit-task','modal-edit-exam','modal-confirm-delete'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', function(e) {
      if (e.target === el) closeModal(id);
    });
  });
}

// ── CONFIRM DELETE ────────────────────────────────────────────
function confirmDelete(type, id) {
  id = String(id);
  // If confirmations are disabled, delete immediately
  if (state.settings && state.settings.confirmDeletes === false) {
    pendingDeleteAction = { type, id };
    if (type === 'task')  deleteTask(id);
    if (type === 'exam')  deleteExam(id);
    if (type === 'study') deleteStudyItem(id);
    pendingDeleteAction = null;
    return;
  }
  pendingDeleteAction = { type, id };
  let name = '';
  if (type === 'task') {
    const t = state.tasks.find(t => t.id === id) || (state.taskHistory||[]).find(t => t.id === id);
    name = t ? '"' + t.name + '"' : 'esta tarefa';
  }
  if (type === 'exam') {
    const e = state.exams.find(e => e.id === id);
    name = e ? '"' + e.name + '"' : 'esta prova';
  }
  if (type === 'study') {
    const si = (state.studyItems || []).find(i => i.id === id);
    name = si ? '"' + si.content + '"' : 'este conteúdo';
  }
  document.getElementById('confirm-delete-text').textContent = 'Tem certeza que deseja excluir ' + name + '? Esta ação não pode ser desfeita.';
  openModal('modal-confirm-delete');
}

// ── EDIT TASK ─────────────────────────────────────────────────
function openEditTask(id) {
  id = String(id);
  const task = state.tasks.find(t => t.id === id);
  if (!task) return showNotification('Tarefa não encontrada!', 'error');

  document.getElementById('edit-task-id').value    = id;
  document.getElementById('edit-task-name').value  = task.name;
  document.getElementById('edit-task-due-date').value = task.dueDate || '';

  // Populate subject select
  populateSubjectSelect('edit-task-subject');
  document.getElementById('edit-task-subject').value = task.subjectId || '';

  // Set difficulty
  document.querySelectorAll('#edit-diff-opts .diff-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.diff === task.difficulty);
  });

  openModal('modal-edit-task');
}

function saveEditTask() {
  const id       = document.getElementById('edit-task-id').value;
  const name     = document.getElementById('edit-task-name').value.trim();
  const subject  = document.getElementById('edit-task-subject').value;
  const diff     = document.querySelector('#edit-diff-opts .diff-btn.active')?.dataset.diff || 'easy';
  const dueDate  = document.getElementById('edit-task-due-date').value || null;

  if (!name) return showNotification('Digite o nome da tarefa!', 'warning');

  const task = state.tasks.find(t => t.id === id);
  if (!task) return showNotification('Tarefa não encontrada!', 'error');

  task.name      = name;
  task.subjectId = subject;
  task.difficulty= diff;
  task.dueDate   = dueDate;

  saveState();
  closeModal('modal-edit-task');
  renderTasks();
  showNotification('✅ Tarefa atualizada!', 'success');
}

// ── EDIT EXAM ─────────────────────────────────────────────────
function openEditExam(id) {
  id = String(id);
  const exam = state.exams.find(e => e.id === id);
  if (!exam) return showNotification('Prova não encontrada!', 'error');

  document.getElementById('edit-exam-id').value   = id;
  document.getElementById('edit-exam-name').value  = exam.name;
  document.getElementById('edit-exam-date').value  = exam.examDate || exam.date || '';

  populateSubjectSelect('edit-exam-subject');
  document.getElementById('edit-exam-subject').value = exam.subjectId || '';

  const hasGrade = exam.status === 'done' && exam.grade !== null;
  document.getElementById('edit-has-grade').checked = hasGrade;
  document.getElementById('edit-grade-slider').disabled = !hasGrade;
  document.getElementById('edit-grade-picker').style.opacity = hasGrade ? '1' : '0.4';
  if (hasGrade) {
    document.getElementById('edit-grade-slider').value = exam.grade;
    document.getElementById('edit-grade-display').textContent = parseFloat(exam.grade).toFixed(1);
  } else {
    document.getElementById('edit-grade-display').textContent = '—';
  }

  openModal('modal-edit-exam');
}

function saveEditExam() {
  const id      = document.getElementById('edit-exam-id').value;
  const name    = document.getElementById('edit-exam-name').value.trim();
  const subject = document.getElementById('edit-exam-subject').value;
  const date    = document.getElementById('edit-exam-date').value || null;
  const hasGrade = document.getElementById('edit-has-grade').checked;
  const grade   = hasGrade ? parseFloat(document.getElementById('edit-grade-slider').value) : null;

  if (!name) return showNotification('Digite o nome da prova!', 'warning');

  const exam = state.exams.find(e => e.id === id);
  if (!exam) return showNotification('Prova não encontrada!', 'error');

  // Update subject grade list if grade changed
  if (exam.subjectId && exam.grade !== null) {
    const oldSubj = state.subjects.find(s => s.id === exam.subjectId);
    if (oldSubj) oldSubj.grades = oldSubj.grades.filter(g => g !== exam.grade);
  }

  exam.name      = name;
  exam.subjectId = subject;
  exam.examDate  = date;
  exam.date      = date || exam.date;

  if (hasGrade && grade !== null) {
    const gradeInfo = gradeToInfo(grade);
    exam.grade      = grade;
    exam.status     = 'done';
    exam.gradeClass = gradeInfo.gradeClass;
    exam.gradeLabel = gradeInfo.gradeLabel;
    if (!exam.xpGain) { exam.xpGain = gradeInfo.xpGain; exam.coinGain = gradeInfo.coinGain; }
    // Update subject
    if (subject) {
      const subj = state.subjects.find(s => s.id === subject);
      if (subj) {
        subj.grades.push(grade);
        subj.avgGrade = subj.grades.reduce((a,b)=>a+b,0)/subj.grades.length;
      }
    }
    state.maxGradeEver = Math.max(state.maxGradeEver, grade);
  } else if (!hasGrade) {
    exam.grade      = null;
    exam.status     = 'pending';
    exam.gradeClass = '';
    exam.gradeLabel = '';
  }

  saveState();
  closeModal('modal-edit-exam');
  renderExams();
  showNotification('📝 Prova atualizada!', 'success');
}

// Helper: grade → xp/class/label info (same logic as confirmExamGrade)
function gradeToInfo(grade) {
  const avg = getSchoolAverage();
  if (grade >= Math.min(9, avg + 2)) return { xpGain: 60,  coinGain: 25, gradeClass: grade===10 ? 'grade-10' : 'grade-high', gradeLabel: 'Excelente' };
  if (grade >= avg)                  return { xpGain: 40,  coinGain: 15, gradeClass: 'grade-high', gradeLabel: 'Aprovado' };
  if (grade >= avg - 2)              return { xpGain: 15,  coinGain: 7,  gradeClass: 'grade-mid',  gradeLabel: 'Recuperação' };
  return                                    { xpGain: 8,   coinGain: 3,  gradeClass: 'grade-low',  gradeLabel: 'Resultado Crítico' };
}

// ============================================================
// PÁGINA DE NOTAS & MÉDIAS — sistema de tipos com pesos
// ============================================================

// state.gradeTypes   = { subjectId: [ { id, name, weight, count } ] }
// state.gradeEntries = { subjectId: { typeId: [n0, n1, ...] } }

// Helper: build safe onclick strings without inner quote conflicts
function eid(id) { return String(id).replace(/[^0-9a-zA-Z_-]/g,''); }

function initGradesPage() {
  if (!state.gradeTypes)   state.gradeTypes   = {};
  if (!state.gradeEntries) state.gradeEntries = {};

  const addBtn = document.getElementById('add-grade-type-btn');
  if (addBtn) {
    addBtn.onclick = () => {
      const sel = document.getElementById('grades-subject-select').value;
      if (!sel) return showNotification('Selecione uma matéria primeiro!', 'warning');
      openModal('modal-grade-type');
      updateFormulaPreview();
    };
  }

  const saveBtn = document.getElementById('save-grade-type-btn');
  if (saveBtn) saveBtn.onclick = saveGradeType;

  const wtSlider = document.getElementById('grade-type-weight');
  const cntInput = document.getElementById('grade-type-count');
  if (wtSlider) wtSlider.addEventListener('input', updateFormulaPreview);
  if (cntInput) cntInput.addEventListener('input', updateFormulaPreview);

  // Event delegation for grade-type-list buttons
  const typesList = document.getElementById('grade-types-list');
  if (typesList && !typesList._delegated) {
    typesList._delegated = true;
    typesList.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-delete-type]');
      if (btn) deleteGradeType(btn.dataset.subjectId, btn.dataset.deleteType);
    });
  }

  // Event delegation for grade inputs
  const entriesList = document.getElementById('grade-entries-list');
  if (entriesList && !entriesList._delegated) {
    entriesList._delegated = true;
    entriesList.addEventListener('change', function(e) {
      const inp = e.target.closest('[data-subject][data-type][data-index]');
      if (inp) saveGradeEntry(inp.dataset.subject, inp.dataset.type, parseInt(inp.dataset.index), inp.value, inp);
    });
    entriesList.addEventListener('input', function(e) {
      const inp = e.target.closest('[data-subject][data-type][data-index]');
      if (inp) colorGradeInput(inp);
    });
    // calc button delegation
    entriesList.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-calc-subject]');
      if (btn) calcFinalGrade(btn.dataset.calcSubject);
    });
  }
}

function updateFormulaPreview() {
  const nameEl   = document.getElementById('grade-type-name');
  const wtEl     = document.getElementById('grade-type-weight');
  const cntEl    = document.getElementById('grade-type-count');
  const prevEl   = document.getElementById('grade-type-formula-preview');
  const dispEl   = document.getElementById('grade-type-weight-display');
  if (!wtEl || !cntEl || !prevEl) return;
  const name   = nameEl ? (nameEl.value || 'Avaliação') : 'Avaliação';
  const weight = parseFloat(wtEl.value) || 7;
  const count  = parseInt(cntEl.value) || 2;
  const notes  = Array.from({length: count}, (_, i) => 'N'+(i+1)).join(' + ');
  const factor = (weight/10).toFixed(1);
  prevEl.textContent = 'Fórmula: (' + notes + ') × ' + factor + ' ÷ ' + count;
  if (dispEl) dispEl.textContent = weight;
}

function saveGradeType() {
  const subjectId = document.getElementById('grades-subject-select').value;
  if (!subjectId) return showNotification('Selecione uma matéria!', 'warning');
  const name   = document.getElementById('grade-type-name').value.trim();
  if (!name) return showNotification('Digite o nome do tipo!', 'warning');
  const weight = parseFloat(document.getElementById('grade-type-weight').value);
  const count  = parseInt(document.getElementById('grade-type-count').value) || 2;

  if (!state.gradeTypes[subjectId]) state.gradeTypes[subjectId] = [];
  state.gradeTypes[subjectId].push({ id: Date.now().toString(), name, weight, count });
  if (!state.gradeEntries[subjectId]) state.gradeEntries[subjectId] = {};

  saveState();
  closeModal('modal-grade-type');
  document.getElementById('grade-type-name').value = '';
  document.getElementById('grade-type-weight').value = 7;
  document.getElementById('grade-type-count').value = 2;
  renderGradesPage();
  showNotification('⚖️ Tipo "' + name + '" criado! Peso: ' + weight, 'success');
}

function deleteGradeType(subjectId, typeId) {
  subjectId = String(subjectId); typeId = String(typeId);
  if (!state.gradeTypes[subjectId]) return;
  state.gradeTypes[subjectId] = state.gradeTypes[subjectId].filter(t => t.id !== typeId);
  if (state.gradeEntries[subjectId]) delete state.gradeEntries[subjectId][typeId];
  saveState();
  renderGradesPage();
}

function renderGradesPage() {
  // Populate subject select
  const sel = document.getElementById('grades-subject-select');
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">— Selecione uma matéria —</option>' +
    (state.subjects || []).map(s => '<option value="' + s.id + '">' + s.emoji + ' ' + s.name + '</option>').join('');
  sel.value = currentVal;

  const section    = document.getElementById('grade-types-section');
  const subjectId  = sel.value;

  if (!subjectId) {
    if (section) section.style.display = 'none';
    renderAllGradesHistory();
    return;
  }
  if (section) section.style.display = 'block';

  const types   = (state.gradeTypes   && state.gradeTypes[subjectId])   || [];
  const entries = (state.gradeEntries && state.gradeEntries[subjectId]) || {};

  // Weight sum badge
  const totalWeight = types.reduce((s, t) => s + t.weight, 0);
  const badge = document.getElementById('weight-sum-badge');
  if (badge) {
    badge.textContent = 'Peso total: ' + totalWeight;
    badge.style.color = Math.abs(totalWeight - 10) < 0.01 ? 'var(--success)' : 'var(--warning)';
  }

  // Render type cards
  const typesEl = document.getElementById('grade-types-list');
  if (typesEl) {
    if (!types.length) {
      typesEl.innerHTML = '<div class="empty-state" style="padding:1rem"><span class="empty-icon">⚖️</span><p>Nenhum tipo criado. Clique em "+ Tipo de Avaliação".</p></div>';
    } else {
      const icons = ['📝','📋','🏆','✅','📖','🧪','📊','🎯'];
      typesEl.innerHTML = types.map(function(t, i) {
        const factor = (t.weight/10).toFixed(1);
        const notes  = Array.from({length: t.count}, function(_,j){ return 'N'+(j+1); }).join(' + ');
        return '<div class="grade-type-card">' +
          '<div class="grade-type-icon">' + icons[i % icons.length] + '</div>' +
          '<div class="grade-type-info">' +
          '<div class="grade-type-name">' + t.name + '</div>' +
          '<div class="grade-type-meta">(' + notes + ') × ' + factor + ' ÷ ' + t.count + '</div>' +
          '</div>' +
          '<div class="grade-type-weight-badge">' + t.weight + '</div>' +
          '<button class="delete-btn" style="opacity:1" ' +
            'data-delete-type="' + t.id + '" data-subject-id="' + subjectId + '">✕</button>' +
          '</div>';
      }).join('');
    }
  }

  // Render entry inputs
  const entriesEl = document.getElementById('grade-entries-list');
  if (entriesEl) {
    if (!types.length) {
      entriesEl.innerHTML = '';
    } else {
      const inputsHTML = types.map(function(t) {
        const saved = entries[t.id] || [];
        const inputCells = Array.from({length: t.count}, function(_, i) {
          const val        = (saved[i] !== undefined && saved[i] !== null) ? saved[i] : '';
          const colorClass = val === '' ? '' : parseFloat(val) >= 7 ? 'grade-ok' : parseFloat(val) >= 5 ? 'grade-warn' : 'grade-bad';
          return '<div class="grade-input-cell">' +
            '<span class="grade-input-label">' + t.name + ' ' + (i+1) + '</span>' +
            '<input type="number" class="' + colorClass + '" min="0" max="10" step="0.1" ' +
              'value="' + val + '" placeholder="—" ' +
              'data-subject="' + subjectId + '" data-type="' + t.id + '" data-index="' + i + '" />' +
            '</div>';
        }).join('');
        const subtotal = calcTypeSubtotal(t, saved);
        return '<div class="grade-entry-group">' +
          '<div class="grade-entry-header">' +
          '<div class="grade-entry-title">📝 ' + t.name + '</div>' +
          '<span class="grade-entry-weight">Peso ' + t.weight + '</span>' +
          '</div>' +
          '<div class="grade-inputs-row">' + inputCells + '</div>' +
          '<div class="grade-entry-subtotal">Contribuição: <strong>' +
            (subtotal !== null ? subtotal.toFixed(2) : '—') + '</strong></div>' +
          '</div>';
      }).join('');

      entriesEl.innerHTML = inputsHTML +
        '<button class="calc-btn" data-calc-subject="' + subjectId + '">🧮 Calcular Média Final</button>';
    }
  }

  // Re-init delegation after innerHTML change
  initGradesPage();
  calcFinalGrade(subjectId);
  renderAllGradesHistory();
}

function colorGradeInput(input) {
  const v = parseFloat(input.value);
  input.className = isNaN(v) ? '' : v >= 7 ? 'grade-ok' : v >= 5 ? 'grade-warn' : 'grade-bad';
}

function saveGradeEntry(subjectId, typeId, index, value, inputEl) {
  subjectId = String(subjectId); typeId = String(typeId);
  if (!state.gradeEntries) state.gradeEntries = {};
  if (!state.gradeEntries[subjectId]) state.gradeEntries[subjectId] = {};
  if (!state.gradeEntries[subjectId][typeId]) state.gradeEntries[subjectId][typeId] = [];
  const val = (value === '' || value === null || value === undefined) ? null : parseFloat(value);
  state.gradeEntries[subjectId][typeId][index] = val;
  if (inputEl) colorGradeInput(inputEl);

  // Update subtotal
  const types = (state.gradeTypes && state.gradeTypes[subjectId]) || [];
  const t = types.find(function(x){ return x.id === typeId; });
  if (t && inputEl) {
    const saved = state.gradeEntries[subjectId][typeId];
    const sub = calcTypeSubtotal(t, saved);
    const group = inputEl.closest('.grade-entry-group');
    if (group) {
      const stEl = group.querySelector('.grade-entry-subtotal');
      if (stEl) stEl.innerHTML = 'Contribuição: <strong>' + (sub !== null ? sub.toFixed(2) : '—') + '</strong>';
    }
  }
  saveState();
  calcFinalGrade(subjectId);
}

function calcTypeSubtotal(type, saved) {
  // avg of entered notes × (weight/10)
  const validNotes = [];
  for (let i = 0; i < type.count; i++) {
    const v = saved[i];
    if (v !== null && v !== undefined && v !== '') validNotes.push(parseFloat(v));
  }
  if (!validNotes.length) return null;
  const avg = validNotes.reduce(function(a,b){ return a+b; }, 0) / type.count;
  return avg * (type.weight / 10);
}

function calcFinalGrade(subjectId) {
  subjectId = String(subjectId);
  const types   = (state.gradeTypes   && state.gradeTypes[subjectId])   || [];
  const entries = (state.gradeEntries && state.gradeEntries[subjectId]) || {};
  if (!types.length) return;

  const totalWeight  = types.reduce(function(s,t){ return s + t.weight; }, 0);
  const resultCard   = document.getElementById('grade-result-card');
  const resultValue  = document.getElementById('grade-result-value');
  const resultStatus = document.getElementById('grade-result-status');
  const resultIcon   = document.getElementById('grade-result-icon');
  const formulaBox   = document.getElementById('grade-formula-box');
  if (!resultValue) return;

  let totalContrib  = 0;
  let hasAllValues  = true;
  const formulaParts = [];

  types.forEach(function(t) {
    const saved = entries[t.id] || [];
    const sub   = calcTypeSubtotal(t, saved);
    const noteStrs = Array.from({length: t.count}, function(_, i) {
      const v = saved[i];
      return (v !== null && v !== undefined && v !== '') ? parseFloat(v).toFixed(1) : '?';
    });
    const factor = (t.weight / 10).toFixed(1);
    const line   = t.name + ': (' + noteStrs.join(' + ') + ') × ' + factor + ' ÷ ' + t.count + ' = ' + (sub !== null ? sub.toFixed(2) : '?');
    formulaParts.push(line);
    if (sub !== null) totalContrib += sub;
    else hasAllValues = false;
  });

  // Normalize by total weight if not 10
  const finalGrade = hasAllValues
    ? (totalWeight > 0 ? totalContrib * (10 / totalWeight) : totalContrib)
    : null;

  if (formulaBox) {
    formulaBox.textContent = formulaParts.join('\n') +
      '\n' + '─'.repeat(28) +
      '\nMédia Final = ' + (finalGrade !== null ? finalGrade.toFixed(2) : '(aguardando notas)') +
      (Math.abs(totalWeight - 10) > 0.01 ? '\n⚠️ Pesos somam ' + totalWeight + ' (normalizado ÷ ' + totalWeight + ' × 10)' : '');
  }

  if (finalGrade === null) {
    resultValue.textContent = '—';
    resultValue.style.color = 'var(--text-muted)';
    resultStatus.textContent = 'Preencha as notas';
    resultStatus.style.cssText = '';
    resultIcon.textContent  = '📊';
    if (resultCard) resultCard.className = 'grade-result-card';
    return;
  }

  resultValue.textContent = finalGrade.toFixed(2);
  let cls, statusTxt, icon, color;
  if      (finalGrade >= 9) { cls='result-excellent'; statusTxt='🌟 Excelente!';   icon='🏆'; color='var(--success)'; }
  else if (finalGrade >= 7) { cls='result-approved';  statusTxt='✅ Aprovado';     icon='👍'; color='#34d399'; }
  else if (finalGrade >= 5) { cls='result-recovery';  statusTxt='⚠️ Recuperação'; icon='📖'; color='var(--warning)'; }
  else                      { cls='result-fail';       statusTxt='❌ Reprovado';   icon='😰'; color='var(--danger)'; }

  resultValue.style.color    = color;
  resultIcon.textContent     = icon;
  resultStatus.textContent   = statusTxt;
  resultStatus.style.cssText = 'color:' + color + ';font-size:1rem;font-weight:800;';
  if (resultCard) resultCard.className = 'grade-result-card ' + cls;
}

function renderAllGradesHistory() {
  const container = document.getElementById('all-grades-history');
  if (!container) return;

  populateGradeFilters();

  let allExams = (state.exams || []).filter(function(e) {
    // Status filter
    if (gradeFilters.status === 'done')    return e.status === 'done';
    if (gradeFilters.status === 'pending') return e.status === 'pending';
    return true;
  });
  // Subject filter
  if (gradeFilters.subject) allExams = allExams.filter(e => e.subjectId === gradeFilters.subject);
  // Range filter (only for done exams with grades)
  if (gradeFilters.range) {
    const [lo, hi] = gradeFilters.range.split('-').map(Number);
    allExams = allExams.filter(e => e.grade !== null && e.grade >= lo && e.grade < hi);
  }

  if (!allExams.length) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">📋</span><p>Nenhuma prova encontrada com esses filtros.</p></div>';
    return;
  }

  applySortSelect('grades');
  const sorted = sortArray(allExams, sortPrefs['grades']);

  container.innerHTML = sorted.map(function(e) {
    const subj    = state.subjects.find(function(s){ return s.id === e.subjectId; });
    const dateStr = e.examDate || e.date || '';
    if (e.status === 'pending') {
      return '<div class="history-grade-row">' +
        '<div class="hgr-grade-badge exam-grade-circle grade-mid" style="font-size:1rem">?</div>' +
        '<div class="hgr-info">' +
        '<div class="hgr-name">' + e.name + '</div>' +
        '<div class="hgr-meta">' + (subj ? subj.emoji + ' ' + subj.name + ' · ' : '') + dateStr + '</div>' +
        '</div>' +
        '<span class="hgr-label exam-status-badge status-pending">Pendente</span>' +
        '<div class="item-actions">' +
        '<button class="complete-exam-btn" style="font-size:.75rem;padding:.25rem .6rem" data-action="grade-exam" data-id="' + e.id + '">🎯 Nota</button>' +
        '<button class="btn-icon-edit"   data-action="edit-exam" data-id="' + e.id + '">✏️</button>' +
        '<button class="btn-icon-delete" data-action="del-exam"  data-id="' + e.id + '">🗑️</button>' +
        '</div>' +
        '</div>';
    }
    const g = parseFloat(e.grade);
    let badgeCls, badgeTxt, circleCls;
    if      (g >= 9) { badgeCls='status-excellent'; badgeTxt='Excelente';   circleCls='grade-10'; }
    else if (g >= 7) { badgeCls='status-approved';  badgeTxt='Aprovado';    circleCls='grade-high'; }
    else if (g >= 5) { badgeCls='status-recovery';  badgeTxt='Recuperação'; circleCls='grade-mid'; }
    else             { badgeCls='status-fail';       badgeTxt='Crítico';     circleCls='grade-low'; }
    return '<div class="history-grade-row" data-exam-id="' + e.id + '">' +
      '<div class="hgr-grade-badge exam-grade-circle ' + circleCls + '">' + g + '</div>' +
      '<div class="hgr-info">' +
      '<div class="hgr-name">' + e.name + '</div>' +
      '<div class="hgr-meta">' + (subj ? subj.emoji + ' ' + subj.name + ' · ' : '') + dateStr + '</div>' +
      '</div>' +
      '<span class="hgr-label exam-status-badge ' + badgeCls + '">' + badgeTxt + '</span>' +
      '<div class="item-actions">' +
      '<button class="btn-icon-edit"   data-action="edit-exam" data-id="' + e.id + '">✏️</button>' +
      '<button class="btn-icon-delete" data-action="del-exam"  data-id="' + e.id + '">🗑️</button>' +
      '</div>' +
      '</div>';
  }).join('');
  // Bind delegation to history list
  if (container && !container._histBound) {
    container._histBound = true;
    container.addEventListener('click', function(ev) {
      const btn = ev.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id, act = btn.dataset.action;
      if (act === 'grade-exam') openExamGrade(id);
      if (act === 'edit-exam')  openEditExam(id);
      if (act === 'del-exam')   confirmDelete('exam', id);
    });
  }
}



// ============================================================
// FILTROS DE NOTAS
// ============================================================

let gradeFilters = { subject: '', range: '', status: '' };

function applyGradeFilters() {
  gradeFilters.subject = document.getElementById('filter-grade-subject').value;
  gradeFilters.range   = document.getElementById('filter-grade-range').value;
  gradeFilters.status  = document.getElementById('filter-grade-status').value;
  renderAllGradesHistory();
}

function clearGradeFilters() {
  gradeFilters = { subject: '', range: '', status: '' };
  document.getElementById('filter-grade-subject').value = '';
  document.getElementById('filter-grade-range').value   = '';
  document.getElementById('filter-grade-status').value  = '';
  renderAllGradesHistory();
}

function populateGradeFilters() {
  const sel = document.getElementById('filter-grade-subject');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todas</option>' +
    (state.subjects || []).map(s => '<option value="' + s.id + '">' + s.emoji + ' ' + s.name + '</option>').join('');
  sel.value = cur;
}

// ============================================================
// SISTEMA DE ESTUDO
// ============================================================

// state.studyItems = [ { id, content, subjectId, date, done, doneAt, createdAt } ]

const STUDY_XP    = 15;
const STUDY_COINS = 8;

function initStudyPage() {
  if (!state.studyItems) state.studyItems = [];

  // Add button
  const addBtn = document.getElementById('add-study-btn');
  if (addBtn && !addBtn._bound) {
    addBtn._bound = true;
    addBtn.addEventListener('click', () => {
      populateSubjectSelect('study-subject-input');
      document.getElementById('study-date-input').value = '';
      document.getElementById('study-content-input').value = '';
      openModal('modal-study');
    });
  }

  // Save new
  const saveBtn = document.getElementById('save-study-btn');
  if (saveBtn && !saveBtn._bound) {
    saveBtn._bound = true;
    saveBtn.addEventListener('click', saveStudyItem);
  }

  // Save edit
  const saveEditBtn = document.getElementById('save-edit-study-btn');
  if (saveEditBtn && !saveEditBtn._bound) {
    saveEditBtn._bound = true;
    saveEditBtn.addEventListener('click', saveEditStudyItem);
  }

  // Filter tabs
  const tabs = document.querySelectorAll('#study-filter-tabs .filter-btn');
  tabs.forEach(btn => {
    if (!btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', () => {
        tabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderStudyPage();
      });
    }
  });

  // Close modals
  ['modal-study','modal-edit-study'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el._bound) {
      el._bound = true;
      el.addEventListener('click', e => { if (e.target === el) closeModal(id); });
    }
  });

  // Event delegation on study list
  const list = document.getElementById('study-list');
  if (list && !list._studyBound) {
    list._studyBound = true;
    list.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-study-action]');
      if (!btn) return;
      const id  = btn.dataset.id;
      const act = btn.dataset.studyAction;
      if (act === 'toggle') toggleStudyItem(id);
      if (act === 'edit')   openEditStudyItem(id);
      if (act === 'delete') confirmDelete('study', id);
    });
  }
}

function saveStudyItem() {
  const content   = document.getElementById('study-content-input').value.trim();
  const subjectId = document.getElementById('study-subject-input').value;
  const date      = document.getElementById('study-date-input').value || null;

  if (!content) return showNotification('Digite o conteúdo!', 'warning');

  if (!state.studyItems) state.studyItems = [];
  state.studyItems.push({
    id: Date.now().toString(),
    content,
    subjectId,
    date,
    done: false,
    doneAt: null,
    createdAt: Date.now(),
  });

  saveState();
  closeModal('modal-study');
  document.getElementById('study-content-input').value = '';
  generateDynamicMissions();
  renderStudyPage();
  showNotification('📘 Conteúdo adicionado!', 'info');
}

function openEditStudyItem(id) {
  id = String(id);
  const item = (state.studyItems || []).find(i => i.id === id);
  if (!item) return;
  document.getElementById('edit-study-id').value      = id;
  document.getElementById('edit-study-content').value = item.content;
  document.getElementById('edit-study-date').value    = item.date || '';
  populateSubjectSelect('edit-study-subject');
  document.getElementById('edit-study-subject').value = item.subjectId || '';
  openModal('modal-edit-study');
}

function saveEditStudyItem() {
  const id      = document.getElementById('edit-study-id').value;
  const content = document.getElementById('edit-study-content').value.trim();
  const subject = document.getElementById('edit-study-subject').value;
  const date    = document.getElementById('edit-study-date').value || null;

  if (!content) return showNotification('Digite o conteúdo!', 'warning');

  const item = (state.studyItems || []).find(i => i.id === id);
  if (!item) return;
  item.content   = content;
  item.subjectId = subject;
  item.date      = date;

  saveState();
  closeModal('modal-edit-study');
  renderStudyPage();
  showNotification('✏️ Conteúdo atualizado!', 'success');
}

function toggleStudyItem(id) {
  id = String(id);
  const item = (state.studyItems || []).find(i => i.id === id);
  if (!item) return;

  item.done  = !item.done;
  item.doneAt = item.done ? Date.now() : null;

  if (item.done) {
    state.totalStudied = (state.totalStudied || 0) + 1;
    const xpBoost   = consumeBoost('xp_boost');
    const coinBoost = consumeBoost('coin_boost');
    const xp    = xpBoost   ? STUDY_XP * 2    : STUDY_XP;
    const coins = coinBoost ? STUDY_COINS * 2 : STUDY_COINS;

    addXp(xp);
    addCoins(coins);
    markStudyToday();
    updateMissionProgress('studiedToday', 1);
    updateWeeklyMissionProgress('studiedThisWeek', 1);
    showXpPopup(xp, xpBoost);
    showNotification('📘 Conteúdo estudado! +' + xp + ' XP', 'success');
    playSound('complete');
    checkAchievements();
  }

  saveState();
  renderStudyPage();
  updateDashboard();
}

function deleteStudyItem(id) {
  id = String(id);
  state.studyItems = (state.studyItems || []).filter(i => i.id !== id);
  saveState();
  renderStudyPage();
  showNotification('🗑️ Conteúdo removido.', 'info');
}

function renderStudyPage() {
  if (!state.studyItems) state.studyItems = [];
  initStudyPage();

  // Populate subject filter
  const subjSel = document.getElementById('study-subject-filter');
  if (subjSel) {
    const cur = subjSel.value;
    subjSel.innerHTML = '<option value="">Todas as matérias</option>' +
      (state.subjects || []).map(s => '<option value="' + s.id + '">' + s.emoji + ' ' + s.name + '</option>').join('');
    subjSel.value = cur;
  }

  const activeFilter  = (document.querySelector('#study-filter-tabs .filter-btn.active') || {}).dataset?.sfilter || 'all';
  const subjectFilter = subjSel ? subjSel.value : '';
  const today         = todayStr();

  // Smart suggestion: if low grades exist, suggest study
  renderStudySuggestion();

  // Filter items
  let items = (state.studyItems || []).slice();
  if (subjectFilter) items = items.filter(i => i.subjectId === subjectFilter);
  if (activeFilter === 'pending') items = items.filter(i => !i.done);
  if (activeFilter === 'done')    items = items.filter(i =>  i.done);

  // Apply sort preference
  applySortSelect('study');
  var _sk = sortPrefs['study'] || 'status';
  if (_sk === 'status') {
    items.sort(function(a, b) {
      var sa = a.done ? 1 : 0, sb = b.done ? 1 : 0;
      if (sa !== sb) return sa - sb;
      if (a.date && b.date) return a.date.localeCompare(b.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return (b.createdAt||0) - (a.createdAt||0);
    });
  } else {
    items = sortArray(items, _sk);
  }

  // Progress bar
  const total   = state.studyItems.length;
  const studied = state.studyItems.filter(i => i.done).length;
  const wrap    = document.getElementById('study-progress-wrap');
  if (wrap) {
    wrap.style.display = total > 0 ? 'block' : 'none';
    const pct = total > 0 ? Math.round(studied / total * 100) : 0;
    document.getElementById('study-progress-text').textContent = studied + ' / ' + total + ' conteúdos estudados';
    document.getElementById('study-progress-pct').textContent  = pct + '%';
    document.getElementById('study-progress-fill').style.width = pct + '%';
  }

  const container = document.getElementById('study-list');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">📘</span><p>' +
      (activeFilter === 'all' ? 'Nenhum conteúdo ainda. Clique em "+ Novo Conteúdo"!' :
       activeFilter === 'pending' ? 'Nenhum conteúdo pendente!' : 'Nenhum conteúdo estudado ainda.') +
      '</p></div>';
    return;
  }

  // Separate into pending / done for "all" view
  if (activeFilter === 'all') {
    const pending = items.filter(i => !i.done);
    const done    = items.filter(i =>  i.done);
    let html = '';
    if (pending.length) {
      html += '<div class="study-section-header pending-hdr">📖 Para Estudar <span class="task-section-badge">' + pending.length + '</span></div>';
      html += pending.map(renderStudyItem).join('');
    }
    if (done.length) {
      html += '<div class="study-section-header done-hdr">✅ Estudados <span class="task-section-badge">' + done.length + '</span></div>';
      html += done.map(renderStudyItem).join('');
    }
    container.innerHTML = html;
  } else {
    container.innerHTML = items.map(renderStudyItem).join('');
  }
}

function renderStudyItem(item) {
  const subj    = (state.subjects || []).find(s => s.id === item.subjectId);
  const today   = todayStr();
  let dateTag   = '';
  if (item.done && item.doneAt) {
    dateTag = '<span class="study-date-tag done-tag">✅ ' + new Date(item.doneAt).toLocaleDateString('pt-BR') + '</span>';
  } else if (item.date) {
    if (item.date < today) {
      dateTag = '<span class="study-date-tag overdue">⚠️ ' + item.date + '</span>';
    } else if (item.date === today) {
      dateTag = '<span class="study-date-tag today">🔔 Hoje</span>';
    } else {
      dateTag = '<span class="study-date-tag">📅 ' + item.date + '</span>';
    }
  }

  return '<div class="study-item ' + (item.done ? 'studied' : '') + '" data-study-id="' + item.id + '">' +
    '<div class="study-check" data-study-action="toggle" data-id="' + item.id + '">' + (item.done ? '✅' : '') + '</div>' +
    '<div class="study-info">' +
    '<div class="study-content">' + item.content + ' ' + dateTag + '</div>' +
    '<div class="study-meta">' + (subj ? subj.emoji + ' ' + subj.name + ' · ' : '') +
      (item.done ? 'Estudado' : 'Pendente') + ' · ⚡ +' + STUDY_XP + ' XP</div>' +
    '</div>' +
    '<div class="item-actions">' +
    '<button class="btn-icon-edit"   data-study-action="edit"   data-id="' + item.id + '" title="Editar">✏️</button>' +
    '<button class="btn-icon-delete" data-study-action="delete" data-id="' + item.id + '" title="Excluir">🗑️</button>' +
    '</div>' +
    '</div>';
}

function renderStudySuggestion() {
  const box = document.getElementById('study-suggestion');
  if (!box) return;

  // Check for low exam grades
  const lowGrades = (state.exams || []).filter(e => e.status === 'done' && e.grade !== null && e.grade < getSchoolAverage());
  if (!lowGrades.length) { box.style.display = 'none'; return; }

  // Group by subject
  const subjMap = {};
  lowGrades.forEach(e => {
    if (e.subjectId) subjMap[e.subjectId] = (subjMap[e.subjectId] || 0) + 1;
  });
  const suggestions = Object.entries(subjMap).map(([sid, count]) => {
    const s = (state.subjects || []).find(s => s.id === sid);
    return s ? s.emoji + ' ' + s.name + ' (' + count + ' prova(s) abaixo de 7)' : null;
  }).filter(Boolean);

  if (!suggestions.length) { box.style.display = 'none'; return; }

  box.style.display = 'block';
  box.innerHTML = '<div class="study-suggestion-box">💡 <strong>Sugestão:</strong> Você tem notas baixas em: ' +
    suggestions.join(', ') + '. Considere adicionar conteúdos de revisão!</div>';
}

// confirmDelete handles 'study' type via initEditDelete's confirm-delete-btn
// The study branch calls deleteStudyItem(id) when type === 'study'




// ============================================================
// AUTENTICAÇÃO — Login / Cadastro (Frontend + Backend)
// ============================================================

// ── Configuração da API ───────────────────────────────────
const API_URL = "https://studyquest-4ylx.onrender.com/api";
// ↑ IMPORTANTE: sempre termina com /api
// Rotas ficam: /api/login, /api/register, /api/data, /api/health

console.log('[API] URL base:', API_URL);

// ╔══════════════════════════════════════════════════════════════╗
// ║            SISTEMA OFFLINE-FIRST — StudyQuest               ║
// ╚══════════════════════════════════════════════════════════════╝

const API_TIMEOUT_MS = 60000; // 60s — comporta cold start do Render free tier
const API_WARMUP_MS  =  5000; // avisa o usuário após 5s de espera

// ── 1. apiFetch — fetch central com timeout e cold-start warning ──────────────
// Toda chamada à API passa por aqui.
// Login e register usam diretamente (nunca entram em fila offline).
// syncStateToAPI verifica navigator.onLine antes de chamar apiFetch.
// externalSignal → passado por handleLogin para permitir cancelamento pelo usuário
async function apiFetch(path, options = {}, { signal: externalSignal } = {}) {
  const controller = new AbortController();
  const url        = `${API_URL}${path}`;

  // Propaga cancelamento externo (ex: usuário clica "Usar modo offline")
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  // Avisa se demorar mais de 5s (Render cold start)
  const warmupTimer  = setTimeout(() => {
    console.warn('[API] Servidor demorando — cold start do Render...');
    showNotification('⏳ Servidor acordando, aguarde alguns segundos…', 'info');
  }, API_WARMUP_MS);

  // Cancela após 60s para não travar a UI infinitamente
  const timeoutTimer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Tempo esgotado. O servidor pode estar iniciando. Tente novamente em instantes.');
    }
    throw err;
  } finally {
    clearTimeout(warmupTimer);
    clearTimeout(timeoutTimer);
  }
}

// ── 2. Fila offline — persiste no localStorage ────────────────────────────────
const OFFLINE_QUEUE_KEY = 'sq_offlineQueue';

function getOfflineQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); }
  catch (e) { return []; }
}

function setOfflineQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

// Adiciona uma ação à fila.
// Para POST /data faz deduplicação: mantém apenas a versão mais recente
// (evita enviar estados desatualizados quando voltar online).
function addToOfflineQueue(path, options) {
  const queue    = getOfflineQueue();
  const isData   = path === '/data' && options.method === 'POST';

  // Remove entradas anteriores do mesmo tipo para guardar só a última
  const filtered = isData
    ? queue.filter(item => !(item.path === '/data' && item.options.method === 'POST'))
    : queue;

  filtered.push({ path, options, timestamp: Date.now() });
  setOfflineQueue(filtered);
  console.log('[Offline] Ação salva na fila. Total na fila:', filtered.length);
}

// ── 3. Sincronização da fila quando voltar online ─────────────────────────────
async function flushOfflineQueue() {
  const queue = getOfflineQueue();
  if (!queue.length) return;

  console.log('[Offline] Sincronizando dados...', queue.length, 'ação(ões) na fila.');
  showNotification('🔄 Sincronizando dados salvos offline…', 'info');

  let failedAt = -1;

  for (let i = 0; i < queue.length; i++) {
    const token = getToken();
    if (!token) { failedAt = i; break; } // usuário deslogou

    // Recria options injetando o token atual (pode ter expirado antes)
    const opts = JSON.parse(JSON.stringify(queue[i].options));
    if (opts.headers) opts.headers['Authorization'] = 'Bearer ' + token;

    try {
      const res = await apiFetch(queue[i].path, opts);
      if (!res.ok) {
        console.warn('[Offline] Falha ao sincronizar item', i, '— status:', res.status);
        failedAt = i;
        break;
      }
    } catch (err) {
      console.warn('[Offline] Erro ao sincronizar item', i, ':', err.message);
      failedAt = i;
      break;
    }
  }

  if (failedAt === -1) {
    setOfflineQueue([]);
    setAuthMode('online'); // retorna ao modo online após sincronização bem-sucedida
    console.log('[Offline] ✅ Sincronização concluída! Fila limpa. Modo: online.');
    showNotification('✅ Dados sincronizados com sucesso!', 'success');
    _renderOfflineIndicator(); // atualiza o indicador para 🟢 Online
  } else {
    setOfflineQueue(queue.slice(failedAt)); // mantém o que não foi enviado
    console.warn('[Offline] Sincronização parcial.', queue.slice(failedAt).length, 'item(s) restante(s).');
  }
}

// ── 5. Botões de instalação PWA ────────────────────────────────────────────────
function initPWAButtons() {
  const btnTopbar   = document.getElementById('install-btn-topbar');
  const btnSettings = document.getElementById('install-btn-settings');
  const btnLogin    = document.getElementById('install-btn-login');
  const btnRegister = document.getElementById('install-btn-register');
  if (btnTopbar)   btnTopbar.addEventListener('click',   triggerPWAInstall);
  if (btnSettings) btnSettings.addEventListener('click', triggerPWAInstall);
  if (btnLogin)    btnLogin.addEventListener('click',    triggerPWAInstall);
  if (btnRegister) btnRegister.addEventListener('click', triggerPWAInstall);
}

// ── 4. Indicador visual de status online/offline ──────────────────────────────
function initOfflineStatus() {
  // Cria o elemento de status (injetado uma única vez no body)
  if (document.getElementById('offline-indicator')) return;

  const el = document.createElement('div');
  el.id = 'offline-indicator';
  el.style.cssText = [
    'position:fixed', 'bottom:18px', 'right:18px', 'z-index:9998',
    'padding:5px 12px', 'border-radius:20px',
    'font-size:0.72rem', 'font-weight:700', 'letter-spacing:0.02em',
    'display:flex', 'align-items:center', 'gap:5px',
    'pointer-events:none', 'user-select:none',
    'transition:opacity 0.4s ease, transform 0.4s ease',
    'box-shadow:0 2px 10px rgba(0,0,0,0.25)',
  ].join(';');
  document.body.appendChild(el);

  _renderOfflineIndicator();

  // Reage à restauração da conexão
  window.addEventListener('online', () => {
    console.log('[Offline] Conexão restaurada.');
    if (isOfflineMode()) {
      // Voltou online em modo offline → sincroniza dados pendentes
      console.log('[Offline] Sincronizando dados...');
      showNotification('🔄 Sincronizando dados...', 'info');
      flushOfflineQueue(); // internamente chama setAuthMode('online') e _renderOfflineIndicator()
    } else {
      _renderOfflineIndicator();
      flushOfflineQueue(); // garante fila vazia no modo online normal
    }
  });

  // Reage à perda de conexão
  window.addEventListener('offline', () => {
    console.log('[Offline] Conexão perdida.');
    if (isOnlineMode()) {
      // Estava online → transita para offline
      setAuthMode('offline');
      console.log('[Auth] Modo offline ativado.');
    }
    _renderOfflineIndicator();
    showNotification('📶 Você está offline. Alterações serão salvas quando voltar.', 'warning');
  });
}

// Atualiza visual do indicador conforme o modo de autenticação atual
function _renderOfflineIndicator() {
  const el = document.getElementById('offline-indicator');
  if (!el) return;
  clearTimeout(el._hideTimer);

  // ── Offline 🔴 — permanente (não some até voltar online) ──
  if (isOfflineMode()) {
    el.innerHTML        = 'Offline 🔴';
    el.style.color      = '#ef4444';
    el.style.background = 'rgba(239,68,68,0.12)';
    el.style.border     = '1px solid rgba(239,68,68,0.4)';
    el.style.opacity    = '1';
    el.style.transform  = 'translateY(0)';
    return; // permanente — não some
  }

  // ── Online 🟢 ─────────────────────────────────────────
  const connected = navigator.onLine;
  el.innerHTML        = connected ? 'Online 🟢' : 'Offline 🔴';
  el.style.color      = connected ? '#10b981' : '#ef4444';
  el.style.background = connected ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
  el.style.border     = `1px solid ${connected ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`;
  el.style.opacity    = '1';
  el.style.transform  = 'translateY(0)';

  // 🟢 Online: some após 3s para não poluir a tela
  if (connected) {
    el._hideTimer = setTimeout(() => {
      el.style.opacity   = '0';
      el.style.transform = 'translateY(6px)';
    }, 3000);
  }
}

// ── Helpers de token JWT ──────────────────────────────────
function getToken()        { return localStorage.getItem('sq_token'); }
function setToken(t)       { localStorage.setItem('sq_token', t); }
function clearToken()      { localStorage.removeItem('sq_token'); }

// ── Estado de autenticação persistido ─────────────────────
// Formato: { mode: "online" | "offline", updatedAt: timestamp }
const AUTH_MODE_KEY = 'sq_authMode';

function getAuthMode() {
  try { return JSON.parse(localStorage.getItem(AUTH_MODE_KEY) || '{}'); }
  catch (e) { return {}; }
}
function setAuthMode(mode) {
  localStorage.setItem(AUTH_MODE_KEY, JSON.stringify({ mode, updatedAt: Date.now() }));
}
function clearAuthMode() {
  localStorage.removeItem(AUTH_MODE_KEY);
}

// ╔══════════════════════════════════════════════════════════════╗
// ║   MODOS DE AUTENTICAÇÃO — StudyQuest                         ║
// ║                                                              ║
// ║   "online"   → conectado ao backend, dados sincronizados    ║
// ║   "offline"  → sem conexão, dados locais (localStorage)     ║
// ╚══════════════════════════════════════════════════════════════╝

function getCurrentMode() { return (getAuthMode().mode) || null; }
function isOnlineMode()   { return getCurrentMode() === 'online'; }
function isOfflineMode()  { return getCurrentMode() === 'offline'; }

// ── Ativar modo OFFLINE ───────────────────────────────────
// Carrega dados do localStorage. Não chama API.
// Se vier a ter token depois, sincroniza automaticamente ao voltar online.
function activateOfflineMode() {
  console.log('[Auth] Modo offline ativado.');
  setAuthMode('offline');
  localStorage.setItem('sq_loggedIn', 'true');
  _renderOfflineIndicator();
  launchApp();
}

// Exibe o painel "⚡ Continuar offline" abaixo do botão de login.
// Chamado após ~12s sem resposta do servidor.
// Ao clicar: cancela o fetch e ativa modo offline com dados do localStorage.
function _showOfflineModeOffer(loginAbortCtrl) {
  if (document.getElementById('offline-offer')) return; // já visível
  console.log('[Auth] Servidor não respondeu — oferecendo modo offline.');

  const savedUser  = getAuthUser();
  const savedState = loadLocalData(); // usa função canônica (inclui migração)
  const subtitle   = (savedUser && savedUser.id && savedState)
    ? `Dados de <b>${savedUser.email}</b> salvos localmente serão carregados.`
    : 'Seus dados locais serão carregados (ou um novo perfil será criado).';

  const el = document.createElement('div');
  el.id = 'offline-offer';
  el.style.cssText = [
    'margin-top:12px', 'padding:12px 14px', 'border-radius:10px',
    'background:rgba(239,68,68,0.06)', 'border:1px solid rgba(239,68,68,0.25)',
    'text-align:center', 'animation:fadeIn .3s ease',
  ].join(';');
  el.innerHTML =
    `<p style="margin:0 0 4px;font-size:0.8rem;color:var(--text-secondary,#aaa)">` +
      `🐢 Servidor não está respondendo...` +
    `</p>` +
    `<p style="margin:0 0 10px;font-size:0.75rem;color:var(--text-secondary,#888)">${subtitle}</p>` +
    `<button id="offline-offer-btn" style="` +
      `cursor:pointer;border:none;border-radius:8px;padding:8px 18px;` +
      `background:#ef4444;color:#fff;font-weight:700;font-size:0.85rem;` +
      `width:100%;transition:opacity .2s` +
    `">🔴 Continuar offline</button>`;

  const loginBtn = document.getElementById('login-btn');
  if (loginBtn && loginBtn.parentNode) {
    loginBtn.parentNode.insertBefore(el, loginBtn.nextSibling);
  }

  document.getElementById('offline-offer-btn').addEventListener('click', () => {
    loginAbortCtrl.abort(); // cancela o fetch em andamento
    activateOfflineMode();  // sempre ativa modo offline (usa dados do localStorage)
  });
}

// Remove o painel de oferta de modo offline
function _removeOfflineModeOffer() {
  const el = document.getElementById('offline-offer');
  if (el) el.remove();
}

// ── Auth state helpers ────────────────────────────────────
function isLoggedIn() {
  // Online (tem token) OU offline (modo ativo no localStorage)
  const hasToken  = !!getToken();
  const offline   = isOfflineMode();
  const mode      = getCurrentMode();
  console.log('[Auth] isLoggedIn → token:', hasToken, '| mode:', mode);
  return hasToken || offline;
}

function getAuthUser() {
  try { return JSON.parse(localStorage.getItem('sq_authUser') || 'null'); } catch(e) { return null; }
}

function setAuthUser(user) {
  localStorage.setItem('sq_authUser', JSON.stringify(user));
  localStorage.setItem('sq_loggedIn', 'true');
}

function clearAuth() {
  localStorage.removeItem('sq_loggedIn');
  // Keep sq_authUser for pre-fill on next login attempt
}

// ── Screen switcher ───────────────────────────────────────
function showAuthScreen() {
  // Redireciona para a landing page ao invés de mostrar a tela de login inline.
  // A landing page detecta sessão ativa e redireciona de volta ao app automaticamente.
  window.location.replace('./landing.html');
}

function showAuthPanel(panel) {
  document.getElementById('auth-login').classList.toggle('active', panel === 'login');
  document.getElementById('auth-register').classList.toggle('active', panel === 'register');
  clearAuthErrors();
}

function clearAuthErrors() {
  ['login-error','reg-error'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.textContent = ''; }
  });
}

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

// ── Password helpers ──────────────────────────────────────
function checkPasswordStrength(password) {
  let score = 0;
  if (password.length >= 6)  score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score; // 0–5
}

function updateStrengthBar(password) {
  const bar = document.getElementById('reg-strength');
  if (!bar) return;
  const score = checkPasswordStrength(password);
  const widths = ['0%','20%','40%','60%','85%','100%'];
  const colors = ['transparent','var(--danger)','var(--warning)','var(--warning)','var(--success)','var(--success)'];
  const labels = ['','Muito fraca','Fraca','Razoável','Boa','Forte'];
  bar.style.setProperty('--strength-w',     widths[score]);
  bar.style.setProperty('--strength-color', colors[score]);
  bar.title = labels[score];
}

// ── Login logic ───────────────────────────────────────────
// Flag que impede múltiplas chamadas simultâneas (evita loop por clique duplo)
let _loginInProgress = false;

async function handleLogin() {
  // Proteção contra duplo clique / Enter + clique simultâneo
  if (_loginInProgress) {
    console.warn('[Login] Requisição já em andamento, ignorando chamada duplicada.');
    return;
  }

  const email    = (document.getElementById('login-email').value    || '').trim();
  const password =  document.getElementById('login-password').value || '';

  clearAuthErrors();

  // Validações locais
  if (!email)               return showAuthError('login-error', '⚠️ Digite seu e-mail.');
  if (!email.includes('@')) return showAuthError('login-error', '⚠️ E-mail inválido.');
  if (!password)            return showAuthError('login-error', '⚠️ Digite sua senha.');

  if (!sb) return showAuthError('login-error', '⚠️ Serviço indisponível. Tente o modo offline.');

  _loginInProgress = true;
  const btn = document.getElementById('login-btn');
  btn.disabled    = true;
  btn.textContent = 'Entrando...';

  console.log('[Login] Iniciado via Supabase para:', email);

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
      console.warn('[Login] Erro Supabase:', error.message);
      // Traduz as mensagens mais comuns
      if (error.message.includes('Invalid login credentials')) {
        showAuthError('login-error', '❌ E-mail ou senha incorretos.');
      } else if (error.message.includes('Email not confirmed')) {
        showAuthError('login-error', '⚠️ Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.');
      } else {
        showAuthError('login-error', '❌ ' + error.message);
      }
      return;
    }

    // ── Sucesso ──────────────────────────────────────────────
    const user = data.user;
    console.log('[Auth] Login Supabase bem-sucedido:', user.email);
    authUserId = user.id;
    setAuthUser({ email: user.email, id: user.id, createdAt: Date.now(), provider: 'email' });
    setAuthMode('online');
    await launchApp();

  } catch (err) {
    console.error('[Login] ❌ Exceção:', err.message);
    showAuthError('login-error', '⚠️ Não foi possível conectar. Verifique sua conexão e tente novamente.');

  } finally {
    _loginInProgress = false;
    btn.disabled    = false;
    btn.textContent = '🚀 Entrar';
  }
}

// ── Register logic ────────────────────────────────────────
// Flag que impede múltiplas chamadas simultâneas
let _registerInProgress = false;

async function handleRegister() {
  if (_registerInProgress) {
    console.warn('[Register] Requisição já em andamento, ignorando chamada duplicada.');
    return;
  }

  const email    = (document.getElementById('reg-email').value    || '').trim();
  const password =  document.getElementById('reg-password').value || '';
  const confirm  =  document.getElementById('reg-confirm').value  || '';

  clearAuthErrors();

  // Validações locais
  if (!email)               return showAuthError('reg-error', '⚠️ Digite seu e-mail.');
  if (!email.includes('@')) return showAuthError('reg-error', '⚠️ E-mail inválido.');
  if (!password)            return showAuthError('reg-error', '⚠️ Crie uma senha.');
  if (password.length < 6)  return showAuthError('reg-error', '⚠️ Senha deve ter ao menos 6 caracteres.');
  if (password !== confirm)  return showAuthError('reg-error', '❌ As senhas não coincidem.');

  if (!sb) return showAuthError('reg-error', '⚠️ Serviço indisponível. Tente o modo offline.');

  _registerInProgress = true;
  const btn = document.getElementById('register-btn');
  btn.disabled    = true;
  btn.textContent = 'Criando conta...';

  console.log('[Register] Tentando criar conta via Supabase para:', email);

  try {
    const { data, error } = await sb.auth.signUp({ email, password });

    if (error) {
      console.warn('[Register] Erro Supabase:', error.message);
      if (error.message.includes('already registered') || error.message.includes('User already registered')) {
        showAuthError('reg-error', '❌ Este e-mail já possui uma conta. Faça login.');
      } else {
        showAuthError('reg-error', '❌ ' + error.message);
      }
      return;
    }

    // ── Sucesso ──────────────────────────────────────────────
    console.log('[Register] ✅ Conta criada via Supabase para:', email);

    // Supabase pode exigir confirmação de e-mail dependendo das configurações
    // Se o usuário foi criado e já tem sessão, entra direto; se não, pede confirmação
    if (data.session) {
      // Confirmação de e-mail desativada → entra direto
      authUserId = data.user.id;
      setAuthUser({ email: data.user.email, id: data.user.id, createdAt: Date.now(), provider: 'email' });
      setAuthMode('online');
      showNotification('✅ Conta criada com sucesso! Bem-vindo(a)!', 'success');
      await launchApp();
    } else {
      // Confirmação de e-mail ativada → tenta login direto mesmo assim
      // (funciona se o Supabase não exigir confirmação para este projeto)
      console.log('[Register] Sem sessão automática — tentando login direto...');
      const { data: loginData, error: loginError } = await sb.auth.signInWithPassword({ email, password });
      if (!loginError && loginData?.session) {
        authUserId = loginData.user.id;
        setAuthUser({ email: loginData.user.email, id: loginData.user.id, createdAt: Date.now(), provider: 'email' });
        setAuthMode('online');
        showNotification('✅ Conta criada com sucesso! Bem-vindo(a)!', 'success');
        await launchApp();
      } else {
        // Confirmação de e-mail realmente necessária
        showNotification('✅ Conta criada! Confirme seu e-mail para entrar.', 'success');
        const loginEmail = document.getElementById('login-email');
        if (loginEmail) loginEmail.value = email;
        showAuthPanel('login');
      }
    }

  } catch (err) {
    console.error('[Register] ❌ Exceção:', err.message);
    showAuthError('reg-error', '⚠️ Não foi possível criar a conta. Verifique sua conexão e tente novamente.');

  } finally {
    _registerInProgress = false;
    btn.disabled    = false;
    btn.textContent = '⚔️ Criar Conta';
  }
}

// ── Botão "Entrar sem conta" / demo ───────────────────────
// Entra no app em modo offline com dados locais existentes (ou estado vazio)
function handleDemo() {
  activateOfflineMode();
}

// ── Launch / Hide helpers ─────────────────────────────────
function hideAuthScreen() {
  const authScreen = document.getElementById('auth-screen');
  authScreen.classList.remove('active');
  authScreen.style.display = 'none';
}

async function launchApp() {
  hideAuthScreen();
  _showAppLoading(true);

  if (authUserId) {
    // ════════════════════════════════════════════════════
    // CAMINHO A — Google Auth
    // Supabase é a ÚNICA fonte de verdade.
    // loadLocalData() NÃO é chamado aqui para não sobrescrever.
    // ════════════════════════════════════════════════════
    console.log('[App] Google Auth — carregando state do Supabase...');

    if (navigator.onLine) {
      const cloudState = await Promise.race([
        loadUserData(),
        new Promise(resolve => setTimeout(() => { console.warn('[Supabase] Timeout ao carregar dados — continuando.'); resolve(null); }, 7000))
      ]);
      if (cloudState) {
        state = _mergeCloudState(state, cloudState);
        saveLocalData(state); // espelha no localStorage para fallback offline
        console.log('[Supabase] State aplicado — XP:', state.xp,
                    '| Nível:', state.level, '| Nome:', state.name);
      } else {
        // Primeiro login ou timeout — sem dados na nuvem ainda. State permanece no default.
        console.log('[Supabase] Sem dados na nuvem (ou timeout) — novo usuário Google / fallback.');
      }
    } else {
      // Offline com conta Google → usa espelho local (gravado por saveLocalData)
      loadState();
      console.log('[App] Google Auth offline — usando espelho local.');
    }

  } else {
    // ════════════════════════════════════════════════════
    // CAMINHO B — JWT (backend) ou modo offline
    // localStorage é a base; Supabase (UUID local) sincroniza por cima.
    // ════════════════════════════════════════════════════
    console.log('[Auth] Carregando dados locais...');
    loadState();
    console.log('[App] State local carregado. Setup:', state.setup,
                '| Modo:', getCurrentMode());

    if (isOfflineMode()) {
      console.log('[Auth] Modo offline — dados locais carregados.');
      showNotification('🔴 Modo offline ativo. Dados locais carregados.', 'info');

    } else if (getToken()) {
      await loadUserDataFromAPI();

      if (!getToken()) {           // 401 → token expirado
        _showAppLoading(false);
        showAuthScreen();
        showNotification('Sessão expirada. Faça login novamente.', 'warning');
        return;
      }
      setAuthMode('online');
      console.log('[Auth] Modo online (JWT) ativo.');
    }

    // Supabase UUID-local: sincroniza XP/level para usuários sem conta Google
    if (navigator.onLine) {
      const cloudState = await Promise.race([
        loadUserData(), // usa UUID do localStorage
        new Promise(resolve => setTimeout(() => { console.warn('[Supabase] Timeout ao sincronizar — continuando.'); resolve(null); }, 7000))
      ]);
      if (cloudState) {
        const cloudXP = cloudState.xp || 0;
        const localXP = state.xp      || 0;
        if (cloudXP > localXP) {
          state = _mergeCloudState(state, cloudState);
          saveLocalData(state);
          console.log('[Supabase] XP da nuvem aplicado:', cloudXP);
        } else if (localXP > cloudXP) {
          saveUserData(state); // sobe o progresso local para a nuvem
        } else {
          // XP igual: aplica dados da nuvem mas preserva schedule/tarefas locais
          state = _mergeCloudState(state, cloudState);
        }
      }
    }
  }

  _renderOfflineIndicator(); // atualiza indicador com o modo atual
  _showAppLoading(false);

  if (state.setup) {
    // Usuário já criou herói → vai para o app
    const setup = document.getElementById('setup-screen');
    const app   = document.getElementById('app');
    setup.classList.remove('active');
    setup.style.display = 'none';
    app.classList.add('active');
    app.style.display = ''; // ← limpa display:none inline (definido por showAuthScreen/logout)

    console.log('[Data] Aplicando dados na interface...');
    initShop();
    checkDailyReset();
    checkStreakIntegrity();
    autoArchiveTasks();
    generateDailyTasks();
    updateAllUI();
    // Determina página inicial: URL atual → localStorage (persistido entre refreshes) → sessionStorage (404.html) → dashboard
    const _urlPage = window.location.pathname.replace(/^\//, '').split('/')[0];
    const _savedPage = localStorage.getItem('sq_current_page');
    const _storedPage = sessionStorage.getItem('sq_spa_redirect');
    sessionStorage.removeItem('sq_spa_redirect');
    const _startPage = (_SPA_PAGES.has(_storedPage) && _storedPage)
                    || (_SPA_PAGES.has(_savedPage)   && _savedPage)
                    || (_SPA_PAGES.has(_urlPage)     && _urlPage)
                    || 'dashboard';
    navigateTo(_startPage);
    console.log('[App] App iniciado para:', state.name, '| XP:', state.xp, '| Nível:', state.level, '| Página:', _startPage);
    // Sincroniza perfil público para que amigos possam buscar
    if (authUserId) setTimeout(syncPublicProfile, 2000);
    // Badge família
    if (authUserId) setTimeout(() => updateFamiliaBadge().catch(()=>{}), 3000);
    // Verifica notificações de desempenho, presente surpresa e push inteligente
    setTimeout(() => {
      checkPerformanceNotifs();
      checkSurpriseGift();
      updateNotifBell();
      runSmartPushChecks().catch(() => {}); // streak risk + cronograma
    }, 2000);
  } else {
    // Primeiro acesso → criação de herói
    console.log('[App] Novo usuário → tela de criação de herói.');
    const setup = document.getElementById('setup-screen');
    setup.classList.add('active');
    setup.style.display = '';
  }
}

// Exibe/oculta indicador de carregamento durante chamadas de API
function _showAppLoading(show) {
  let el = document.getElementById('app-loading-overlay');
  if (show) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-loading-overlay';
      el.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:9999',
        'background:var(--bg, #0f0f1a)',
        'display:flex', 'align-items:center', 'justify-content:center',
        'flex-direction:column', 'gap:16px',
        'font-family:var(--font-main, sans-serif)',
        'color:var(--text-primary, #fff)',
      ].join(';');
      el.innerHTML = '<div style="font-size:2.5rem">⚡</div>'
                   + '<div style="font-size:1rem;opacity:.7">Carregando StudyQuest...</div>';
      document.body.appendChild(el);
    }
    el.style.display = 'flex';
  } else if (el) {
    el.style.display = 'none';
  }
}

// ── Logout ────────────────────────────────────────────────
async function logout() {
  console.log('[Auth] Logout efetuado.');
  const wasOffline = isOfflineMode(); // captura antes de limpar o modo

  // Se logado via Google, encerra a sessão no Supabase
  if (sb && authUserId) {
    try {
      await sb.auth.signOut();
      console.log('[Google Auth] Sessão Supabase encerrada.');
    } catch (e) {
      console.warn('[Google Auth] Erro ao fazer signOut:', e.message);
    }
    authUserId = null;
  }

  // Limpa credenciais e modo
  clearToken();
  clearAuthMode();
  localStorage.removeItem('sq_loggedIn');
  localStorage.removeItem('sq_authUser');

  if (wasOffline) {
    // Modo offline: preserva os dados de jogo no localStorage.
    // O usuário pode retomar o progresso na próxima vez que entrar offline.
    console.log('[Data] Modo offline — dados locais preservados para próxima sessão.');
  } else {
    // Modo online: limpa dados de jogo para não vazar entre contas diferentes.
    localStorage.removeItem(LS_SAVE_KEY);
    localStorage.removeItem('studyquest_v3'); // limpa chave legada também
    console.log('[Data] Dados de jogo removidos (logout online).');
  }

  const app   = document.getElementById('app');
  const setup = document.getElementById('setup-screen');
  if (app)   { app.classList.remove('active');   app.style.display   = 'none'; }
  if (setup) { setup.classList.remove('active'); setup.style.display = 'none'; }

  showAuthScreen();
}

// ── API: carregar dados do usuário ────────────────────────
/**
 * Faz GET /api/data e mescla o resultado no state.
 * Retorna true se carregou com sucesso, false caso contrário.
 */
async function loadUserDataFromAPI() {
  const token = getToken();
  if (!token) return;

  console.log('[Auth] Carregando dados locais + backend...');

  try {
    const res = await apiFetch('/data', {
      headers: { 'Authorization': 'Bearer ' + token },
    });

    if (res.status === 401) {
      console.warn('[API] Token inválido ou expirado. Redirecionando para login.');
      clearToken();
      localStorage.removeItem('sq_loggedIn');
      return;
    }

    if (!res.ok) {
      console.warn('[API] Erro ao carregar dados. Status:', res.status);
      return;
    }

    const json = await res.json();

    if (json.data && typeof json.data === 'object' && Object.keys(json.data).length > 0) {
      // Mescla dados da API preservando schedule/tarefas locais mais recentes
      state = _mergeCloudState(state, json.data);
      // Espelha no localStorage como backup offline (via função canônica)
      saveLocalData(state);
      console.log('[API] Dados carregados do backend com sucesso. Setup:', state.setup, '| XP:', state.xp);
    } else {
      console.log('[API] Backend sem dados salvos ainda. Usando localStorage como base.');
    }
  } catch (err) {
    console.warn('[API] Backend indisponível. Usando localStorage:', err.message);
    // Servidor indisponível → entra em modo offline automaticamente
    if (getToken()) {
      setAuthMode('offline');
      console.log('[Auth] Modo offline ativado (servidor indisponível).');
    }
  }
}

// ── API: salvar dados do usuário (offline-aware) ──────────
async function syncStateToAPI() {
  const token = getToken();

  // Sem token (nunca fez login) → nada a sincronizar
  if (!token) return;

  // ── Offline ou sem conexão: enfileira para sincronizar depois ──
  if (!navigator.onLine || isOfflineMode()) {
    console.log('[Offline] Salvando ação na fila (modo offline ou sem conexão).');
    addToOfflineQueue('/data', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({ data: state }),
    });
    return;
  }

  // ── Online: envia direto ──────────────────────────────
  console.log('[API] Salvando dados no backend...');
  try {
    const res  = await apiFetch('/data', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({ data: state }),
    });
    const json = await res.json();

    if (res.ok) {
      console.log('[API] Dados salvos no backend com sucesso!');
    } else {
      // Falha HTTP → enfileira para tentar novamente
      console.warn('[API] Erro ao salvar dados:', json.error || res.status, '— enfileirando.');
      addToOfflineQueue('/data', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ data: state }),
      });
    }
  } catch (err) {
    // Erro de rede → também enfileira
    console.warn('[API] Falha de rede ao salvar — enfileirando:', err.message);
    addToOfflineQueue('/data', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({ data: state }),
    });
  }
}

// ── Debounce de sincronização ─────────────────────────────
/**
 * Agenda o envio do state para a API com atraso de 2 segundos.
 * Se houver várias alterações rápidas, apenas o último é enviado.
 */
let _syncDebounceTimer = null;
function scheduleSyncToAPI() {
  // Sem token → nada a sincronizar (offline sem conta prévia)
  if (!getToken()) return;
  clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(syncStateToAPI, 2000);
}

// ── Google / Supabase Auth ────────────────────────────────

/**
 * Abre o fluxo OAuth do Google via Supabase.
 * O usuário é redirecionado para o Google e volta ao site após autorizar.
 */
async function handleGoogleLogin() {
  if (!sb) {
    showAuthError('login-error', '⚠️ Supabase não disponível.');
    return;
  }
  const btn = document.getElementById('google-btn');
  const btnReg = document.getElementById('google-btn-register');
  if (btn)    { btn.disabled    = true; btn.textContent    = 'Redirecionando...'; }
  if (btnReg) { btnReg.disabled = true; btnReg.textContent = 'Redirecionando...'; }

  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Redireciona de volta para esta mesma página após o login
      redirectTo: window.location.origin + window.location.pathname,
    },
  });

  if (error) {
    console.error('[Google Auth] Erro ao iniciar OAuth:', error.message);
    showAuthError('login-error', '❌ ' + error.message);
    if (btn)    { btn.disabled    = false; btn.textContent    = 'Entrar com Google'; }
    if (btnReg) { btnReg.disabled = false; btnReg.textContent = 'Criar conta com Google'; }
  }
  // Se não houver erro, a página será redirecionada — não é preciso fazer mais nada aqui.
}

/**
 * Ponto de entrada do app quando Supabase está disponível.
 *
 * Chama getSession() PRIMEIRO — sem nenhuma verificação antes.
 * getSession() resolve os dois casos em uma única chamada await:
 *   • Reload normal com sessão existente → retorna a sessão salva
 *   • Redirect OAuth (?code= na URL)     → troca o code e retorna a nova sessão
 *
 * Com sessão  → handleSupabaseSession() → launchApp()
 * Sem sessão  → fluxo normal (JWT / modo offline / tela de login)
 */
async function startApp() {
  console.log('[startApp] Iniciando...');
  try {
    const { data, error } = await sb.auth.getSession();

    if (error) {
      console.warn('[startApp] getSession erro:', error.message);
    }

    const session = data?.session;

    if (session && session.user) {
      console.log('[startApp] Sessão encontrada:', session.user.email, '| provider:', session.user.app_metadata?.provider);
      await handleSupabaseSession(session);
      return;
    }

    console.log('[startApp] Sem sessão Supabase.');
  } catch (e) {
    console.warn('[startApp] Exceção em getSession:', e.message);
  }

  // Sem sessão → modo offline/demo ou tela de login
  if (isOfflineMode()) {
    await launchApp();
  } else {
    showAuthScreen();
  }
}

/**
 * Processa uma sessão Supabase ativa (login novo ou restauração ao recarregar).
 * Define authUserId, armazena user info e chama launchApp().
 */
async function handleSupabaseSession(session) {
  if (!session?.user) return;
  if (authUserId) return; // Guard: evita chamada dupla

  const user     = session.user;
  const provider = user.app_metadata?.provider || 'email';

  authUserId = user.id;
  // Salva foto do Google no state para uso como avatar
  if (provider === 'google' && user.user_metadata?.picture) {
    state.googleAvatarUrl = user.user_metadata.picture;
  } else if (provider === 'google' && user.user_metadata?.avatar_url) {
    state.googleAvatarUrl = user.user_metadata.avatar_url;
  }
  console.log('[Auth] Sessão ativa:', user.email, '| provider:', provider, '| ID:', user.id);

  setAuthUser({ email: user.email, id: user.id, createdAt: Date.now(), provider });
  setAuthMode('online');

  await launchApp();
}

// ── Init auth UI ──────────────────────────────────────────
function initAuth() {
  // Panel switchers
  document.getElementById('go-register').addEventListener('click', () => showAuthPanel('register'));
  document.getElementById('go-login').addEventListener('click',    () => showAuthPanel('login'));

  // Submit buttons
  document.getElementById('login-btn').addEventListener('click',          handleLogin);
  document.getElementById('register-btn').addEventListener('click',       handleRegister);
  document.getElementById('demo-btn').addEventListener('click',           handleDemo);
  document.getElementById('google-btn').addEventListener('click',         handleGoogleLogin);
  document.getElementById('google-btn-register').addEventListener('click',handleGoogleLogin);

  // Enter key submits
  document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  document.getElementById('login-email').addEventListener('keydown',    e => { if (e.key === 'Enter') handleLogin(); });
  document.getElementById('reg-confirm').addEventListener('keydown',    e => { if (e.key === 'Enter') handleRegister(); });

  // Password strength on register
  document.getElementById('reg-password').addEventListener('input', e => updateStrengthBar(e.target.value));

  // Eye toggles (show/hide password)
  document.querySelectorAll('.auth-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      btn.textContent = isText ? '👁' : '🙈';
    });
  });

  // Logout button (in settings page)
  document.addEventListener('click', e => {
    if (e.target && e.target.id === 'logout-btn') {
      if (confirm('Tem certeza que deseja sair?')) logout();
    }
  });

  // Update account email in settings
  const user = getAuthUser();
  const cfgEmail = document.getElementById('cfg-account-email');
  if (cfgEmail && user && user.email) {
    cfgEmail.textContent = '📧 ' + user.email;
  }
}

// ============================================================
// CONFIGURAÇÕES
// ============================================================

function initSettingsPage() {
  if (!state.settings) state.settings = { schoolAverage: 7, notificationsEnabled: true, soundsEnabled: true, confirmDeletes: true, theme: 'dark', focusMode: false };

  // Populate profile preview
  const cfgAvatar = document.getElementById('cfg-avatar');
  const cfgName   = document.getElementById('cfg-name');
  if (cfgAvatar) {
    if ((state.avatarType === 'google' || state.avatarType === 'url' || state.avatarType === 'upload') && state.avatarUrl) {
      cfgAvatar.innerHTML = `<img src="${escHtml(state.avatarUrl)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block">`;
    } else {
      cfgAvatar.textContent = state.avatar || '🧙';
    }
  }
  if (cfgName) cfgName.textContent = state.name || 'Herói';

  // Show logged-in email
  const user = getAuthUser();
  const cfgEmail = document.getElementById('cfg-account-email');
  if (cfgEmail && user && user.email) {
    cfgEmail.textContent = '📧 ' + user.email + (isOfflineMode() ? ' · offline' : '');
  }

  // School average stepper
  const avgDisplay = document.getElementById('avg-display');
  if (avgDisplay) avgDisplay.textContent = state.settings.schoolAverage;

  const avgMinus = document.getElementById('avg-minus');
  const avgPlus  = document.getElementById('avg-plus');
  if (avgMinus && !avgMinus._bound) {
    avgMinus._bound = true;
    avgMinus.addEventListener('click', () => {
      const cur = Number(state.settings.schoolAverage);
      if (cur <= 1) return;
      state.settings.schoolAverage = Math.round((cur - 0.5) * 10) / 10;
      document.getElementById('avg-display').textContent = state.settings.schoolAverage;
      saveState();
      showNotification('📊 Média escolar: ' + state.settings.schoolAverage, 'info');
    });
  }
  if (avgPlus && !avgPlus._bound) {
    avgPlus._bound = true;
    avgPlus.addEventListener('click', () => {
      const cur = Number(state.settings.schoolAverage);
      if (cur >= 10) return;
      state.settings.schoolAverage = Math.round((cur + 0.5) * 10) / 10;
      document.getElementById('avg-display').textContent = state.settings.schoolAverage;
      saveState();
      showNotification('📊 Média escolar: ' + state.settings.schoolAverage, 'info');
    });
  }

  // Toggles — bind once
  function bindToggle(id, key, label, onCallback) {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = !!state.settings[key];
    if (!el._bound) {
      el._bound = true;
      el.addEventListener('change', () => {
        state.settings[key] = el.checked;
        saveState();
        showNotification(label + ': ' + (el.checked ? 'Ativado ✅' : 'Desativado'), 'info');
        if (onCallback) onCallback(el.checked);
      });
    }
  }

  bindToggle('cfg-dark-mode',       'theme',                '🌙 Tema Escuro',          (on) => setTheme(on ? 'dark' : 'light'));
  bindToggle('cfg-notifications',   'notificationsEnabled', '🔔 Notificações',          null);
  bindToggle('cfg-sounds',          'soundsEnabled',        '🔊 Sons',                  null);
  bindToggle('cfg-confirm-delete',  'confirmDeletes',       '🗑️ Confirmações',          null);
  bindToggle('cfg-focus-mode',      'focusMode',            '🎯 Modo Foco',             (on) => { focusMode = on; });

  // Theme toggle syncs with existing theme
  const darkToggle = document.getElementById('cfg-dark-mode');
  if (darkToggle) darkToggle.checked = document.documentElement.dataset.theme === 'dark';

  // Export / Import (moved from sidebar)
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const importFile = document.getElementById('import-file');
  if (exportBtn && !exportBtn._settingsBound) {
    exportBtn._settingsBound = true;
    exportBtn.addEventListener('click', exportData);
  }
  if (importBtn && !importBtn._settingsBound) {
    importBtn._settingsBound = true;
    importBtn.addEventListener('click', () => importFile && importFile.click());
  }
  if (importFile && !importFile._settingsBound) {
    importFile._settingsBound = true;
    importFile.addEventListener('change', (e) => {
      // Confirm before importing
      const proceed = confirm('⚠️ Importar dados substituirá seu progresso atual. Tem certeza?');
      if (!proceed) { e.target.value = ''; return; }
      importData(e);
    });
  }

  // Reset button
  const resetBtn = document.getElementById('reset-all-btn');
  if (resetBtn && !resetBtn._bound) {
    resetBtn._bound = true;
    resetBtn.addEventListener('click', () => {
      document.getElementById('reset-confirm-input').value = '';
      openModal('modal-reset-confirm');
    });
  }

  // Confirm reset
  const confirmResetBtn = document.getElementById('confirm-reset-btn');
  if (confirmResetBtn && !confirmResetBtn._bound) {
    confirmResetBtn._bound = true;
    confirmResetBtn.addEventListener('click', () => {
      const val = document.getElementById('reset-confirm-input').value.trim().toUpperCase();
      if (val !== 'RESETAR') {
        showNotification('Digite "RESETAR" para confirmar.', 'error');
        return;
      }
      resetAllProgress();
    });
  }

  // Close reset modal on overlay
  const resetOverlay = document.getElementById('modal-reset-confirm');
  if (resetOverlay && !resetOverlay._bound) {
    resetOverlay._bound = true;
    resetOverlay.addEventListener('click', e => {
      if (e.target === resetOverlay) closeModal('modal-reset-confirm');
    });
  }

  // ── Push notification preferences UI ──────────────────────
  _updatePushStatusUI().catch(() => {});
  const prefs = state.settings?.pushPrefs || {};
  ['streak','daily','friends','groups','medals'].forEach(type => {
    const el = document.getElementById(`push-pref-${type}`);
    if (el) el.checked = prefs[type] !== false; // default ativado
  });
}

/** Salva preferência de push para um tipo específico */
function savePushPref(type, enabled) {
  if (!state.settings) state.settings = {};
  if (!state.settings.pushPrefs) state.settings.pushPrefs = {};
  state.settings.pushPrefs[type] = !!enabled;
  saveState();
}

function resetAllProgress() {
  const savedSettings = Object.assign({}, state.settings);
  const savedName     = state.name;
  const savedAvatar   = state.avatar;

  // Re-init state keeping only identity + settings
  state = {
    setup: true,
    name: savedName,
    avatar: savedAvatar,
    xp: 0, totalXpEarned: 0, coins: 0, level: 1,
    streak: 0, maxStreak: 0, lastStudyDate: null,
    dailyXp: 0, dailyGoal: 100, lastResetDate: todayStr(),
    subjects: [], tasks: [], taskHistory: [], exams: [],
    achievements: [], boosts: [], dailyMissions: {}, weeklyMissions: {},
    dynamicMissions: [], totalTasksDone: 0, totalPomodoros: 0,
    maxGradeEver: 0, totalPurchases: 0, xpHistory: {}, studyDays: [],
    records: { maxDailyXp: 0, maxStreak: 0, fastestLevelup: null, topGrade: 0 },
    gradeTypes: {}, gradeEntries: {}, studyItems: [], totalStudied: 0,
    settings: savedSettings,
    _subjectsStudiedToday: [],
  };

  initDailyMissions();
  initWeeklyMissions();
  saveState();
  closeModal('modal-reset-confirm');
  updateAllUI();
  navigateTo('dashboard');
  showNotification('🗑️ Progresso resetado. Boa sorte, ' + savedName + '!', 'warning');
}

// ============================================================
// EDITAR PERFIL
// ============================================================

function openEditProfile() {
  document.getElementById('profile-name-input').value = state.name || '';

  const grid = document.getElementById('profile-avatar-grid');
  grid.querySelectorAll('.avatar-opt').forEach(el => {
    el.classList.toggle('selected', el.dataset.av === state.avatar);
  });

  // Foto personalizada
  const urlInput = document.getElementById('profile-url-input');
  if (urlInput) urlInput.value = (state.avatarType === 'url' ? state.avatarUrl : '') || '';

  // Botão de foto do Google (só aparece se logou com Google)
  const gBtn = document.getElementById('profile-google-photo-btn');
  if (gBtn) {
    gBtn.style.display = state.googleAvatarUrl ? 'flex' : 'none';
    gBtn.classList.toggle('active', state.avatarType === 'google');
  }

  // Limpa foto pendente ao reabrir o modal
  state._pendingUploadUrl = null;

  // Destaca tipo ativo
  _updateAvatarTypeUI(state.avatarType || 'emoji');

  // Restaura preview se já tem foto ou URL
  const previewEl = document.getElementById('profile-preview-avatar');
  if (previewEl) {
    if ((state.avatarType === 'upload' || state.avatarType === 'google' || state.avatarType === 'url') && state.avatarUrl) {
      previewEl.innerHTML = `<img src="${escHtml(state.avatarUrl)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    } else {
      previewEl.textContent = state.avatar || '🧙';
    }
  }
  // Restaura status do upload
  if (state.avatarType === 'upload' && state.avatarUrl) {
    const statusEl = document.getElementById('avatar-upload-status');
    const iconEl   = document.getElementById('avatar-upload-icon');
    if (statusEl) statusEl.textContent = 'Foto atual. Toque para trocar.';
    if (iconEl)   iconEl.textContent   = '✅';
  }

  // Populate favorite subject select
  const sel = document.getElementById('profile-fav-subject');
  if (sel) {
    sel.innerHTML = '<option value="">— Nenhuma —</option>' +
      state.subjects.map(s => `<option value="${s.name}" ${s.name === state.favoriteSubject ? 'selected' : ''}>${s.icon || '📚'} ${s.name}</option>`).join('');
  }

  updateProfilePreview();
  openModal('modal-edit-profile');
}

function _updateAvatarTypeUI(type) {
  ['emoji','upload','google','url'].forEach(t => {
    document.getElementById(`avatar-type-${t}`)?.classList.toggle('active', t === type);
  });
  const urlRow    = document.getElementById('avatar-url-row');
  const uploadRow = document.getElementById('avatar-upload-row');
  const emojiRow  = document.getElementById('profile-avatar-grid-wrap');
  if (urlRow)    urlRow.style.display    = type === 'url'    ? 'flex' : 'none';
  if (uploadRow) uploadRow.style.display = type === 'upload' ? ''     : 'none';
  if (emojiRow)  emojiRow.style.display  = type === 'emoji'  ? ''     : 'none';
}

function updateProfilePreview() {
  const nameVal   = document.getElementById('profile-name-input').value.trim() || 'Herói';
  const activeAv  = document.querySelector('#profile-avatar-grid .avatar-opt.selected');
  const avatarVal = activeAv ? activeAv.dataset.av : (state.avatar || '🧙');

  document.getElementById('profile-preview-avatar').textContent = avatarVal;
  document.getElementById('profile-preview-name').textContent   = nameVal;
  document.getElementById('profile-preview-level').textContent  = 'Nível ' + state.level;
}

function initEditProfile() {
  // Avatar picker inside the profile modal
  const grid = document.getElementById('profile-avatar-grid');
  grid.querySelectorAll('.avatar-opt').forEach(el => {
    el.addEventListener('click', () => {
      grid.querySelectorAll('.avatar-opt').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      updateProfilePreview();
    });
  });

  // Live preview on name typing
  const nameInput = document.getElementById('profile-name-input');
  nameInput.addEventListener('input', updateProfilePreview);

  // Save button
  document.getElementById('save-profile-btn').addEventListener('click', saveProfile);

  // Close on overlay click
  const overlay = document.getElementById('modal-edit-profile');
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal('modal-edit-profile');
  });
}

function saveProfile() {
  const name   = document.getElementById('profile-name-input').value.trim();
  const selAv  = document.querySelector('#profile-avatar-grid .avatar-opt.selected');
  const avatar = selAv ? selAv.dataset.av : state.avatar;
  const favSel = document.getElementById('profile-fav-subject');
  const favoriteSubject = favSel ? favSel.value : state.favoriteSubject;

  // Avatar type
  const activeTypeBtn = document.querySelector('.avatar-type-btn.active');
  const avatarType = activeTypeBtn?.dataset.type || 'emoji';
  let avatarUrl = '';
  if (avatarType === 'google') avatarUrl = state.googleAvatarUrl || '';
  if (avatarType === 'url')    avatarUrl = document.getElementById('profile-url-input')?.value.trim() || '';
  if (avatarType === 'upload') avatarUrl = state._pendingUploadUrl || (state.avatarType === 'upload' ? state.avatarUrl : '');
  state.avatarType          = avatarType;
  state.avatarUrl           = avatarUrl;
  state._pendingUploadUrl   = null;  // limpa temporário

  if (!name) return showNotification('Digite seu nome de herói!', 'warning');

  const nameChanged   = name !== state.name;
  const avatarChanged = avatar !== state.avatar || avatarType !== (state.avatarType || 'emoji');

  state.name            = name;
  state.avatar          = avatar;
  state.favoriteSubject = favoriteSubject;
  saveState();

  // Atualiza topbar imediatamente
  document.getElementById('nav-name').textContent  = name;
  document.getElementById('dash-name').textContent = name;
  _renderNavAvatar();

  closeModal('modal-edit-profile');

  if (nameChanged && avatarChanged) {
    showNotification('✅ Nome e avatar atualizados!', 'success');
  } else if (nameChanged) {
    showNotification('✅ Nome atualizado para "' + name + '"!', 'success');
  } else if (avatarChanged) {
    showNotification('✅ Avatar atualizado!', 'success');
  } else {
    showNotification('Perfil salvo!', 'info');
  }

  playSound('complete');
}

// ============================================================
// EXPORT / IMPORT DE DADOS
// ============================================================

function initExportImport() {
  // Export/import buttons are now in the Settings page
  // initSettingsPage() handles binding them
  // This function is kept for backward compatibility
}

function exportData() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = 'studyquest_backup_' + dateStr + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showNotification('📤 Dados exportados com sucesso!', 'success');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.setup || !imported.name) {
        return showNotification('❌ Arquivo inválido. Não é um backup do StudyQuest.', 'error');
      }
      // Merge: preserve new fields, overwrite with imported
      state = { ...state, ...imported };
      // Garantir campos novos que possam não estar no backup
      if (!state.taskHistory) state.taskHistory = [];
      if (!state.dynamicMissions) state.dynamicMissions = [];
      if (!state.weeklyMissions) state.weeklyMissions = {};
      saveState();
      updateAllUI();
      navigateTo('dashboard');
      showNotification('📥 Dados importados com sucesso! Bem-vindo de volta, ' + state.name + '!', 'success');
    } catch(err) {
      showNotification('❌ Erro ao importar: arquivo corrompido.', 'error');
    }
  };
  reader.readAsText(file);
  // Reset input so same file can be imported again
  event.target.value = '';
}

// ============================================================
// NOTIFICAÇÕES DE TAREFAS URGENTES (ao carregar)
// ============================================================

function checkUrgentTasks() {
  if (!state.tasks) return;
  const today = todayStr();
  const overdue = state.tasks.filter(t => !t.done && t.dueDate && t.dueDate < today);
  const todayTasks = state.tasks.filter(t => !t.done && t.dueDate === today);
  if (overdue.length > 0) {
    setTimeout(() => showNotification('⚠️ Você tem ' + overdue.length + ' tarefa(s) atrasada(s)!', 'error'), 1500);
  }
  if (todayTasks.length > 0) {
    setTimeout(() => showNotification('🔔 ' + todayTasks.length + ' tarefa(s) vencem hoje!', 'warning'), 2500);
  }
}

setTimeout(checkUrgentTasks, 1000);

// ============================================================
// AUTO-SAVE periódico
// ============================================================

setInterval(saveState, 30000); // salva a cada 30 segundos

// ============================================================
// PERFIL PÚBLICO
// ============================================================

function computeBestSubject() {
  if (!state.subjects.length) return '';
  let best = { name: '', avg: -1 };
  state.subjects.forEach(subj => {
    const entries = state.gradeEntries[subj.id];
    if (!entries) return;
    let total = 0, count = 0;
    Object.values(entries).forEach(scores => scores.forEach(s => { total += s; count++; }));
    if (count > 0 && total / count > best.avg) best = { name: subj.name, avg: total / count };
  });
  return best.name;
}

async function syncPublicProfile() {
  await saveUserData(state);
}

// ============================================================
// COSMÉTICOS — armazenados em state.cosmetics (sem tabela extra)
// ============================================================

function buyCosmetic(type, id) {
  if (!authUserId) return showNotification('Faça login para comprar cosméticos.', 'warning');
  const list = type === 'frame' ? COSMETIC_FRAMES : COSMETIC_BANNERS;
  const item = list.find(i => i.id === id);
  if (!item) return;

  const owned = type === 'frame' ? state.cosmetics.ownedFrames : state.cosmetics.ownedBanners;
  if (owned.includes(id)) return showNotification('Você já possui este item!', 'info');
  if (state.coins < item.cost) return showNotification('Moedas insuficientes! 🪙', 'warning');

  state.coins -= item.cost;
  owned.push(id);
  saveState();
  showNotification(`✅ ${item.icon} "${item.name}" comprado!`, 'success');
  renderCosmeticsShop();
  updateDashboard();
}

function equipCosmetic(type, id) {
  if (type === 'frame') {
    state.cosmetics.equippedFrame  = state.cosmetics.equippedFrame  === id ? null : id;
  } else {
    state.cosmetics.equippedBanner = state.cosmetics.equippedBanner === id ? null : id;
  }
  saveState();
  showNotification('🎨 Visual atualizado!', 'success');
  renderCosmeticsShop();
  renderProfilePage();
}

function renderCosmeticsShop() {
  const container = document.getElementById('cosmetics-shop');
  if (!container) return;
  const c = state.cosmetics;

  function itemsHtml(items, type, owned, equipped) {
    return items.map(item => {
      const isOwned    = owned.includes(item.id);
      const isEquipped = equipped === item.id;
      // Prévia visual para banners
      const preview = type === 'banner'
        ? `<div class="cosmetic-banner-preview ${item.id}"></div>`
        : `<span class="shop-icon">${item.icon}</span>`;
      return `<div class="shop-item cosmetic-item">
        ${preview}
        <div class="shop-name">${item.name}</div>
        <div class="shop-desc">${item.desc}</div>
        ${isOwned
          ? `<button class="shop-buy-btn ${isEquipped ? 'btn-equipped' : ''}" onclick="equipCosmetic('${type}','${item.id}')">
              ${isEquipped ? '✅ Equipado' : '🎨 Equipar'}
             </button>`
          : `<button class="shop-buy-btn" onclick="buyCosmetic('${type}','${item.id}')" ${state.coins < item.cost ? 'disabled' : ''}>
              💰 ${item.cost} moedas
             </button>`}
      </div>`;
    }).join('');
  }

  container.innerHTML = `
    <div class="cosmetics-section">
      <div class="shop-section-title">🖼️ Molduras de Perfil</div>
      <div class="shop-grid">${itemsHtml(COSMETIC_FRAMES, 'frame', c.ownedFrames, c.equippedFrame)}</div>
    </div>
    <div class="cosmetics-section">
      <div class="shop-section-title">🎨 Banners de Perfil</div>
      <div class="shop-grid">${itemsHtml(COSMETIC_BANNERS, 'banner', c.ownedBanners, c.equippedBanner)}</div>
    </div>`;
}

// ============================================================
// MOTIVAÇÕES — tabela: motivations (id, from_id, to_id, phrase, read, created_at)
// ============================================================

async function sendMotivation(toId, phrase) {
  if (!sb || !authUserId) return false;
  try {
    const { error } = await sb.from('motivations').insert({ from_id: authUserId, to_id: toId, phrase });
    if (error) { console.error('[Motiv] Erro ao enviar:', error.message); return false; }
    return true;
  } catch (e) { return false; }
}

async function listMyMotivations() {
  if (!sb || !authUserId) return [];
  try {
    const { data: rows } = await sb.from('motivations')
      .select('id, from_id, phrase, read, created_at')
      .eq('to_id', authUserId).order('created_at', { ascending: false }).limit(20);
    if (!rows?.length) return [];
    const ids = [...new Set(rows.map(r => r.from_id))];
    const { data: users } = await sb.from('users').select('id, name, data').in('id', ids);
    const uMap = {}; (users || []).forEach(u => { uMap[u.id] = _parseUserRow(u); });
    return rows.map(r => ({ ...r, sender: uMap[r.from_id] || { name: 'Alguém', avatar: '🧙' } }));
  } catch (e) { return []; }
}

async function markMotivationsRead() {
  if (!sb || !authUserId) return;
  try { await sb.from('motivations').update({ read: true }).eq('to_id', authUserId).eq('read', false); } catch (e) {}
}

// ============================================================
// PRESENTES — tabela: gifts (id, from_id, to_id, item_id, item_name, item_icon, status, created_at)
// ============================================================

async function sendGift(toId, itemId) {
  if (!sb || !authUserId) return false;
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return false;
  const cost = Math.floor(item.cost * 1.2); // 20% mais caro para presentear
  if (state.coins < cost) { showNotification(`Precisa de ${cost} moedas para presentear! 🪙`, 'warning'); return false; }
  try {
    const { error } = await sb.from('gifts').insert({
      from_id: authUserId, to_id: toId,
      item_id: item.id, item_name: item.name, item_icon: item.icon,
    });
    if (error) { console.error('[Gift] Erro ao enviar:', error.message); return false; }
    state.coins -= cost;
    saveState();
    updateDashboard();
    return true;
  } catch (e) { return false; }
}

async function listMyGifts() {
  if (!sb || !authUserId) return [];
  try {
    const { data: rows } = await sb.from('gifts')
      .select('id, from_id, item_id, item_name, item_icon, status, created_at')
      .eq('to_id', authUserId).eq('status', 'pending').order('created_at', { ascending: false });
    if (!rows?.length) return [];
    const ids = [...new Set(rows.map(r => r.from_id))];
    const { data: users } = await sb.from('users').select('id, name, data').in('id', ids);
    const uMap = {}; (users || []).forEach(u => { uMap[u.id] = _parseUserRow(u); });
    return rows.map(r => ({ ...r, sender: uMap[r.from_id] || { name: 'Alguém', avatar: '🧙' } }));
  } catch (e) { return []; }
}

async function acceptGift(giftId, itemId) {
  if (!sb || !authUserId) return false;
  try {
    await sb.from('gifts').update({ status: 'accepted' }).eq('id', giftId);
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (item) {
      state.boosts.push({ ...item, name: item.name, icon: item.icon });
      saveState();
      showNotification(`🎁 Você recebeu "${item.name}"!`, 'success');
    }
    return true;
  } catch (e) { return false; }
}

async function declineGift(giftId) {
  if (!sb || !authUserId) return;
  try { await sb.from('gifts').update({ status: 'declined' }).eq('id', giftId); } catch (e) {}
}

// ============================================================
// NOTIFICAÇÕES — painel com pedidos, motivações e presentes
// ============================================================

async function loadNotifCount() {
  // Notifs locais (desempenho + presentes surpresa)
  const localUnread   = (state.localNotifs   || []).filter(n => !n.read).length;
  const surprisePending = (state.surpriseGifts || []).length;

  if (!sb || !authUserId) return localUnread + surprisePending;
  try {
    const [{ count: reqCount }, { count: motivCount }, { count: giftCount }, { count: inviteCount }] = await Promise.all([
      sb.from('friend_requests').select('*', { count: 'exact', head: true }).eq('to_id', authUserId).eq('status', 'pending'),
      sb.from('motivations').select('*', { count: 'exact', head: true }).eq('to_id', authUserId).eq('read', false),
      sb.from('gifts').select('*', { count: 'exact', head: true }).eq('to_id', authUserId).eq('status', 'pending'),
      sb.from('group_invites').select('*', { count: 'exact', head: true }).eq('to_id', authUserId).eq('status', 'pending'),
    ]);
    return (reqCount || 0) + (motivCount || 0) + (giftCount || 0) + (inviteCount || 0) + localUnread + surprisePending;
  } catch (e) { return localUnread + surprisePending; }
}

async function updateNotifBell() {
  const count = await loadNotifCount();
  document.querySelectorAll('.notif-bell-badge').forEach(el => {
    el.textContent = count > 0 ? count : '';
    el.style.display = count > 0 ? 'flex' : 'none';
  });
  // Anima o sino quando tem notificações pendentes
  document.querySelectorAll('.topbar-notif-btn, .dash-notif-btn').forEach(btn => {
    btn.classList.toggle('has-notif', count > 0);
  });
}

async function renderNotifPanel() {
  const container = document.getElementById('notif-panel-content');
  if (!container) return;
  container.innerHTML = '<div class="social-loading">Carregando...</div>';

  const [pendingReqs, motivations, gifts, groupInvites] = await Promise.all([
    listPendingRequests(), listMyMotivations(), listMyGifts(), listGroupInvites(),
  ]);
  markMotivationsRead();

  let html = '';

  // ── Presentes surpresa do sistema ───────────────────────────
  const surprises = state.surpriseGifts || [];
  if (surprises.length) {
    html += `<div class="notif-section-title">🎁 Presente Surpresa do Sistema (${surprises.length})</div>`;
    html += surprises.map(g => `<div class="notif-card notif-surprise">
      <div class="notif-surprise-icon">${g.icon}</div>
      <div class="notif-info">
        <div class="notif-name">Presente do Sistema!</div>
        <div class="notif-sub">${g.icon} ${escHtml(g.name)}</div>
      </div>
      <div class="notif-btns">
        <button class="btn-accept" onclick="claimSurpriseGift('${g.uid}',this)">🎁 Pegar</button>
      </div>
    </div>`).join('');
  }

  // ── Notificações de desempenho ───────────────────────────────
  const perfNotifs = (state.localNotifs || []).filter(n => !n.read).slice(0, 5);
  if (perfNotifs.length) {
    html += `<div class="notif-section-title">📊 Desempenho (${perfNotifs.length})</div>`;
    html += perfNotifs.map(n => `<div class="notif-card notif-perf">
      <div class="notif-surprise-icon">${n.icon}</div>
      <div class="notif-info">
        <div class="notif-name" style="font-size:.85rem;font-weight:600">${escHtml(n.message)}</div>
        <div class="notif-sub">${new Date(n.timestamp).toLocaleDateString('pt-BR')}</div>
      </div>
      <button class="btn-notif-dismiss" onclick="dismissLocalNotif('${n.id}',this)" title="Dispensar">✕</button>
    </div>`).join('');
  }

  // ── Pedidos de amizade ───────────────────────────────────────
  if (pendingReqs.length) {
    html += `<div class="notif-section-title">👥 Pedidos de Amizade (${pendingReqs.length})</div>`;
    html += pendingReqs.map(req => `<div class="notif-card">
      ${_avatarHtml(req.user || { avatar: '🧙', avatarType: 'emoji' })}
      <div class="notif-info">
        <div class="notif-name">${escHtml(req.user?.name || '?')}</div>
        <div class="notif-sub">Quer ser seu amigo!</div>
      </div>
      <div class="notif-btns">
        <button class="btn-accept" onclick="handleAcceptFriend('${req.from_id}','${req.id}',this);updateNotifBell()">✓</button>
        <button class="btn-reject" onclick="handleRejectFriend('${req.id}',this);updateNotifBell()">✕</button>
      </div>
    </div>`).join('');
  }

  // ── Convites de grupo ────────────────────────────────────────
  if (groupInvites.length) {
    html += `<div class="notif-section-title">🏰 Convites de Grupo (${groupInvites.length})</div>`;
    html += groupInvites.map(inv => `<div class="notif-card">
      <div class="notif-surprise-icon">🏰</div>
      <div class="notif-info">
        <div class="notif-name">${escHtml(inv.group_name)}</div>
        <div class="notif-sub">Convidado por ${escHtml(inv.from_name)}</div>
      </div>
      <div class="notif-btns">
        <button class="btn-accept" onclick="handleAcceptGroupInvite('${inv.id}','${inv.group_id}',this)">✓</button>
        <button class="btn-reject" onclick="handleDeclineGroupInvite('${inv.id}',this)">✕</button>
      </div>
    </div>`).join('');
  }

  // ── Presentes de amigos ──────────────────────────────────────
  if (gifts.length) {
    html += `<div class="notif-section-title">🎁 Presentes (${gifts.length})</div>`;
    html += gifts.map(g => `<div class="notif-card">
      ${_avatarHtml(g.sender)}
      <div class="notif-info">
        <div class="notif-name">${escHtml(g.sender.name)}</div>
        <div class="notif-sub">${g.item_icon} ${escHtml(g.item_name)}</div>
      </div>
      <div class="notif-btns">
        <button class="btn-accept" onclick="handleAcceptGift('${g.id}','${g.item_id}',this)">🎁 Pegar</button>
        <button class="btn-reject" onclick="handleDeclineGift('${g.id}',this)">✕</button>
      </div>
    </div>`).join('');
  }

  // Motivações
  if (motivations.length) {
    html += `<div class="notif-section-title">💪 Motivações (${motivations.length})</div>`;
    html += motivations.map(m => `<div class="notif-card notif-motivation">
      ${_avatarHtml(m.sender)}
      <div class="notif-info">
        <div class="notif-name">${escHtml(m.sender.name)}</div>
        <div class="notif-sub">"${escHtml(m.phrase)}"</div>
      </div>
    </div>`).join('');
  }

  if (!html) html = '<div class="social-empty" style="padding:1.5rem 0">Nenhuma notificação. 🎉</div>';
  container.innerHTML = html;
  updateNotifBell();
}

async function handleAcceptGift(giftId, itemId, btn) {
  if (btn) btn.disabled = true;
  const ok = await acceptGift(giftId, itemId);
  if (ok) { renderNotifPanel(); updateNotifBell(); }
  else showNotification('Erro ao aceitar presente.', 'error');
}

async function handleDeclineGift(giftId, btn) {
  if (btn) btn.disabled = true;
  await declineGift(giftId);
  showNotification('Presente recusado.', 'info');
  renderNotifPanel();
  updateNotifBell();
}

function openNotifPanel() {
  closeSidebar();
  openModal('modal-notif-panel');
  renderNotifPanel();
}

// ── Handlers de convite de grupo no painel ───────────────────
async function handleAcceptGroupInvite(inviteId, groupId, btn) {
  if (btn) btn.disabled = true;
  const ok = await acceptGroupInvite(inviteId, groupId);
  if (ok) {
    showNotification('🏰 Você entrou no grupo!', 'success');
    renderNotifPanel(); updateNotifBell();
    if (document.getElementById('page-groups')?.classList.contains('active')) renderGroupsPage();
  } else {
    showNotification('Erro ao aceitar convite.', 'error');
    if (btn) btn.disabled = false;
  }
}

async function handleDeclineGroupInvite(inviteId, btn) {
  if (btn) btn.disabled = true;
  await declineGroupInvite(inviteId);
  showNotification('Convite recusado.', 'info');
  renderNotifPanel(); updateNotifBell();
}

// ── Notificações locais de desempenho ────────────────────────
function addLocalNotif(icon, message) {
  if (!state.localNotifs) state.localNotifs = [];
  // Evita duplicata com mesmo ícone+mensagem no mesmo dia
  const today = todayStr();
  const duplicate = state.localNotifs.some(n =>
    n.message === message && n.timestamp?.slice(0, 10) === today
  );
  if (duplicate) return;
  state.localNotifs.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    icon,
    message,
    timestamp: new Date().toISOString(),
    read: false,
  });
  // Mantém no máximo 20 notifs locais
  if (state.localNotifs.length > 20) state.localNotifs = state.localNotifs.slice(-20);
  saveState();
}

function dismissLocalNotif(id, btn) {
  if (btn) btn.closest('.notif-card')?.remove();
  state.localNotifs = (state.localNotifs || []).map(n =>
    n.id === id ? { ...n, read: true } : n
  );
  saveState();
  updateNotifBell();
}

// ── Presentes surpresa do sistema ────────────────────────────
function checkSurpriseGift() {
  const today = todayStr();
  if ((state.lastSurpriseGiftDate || '') === today) return; // já recebeu hoje

  // 60% de chance de ganhar um presente por dia
  if (Math.random() > 0.60) {
    state.lastSurpriseGiftDate = today;
    saveState();
    return;
  }

  const pool = SURPRISE_GIFTS_POOL;
  const gift = { ...pool[Math.floor(Math.random() * pool.length)] };
  gift.uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  gift.timestamp = new Date().toISOString();

  if (!state.surpriseGifts) state.surpriseGifts = [];
  state.surpriseGifts.push(gift);
  state.lastSurpriseGiftDate = today;
  saveState();
  updateNotifBell();
  showNotification(`🎁 Você recebeu um presente surpresa: ${gift.icon} ${gift.name}!`, 'success');
}

function claimSurpriseGift(uid, btn) {
  if (btn) btn.disabled = true;
  const gift = (state.surpriseGifts || []).find(g => g.uid === uid);
  if (!gift) return;

  if (gift.type === 'xp')    addXp(gift.value);
  if (gift.type === 'coins') addCoins(gift.value);

  state.surpriseGifts = (state.surpriseGifts || []).filter(g => g.uid !== uid);
  saveState();
  showNotification(`✅ ${gift.icon} ${gift.name} resgatado! +${gift.value} ${gift.type === 'xp' ? 'XP' : 'moedas'}`, 'success');
  renderNotifPanel();
  updateNotifBell();
}

// ── Verificação de desempenho ao logar ───────────────────────
function checkPerformanceNotifs() {
  // Verifica mudanças por matéria
  const prev = state.lastCheckedGrades || {};
  const next  = {};

  state.subjects.forEach(s => {
    if (!s.grades || s.grades.length === 0) return;
    const last = s.grades[s.grades.length - 1];
    next[s.id] = last;
    const prevGrade = prev[s.id];
    if (prevGrade === undefined) return; // primeira vez
    if (last > prevGrade + 0.5) {
      addLocalNotif('📈', `Você melhorou em ${s.name}! Nota ${last} vs ${prevGrade} antes.`);
    } else if (last < prevGrade - 0.5) {
      addLocalNotif('📉', `Seu desempenho em ${s.name} caiu. Note ${last} vs ${prevGrade}. Hora de revisar!`);
    }
  });

  // Verifica exames recentes
  const recent = state.exams.slice(-3);
  if (recent.length >= 2) {
    const avg = recent.reduce((a, b) => a + b.grade, 0) / recent.length;
    if (avg >= 9) addLocalNotif('🌟', 'Suas notas recentes estão excelentes! Continue assim!');
    else if (avg < 5) addLocalNotif('⚠️', 'Suas notas recentes estão baixas. Hora de estudar mais!');
  }

  // Streak de 3, 7, 30 dias
  if (state.streak === 3)  addLocalNotif('🔥', '3 dias de streak! Continue firme!');
  if (state.streak === 7)  addLocalNotif('💪', '1 semana de streak! Incrível!');
  if (state.streak === 30) addLocalNotif('🏆', '30 dias de streak! Você é uma lenda!');

  state.lastCheckedGrades = next;
  saveState();
}

function selectAvatarType(type) {
  _updateAvatarTypeUI(type);
  const previewEl = document.getElementById('profile-preview-avatar');
  if (type === 'google' && state.googleAvatarUrl) {
    previewEl.innerHTML = `<img src="${state.googleAvatarUrl}" class="avatar-img" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
  } else if (type === 'url') {
    const url = document.getElementById('profile-url-input')?.value.trim();
    if (url) previewEl.innerHTML = `<img src="${escHtml(url)}" class="avatar-img" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    document.getElementById('profile-url-input')?.addEventListener('input', e => {
      if (e.target.value.trim()) previewEl.innerHTML =
        `<img src="${escHtml(e.target.value.trim())}" class="avatar-img" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    }, { once: true });
  } else if (type === 'upload') {
    // Se já tem foto carregada nesta sessão ou salva anteriormente, mostra
    const existing = state._pendingUploadUrl || (state.avatarType === 'upload' ? state.avatarUrl : '');
    if (existing) {
      previewEl.innerHTML = `<img src="${existing}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    }
    // Abre o seletor de arquivo automaticamente se não tem foto ainda
    if (!existing) {
      setTimeout(() => document.getElementById('avatar-upload-input')?.click(), 100);
    }
  } else {
    updateProfilePreview();
  }
}

/**
 * Lida com o upload de foto do dispositivo:
 * lê o arquivo, redimensiona para 200×200 com canvas e armazena
 * como data URL JPEG (~15–25 KB) em state._pendingUploadUrl.
 */
function handleAvatarUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const statusEl = document.getElementById('avatar-upload-status');
  const iconEl   = document.getElementById('avatar-upload-icon');
  if (statusEl) statusEl.textContent = 'Processando foto...';
  if (iconEl)   iconEl.textContent   = '⏳';

  const reader = new FileReader();
  reader.onload = function(ev) {
    const img = new Image();
    img.onload = function() {
      // Redimensiona para quadrado 200×200 (crop centralizado)
      const SIZE   = 200;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = SIZE;
      const ctx    = canvas.getContext('2d');

      const minSide = Math.min(img.width, img.height);
      const sx = (img.width  - minSide) / 2;
      const sy = (img.height - minSide) / 2;
      ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, SIZE, SIZE);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      state._pendingUploadUrl = dataUrl;

      // Preview na modal
      const previewEl = document.getElementById('profile-preview-avatar');
      if (previewEl) previewEl.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;

      if (statusEl) statusEl.textContent = 'Foto carregada! Clique em Salvar.';
      if (iconEl)   iconEl.textContent   = '✅';
    };
    img.onerror = function() {
      if (statusEl) statusEl.textContent = 'Erro ao carregar imagem. Tente outra.';
      if (iconEl)   iconEl.textContent   = '❌';
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  // Limpa o input para permitir reselecionar o mesmo arquivo
  input.value = '';
}

function renderProfilePage() {
  const container = document.getElementById('page-profile');
  if (!container) return;
  const achs = (state.achievements || []).map(id => {
    const def = ACHIEVEMENTS_DEF.find(a => a.id === id);
    return def ? `<div class="profile-ach-badge" title="${def.name}: ${def.desc}">${def.icon}</div>` : '';
  }).join('');
  const bestSubj = computeBestSubject();
  const xpNext = xpForLevel(state.level + 1);
  const xpPct  = Math.min(100, Math.round((state.xp / xpNext) * 100));
  const authNote = authUserId ? '' : '<div class="social-auth-hint">🔒 Faça login para usar amigos e grupos</div>';

  const subjCards = [
    state.favoriteSubject ? `<div class="subject-info-card fav-card">
      <div class="sic-label">❤️ Favorita</div>
      <div class="sic-value">${escHtml(state.favoriteSubject)}</div>
    </div>` : '',
    bestSubj ? `<div class="subject-info-card best-card">
      <div class="sic-label">🏆 Melhor</div>
      <div class="sic-value">${escHtml(bestSubj)}</div>
    </div>` : '',
  ].filter(Boolean).join('');

  const myUser = { avatar: state.avatar, avatarType: state.avatarType, avatarUrl: state.avatarUrl,
                    equippedFrame: state.cosmetics?.equippedFrame, name: state.name };
  const bannerClass = state.cosmetics?.equippedBanner || '';

  container.innerHTML = `
    <div class="page-header"><h1>👤 Meu Perfil</h1></div>
    <div class="profile-page-banner ${bannerClass}">
      <div class="profile-page-hero">
        ${_avatarHtml(myUser, 'profile-page-avatar-wrap')}
        <div class="profile-page-info">
          <h2>${escHtml(state.name || 'Herói')}</h2>
          <div class="profile-page-level">⚔️ Nível ${state.level}</div>
          <div class="xp-bar-wrap"><div class="xp-bar-fill" style="width:${xpPct}%"></div></div>
          <div class="profile-page-xptext">${state.xp} / ${xpNext} XP para o próximo nível</div>
        </div>
      </div>
    </div>
    ${authUserId ? `<div class="friend-code-box">
      <span class="friend-code-label">🔑 Seu código de amigo:</span>
      <span class="friend-code-val">@${state.username || _generateUsername(authUserId)}</span>
      <button class="btn-sm btn-secondary" onclick="copyFriendCode()">📋 Copiar</button>
    </div>` : ''}
    ${authNote}
    <div class="profile-stats-row">
      <div class="profile-stat"><span class="profile-stat-val">${state.totalXpEarned || 0}</span><span class="profile-stat-label">XP Total</span></div>
      <div class="profile-stat"><span class="profile-stat-val">${state.streak || 0}🔥</span><span class="profile-stat-label">Streak</span></div>
      <div class="profile-stat"><span class="profile-stat-val">${(state.achievements || []).length}</span><span class="profile-stat-label">Conquistas</span></div>
    </div>
    ${subjCards ? `<div class="subject-info-row">${subjCards}</div>` : ''}
    <div class="profile-section-title">🏅 Conquistas (${(state.achievements || []).length} / ${ACHIEVEMENTS_DEF.length})</div>
    <div class="profile-ach-grid">${achs || '<div class="profile-ach-empty">Nenhuma conquista ainda. Continue jogando!</div>'}</div>
    <button class="btn-primary" style="margin-top:1.5rem" onclick="openEditProfile()">✏️ Editar Perfil</button>
  `;
}

// ============================================================
// AMIGOS — tabelas: friends (user_id, friend_id), friend_requests (from_id, to_id, status)
//           dados de perfil na tabela users
// ============================================================

/** Extrai dados públicos de uma linha da tabela users */
function _parseUserRow(row) {
  if (!row) return null;
  const d = row.data || {};
  return {
    id:              row.id,
    name:            row.name     || 'Herói',
    username:        row.username || _generateUsername(row.id),
    level:           row.level    || 1,
    xp:              row.xp       || 0,
    avatar:          d.avatar     || '🧙',
    avatarType:      d.avatarType || 'emoji',
    avatarUrl:       d.avatarUrl  || '',
    equippedFrame:   d.cosmetics?.equippedFrame  || null,
    equippedBanner:  d.cosmetics?.equippedBanner || null,
    favoriteSubject: d.favoriteSubject || '',
    achievements:    d.achievements    || [],
  };
}

/** Retorna o HTML do avatar de um usuário (foto ou emoji) com moldura se tiver */
function _avatarHtml(user, extraClass = '') {
  const frame = user.equippedFrame || null;
  const frameClass = frame ? ` avatar-frame ${frame}` : '';
  const cls = `friend-avatar${frameClass}${extraClass ? ' ' + extraClass : ''}`;
  if ((user.avatarType === 'google' || user.avatarType === 'url' || user.avatarType === 'upload') && user.avatarUrl) {
    return `<img class="${cls} avatar-img" src="${escHtml(user.avatarUrl)}" alt="${escHtml(user.name || '')}" onerror="this.outerHTML='<div class=\\'${cls}\\'>${user.avatar||'🧙'}</div>'">`;
  }
  return `<div class="${cls}">${user.avatar || '🧙'}</div>`;
}

/** Atualiza o avatar da topbar (pode ser emoji ou imagem) */
function _renderNavAvatar() {
  const el = document.getElementById('nav-avatar');
  if (!el) return;
  if ((state.avatarType === 'google' || state.avatarType === 'url' || state.avatarType === 'upload') && state.avatarUrl) {
    el.innerHTML = `<img src="${escHtml(state.avatarUrl)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block">`;
  } else {
    el.textContent = state.avatar || '🧙';
  }
}

/** Busca dados de um único usuário pela tabela users */
async function getUserById(userId) {
  if (!sb || !userId) return null;
  try {
    const { data } = await sb.from('users').select('id, name, xp, level, data, username').eq('id', userId).single();
    return _parseUserRow(data);
  } catch (e) { return null; }
}

/** Busca usuários por nome OU por @username em uma só query */
async function searchUsers(query) {
  if (!sb || !query.trim()) return [];
  const q = query.trim().replace(/^@/, ''); // aceita @username ou username
  try {
    const { data } = await sb
      .from('users')
      .select('id, name, xp, level, data, username')
      .or(`name.ilike.%${q}%,username.ilike.%${q}%`)
      .neq('id', authUserId || '')
      .limit(15);
    return (data || []).map(_parseUserRow).filter(Boolean);
  } catch (e) { console.error('[searchUsers]', e); return []; }
}

/** @deprecated — mantido por compatibilidade */
async function searchUsersByName(query) { return searchUsers(query); }

/** Lista os IDs dos amigos do usuário atual */
async function listFriendIds() {
  if (!sb || !authUserId) return [];
  try {
    const { data } = await sb.from('friends').select('friend_id').eq('user_id', authUserId);
    return (data || []).map(r => r.friend_id);
  } catch (e) { return []; }
}

/** Lista amigos com dados de perfil completos */
async function listFriendsWithData() {
  if (!sb || !authUserId) return [];
  try {
    const ids = await listFriendIds();
    if (!ids.length) return [];
    const { data } = await sb.from('users').select('id, name, xp, level, data, username').in('id', ids);
    return (data || []).map(_parseUserRow).filter(Boolean);
  } catch (e) { return []; }
}

/** Remove amigo: deleta o registro onde user_id=eu e friend_id=alvo (e vice-versa) */
async function removeFriend(friendId) {
  if (!sb || !authUserId) return;
  try {
    await Promise.all([
      sb.from('friends').delete().eq('user_id', authUserId).eq('friend_id', friendId),
      sb.from('friends').delete().eq('user_id', friendId).eq('friend_id', authUserId),
    ]);
  } catch (e) {}
}

// ── Pedidos de amizade ────────────────────────────────────────

/** Envia pedido de amizade — retorna { ok, reason } */
async function sendFriendRequest(toId) {
  if (!sb || !authUserId) return { ok: false, reason: 'not_logged_in' };
  try {
    // 1) Já são amigos?
    const { count: friendCount } = await sb.from('friends')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', authUserId).eq('friend_id', toId);
    if (friendCount > 0) return { ok: false, reason: 'already_friends' };

    // 2) Já existe pedido pendente enviado por mim?
    const { count: sentCount } = await sb.from('friend_requests')
      .select('*', { count: 'exact', head: true })
      .eq('from_id', authUserId).eq('to_id', toId).eq('status', 'pending');
    if (sentCount > 0) return { ok: false, reason: 'already_sent' };

    // 3) A outra pessoa já me mandou pedido? → aceita automaticamente
    const { data: incoming } = await sb.from('friend_requests')
      .select('id').eq('from_id', toId).eq('to_id', authUserId).eq('status', 'pending').maybeSingle();
    if (incoming) {
      const acc = await acceptFriendRequest(toId, incoming.id);
      if (!acc.ok) return { ok: false, reason: acc.msg || 'auto_accept_failed' };
      return { ok: true, reason: 'auto_accepted' };
    }

    // 4) Insere pedido
    const { error } = await sb.from('friend_requests')
      .insert({ from_id: authUserId, to_id: toId, status: 'pending' });
    if (error) {
      console.error('[sendFriendRequest] código:', error.code, '| mensagem:', error.message, '| detalhes:', error.details, '| hint:', error.hint);
      if (error.code === '23505') return { ok: false, reason: 'already_sent' };
      if (error.code === '42501') return { ok: false, reason: 'permission_denied' };
      return { ok: false, reason: error.message || 'insert_error' };
    }

    // Push para o destinatário
    if (_pushPrefEnabled('friends')) {
      sendPushToUser(toId,
        '👥 Novo pedido de amizade!',
        `${escHtml(state.name || 'Alguém')} te enviou um pedido de amizade no StudyQuest.`,
        { page: 'friends', tag: 'friend-request' }
      ).catch(() => {});
    }

    return { ok: true, reason: 'sent' };
  } catch (e) {
    console.error('[sendFriendRequest] Exception:', e);
    return { ok: false, reason: e.message || 'unknown' };
  }
}

/** Lista IDs para quem eu já enviei pedido pendente */
async function listSentRequestIds() {
  if (!sb || !authUserId) return [];
  try {
    const { data } = await sb.from('friend_requests').select('to_id').eq('from_id', authUserId).eq('status', 'pending');
    return (data || []).map(r => r.to_id);
  } catch (e) { return []; }
}

/** Lista pedidos recebidos pendentes com dados do solicitante */
async function listPendingRequests() {
  if (!sb || !authUserId) return [];
  try {
    const { data: reqs } = await sb.from('friend_requests').select('id, from_id, created_at').eq('to_id', authUserId).eq('status', 'pending');
    if (!reqs || !reqs.length) return [];
    const ids = reqs.map(r => r.from_id);
    const { data: users } = await sb.from('users').select('id, name, xp, level, data, username').in('id', ids);
    const userMap = {};
    (users || []).forEach(u => { userMap[u.id] = _parseUserRow(u); });
    return reqs.map(r => ({ ...r, user: userMap[r.from_id] })).filter(r => r.user);
  } catch (e) { return []; }
}

/** Aceita pedido via RPC SECURITY DEFINER (resolve RLS bidirecional) */
async function acceptFriendRequest(fromId, requestId) {
  if (!sb || !authUserId) return { ok: false, msg: 'Não autenticado.' };
  try {
    // Tenta via função RPC (recomendado — bypass RLS seguro)
    const { data, error } = await sb.rpc('accept_friend_request', {
      p_request_id: requestId,
      p_from_id:    fromId,
    });

    if (!error && data?.ok) return { ok: true };

    // RPC não existe ainda → fallback com dois inserts separados
    if (error?.code === 'PGRST202') {
      console.warn('[acceptFriendRequest] RPC não encontrada, usando fallback direto');
      return await _acceptFriendFallback(fromId, requestId);
    }

    const msg = error?.message || data?.error || 'Erro desconhecido';
    console.error('[acceptFriendRequest] RPC error:', msg);
    return { ok: false, msg };
  } catch (e) {
    console.error('[acceptFriendRequest] catch:', e);
    return { ok: false, msg: e.message || 'Erro inesperado' };
  }
}

/** Fallback direto — usa INSERT simples e ignora duplicatas (23505) */
async function _acceptFriendFallback(fromId, requestId) {
  try {
    // Insere minha direção
    const { error: e1 } = await sb.from('friends')
      .insert({ user_id: authUserId, friend_id: fromId });
    if (e1 && e1.code !== '23505') {
      console.error('[_acceptFriendFallback] insert próprio:', e1.code, e1.message);
      return { ok: false, msg: e1.message };
    }

    // Insere direção inversa
    const { error: e2 } = await sb.from('friends')
      .insert({ user_id: fromId, friend_id: authUserId });
    if (e2 && e2.code !== '23505') {
      console.error('[_acceptFriendFallback] insert inverso:', e2.code, e2.message);
      // Código 42501 = permissão negada por RLS
      if (e2.code === '42501') return { ok: false, msg: 'Permissão negada. Execute o SQL accept_friend_request no Supabase.' };
      return { ok: false, msg: e2.message };
    }

    // Deleta o pedido
    if (requestId) {
      await sb.from('friend_requests').delete().eq('id', requestId);
    } else {
      await sb.from('friend_requests').delete().eq('from_id', fromId).eq('to_id', authUserId);
    }
    return { ok: true };
  } catch (e) {
    console.error('[_acceptFriendFallback] catch:', e);
    return { ok: false, msg: e.message };
  }
}

/** Rejeita pedido: deleta o pedido */
async function rejectFriendRequest(requestId) {
  if (!sb || !authUserId) return;
  try {
    await sb.from('friend_requests').delete().eq('id', requestId);
  } catch (e) {}
}

/** Cancela pedido que EU enviei */
async function cancelFriendRequest(requestId) {
  if (!sb || !authUserId) return;
  try { await sb.from('friend_requests').delete().eq('id', requestId).eq('from_id', authUserId); } catch (e) {}
}

/** Lista pedidos que EU enviei com dados do destinatário */
async function listSentRequests() {
  if (!sb || !authUserId) return [];
  try {
    const { data: reqs } = await sb.from('friend_requests')
      .select('id, to_id, created_at').eq('from_id', authUserId).eq('status', 'pending');
    if (!reqs?.length) return [];
    const ids = reqs.map(r => r.to_id);
    const { data: users } = await sb.from('users').select('id, name, xp, level, data, username').in('id', ids);
    const uMap = {};
    (users || []).forEach(u => { uMap[u.id] = _parseUserRow(u); });
    return reqs.map(r => ({ ...r, user: uMap[r.to_id] })).filter(r => r.user);
  } catch (e) { return []; }
}

/** @deprecated — searchUsers() já cobre username */
async function searchUserByCode(code) { return searchUsers(code); }

/** Amigos de amigos (sugestões) — exclui quem já é amigo ou tem pedido pendente */
async function loadFriendSuggestions(myFriendIds, sentIds) {
  if (!sb || !authUserId || !myFriendIds.length) return [];
  try {
    const { data: rows } = await sb.from('friends').select('friend_id').in('user_id', myFriendIds);
    const countMap = {};
    for (const row of (rows || [])) {
      const fid = row.friend_id;
      if (fid === authUserId || myFriendIds.includes(fid) || sentIds.includes(fid)) continue;
      countMap[fid] = (countMap[fid] || 0) + 1;
    }
    const cids = Object.keys(countMap);
    if (!cids.length) return [];
    const { data: users } = await sb.from('users').select('id, name, xp, level, data, username').in('id', cids);
    return (users || [])
      .map(u => ({ ..._parseUserRow(u), mutualCount: countMap[u.id] || 0 }))
      .sort((a, b) => b.mutualCount - a.mutualCount)
      .slice(0, 8);
  } catch (e) { return []; }
}

// ── Render ────────────────────────────────────────────────────

function _friendCard(user) {
  return `<div class="friend-card" onclick="openFriendProfile('${user.id}')">
    ${_avatarHtml(user)}
    <div class="friend-info">
      <div class="friend-name">${escHtml(user.name)}</div>
      ${user.username ? `<div class="friend-username">@${escHtml(user.username)}</div>` : ''}
      <div class="friend-level">⚔️ Nível ${user.level} · ✨ ${user.xp} XP</div>
      ${user.favoriteSubject ? `<div class="friend-fav">❤️ ${escHtml(user.favoriteSubject)}</div>` : ''}
    </div>
    <button class="btn-danger-sm"
      onclick="event.stopPropagation(); confirmRemoveFriend('${user.id}')"
      title="Remover amigo">✕</button>
  </div>`;
}

async function renderFriendsPage() {
  const container = document.getElementById('page-friends');
  if (!container) return;

  if (!authUserId) {
    container.innerHTML = `<div class="social-auth-wall">
      <div class="social-auth-icon">👥</div>
      <p>Faça login para adicionar amigos e ver seus perfis.</p>
      <button class="btn-primary" onclick="showAuthScreen()">Fazer Login</button>
    </div>`;
    return;
  }

  container.innerHTML = '<div class="social-loading">Carregando amigos...</div>';
  const [friends, pendingReqs, sentReqs] = await Promise.all([
    listFriendsWithData(), listPendingRequests(), listSentRequests(),
  ]);
  const myFriendIds = friends.map(f => f.id);
  const sentIds     = sentReqs.map(r => r.to_id);

  // ── Painel: pedidos recebidos ──────────────────────────────
  const receivedHtml = pendingReqs.length
    ? pendingReqs.map(req => `<div class="friend-card">
        <div class="friend-avatar">${req.user.avatar}</div>
        <div class="friend-info">
          <div class="friend-name">${escHtml(req.user.name)}</div>
          <div class="friend-level">⚔️ Nível ${req.user.level} · ✨ ${req.user.xp} XP</div>
        </div>
        <div class="friend-request-btns">
          <button class="btn-accept" onclick="handleAcceptFriend('${req.from_id}','${req.id}',this)">✓ Aceitar</button>
          <button class="btn-reject" onclick="handleRejectFriend('${req.id}',this)">✕ Rejeitar</button>
        </div>
      </div>`).join('')
    : '<div class="social-empty">Sem pedidos recebidos. 😊</div>';

  // ── Painel: pedidos enviados ───────────────────────────────
  const sentHtml = sentReqs.length
    ? sentReqs.map(req => `<div class="friend-card">
        <div class="friend-avatar">${req.user.avatar}</div>
        <div class="friend-info">
          <div class="friend-name">${escHtml(req.user.name)}</div>
          <div class="friend-level">⚔️ Nível ${req.user.level} · ✨ ${req.user.xp} XP</div>
        </div>
        <button class="btn-reject" onclick="handleCancelFriendRequest('${req.id}',this)">✕ Cancelar</button>
      </div>`).join('')
    : '<div class="social-empty">Sem pedidos enviados. 😊</div>';

  const totalPending = pendingReqs.length + sentReqs.length;

  const friendsHtml = friends.length
    ? friends.map(_friendCard).join('')
    : '<div class="social-empty">Sem amigos ainda. Clique em "Adicionar Amigo" para buscar! 😊</div>';

  container.innerHTML = `
    <div class="page-header"><h1>👥 Amigos</h1></div>

    <div class="friends-action-row">
      <button class="btn-primary" id="btn-buscar-amigo">🔍 Adicionar Amigo</button>
      <button class="btn-secondary" id="btn-pedidos">
        📨 Pedidos${totalPending ? `<span class="notif-badge">${totalPending}</span>` : ''}
      </button>
    </div>

    <!-- Painel de busca (fechado por padrão) -->
    <div id="add-friend-section" class="friends-panel" style="display:none">
      <div class="friends-search-bar">
        <input type="text" id="friend-search-input" placeholder="🔍 Nome ou @codigo (ex: @user_a3f7b2)" autocomplete="off">
        <button class="btn-primary" id="friend-search-btn">Buscar</button>
      </div>
      <div id="friend-search-results"></div>
      <div id="friend-suggestions-wrap"></div>
    </div>

    <!-- Painel de pedidos (recebidos + enviados) -->
    <div id="pending-section" class="friends-panel" style="display:none">
      <div class="social-section-title">📨 Recebidos (${pendingReqs.length})</div>
      ${receivedHtml}
      <div class="social-section-title" style="margin-top:.75rem">📤 Enviados (${sentReqs.length})</div>
      ${sentHtml}
    </div>

    <div class="social-section-title">👥 Meus Amigos (${friends.length})</div>
    ${friendsHtml}
  `;

  // Toggle: Adicionar Amigo
  document.getElementById('btn-buscar-amigo').addEventListener('click', async () => {
    const s = document.getElementById('add-friend-section');
    const p = document.getElementById('pending-section');
    const opening = s.style.display === 'none';
    s.style.display = opening ? 'block' : 'none';
    p.style.display = 'none';
    if (opening) {
      document.getElementById('friend-search-input').focus();
      // Carrega sugestões (amigos de amigos)
      const sugWrap = document.getElementById('friend-suggestions-wrap');
      sugWrap.innerHTML = '<div class="social-loading" style="font-size:.8rem;padding:.5rem 0">Carregando sugestões...</div>';
      const suggestions = await loadFriendSuggestions(myFriendIds, sentIds);
      if (!suggestions.length) { sugWrap.innerHTML = ''; return; }
      sugWrap.innerHTML = `<div class="social-section-title" style="margin-top:.75rem">✨ Sugestões de Amizade</div>` +
        suggestions.map(u => {
          const alreadySent = sentIds.includes(u.id);
          const btn = alreadySent
            ? '<span class="friend-tag pending-tag">⏳ Enviado</span>'
            : `<button class="btn-add-friend" onclick="handleAddFriend('${u.id}',this)">+ Adicionar</button>`;
          return `<div class="friend-card search-result">
            <div class="friend-avatar">${u.avatar}</div>
            <div class="friend-info">
              <div class="friend-name">${escHtml(u.name)}</div>
              <div class="friend-level">⚔️ Nível ${u.level} · ✨ ${u.xp} XP</div>
              <div class="friend-fav">👥 ${u.mutualCount} amigo${u.mutualCount > 1 ? 's' : ''} em comum</div>
            </div>
            ${btn}
          </div>`;
        }).join('');
    }
  });

  // Toggle: Pedidos
  document.getElementById('btn-pedidos').addEventListener('click', () => {
    const s = document.getElementById('add-friend-section');
    const p = document.getElementById('pending-section');
    const opening = p.style.display === 'none';
    p.style.display = opening ? 'block' : 'none';
    s.style.display = 'none';
  });

  document.getElementById('friend-search-btn').addEventListener('click', doFriendSearch);
  document.getElementById('friend-search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doFriendSearch(); });
}

async function doFriendSearch() {
  const query = document.getElementById('friend-search-input')?.value || '';
  const resultsDiv = document.getElementById('friend-search-results');
  if (!resultsDiv) return;
  if (!query.trim()) { resultsDiv.innerHTML = ''; return; }

  resultsDiv.innerHTML = '<div class="social-loading">Buscando...</div>';

  const results = await searchUsers(query);
  if (!results.length) {
    resultsDiv.innerHTML = '<div class="social-empty">Nenhum usuário encontrado.</div>';
    return;
  }

  const [myFriendIds, sentIds] = await Promise.all([listFriendIds(), listSentRequestIds()]);

  resultsDiv.innerHTML = results.map(u => {
    let btn;
    if (myFriendIds.includes(u.id)) {
      btn = '<span class="friend-tag">Já é amigo ✓</span>';
    } else if (sentIds.includes(u.id)) {
      btn = '<span class="friend-tag pending-tag">⏳ Pedido enviado</span>';
    } else {
      btn = `<button class="btn-add-friend" onclick="handleAddFriend('${u.id}', this)">+ Adicionar</button>`;
    }
    return `<div class="friend-card search-result">
      <div class="friend-avatar" style="cursor:pointer" onclick="openFriendProfile('${u.id}')">${u.avatar}</div>
      <div class="friend-info" style="cursor:pointer" onclick="openFriendProfile('${u.id}')">
        <div class="friend-name">${escHtml(u.name)}</div>
        <div class="friend-username">@${escHtml(u.username)}</div>
        <div class="friend-level">⚔️ Nível ${u.level} · ✨ ${u.xp} XP</div>
        ${u.favoriteSubject ? `<div class="friend-fav">❤️ ${escHtml(u.favoriteSubject)}</div>` : ''}
      </div>
      ${btn}
    </div>`;
  }).join('');
}

/** @deprecated — substituído por doFriendSearch + searchUsers() */
async function doFriendCodeSearch() {
  const input = document.getElementById('friend-code-input') || document.getElementById('friend-search-input');
  if (input) { input.value && doFriendSearch(); }

  if (!results.length) {
    resultsDiv.innerHTML = '<div class="social-empty">Nenhum usuário encontrado com esse código.</div>';
    return;
  }

  const [myFriendIds, sentIds] = await Promise.all([listFriendIds(), listSentRequestIds()]);
  resultsDiv.innerHTML = results
    .filter(u => u.id !== authUserId) // esconde a si mesmo
    .map(u => {
      let btn;
      if (myFriendIds.includes(u.id))  btn = '<span class="friend-tag">Já é amigo ✓</span>';
      else if (sentIds.includes(u.id)) btn = '<span class="friend-tag pending-tag">⏳ Pedido enviado</span>';
      else btn = `<button class="btn-add-friend" onclick="handleAddFriend('${u.id}',this)">+ Adicionar</button>`;
      return `<div class="friend-card search-result">
        <div class="friend-avatar">${u.avatar}</div>
        <div class="friend-info">
          <div class="friend-name">${escHtml(u.name)}</div>
          <div class="friend-level">⚔️ Nível ${u.level} · ✨ ${u.xp} XP</div>
        </div>
        ${btn}
      </div>`;
    }).join('') || '<div class="social-empty">Código pertence a você mesmo. 😄</div>';
}

async function handleCancelFriendRequest(requestId, btn) {
  if (btn) btn.disabled = true;
  await cancelFriendRequest(requestId);
  showNotification('Pedido cancelado.', 'info');
  renderFriendsPage();
}

async function handleAddFriend(friendId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  const { ok, reason } = await sendFriendRequest(friendId);
  if (ok) {
    if (reason === 'auto_accepted') {
      if (btn) btn.outerHTML = '<span class="friend-tag">✅ Amigos!</span>';
      showNotification('🎉 Vocês já são amigos agora!', 'success');
      renderFriendsPage();
    } else {
      if (btn) btn.outerHTML = '<span class="friend-tag pending-tag">⏳ Pedido enviado</span>';
      showNotification('✉️ Pedido de amizade enviado!', 'success');
    }
  } else {
    if (btn) { btn.disabled = false; btn.textContent = '+ Adicionar'; }
    if (reason === 'already_friends') {
      showNotification('Vocês já são amigos! 😄', 'info');
    } else if (reason === 'already_sent') {
      if (btn) btn.outerHTML = '<span class="friend-tag pending-tag">⏳ Pedido enviado</span>';
      showNotification('Você já enviou um pedido para essa pessoa.', 'info');
    } else if (reason === 'permission_denied') {
      showNotification('Permissão negada. Verifique as configurações do banco.', 'error');
    } else {
      showNotification(`Erro ao enviar pedido: ${reason}`, 'error');
    }
  }
}

async function handleAcceptFriend(fromId, requestId, btn) {
  if (btn) btn.disabled = true;
  const res = await acceptFriendRequest(fromId, requestId);
  if (res.ok) {
    showNotification('✅ Pedido aceito! Vocês agora são amigos.', 'success');
    renderFriendsPage();
  } else {
    showNotification('❌ ' + (res.msg || 'Erro ao aceitar pedido.'), 'error');
    console.error('[handleAcceptFriend]', res.msg);
    if (btn) btn.disabled = false;
  }
}

async function handleRejectFriend(requestId, btn) {
  if (btn) btn.disabled = true;
  await rejectFriendRequest(requestId);
  showNotification('Pedido rejeitado.', 'info');
  renderFriendsPage();
}

async function confirmRemoveFriend(friendId) {
  if (!confirm('Remover este amigo?')) return;
  await removeFriend(friendId);
  showNotification('Amigo removido.', 'info');
  renderFriendsPage();
}

async function openFriendProfile(userId) {
  const user = await getUserById(userId);
  if (!user) return showNotification('Perfil não encontrado.', 'warning');

  const achs = (user.achievements || []).map(id => {
    const def = ACHIEVEMENTS_DEF.find(a => a.id === id);
    return def ? `<div class="profile-ach-badge" title="${def.name}">${def.icon}</div>` : '';
  }).join('');

  const avatarEl = document.getElementById('friend-profile-avatar');
  avatarEl.innerHTML = _avatarHtml(user, 'friend-profile-avatar-inner');

  // ── Banner de fundo ──
  const bannerEl = document.getElementById('friend-profile-banner');
  if (bannerEl) {
    // Remove classes de banner anteriores
    const bannerClasses = ['banner_purple','banner_fire','banner_ocean','banner_forest','banner_galaxy'];
    bannerEl.classList.remove(...bannerClasses);
    if (user.equippedBanner) bannerEl.classList.add(user.equippedBanner);
  }

  document.getElementById('friend-profile-name').textContent   = user.name;
  document.getElementById('friend-profile-level').textContent  = `⚔️ Nível ${user.level}`;
  document.getElementById('friend-profile-xp').textContent     = `✨ ${user.xp} XP`;
  document.getElementById('friend-profile-fav').textContent    = user.favoriteSubject ? `❤️ Favorita: ${user.favoriteSubject}` : '';
  document.getElementById('friend-profile-best').textContent   = '';
  document.getElementById('friend-profile-achs').innerHTML     = achs || '<em>Sem conquistas ainda.</em>';

  // ── Medalhas de grupo desta semana ──
  const medalsEl = document.getElementById('friend-profile-medals');
  if (medalsEl) {
    loadUserMedals(userId).then(medals => {
      if (!medals.length) {
        medalsEl.innerHTML = '';
        return;
      }
      const chips = medals.map(m => {
        const def    = GROUP_MEDAL_DEFS.find(d => d.type === m.medal_type);
        const rarity = MEDAL_RARITIES[m.rarity];
        if (!def || !rarity) return '';
        return `<div class="profile-medal-chip" style="color:${rarity.color};border-color:${rarity.color}" title="${def.desc} — ${rarity.label}">
          ${def.icon} ${def.label}
        </div>`;
      }).join('');
      medalsEl.innerHTML = chips
        ? `<div class="profile-medals-section">
             <div class="profile-medals-title">🏅 Medalhas da Semana</div>
             <div class="profile-medals-list">${chips}</div>
           </div>`
        : '';
    }).catch(() => { medalsEl.innerHTML = ''; });
  }

  // Botões de interação (só para amigos reais logados)
  const actionsEl = document.getElementById('friend-profile-actions');
  if (actionsEl && authUserId && userId !== authUserId) {
    actionsEl.innerHTML = `
      <button class="btn-secondary btn-sm" onclick="openMotivationModal('${userId}','${escHtml(user.name)}')">💪 Motivar</button>
      <button class="btn-secondary btn-sm" onclick="openGiftModal('${userId}','${escHtml(user.name)}')">🎁 Dar Presente</button>
    `;
  } else if (actionsEl) {
    actionsEl.innerHTML = '';
  }

  openModal('modal-friend-profile');
}

function openMotivationModal(toId, toName) {
  document.getElementById('motivation-target-name').textContent = toName;
  document.getElementById('motivation-target-id').value = toId;
  const list = document.getElementById('motivation-phrase-list');
  list.innerHTML = MOTIVATION_PHRASES.map((p, i) =>
    `<button class="motivation-phrase-btn" onclick="selectPhrase(this)" data-index="${i}">${escHtml(p)}</button>`
  ).join('');
  openModal('modal-send-motivation');
}

function selectPhrase(btn) {
  document.querySelectorAll('.motivation-phrase-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function handleSendMotivation() {
  const toId  = document.getElementById('motivation-target-id').value;
  const active = document.querySelector('.motivation-phrase-btn.active');
  if (!active) return showNotification('Selecione uma frase!', 'warning');
  const phrase = active.textContent;
  const btn = document.getElementById('send-motivation-btn');
  btn.disabled = true; btn.textContent = 'Enviando...';
  const ok = await sendMotivation(toId, phrase);
  btn.disabled = false; btn.textContent = '💪 Enviar';
  if (ok) {
    showNotification('💪 Motivação enviada!', 'success');
    closeModal('modal-send-motivation');
  } else {
    showNotification('Erro ao enviar. Tente novamente.', 'error');
  }
}

function openGiftModal(toId, toName) {
  document.getElementById('gift-target-name').textContent = toName;
  document.getElementById('gift-target-id').value = toId;
  const list = document.getElementById('gift-item-list');
  list.innerHTML = SHOP_ITEMS.map(item => {
    const cost = Math.floor(item.cost * 1.2);
    const canAfford = state.coins >= cost;
    return `<div class="gift-item ${canAfford ? '' : 'gift-item-disabled'}" onclick="${canAfford ? `selectGiftItem(this,'${item.id}')` : ''}">
      <span class="gift-item-icon">${item.icon}</span>
      <div class="gift-item-name">${item.name}</div>
      <div class="gift-item-cost">💰 ${cost} moedas</div>
    </div>`;
  }).join('');
  openModal('modal-send-gift');
}

function selectGiftItem(el, itemId) {
  document.querySelectorAll('.gift-item').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  el.dataset.itemId = itemId;
}

async function handleSendGift() {
  const toId = document.getElementById('gift-target-id').value;
  const active = document.querySelector('.gift-item.active');
  if (!active) return showNotification('Selecione um item para presentear!', 'warning');
  const itemId = active.dataset.itemId;
  const btn = document.getElementById('send-gift-btn');
  btn.disabled = true; btn.textContent = 'Enviando...';
  const ok = await sendGift(toId, itemId);
  btn.disabled = false; btn.textContent = '🎁 Enviar Presente';
  if (ok) {
    showNotification('🎁 Presente enviado!', 'success');
    closeModal('modal-send-gift');
  }
}

// ============================================================
// NOTIFICAÇÕES PUSH — WEB PUSH API + SUPABASE EDGE FUNCTION
// ============================================================

/**
 * Chave pública VAPID (gerada uma vez — nunca mudar sem reger a Edge Function também).
 * A chave PRIVADA fica SOMENTE nas variáveis de ambiente da Edge Function no Supabase.
 */
const VAPID_PUBLIC_KEY = 'BEdUNLPAv-abfKlkcoxCDY0KKrZXTbvQ1J49sZY2EGbcBbqsKp8i50_g9BQbTbE_dy_GaIL6J1av9m-14x9VaTc';

/** Converte base64url → Uint8Array (necessário para applicationServerKey) */
function _urlBase64ToUint8Array(base64String) {
  const padding  = '='.repeat((4 - base64String.length % 4) % 4);
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData  = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

/**
 * Solicita permissão + cria subscription push + salva no Supabase.
 * Retorna true se ativado, false se bloqueado/não-suportado.
 */
async function initPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Push] Web Push não suportado neste navegador.');
    return false;
  }

  // Verifica se já está subscrito
  const reg = await navigator.serviceWorker.ready;
  const existingSub = await reg.pushManager.getSubscription();
  if (existingSub) {
    await savePushSubscription(existingSub);
    return true;
  }

  // Pede permissão
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.log('[Push] Permissão negada pelo usuário.');
    return false;
  }

  try {
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    await savePushSubscription(subscription);
    console.log('[Push] ✅ Subscrito com sucesso.');
    return true;
  } catch (e) {
    console.warn('[Push] Erro ao criar subscription:', e.message);
    return false;
  }
}

/** Salva (ou atualiza) a push subscription no Supabase */
async function savePushSubscription(subscription) {
  if (!sb || !authUserId) return;
  try {
    await sb.from('push_subscriptions').upsert({
      user_id:      authUserId,
      subscription: subscription.toJSON(),
    }, { onConflict: 'user_id' });
  } catch (e) {
    console.warn('[Push] Erro ao salvar subscription:', e.message);
  }
}

/** Remove a push subscription do Supabase e cancela no browser */
async function disablePushNotifications() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    if (sb && authUserId) {
      await sb.from('push_subscriptions').delete().eq('user_id', authUserId);
    }
    console.log('[Push] Subscription removida.');
  } catch (e) {
    console.warn('[Push] Erro ao desativar push:', e.message);
  }
}

/**
 * Envia notificação push para um usuário via Supabase Edge Function.
 * Só envia se o remetente não for o mesmo que o destinatário.
 *
 * @param {string} toUserId   - UUID do destinatário
 * @param {string} title      - Título da notificação
 * @param {string} body       - Corpo da mensagem
 * @param {object} data       - Dados extras { page, tag, icon }
 */
async function sendPushToUser(toUserId, title, body, data = {}) {
  if (!sb || !toUserId || toUserId === authUserId) return;
  try {
    // Chama a Edge Function via Supabase Functions
    const { error } = await sb.functions.invoke('send-push', {
      body: { toUserId, title, body, data },
    });
    if (error) console.warn('[Push] Edge Function erro:', error.message);
  } catch (e) {
    console.warn('[Push] Falha ao invocar Edge Function:', e.message);
  }
}

/**
 * Verifica se push está habilitado para um tipo específico.
 * O usuário pode desativar tipos individualmente nas configurações.
 */
function _pushPrefEnabled(type) {
  const prefs = state.settings?.pushPrefs || {};
  // Se a chave não existe, considera ativado por padrão
  return prefs[type] !== false;
}

/** Exibe status de permissão no botão de ativação de push */
async function _updatePushStatusUI() {
  const btn   = document.getElementById('push-enable-btn');
  const badge = document.getElementById('push-status-badge');
  if (!btn || !badge) return;

  if (!('PushManager' in window)) {
    badge.textContent = '❌ Não suportado neste navegador';
    badge.className   = 'push-status-badge push-status-unsupported';
    btn.style.display = 'none';
    return;
  }

  const perm = Notification.permission;
  if (perm === 'granted') {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      badge.textContent = '✅ Ativo';
      badge.className   = 'push-status-badge push-status-active';
      btn.textContent   = '🔕 Desativar';
      btn.dataset.state = 'active';
    } else {
      badge.textContent = '⚠️ Permissão concedida mas sem subscription';
      badge.className   = 'push-status-badge push-status-warn';
      btn.textContent   = '🔔 Ativar';
      btn.dataset.state = 'inactive';
    }
  } else if (perm === 'denied') {
    badge.textContent = '🚫 Bloqueado — reative nas configurações do navegador';
    badge.className   = 'push-status-badge push-status-denied';
    btn.style.display = 'none';
  } else {
    badge.textContent = '○ Desativado';
    badge.className   = 'push-status-badge push-status-inactive';
    btn.textContent   = '🔔 Ativar Notificações Push';
    btn.dataset.state = 'inactive';
  }
}

/** Handler do botão ativar/desativar push */
async function handlePushToggle(btn) {
  if (btn.dataset.state === 'active') {
    await disablePushNotifications();
  } else {
    const ok = await initPushNotifications();
    if (!ok) showNotification('Não foi possível ativar as notificações. Verifique as permissões do navegador.', 'warning');
    else     showNotification('🔔 Notificações push ativadas!', 'success');
  }
  await _updatePushStatusUI();
}

/**
 * Ouve mensagens do Service Worker (ex: SW_NAVIGATE após clique em notificação).
 */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    const msg = event.data;
    if (!msg) return;
    if (msg.type === 'SW_NAVIGATE' && msg.page) {
      navigateTo(msg.page);
    }
    if (msg.type === 'SW_PUSH_RESUBSCRIBED' && msg.subscription) {
      // Subscription mudou — atualiza no Supabase
      if (sb && authUserId) {
        sb.from('push_subscriptions').upsert({
          user_id: authUserId, subscription: msg.subscription,
        }, { onConflict: 'user_id' }).catch(() => {});
      }
    }
  });
}

// ── Verificações inteligentes de notificações push ─────────────

/**
 * Verifica se o streak está em risco (fim do dia sem estudar).
 * Só envia se: streak > 0, sem escudo, sem estudo hoje, depois das 20h.
 */
async function checkStreakRiskPush() {
  if (!authUserId || !_pushPrefEnabled('streak')) return;
  const now  = new Date();
  const hour = now.getHours();
  if (hour < 20) return; // só alerta depois das 20h

  const today         = now.toISOString().slice(0, 10);
  const studiedToday  = (state.studyDays || []).includes(today) || state.dailyXp > 0;
  const hasShield     = (state.boosts || []).some(b => b.type === 'streak_shield' && b.charges > 0);
  const streak        = state.streak || 0;

  if (streak > 0 && !studiedToday && !hasShield) {
    // Verifica se já enviou hoje (evita spam)
    const lastKey = 'sq_streak_push_' + today;
    if (localStorage.getItem(lastKey)) return;
    localStorage.setItem(lastKey, '1');

    await sendPushToUser(authUserId,
      '🔥 Sua sequência está em risco!',
      `Você tem ${streak} dias seguidos — estude um pouco hoje para não perder!`,
      { page: 'study', tag: 'streak-risk' }
    );
  }
}

/**
 * Verifica matérias do dia no cronograma e envia lembrete matinal (7–9h).
 */
async function checkSchedulePush() {
  if (!authUserId || !_pushPrefEnabled('daily')) return;
  const now   = new Date();
  const hour  = now.getHours();
  if (hour < 7 || hour > 9) return;

  const today   = now.toISOString().slice(0, 10);
  const lastKey = 'sq_sched_push_' + today;
  if (localStorage.getItem(lastKey)) return;

  const weekday  = now.getDay();
  const subjects = (state.schedule || {})[weekday] || [];
  if (!subjects.length) return;

  localStorage.setItem(lastKey, '1');
  await sendPushToUser(authUserId,
    '📚 Seu cronograma de hoje',
    `Matérias de hoje: ${subjects.slice(0, 3).join(', ')}${subjects.length > 3 ? '...' : ''}`,
    { page: 'calendar', tag: 'daily-schedule' }
  );
}

/** Roda as verificações periódicas de push ao abrir o app */
async function runSmartPushChecks() {
  if (Notification.permission !== 'granted') return;
  // Faz checks em paralelo, silenciando erros individuais
  await Promise.allSettled([
    checkStreakRiskPush(),
    checkSchedulePush(),
  ]);
}

// ============================================================
// GRUPOS — RANKING & MEDALHAS
// ============================================================

/** Chave ISO da semana atual, ex: '2026-W20' */
function _isoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = d.getUTCFullYear();
  const w = Math.ceil((((d - new Date(Date.UTC(y, 0, 1))) / 86400000) + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

/** Início da semana atual (segunda-feira 00:00 UTC) como ISO string */
function _weekStart() {
  const d = new Date();
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Início do dia de hoje (00:00 hora local como UTC) */
function _dayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Cache dos IDs de grupo do usuário logado (evita consultas repetidas) */
let _cachedGroupIds = null;

/**
 * Registra um ganho de XP na tabela group_xp_logs para todos os grupos do usuário.
 * Fire-and-forget — não bloqueia o fluxo principal.
 * @param {number} amount  - quantidade de XP ganho
 * @param {string} source  - fonte: 'general' | 'task_resumo' | 'task_revisao' | 'task_feynman' | 'group_task'
 */
async function logGroupXP(amount, source = 'general') {
  if (!sb || !authUserId || amount <= 0) return;
  try {
    if (!_cachedGroupIds) {
      const { data } = await sb.from('group_members')
        .select('group_id').eq('user_id', authUserId);
      _cachedGroupIds = (data || []).map(r => r.group_id);
    }
    if (!_cachedGroupIds.length) return;

    const rows = _cachedGroupIds.map(gid => ({
      user_id: authUserId, group_id: gid, xp: amount, source,
    }));
    await sb.from('group_xp_logs').insert(rows);
  } catch (e) {
    console.warn('[GroupXP] Erro ao logar:', e.message);
  }
}

/** Invalida o cache de grupos (ex: ao entrar/sair de grupo) */
function _invalidateGroupCache() { _cachedGroupIds = null; }

/** Busca ranking de um grupo (daily | weekly) → [{userId, xp}] ordenado desc */
async function fetchGroupRanking(groupId, period = 'weekly') {
  if (!sb) return [];
  const since = period === 'daily' ? _dayStart() : _weekStart();
  const { data, error } = await sb
    .from('group_xp_logs')
    .select('user_id, xp')
    .eq('group_id', groupId)
    .gte('created_at', since);
  if (error || !data) return [];
  const agg = {};
  for (const row of data) agg[row.user_id] = (agg[row.user_id] || 0) + row.xp;
  return Object.entries(agg)
    .map(([userId, xp]) => ({ userId, xp }))
    .sort((a, b) => b.xp - a.xp);
}

/** Calcula a raridade de uma medalha com base no score do ganhador */
function _medalRarity(score, thresholds) {
  if (score >= thresholds.legendary) return 'legendary';
  if (score >= thresholds.gold)      return 'gold';
  if (score >= thresholds.silver)    return 'silver';
  if (score >= thresholds.bronze)    return 'bronze';
  return null;
}

/**
 * Agrega scores por usuário a partir dos logs da semana.
 * Retorna { [userId]: { totalXp, sessionCount, revisaoCount, feynmanCount, resumoCount, maxDayXp, subjectCount, streak } }
 */
async function _calcMedalScores(groupId, members) {
  if (!sb) return {};
  const { data: logs } = await sb
    .from('group_xp_logs')
    .select('user_id, xp, source, created_at')
    .eq('group_id', groupId)
    .gte('created_at', _weekStart());

  const entries = logs || [];
  const scores  = {};

  for (const m of members) {
    const uid = m.profile?.id;
    if (!uid) continue;

    const uLogs        = entries.filter(e => e.user_id === uid);
    const totalXp      = uLogs.reduce((s, e) => s + (e.xp || 0), 0);
    const sessionCount = uLogs.length;
    const revisaoCount = uLogs.filter(e => e.source === 'task_revisao').length;
    const feynmanCount = uLogs.filter(e => e.source === 'task_feynman').length;
    const resumoCount  = uLogs.filter(e => e.source === 'task_resumo').length;

    // XP máximo em um único dia da semana
    const byDay = {};
    for (const e of uLogs) {
      const day = (e.created_at || '').slice(0, 10);
      byDay[day] = (byDay[day] || 0) + (e.xp || 0);
    }
    const maxDayXp = Object.values(byDay).length ? Math.max(...Object.values(byDay)) : 0;

    // Matérias distintas (source = 'subject:NomeDaMatéria')
    const subjects     = new Set(uLogs.map(e => e.source).filter(s => s?.startsWith('subject:')));
    const subjectCount = subjects.size;

    // Streak vem do perfil carregado
    const streak = m.profile?.streak || 0;

    scores[uid] = { totalXp, sessionCount, revisaoCount, feynmanCount, resumoCount, maxDayXp, subjectCount, streak };
  }
  return scores;
}

/**
 * Calcula e atribui medalhas da semana atual para um grupo.
 * Idempotente — UNIQUE constraint no banco evita duplicatas.
 */
async function calculateAndAwardMedals(groupId, members) {
  if (!sb || !authUserId) return;
  const weekKey = _isoWeekKey();
  const scores  = await _calcMedalScores(groupId, members);
  const uids    = Object.keys(scores);
  if (!uids.length) return;

  // Medalhas já atribuídas esta semana
  const { data: existing } = await sb
    .from('group_medals')
    .select('user_id, medal_type')
    .eq('group_id', groupId)
    .eq('period_key', weekKey);
  const alreadyAwarded = new Set((existing || []).map(r => `${r.medal_type}:${r.user_id}`));

  const toInsert = [];
  for (const def of GROUP_MEDAL_DEFS) {
    // Encontra o ganhador (maior score)
    let best = null, bestScore = -1;
    for (const uid of uids) {
      const s = scores[uid]?.[def.scoreKey] ?? 0;
      if (s > bestScore) { bestScore = s; best = uid; }
    }
    if (!best || bestScore <= 0) continue;

    const rarity = _medalRarity(bestScore, def.rarityThresholds);
    if (!rarity) continue;

    if (alreadyAwarded.has(`${def.type}:${best}`)) continue;

    const r = MEDAL_RARITIES[rarity];
    toInsert.push({
      group_id: groupId, user_id: best, medal_type: def.type,
      rarity, period: 'weekly', period_key: weekKey,
      rewarded_xp: r.xp, rewarded_coins: r.coins,
    });
  }

  if (!toInsert.length) return;

  // Insere (UNIQUE constraint garante idempotência)
  const { data: inserted } = await sb
    .from('group_medals').insert(toInsert).select();

  // Dá recompensas ao usuário logado
  for (const m of (inserted || [])) {
    if (m.user_id !== authUserId) continue;
    const def = GROUP_MEDAL_DEFS.find(d => d.type === m.medal_type);
    if (!def) continue;
    const r = MEDAL_RARITIES[m.rarity];
    addXp(m.rewarded_xp, `${def.icon} ${def.label}`);
    addCoins(m.rewarded_coins);
    showNotification(`🏅 Medalha: ${def.icon} ${def.label} [${r.label}]! +${r.xp} XP`, 'success');

    // Push para o próprio usuário
    if (_pushPrefEnabled('medals')) {
      sendPushToUser(authUserId,
        `🏅 Nova medalha: ${def.label}!`,
        `Você conquistou a medalha "${def.label}" [${r.label}] no grupo. +${r.xp} XP`,
        { page: 'groups', tag: 'medal-awarded' }
      ).catch(() => {});
    }
  }
}

/** Renderiza aba 🏆 Ranking no modal do grupo */
async function renderGroupRanking(groupId, members) {
  const container = document.getElementById('group-view-ranking');
  if (!container) return;
  container.innerHTML = '<div class="social-loading">Carregando ranking...</div>';

  // Índice de perfis por ID
  const profiles = {};
  for (const m of members) { if (m.profile) profiles[m.profile.id] = m.profile; }

  const [daily, weekly] = await Promise.all([
    fetchGroupRanking(groupId, 'daily'),
    fetchGroupRanking(groupId, 'weekly'),
  ]);

  function buildList(list, empty) {
    if (!list.length) return `<div class="social-empty">${empty}</div>`;
    const pos = ['🥇', '🥈', '🥉'];
    const maxXp = list[0].xp || 1;
    return list.map((e, i) => {
      const p    = profiles[e.userId];
      const name = p ? escHtml(p.name) : 'Usuário';
      const av   = p ? p.avatar : '👤';
      const isMe = e.userId === authUserId;
      const pct  = Math.round((e.xp / maxXp) * 100);
      return `
        <div class="ranking-row${isMe ? ' ranking-row-me' : ''}">
          <div class="ranking-pos">${pos[i] || `#${i + 1}`}</div>
          <div class="ranking-avatar">${av}</div>
          <div class="ranking-info">
            <div class="ranking-name">${name}${isMe ? ' <span class="ranking-you-tag">Você</span>' : ''}</div>
            <div class="ranking-xp-bar-wrap"><div class="ranking-xp-bar" style="width:${pct}%"></div></div>
          </div>
          <div class="ranking-xp">+${e.xp} XP</div>
        </div>`;
    }).join('');
  }

  container.innerHTML = `
    <div class="ranking-period-tabs">
      <button class="ranking-period-btn active" onclick="switchRankingPeriod(this,'ranking-panel-daily')">📅 Hoje</button>
      <button class="ranking-period-btn" onclick="switchRankingPeriod(this,'ranking-panel-weekly')">📊 Semana</button>
    </div>
    <div id="ranking-panel-daily" class="ranking-period-panel">
      ${buildList(daily, 'Nenhum XP registrado hoje ainda. Estude para aparecer aqui! 📚')}
    </div>
    <div id="ranking-panel-weekly" class="ranking-period-panel" style="display:none">
      ${buildList(weekly, 'Nenhum XP registrado esta semana. Comece a estudar! 🚀')}
    </div>`;
}

/** Alterna entre período daily/weekly no ranking */
function switchRankingPeriod(btn, panelId) {
  const parent = btn.closest('#group-view-ranking');
  if (!parent) return;
  parent.querySelectorAll('.ranking-period-btn').forEach(b => b.classList.remove('active'));
  parent.querySelectorAll('.ranking-period-panel').forEach(p => { p.style.display = 'none'; });
  btn.classList.add('active');
  const panel = document.getElementById(panelId);
  if (panel) panel.style.display = 'block';
}

/** Renderiza aba 🏅 Medalhas no modal do grupo */
async function renderGroupMedals(groupId, members) {
  const container = document.getElementById('group-view-medals');
  if (!container) return;
  container.innerHTML = '<div class="social-loading">Calculando medalhas...</div>';

  await calculateAndAwardMedals(groupId, members);

  const weekKey = _isoWeekKey();
  const { data: medals } = await sb
    .from('group_medals').select('*')
    .eq('group_id', groupId).eq('period_key', weekKey);

  // Mapeia tipo → medalha atribuída
  const awardedMap = {};
  for (const m of (medals || [])) awardedMap[m.medal_type] = m;

  // Índice de perfis
  const profiles = {};
  for (const m of members) { if (m.profile) profiles[m.profile.id] = m.profile; }

  container.innerHTML = `
    <div class="medals-header">
      <span class="medals-week-label">🗓 ${weekKey.replace('-W', ' · Semana ')}</span>
      <span class="medals-week-label" style="font-size:.7rem">Recompensas renovam toda segunda-feira</span>
    </div>
    <div class="medals-grid">
      ${GROUP_MEDAL_DEFS.map(def => {
        const medal  = awardedMap[def.type];
        const rarity = medal ? MEDAL_RARITIES[medal.rarity] : null;
        const holder = medal ? profiles[medal.user_id] : null;
        const isMe   = medal && medal.user_id === authUserId;
        return `
          <div class="medal-card${rarity ? ' medal-card-active' : ''}"
               ${rarity ? `style="--medal-color:${rarity.color};--medal-bg:${rarity.bg}"` : ''}>
            <div class="medal-icon">${def.icon}</div>
            <div class="medal-label">${def.label}</div>
            ${rarity ? `<div class="medal-rarity-badge" style="background:${rarity.color}">${rarity.label}</div>` : ''}
            <div class="medal-desc">${def.desc}</div>
            ${holder
              ? `<div class="medal-holder${isMe ? ' medal-holder-me' : ''}">
                   <span>${holder.avatar}</span>
                   <span>${escHtml(holder.name)}${isMe ? ' 🎉' : ''}</span>
                 </div>`
              : '<div class="medal-holder medal-holder-empty">Sem ganhador ainda</div>'}
            ${rarity ? `<div class="medal-rewards">+${rarity.xp} XP · +${rarity.coins} 🪙</div>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}

/** Carrega medalhas de um usuário para a semana atual (todos os grupos) */
async function loadUserMedals(userId) {
  if (!sb) return [];
  const { data } = await sb
    .from('group_medals')
    .select('medal_type, rarity, group_id, awarded_at')
    .eq('user_id', userId)
    .eq('period_key', _isoWeekKey())
    .order('rarity', { ascending: false });
  return data || [];
}

// ============================================================
// GRUPOS
// ============================================================

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Usa os primeiros 6 chars do UUID como código de convite (sem coluna extra)
function _groupCode(id) {
  return id ? id.replace(/-/g, '').substring(0, 6).toUpperCase() : '';
}

/** Código de amizade: primeiros 8 hex chars do UUID, maiúsculo */
/** Gera um @username inicial a partir do UUID (usado no primeiro save) */
function _generateUsername(userId) {
  if (!userId) return '';
  return 'user_' + userId.replace(/-/g, '').substring(0, 6).toLowerCase();
}

/** @deprecated — use state.username ou _generateUsername() */
function _friendCode(userId) { return _generateUsername(userId).toUpperCase(); }

function copyFriendCode() {
  const code = state.username || _generateUsername(authUserId);
  navigator.clipboard?.writeText('@' + code)
    .then(() => showNotification('✅ @' + code + ' copiado!', 'success'))
    .catch(() => showNotification('Seu código: @' + code, 'info'));
}

async function createGroup(name) {
  if (!sb || !authUserId) return null;
  try {
    const { data, error } = await sb.from('study_groups').insert({
      name,
      created_by: authUserId,
    }).select().single();
    if (error || !data) {
      console.warn('[Grupo] Erro ao criar:', error?.message);
      return null;
    }
    await sb.from('group_members').insert({ group_id: data.id, user_id: authUserId });
    return data;
  } catch (e) {
    console.warn('[Grupo] Exceção ao criar:', e);
    return null;
  }
}

async function joinGroupByCode(code) {
  if (!sb || !authUserId) return null;
  const clean = code.trim().toUpperCase();
  try {
    // Busca grupos cujo id começa com o código (primeiros 6 chars sem hífens)
    const { data: groups } = await sb.from('study_groups').select('*');
    const group = (groups || []).find(g => _groupCode(g.id) === clean);
    if (!group) return null;
    const { data: existing } = await sb.from('group_members').select('id').eq('group_id', group.id).eq('user_id', authUserId).maybeSingle();
    if (existing) return group;
    await sb.from('group_members').insert({ group_id: group.id, user_id: authUserId });
    _invalidateGroupCache(); // atualiza cache de grupos
    return group;
  } catch (e) { return null; }
}

async function leaveGroup(groupId) {
  if (!sb || !authUserId) return;
  await sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', authUserId);
  _invalidateGroupCache(); // atualiza cache de grupos
}

async function loadMyGroups() {
  if (!sb || !authUserId) return [];
  try {
    const { data: memberships } = await sb.from('group_members').select('group_id').eq('user_id', authUserId);
    if (!memberships || !memberships.length) return [];
    const ids = memberships.map(m => m.group_id);
    const { data: groups } = await sb.from('study_groups').select('*').in('id', ids);
    if (!groups) return [];
    return groups.map(g => ({
      group: g,
      isCreator: g.created_by === authUserId,
    }));
  } catch (e) { return []; }
}

async function loadGroupMembers(groupId) {
  if (!sb) return [];
  try {
    const { data: members } = await sb.from('group_members').select('user_id').eq('group_id', groupId);
    if (!members || !members.length) return [];
    const ids = members.map(m => m.user_id);
    const { data: users } = await sb.from('users').select('id, name, xp, level, data, username').in('id', ids);
    const userMap = {};
    (users || []).forEach(u => { userMap[u.id] = _parseUserRow(u); });
    return members.map(m => ({ profile: userMap[m.user_id] }));
  } catch (e) { return []; }
}

async function renderGroupsPage() {
  const container = document.getElementById('page-groups');
  if (!container) return;

  if (!authUserId) {
    container.innerHTML = '<div class="social-auth-wall"><div class="social-auth-icon">🏰</div><p>Faça login para criar e entrar em grupos de estudo.</p><button class="btn-primary" onclick="showAuthScreen()">Fazer Login</button></div>';
    return;
  }

  container.innerHTML = '<div class="social-loading">Carregando grupos...</div>';
  const myGroups = await loadMyGroups();

  const invites = await listGroupInvites();

  let html = `
    <div class="page-header"><h1>🏰 Grupos de Estudo</h1></div>
    <div class="groups-actions">
      <button class="btn-primary" id="create-group-btn">+ Criar Grupo</button>
      <button class="btn-secondary" id="join-group-btn">🔗 Entrar por Código</button>
      <button class="btn-secondary" id="group-invites-btn">
        📨 Convites${invites.length ? `<span class="notif-badge">${invites.length}</span>` : ''}
      </button>
    </div>
    <div id="group-invites-panel" class="friends-panel" style="display:none">
      <div class="social-section-title">📨 Convites Recebidos (${invites.length})</div>
      ${invites.length ? invites.map(inv => `
        <div class="friend-card">
          <div class="friend-avatar">🏰</div>
          <div class="friend-info">
            <div class="friend-name">${escHtml(inv.group_name)}</div>
            <div class="friend-level">Convidado por ${escHtml(inv.from_name)}</div>
          </div>
          <div class="friend-request-btns">
            <button class="btn-accept" onclick="handleAcceptGroupInvite('${inv.id}','${inv.group_id}',this)">✓ Entrar</button>
            <button class="btn-reject" onclick="handleDeclineGroupInvite('${inv.id}',this)">✕</button>
          </div>
        </div>`).join('') : '<div class="social-empty">Sem convites pendentes.</div>'}
    </div>
  `;

  if (myGroups.length) {
    html += `<div class="social-section-title">🏰 Meus Grupos (${myGroups.length})</div>`;
    html += myGroups.map(mg => {
      const g = mg.group;
      if (!g) return '';
      const code = _groupCode(g.id);
      return `<div class="group-card" onclick="openGroupView('${g.id}')">
        <div class="group-icon">🏰</div>
        <div class="group-info">
          <div class="group-name">${escHtml(g.name)}</div>
          <div class="group-code">Código: <strong>${code}</strong></div>
        </div>
        <div class="group-role">${mg.isCreator ? '👑' : '👤'}</div>
      </div>`;
    }).join('');
  } else {
    html += '<div class="social-empty">Você não está em nenhum grupo ainda. Crie ou entre em um! 🏰</div>';
  }

  container.innerHTML = html;
  document.getElementById('create-group-btn').addEventListener('click', () => openModal('modal-create-group'));
  document.getElementById('join-group-btn').addEventListener('click', () => openModal('modal-join-group'));
  document.getElementById('group-invites-btn').addEventListener('click', () => {
    const panel = document.getElementById('group-invites-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
}

async function openGroupView(groupId) {
  // Reseta abas e conteúdo imediatamente
  document.getElementById('group-view-members').innerHTML = '<div class="social-loading">Carregando...</div>';
  document.getElementById('group-view-tasks').innerHTML   = '<div class="social-loading">Carregando tarefas...</div>';
  document.getElementById('group-view-ranking').innerHTML = '<div class="social-loading">Carregando ranking...</div>';
  document.getElementById('group-view-medals').innerHTML  = '<div class="social-loading">Calculando medalhas...</div>';
  _switchGroupTab('members'); // Sempre abre na aba Membros
  openModal('modal-group-view');

  const [members, group] = await Promise.all([
    loadGroupMembers(groupId),
    sb ? sb.from('study_groups').select('*').eq('id', groupId).single().then(r => r.data) : null,
  ]);

  document.getElementById('modal-group-view').dataset.groupId = groupId;

  if (group) {
    const code = _groupCode(group.id);
    document.getElementById('group-view-title').textContent = group.name;
    document.getElementById('group-view-code').textContent  = `Código de convite: ${code}`;
    document.getElementById('copy-invite-code-btn').dataset.code = code;
  }

  const iAmCreator = group && group.created_by === authUserId;

  // ── Aba Membros ──
  document.getElementById('group-view-members').innerHTML = members.map(m => {
    const p = m.profile;
    if (!p) return '';
    const isCreator = group && group.created_by === p.id;
    const canRemove = iAmCreator && !isCreator;
    return `<div class="friend-card">
      <div class="friend-avatar" style="cursor:pointer" onclick="openFriendProfile('${p.id}')">${p.avatar}</div>
      <div class="friend-info" style="cursor:pointer" onclick="openFriendProfile('${p.id}')">
        <div class="friend-name">${escHtml(p.name)} ${isCreator ? '👑' : ''}</div>
        <div class="friend-level">⚔️ Nível ${p.level} · ✨ ${p.xp} XP</div>
        ${p.favoriteSubject ? `<div class="friend-fav">❤️ ${escHtml(p.favoriteSubject)}</div>` : ''}
      </div>
      ${canRemove ? `<button class="btn-danger-sm" onclick="handleRemoveMember('${groupId}','${p.id}','${escHtml(p.name)}',${members.length})" title="Remover membro">✕</button>` : ''}
    </div>`;
  }).join('') || '<div class="social-empty">Sem membros carregados.</div>';

  // Botão convidar amigo
  const inviteBtn = document.getElementById('invite-friend-btn');
  if (inviteBtn) inviteBtn.onclick = () => openGroupInviteModal(groupId, members);

  // Guarda groupId e flag de admin no modal
  const createTaskBtn = document.getElementById('create-group-task-btn');
  if (createTaskBtn) createTaskBtn.dataset.groupId = groupId;
  document.getElementById('modal-group-view').dataset.isAdmin = iAmCreator ? '1' : '0';

  // ── Aba Tarefas ──
  await renderGroupTasks(groupId, members.length, iAmCreator);

  // ── Wiring das abas (lazy-load ranking e medalhas na primeira visita) ──
  const modal = document.getElementById('modal-group-view');
  // Remove listeners antigos clonando o container de abas
  const tabsContainer = modal.querySelector('.group-tabs');
  const newTabs = tabsContainer.cloneNode(true);
  tabsContainer.replaceWith(newTabs);

  newTabs.querySelectorAll('.group-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tab = btn.dataset.groupTab;
      _switchGroupTab(tab);
      // Lazy-load ao primeira visita de cada aba
      if (tab === 'ranking' && !modal.dataset.rankingLoaded) {
        modal.dataset.rankingLoaded = '1';
        await renderGroupRanking(groupId, members);
      }
      if (tab === 'medals' && !modal.dataset.medalsLoaded) {
        modal.dataset.medalsLoaded = '1';
        await renderGroupMedals(groupId, members);
      }
    });
  });
  // Limpa flags ao abrir novo grupo
  modal.dataset.rankingLoaded = '';
  modal.dataset.medalsLoaded  = '';
}

/** Troca a aba ativa no modal do grupo */
function _switchGroupTab(tabName) {
  const modal = document.getElementById('modal-group-view');
  if (!modal) return;
  modal.querySelectorAll('.group-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.groupTab === tabName);
  });
  modal.querySelectorAll('.group-tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `group-panel-${tabName}`);
  });
}

async function handleCreateGroup() {
  const name = document.getElementById('create-group-name').value.trim();
  if (!name) return showNotification('Digite o nome do grupo!', 'warning');
  const btn = document.getElementById('confirm-create-group-btn');
  btn.disabled = true; btn.textContent = 'Criando...';
  const group = await createGroup(name);
  btn.disabled = false; btn.textContent = 'Criar Grupo';
  if (group) {
    const code = _groupCode(group.id);
    showNotification(`🏰 Grupo "${name}" criado! Código: ${code}`, 'success');
    closeModal('modal-create-group');
    document.getElementById('create-group-name').value = '';
    if (document.getElementById('create-group-desc')) document.getElementById('create-group-desc').value = '';
    renderGroupsPage();
  } else {
    showNotification('Erro ao criar grupo. Tente novamente.', 'error');
  }
}

async function handleJoinGroup() {
  const code = document.getElementById('join-group-code').value.trim();
  if (!code) return showNotification('Digite o código do grupo!', 'warning');
  const btn = document.getElementById('confirm-join-group-btn');
  btn.disabled = true; btn.textContent = 'Entrando...';
  const group = await joinGroupByCode(code);
  btn.disabled = false; btn.textContent = 'Entrar';
  if (group) {
    showNotification('🏰 Você entrou no grupo "' + group.name + '"!', 'success');
    closeModal('modal-join-group');
    document.getElementById('join-group-code').value = '';
    renderGroupsPage();
  } else {
    showNotification('Grupo não encontrado. Verifique o código.', 'error');
  }
}

// ============================================================
// TAREFAS EM GRUPO
// Tabelas: group_tasks  (id, group_id, title, xp_reward, coins_reward,
//                        created_by, created_at, reward_given)
//          group_task_progress (task_id, user_id, reward_received)
// ============================================================

async function loadGroupTasks(groupId) {
  if (!sb) return [];
  try {
    const { data: tasks, error: tasksErr } = await sb
      .from('group_tasks')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });
    if (tasksErr) { console.error('[GroupTask] Erro ao carregar tarefas:', tasksErr.message, tasksErr); return []; }
    if (!tasks || !tasks.length) return [];

    const taskIds = tasks.map(t => t.id);
    const { data: progress, error: progErr } = await sb
      .from('group_task_progress')
      .select('task_id, user_id, reward_received')
      .in('task_id', taskIds);
    if (progErr) console.warn('[GroupTask] Erro ao carregar progresso:', progErr.message, progErr);

    return tasks.map(t => ({
      ...t,
      progress: (progress || []).filter(p => p.task_id === t.id),
    }));
  } catch (e) { console.error('[GroupTask] Exceção em loadGroupTasks:', e); return []; }
}

async function createGroupTask(groupId, title, difficulty) {
  if (!sb || !authUserId) return null;
  const xpReward    = XP_REWARDS[difficulty]   || 20;
  const coinsReward = COIN_REWARDS[difficulty]  || 10;
  try {
    const { data, error } = await sb.from('group_tasks').insert({
      group_id:     groupId,
      title,
      difficulty,
      xp_reward:    xpReward,
      coins_reward: coinsReward,
      created_by:   authUserId,
    }).select().single();
    if (error) { console.error('[GroupTask] Erro ao criar:', error.message, error); return null; }
    return data;
  } catch (e) { console.error('[GroupTask] Exceção ao criar:', e); return null; }
}

/** Dá a recompensa ao usuário atual e marca como recebida no banco */
async function _giveGroupTaskReward(taskId, xpReward, coinsReward) {
  const xp    = Math.max(1, xpReward    || 20);
  const coins = Math.max(1, coinsReward || 10);

  addXp(xp);      // usa o sistema oficial de XP (level-up, histórico, missões)
  addCoins(coins);
  showNotification(`🏆 Recompensa em grupo! +${xp} XP · +${coins} 🪙`, 'success');

  if (sb && authUserId) {
    const { error } = await sb.from('group_task_progress').upsert(
      { task_id: taskId, user_id: authUserId, reward_received: true },
      { onConflict: 'task_id,user_id' }
    );
    if (error) console.error('[GroupTask] Erro ao marcar recompensa recebida:', error.message, error);
  }
}

/**
 * Marca a tarefa como concluída para o usuário atual.
 * Se a maioria (≥50%) tiver concluído e reward_given = false,
 * aciona a recompensa para o grupo e dá ao usuário atual.
 */
async function markGroupTaskDone(taskId, groupId, memberCount, btn) {
  if (!sb || !authUserId) return;
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    // Registra conclusão — INSERT ignorando se já existe (não sobrescreve reward_received=true)
    const { error } = await sb.from('group_task_progress').insert(
      { task_id: taskId, user_id: authUserId, reward_received: false }
    ).select().maybeSingle();
    // Ignora erro de unicidade (código 23505 = duplicate key); outros erros são bloqueantes
    if (error && error.code !== '23505') {
      console.error('[GroupTask] Erro ao marcar progresso:', error.message, error);
      if (btn) { btn.disabled = false; btn.textContent = '✓ Marcar como feita'; }
      return;
    }

    // Recarrega a tarefa para verificar reward_given
    const { data: task } = await sb.from('group_tasks').select('*').eq('id', taskId).single();
    if (!task) return;

    if (!task.reward_given) {
      // Conta quantos já concluíram
      const { count } = await sb
        .from('group_task_progress')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', taskId);

      const needed = Math.ceil(memberCount * 0.5);
      if ((count || 0) >= needed) {
        // Maioria atingida → ativa a recompensa para o grupo
        await sb.from('group_tasks').update({ reward_given: true }).eq('id', taskId);
        task.reward_given = true;
      }
    }

    // Se a recompensa foi ativada e o usuário atual ainda não recebeu → dá agora
    if (task.reward_given) {
      const { data: myRow } = await sb
        .from('group_task_progress')
        .select('reward_received')
        .eq('task_id', taskId)
        .eq('user_id', authUserId)
        .maybeSingle();

      // Dá recompensa se: linha não existe OU reward_received ainda é false
      if (!myRow || !myRow.reward_received) {
        await _giveGroupTaskReward(taskId, task.xp_reward || 20, task.coins_reward || 10);
      }
    } else {
      showNotification('✅ Tarefa marcada! Aguardando outros membros...', 'info');
    }

    // Atualiza a lista de tarefas no modal
    const _isAdmin = document.getElementById('modal-group-view')?.dataset.isAdmin === '1';
    await renderGroupTasks(groupId, memberCount, _isAdmin);
  } catch (e) {
    console.warn('[GroupTask] Exceção em markGroupTaskDone:', e);
    if (btn) { btn.disabled = false; btn.textContent = '✓ Marcar como feita'; }
  }
}

/** Renderiza as tarefas no modal do grupo e auto-entrega recompensas pendentes */
async function renderGroupTasks(groupId, memberCount, isAdmin = false) {
  const container = document.getElementById('group-view-tasks');
  if (!container) return;

  try {
    const tasks = await loadGroupTasks(groupId);

    if (!tasks.length) {
      container.innerHTML = '<div class="social-empty" style="margin:.25rem 0 0">Sem tarefas ainda. Crie a primeira! 📋</div>';
      return;
    }

    // Auto-entrega: para cada tarefa com reward_given = true,
    // verifica se o usuário atual ainda não recebeu (linha inexistente OU reward_received = false)
    for (const task of tasks) {
      if (!task.reward_given) continue;
      const myRow = task.progress.find(p => p.user_id === authUserId);
      const jaRecebeu = myRow && myRow.reward_received;
      if (!jaRecebeu) {
        await _giveGroupTaskReward(task.id, task.xp_reward || 20, task.coins_reward || 10);
        // Atualiza localmente para evitar dar novamente na próxima iteração
        if (myRow) myRow.reward_received = true;
        else task.progress.push({ user_id: authUserId, reward_received: true });
      }
    }

    const diffLabels = { easy: '😊 Fácil', medium: '😤 Médio', hard: '💀 Difícil' };
    const diffClass  = { easy: 'badge-easy', medium: 'badge-medium', hard: 'badge-hard' };

    container.innerHTML = tasks.map(task => {
      const completedCount = task.progress.length;
      const needed         = Math.max(1, Math.ceil(memberCount * 0.5));
      const pct            = memberCount > 0 ? Math.round((completedCount / memberCount) * 100) : 0;
      const iDone          = task.progress.some(p => p.user_id === authUserId);
      const rewardGiven    = task.reward_given;
      const diff           = task.difficulty || 'medium';

      return `<div class="group-task-card">
        <div class="group-task-header">
          <div class="group-task-title">${escHtml(task.title)}</div>
          <div style="display:flex;align-items:center;gap:.4rem;flex-shrink:0">
            <span class="task-badge ${diffClass[diff]}">${diffLabels[diff]}</span>
            ${isAdmin ? `<button class="btn-danger-sm" title="Excluir tarefa" onclick="deleteGroupTask('${task.id}','${groupId}',${memberCount})">🗑</button>` : ''}
          </div>
        </div>
        <div class="group-task-rewards-row">⚡ +${task.xp_reward} XP · 🪙 +${task.coins_reward} moedas</div>
        <div class="group-task-progress-wrap">
          <div class="group-task-progress-bar">
            <div class="group-task-progress-fill ${rewardGiven ? 'done' : ''}" style="width:${pct}%"></div>
          </div>
          <span class="group-task-pct">${pct}%</span>
        </div>
        <div class="group-task-meta">
          <span>${completedCount} de ${memberCount} concluíram</span>
          ${rewardGiven
            ? '<span class="group-task-rewarded">🏆 Recompensa liberada!</span>'
            : `<span class="group-task-need">Faltam ${Math.max(0, needed - completedCount)} para a recompensa</span>`}
        </div>
        <div class="group-task-actions">
          ${iDone
            ? '<span class="group-task-done-badge">✅ Você concluiu</span>'
            : `<button class="btn-primary btn-sm" onclick="markGroupTaskDone('${task.id}','${groupId}',${memberCount},this)">✓ Marcar como feita</button>`}
        </div>
      </div>`;
    }).join('');

  } catch (e) {
    console.error('[GroupTask] Erro ao renderizar tarefas:', e);
    container.innerHTML = '<div class="social-empty">Erro ao carregar tarefas. Feche e abra o grupo novamente.</div>';
  }
}

async function deleteGroupTask(taskId, groupId, memberCount) {
  if (!sb || !authUserId) return;
  if (!confirm('Excluir esta tarefa? Essa ação não pode ser desfeita.')) return;

  const { error } = await sb.from('group_tasks').delete().eq('id', taskId);
  if (error) {
    console.error('[GroupTask] Erro ao excluir:', error.message, error);
    return showNotification('Erro ao excluir tarefa.', 'error');
  }
  showNotification('🗑 Tarefa excluída.', 'info');
  const isAdmin = document.getElementById('modal-group-view')?.dataset.isAdmin === '1';
  await renderGroupTasks(groupId, memberCount, isAdmin);
}

async function handleCreateGroupTask() {
  const groupId    = document.getElementById('create-group-task-btn')?.dataset.groupId;
  const title      = document.getElementById('group-task-title').value.trim();
  const difficulty = document.querySelector('.gt-diff-btn.active')?.dataset.diff || 'medium';

  if (!groupId) return showNotification('Erro: grupo não identificado.', 'error');
  if (!title)   return showNotification('Digite o título da tarefa!', 'warning');

  const btn = document.getElementById('confirm-create-group-task-btn');
  btn.disabled = true; btn.textContent = 'Criando...';

  const task = await createGroupTask(groupId, title, difficulty);

  btn.disabled = false; btn.textContent = 'Criar Tarefa';

  if (task) {
    showNotification('📋 Tarefa criada com sucesso!', 'success');
    closeModal('modal-create-group-task');
    document.getElementById('group-task-title').value = '';
    // Reset difficulty to easy
    document.querySelectorAll('.gt-diff-btn').forEach(b => b.classList.remove('active'));
    const easyBtn = document.querySelector('.gt-diff-btn[data-diff="easy"]');
    if (easyBtn) easyBtn.classList.add('active');
    const members = await loadGroupMembers(groupId);
    const _isAdmin = document.getElementById('modal-group-view')?.dataset.isAdmin === '1';
    await renderGroupTasks(groupId, members.length, _isAdmin);
  } else {
    showNotification('Erro ao criar tarefa. Tente novamente.', 'error');
  }
}

// ============================================================
// CONVITES DE GRUPO — tabela group_invites
// (group_id, from_id, to_id, status, created_at)
// ============================================================

/** Envia convite para um amigo entrar no grupo */
async function sendGroupInvite(groupId, toId) {
  if (!sb || !authUserId) return false;
  try {
    const { error } = await sb.from('group_invites').insert({
      group_id: groupId, from_id: authUserId, to_id: toId, status: 'pending',
    });
    if (error) return false;

    // Push para o convidado
    if (_pushPrefEnabled('groups')) {
      // Busca nome do grupo para a mensagem
      sb.from('study_groups').select('name').eq('id', groupId).single()
        .then(({ data: g }) => {
          const groupName = g?.name || 'um grupo';
          sendPushToUser(toId,
            '🏰 Convite de grupo!',
            `${escHtml(state.name || 'Alguém')} te convidou para "${escHtml(groupName)}" no StudyQuest.`,
            { page: 'groups', tag: 'group-invite' }
          );
        }).catch(() => {});
    }
    return true;
  } catch (e) { return false; }
}

/** Lista convites pendentes recebidos pelo usuário atual */
async function listGroupInvites() {
  if (!sb || !authUserId) return [];
  try {
    const { data: invites } = await sb
      .from('group_invites').select('id, group_id, from_id').eq('to_id', authUserId).eq('status', 'pending');
    if (!invites || !invites.length) return [];

    const groupIds  = [...new Set(invites.map(i => i.group_id))];
    const fromIds   = [...new Set(invites.map(i => i.from_id))];
    const [{ data: groups }, { data: fromUsers }] = await Promise.all([
      sb.from('study_groups').select('id, name').in('id', groupIds),
      sb.from('users').select('id, name').in('id', fromIds),
    ]);
    const gMap = {}; (groups   || []).forEach(g => { gMap[g.id] = g.name; });
    const uMap = {}; (fromUsers || []).forEach(u => { uMap[u.id] = u.name || 'Alguém'; });

    return invites.map(i => ({
      id: i.id, group_id: i.group_id,
      group_name: gMap[i.group_id] || 'Grupo',
      from_name:  uMap[i.from_id]  || 'Alguém',
    }));
  } catch (e) { return []; }
}

/** Aceita convite: entra no grupo e exclui o convite */
async function acceptGroupInvite(inviteId, groupId) {
  if (!sb || !authUserId) return false;
  try {
    const { data: existing } = await sb.from('group_members')
      .select('user_id').eq('group_id', groupId).eq('user_id', authUserId).maybeSingle();
    if (!existing) {
      await sb.from('group_members').insert({ group_id: groupId, user_id: authUserId });
    }
    await sb.from('group_invites').delete().eq('id', inviteId);
    return true;
  } catch (e) { return false; }
}

/** Recusa convite */
async function declineGroupInvite(inviteId) {
  if (!sb || !authUserId) return;
  try { await sb.from('group_invites').delete().eq('id', inviteId); } catch (e) {}
}

/** Cancela convite que EU enviei */
async function cancelGroupInvite(inviteId) {
  if (!sb || !authUserId) return;
  try { await sb.from('group_invites').delete().eq('id', inviteId).eq('from_id', authUserId); } catch (e) {}
}

/** Remove um membro do grupo (apenas o criador pode chamar) */
async function removeMemberFromGroup(groupId, userId) {
  if (!sb || !authUserId) return false;
  try {
    await sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
    return true;
  } catch (e) { return false; }
}

/** Abre modal de convite mostrando amigos que ainda não estão no grupo */
async function openGroupInviteModal(groupId, currentMembers) {
  const listEl = document.getElementById('invite-friend-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="social-loading">Carregando amigos...</div>';
  openModal('modal-invite-to-group');

  const memberIds = currentMembers.map(m => m.profile?.id).filter(Boolean);
  const friends   = await listFriendsWithData();
  const available = friends.filter(f => !memberIds.includes(f.id));

  // Busca convites pendentes enviados por MIM (para mostrar cancelar)
  let pendingInvites = [];
  if (sb && authUserId) {
    const { data } = await sb.from('group_invites')
      .select('id, to_id').eq('group_id', groupId).eq('from_id', authUserId).eq('status', 'pending');
    pendingInvites = data || [];
  }
  const pendingMap = {};
  pendingInvites.forEach(r => { pendingMap[r.to_id] = r.id; });

  const availableHtml = available.length
    ? available.map(f => {
        const invId = pendingMap[f.id];
        const btn = invId
          ? `<button class="btn-reject" onclick="handleCancelGroupInvite('${invId}','${groupId}',this)" title="Cancelar convite">✕ Cancelar</button>`
          : `<button class="btn-primary btn-sm" onclick="handleSendGroupInvite('${groupId}','${f.id}',this)">+ Convidar</button>`;
        return `<div class="friend-card">
          <div class="friend-avatar">${f.avatar}</div>
          <div class="friend-info">
            <div class="friend-name">${escHtml(f.name)}</div>
            <div class="friend-level">⚔️ Nível ${f.level} · ✨ ${f.xp} XP</div>
          </div>
          ${btn}
        </div>`;
      }).join('')
    : '<div class="social-empty">Todos os seus amigos já estão no grupo! 😊</div>';

  listEl.innerHTML = availableHtml;
}

async function handleCancelGroupInvite(inviteId, groupId, btn) {
  if (btn) btn.disabled = true;
  await cancelGroupInvite(inviteId);
  showNotification('Convite cancelado.', 'info');
  // Reabre o modal atualizado
  const modal = document.getElementById('modal-group-view');
  const memberCount = parseInt(modal?.dataset.memberCount || '0', 10);
  const members = await loadGroupMembers(groupId);
  await openGroupInviteModal(groupId, members);
}

async function handleSendGroupInvite(groupId, toId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  const ok = await sendGroupInvite(groupId, toId);
  if (ok) {
    if (btn) btn.outerHTML = '<span class="friend-tag pending-tag">⏳ Convite enviado</span>';
    showNotification('✉️ Convite enviado!', 'success');
  } else {
    if (btn) { btn.disabled = false; btn.textContent = '+ Convidar'; }
    showNotification('Erro ao enviar convite.', 'error');
  }
}

async function handleAcceptGroupInvite(inviteId, groupId, btn) {
  if (btn) btn.disabled = true;
  const ok = await acceptGroupInvite(inviteId, groupId);
  if (ok) {
    showNotification('🏰 Você entrou no grupo!', 'success');
    renderGroupsPage();
  } else {
    showNotification('Erro ao aceitar convite.', 'error');
    if (btn) btn.disabled = false;
  }
}

async function handleDeclineGroupInvite(inviteId, btn) {
  if (btn) btn.disabled = true;
  await declineGroupInvite(inviteId);
  showNotification('Convite recusado.', 'info');
  renderGroupsPage();
}

async function handleRemoveMember(groupId, userId, userName, memberCount) {
  if (!confirm(`Remover "${userName}" do grupo?`)) return;
  const ok = await removeMemberFromGroup(groupId, userId);
  if (ok) {
    showNotification(`${userName} foi removido do grupo.`, 'info');
    // Re-abre o modal com dados atualizados
    await openGroupView(groupId);
  } else {
    showNotification('Erro ao remover membro.', 'error');
  }
}

function initSocialModals() {
  // Create group
  const confirmCreate = document.getElementById('confirm-create-group-btn');
  if (confirmCreate) confirmCreate.addEventListener('click', handleCreateGroup);

  // Join group
  const confirmJoin = document.getElementById('confirm-join-group-btn');
  if (confirmJoin) confirmJoin.addEventListener('click', handleJoinGroup);
  const joinInput = document.getElementById('join-group-code');
  if (joinInput) joinInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleJoinGroup(); });

  // Copy invite code
  const copyBtn = document.getElementById('copy-invite-code-btn');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    const code = copyBtn.dataset.code;
    if (code) navigator.clipboard.writeText(code).then(() => showNotification('✅ Código copiado!', 'success'));
  });

  // Leave group
  const leaveBtn = document.getElementById('leave-group-btn');
  if (leaveBtn) leaveBtn.addEventListener('click', async () => {
    const gid = document.getElementById('modal-group-view').dataset.groupId;
    if (!gid || !confirm('Sair deste grupo?')) return;
    await leaveGroup(gid);
    closeModal('modal-group-view');
    showNotification('Você saiu do grupo.', 'info');
    renderGroupsPage();
  });

  // Botões de dificuldade do modal de tarefa em grupo
  document.querySelectorAll('.gt-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gt-diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Abrir modal de nova tarefa (botão dentro do modal de grupo)
  document.addEventListener('click', e => {
    if (e.target && e.target.id === 'create-group-task-btn') {
      openModal('modal-create-group-task');
    }
  });

  // Confirmar criação de tarefa em grupo
  const confirmTask = document.getElementById('confirm-create-group-task-btn');
  if (confirmTask) confirmTask.addEventListener('click', handleCreateGroupTask);
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// IA COM IACOIN — integração Gemini API
// ============================================================

const _GEMINI_LS = 'sq_gemini_key';
let _aiCurrentMode = 'chat_normal';

/** Hash simples e determinístico para deduplicar perguntas no knowledge_base */
function _hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = Math.imul(31, h) + str.charCodeAt(i) | 0; }
  return Math.abs(h).toString(16).padStart(8, '0');
}

/** Verifica se a pergunta já existe no cache (knowledge_base) */
async function checkKnowledgeBase(question, mode) {
  if (!sb) return null;
  try {
    const hash = _hashStr((question + '|' + mode).toLowerCase().trim());
    const { data } = await sb.from('knowledge_base').select('answer').eq('question_hash', hash).maybeSingle();
    return data?.answer || null;
  } catch { return null; }
}

/** Salva resposta da IA no cache */
async function saveToKnowledgeBase(question, answer, mode) {
  if (!sb) return;
  try {
    const hash = _hashStr((question + '|' + mode).toLowerCase().trim());
    await sb.from('knowledge_base')
      .upsert({ question_hash: hash, question: question.trim(), answer, mode }, { onConflict: 'question_hash', ignoreDuplicates: true });
  } catch {}
}

/** Chama a Gemini API com o prompt formatado pelo modo */
async function callGeminiAPI(question, mode) {
  const key = localStorage.getItem(_GEMINI_LS) || '';
  if (!key) throw new Error('NO_KEY');

  const systemMap = {
    chat_normal: 'Você é um assistente educacional amigável e direto. Responda de forma clara e concisa em português.',
    explicar:    'Você é um professor especialista. Explique o conceito detalhadamente com exemplos práticos e analogias em português.',
    resumo:      'Você é um especialista em síntese. Crie um resumo estruturado em tópicos do conteúdo fornecido em português.',
    quiz:        'Você é um professor criativo. Crie exatamente 5 questões de múltipla escolha com 4 alternativas e gabarito comentado em português.',
    prova:       'Você é um professor rigoroso. Crie uma prova completa com 10 questões variadas (múltipla escolha, dissertativas e V/F) com gabarito detalhado em português.',
  };

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemMap[mode] || systemMap.chat_normal}\n\nTarefa: ${question}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erro ${resp.status}`);
  }
  const json = await resp.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta da IA.';
}

/* ── IA LOCAL ────────────────────────────────────────────────────────────── */

/** Remove acentos, lowercase, pontuação */
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Detecta se a pergunta é um cálculo */
function isCalculo(text) {
  const n = normalizeText(text);
  const palavras = ['calcular','calcula','calcule','quanto e','quanto vale','resultado de','quanto fica','me diz quanto','conta quanto','qual e o resultado'];
  if (palavras.some(p => n.includes(p))) return true;
  return /\d[\d\s]*[+\-*/]\s*\d/.test(text);
}

/** Extrai e avalia expressão matemática de forma segura (sem eval direto) */
function calcular(text) {
  let expr = text.replace(/[^0-9+\-*/().]/g, ' ').replace(/\s+/g, '').trim();
  if (!expr || !/\d/.test(expr) || !(/[+\-*/]/.test(expr))) return null;
  if (!/^[0-9+\-*/.()]+$/.test(expr)) return null;
  if (/\/0(?!\.)/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function('"use strict"; return (' + expr + ')')();
    if (typeof result !== 'number' || !isFinite(result)) return null;
    return Number.isInteger(result) ? result : Math.round(result * 100000) / 100000;
  } catch { return null; }
}

/** Detecta a intenção do usuário: 'prova' | 'resumo' | 'explicar' */
function detectarIntencao(text) {
  const n = normalizeText(text);
  if (/\b(cri[ae]|gere?|faca|quiz|prova|questoes?|exercicios?|teste)\b/.test(n)) return 'prova';
  if (/\b(resum[eo]|sintetize?|em poucas palavras)\b/.test(n)) return 'resumo';
  return 'explicar';
}

/**
 * Retorna true se a mensagem é uma resposta conversacional
 * e NÃO deve acionar busca no banco/Wikipédia.
 * Regras: <= 4 palavras com conteúdo OU frases de resposta conhecidas.
 */
function isConversacional(text) {
  const n = normalizeText(text);
  const palavras = n.split(' ').filter(w => w.length > 1);

  // Muito curto → conversacional
  if (palavras.length <= 2) return true;

  // Frases de resposta que NÃO são perguntas/buscas
  const respostas = [
    'nao sei', 'nao lembro', 'nao tenho certeza', 'nao entendi',
    'nao compreendi', 'nao consigo', 'nao consigo lembrar',
    'esqueci', 'me esqueci',
    'sim', 'nao', 'talvez', 'mais ou menos',
    'ok', 'certo', 'entendi', 'compreendi', 'ah entendi', 'ah sim',
    'obrigado', 'obrigada', 'valeu', 'show', 'legal', 'otimo',
    'perfeito', 'exato', 'isso mesmo', 'correto',
    'pode repetir', 'pode explicar melhor', 'nao ficou claro',
    'como assim', 'pode dar um exemplo',
  ];
  if (respostas.some(r => n === r || n.startsWith(r + ' '))) return true;

  // 3-4 palavras onde a primeira é uma resposta conhecida
  const primeiras = ['nao', 'sim', 'talvez', 'ok', 'certo', 'entendi',
                     'obrigado', 'obrigada', 'valeu', 'legal', 'show', 'esqueci'];
  if (palavras.length <= 4 && primeiras.includes(palavras[0])) return true;

  return false;
}

/**
 * Lê o histórico e retorna contexto do último turno da IA:
 * { modo: 'prova'|'explicar'|'calc'|null, topico: string|null, conteudo: string }
 */
function _contextoAnterior() {
  const history = state.aiHistory || [];
  const lastAI  = [...history].reverse().find(m => m.role === 'ai');
  if (!lastAI) return { modo: null, topico: null, conteudo: '' };

  const c = lastAI.content || '';

  // Detecta modo pelo conteúdo
  let modo = 'explicar';
  if (c.includes('Mini-prova:') || /\*\*\d+\.\*\*/.test(c)) modo = 'prova';
  else if (lastAI.source === 'calc') modo = 'calc';

  // Tenta extrair o tópico
  const matchProva   = c.match(/Mini-prova:\s*\*?\*?([^\*\n]+)/);
  const matchTitulo  = c.match(/\*\*([^\*]+)\*\*/);
  const topico = (matchProva?.[1] || matchTitulo?.[1] || '').trim() || null;

  return { modo, topico, conteudo: c };
}

/**
 * Gera uma resposta contextual para mensagens conversacionais,
 * levando em conta o que a IA estava fazendo antes.
 */
function gerarRespostaContextual(text) {
  const n   = normalizeText(text);
  const ctx = _contextoAnterior();

  /* ── "não sei" / "esqueci" ── */
  if (/nao sei|nao lembro|esqueci|nao tenho certeza|nao consigo lembrar/.test(n)) {
    if (ctx.modo === 'prova' && ctx.topico) {
      return `Tudo bem, estudar é um processo! 😊\n\nSobre **${ctx.topico}**, tente reler o material de referência que apareceu logo abaixo das perguntas da prova. Quando sentir que está pronto, pode me pedir para tentar novamente ou perguntar qualquer dúvida específica!`;
    }
    if (ctx.topico) {
      return `Sem problema! 😊 Quer que eu explique **${ctx.topico}** de uma forma diferente, talvez com um exemplo prático?`;
    }
    return `Tudo bem não saber! 😊 Me conta qual parte ficou mais confusa e eu te ajudo a entender melhor.`;
  }

  /* ── "não entendi" / "pode explicar" ── */
  if (/nao entendi|nao compreendi|nao ficou claro|pode explicar|como assim|pode dar um exemplo/.test(n)) {
    if (ctx.topico) {
      return `Claro! 😊 Me diz qual parte de **${ctx.topico}** não ficou clara e eu explico de outro jeito. Ou, se preferir, escreva "explique ${ctx.topico}" que eu faço uma explicação mais detalhada com exemplos!`;
    }
    return `Pode me dizer o que não ficou claro? Assim consigo te explicar melhor! 😊`;
  }

  /* ── "pode repetir" ── */
  if (/pode repetir|repita|repete/.test(n)) {
    if (ctx.conteudo) {
      return `Claro! Aqui está novamente:\n\n${ctx.conteudo}`;
    }
    return `Pode me dizer o que quer que eu repita? 😊`;
  }

  /* ── confirmações positivas (ok, entendi, obrigado…) ── */
  if (/^(ok|certo|entendi|compreendi|ah (entendi|sim|certo)|obrigad|valeu|show|legal|otimo|perfeito|exato|isso mesmo|correto)/.test(n)) {
    if (ctx.modo === 'prova') {
      return `Ótimo! 🎉 Quando terminar de responder as perguntas, me manda suas respostas e eu te dou um feedback. Ou, se quiser uma nova prova sobre outro assunto, é só pedir!`;
    }
    return `Fico feliz em ajudar! 😊 Se tiver mais alguma dúvida, pode perguntar à vontade.`;
  }

  /* ── sim / não simples ── */
  if (/^(sim|nao|talvez|mais ou menos)$/.test(n)) {
    if (ctx.modo === 'prova') {
      return `Para responder a prova, escreva as respostas completas abaixo de cada pergunta. Estou aqui para ajudar se tiver dúvidas! 😊`;
    }
    return `Entendido! 😊 Quer saber mais sobre algum assunto específico?`;
  }

  /* ── fallback conversacional genérico ── */
  return `Hmm, não entendi bem o que você quis dizer. 😊 Pode reformular sua pergunta? Por exemplo:\n- *"O que é fotossíntese?"*\n- *"Crie uma prova sobre Segunda Guerra Mundial"*\n- *"Quanto é 15 × 8?"*`;
}

/** Gera perguntas simples a partir de um título e texto */
function gerarProva(titulo, texto) {
  const frases = texto
    .replace(/\n+/g, ' ')
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 40)
    .slice(0, 3);

  const perguntas = [
    `**1.** O que é ${titulo}?`,
    `**2.** Qual a importância de ${titulo}?`,
    `**3.** Cite pelo menos duas características de ${titulo}.`,
    ...frases.map((f, i) => `**${i + 4}.** Com base no texto, explique: *"${f.slice(0, 90)}…"*`),
  ].slice(0, 5);

  return `📋 **Mini-prova: ${titulo}**\n\n${perguntas.join('\n\n')}\n\n---\n📖 *Material de referência:*\n${texto.slice(0, 250)}${texto.length > 250 ? '…' : ''}`;
}

/** Extrai o termo de busca principal da pergunta (remove stopwords) */
function extrairTermoBusca(question) {
  const stopwords = new Set([
    'o','a','os','as','um','uma','de','do','da','dos','das','em','no','na','nos','nas',
    'que','e','ou','por','para','com','sem','sobre','qual','quais','como','quando',
    'onde','quem','quanto','me','te','se','nos','lhe','isso','isto','esse','essa',
    'este','esta','explique','explica','defina','define','resumo','resuma','crie',
    'criar','gerar','gere','faca','prova','quiz','questoes','questao','o que',
    'qual e','voce','pode','seria','poderia','falar','dizer','sobre','acerca',
  ]);
  const norm  = normalizeText(question);
  const words = norm.split(' ').filter(w => w.length > 2 && !stopwords.has(w));
  return words.slice(0, 4).join(' ') || norm.slice(0, 40);
}

/** Busca na Wikipédia em português (resumo, sem texto completo) */
async function buscarWikipedia(question) {
  const termo = extrairTermoBusca(question);
  if (!termo) return null;

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 6000);

  try {
    // 1. Pesquisa pelo título mais próximo
    const searchUrl =
      `https://pt.wikipedia.org/w/api.php?action=query&list=search` +
      `&srsearch=${encodeURIComponent(termo)}&format=json&origin=*&srlimit=1&srnamespace=0`;
    const sResp = await fetch(searchUrl, { signal: controller.signal });
    if (!sResp.ok) { clearTimeout(tid); return { error: 'wiki_unavailable' }; }
    const sData  = await sResp.json();
    const hit    = sData.query?.search?.[0];
    if (!hit) { clearTimeout(tid); return null; }

    // 2. Busca o resumo da página encontrada
    const pageTitle  = encodeURIComponent(hit.title);
    const sumUrl     = `https://pt.wikipedia.org/api/rest_v1/page/summary/${pageTitle}`;
    const sumResp    = await fetch(sumUrl, { signal: controller.signal });
    clearTimeout(tid);
    if (!sumResp.ok) return null;
    const sumData = await sumResp.json();
    if (!sumData.extract) return null;

    return {
      title:       sumData.title,
      description: sumData.description || '',
      extract:     sumData.extract.slice(0, 700),
      url:         sumData.content_urls?.desktop?.page || '',
    };
  } catch (e) {
    clearTimeout(tid);
    if (e.name === 'AbortError') return { error: 'wiki_timeout' };
    return { error: 'wiki_error' };
  }
}

/** Carrega artigos da base de conhecimento do Supabase */
async function loadKBArticles() {
  if (!sb) return [];
  try {
    const { data } = await sb.from('kb_articles').select('*').order('created_at', { ascending: false });
    return data || [];
  } catch { return []; }
}

/** Busca o artigo mais relevante no banco para a pergunta */
async function buscarNoBanco(question) {
  if (!sb) return null;
  try {
    const articles = await loadKBArticles();
    if (!articles.length) return null;

    const norm  = normalizeText(question);
    const words = norm.split(' ').filter(w => w.length > 2);
    if (!words.length) return null;

    let best = null, bestScore = 0;

    for (const art of articles) {
      let score = 0;
      const tTitle   = normalizeText(art.title   || '');
      const tSubject = normalizeText(art.subject  || '');
      const tContent = normalizeText(art.content  || '');
      const tTags    = (art.tags || []).map(t => normalizeText(t));

      for (const w of words) {
        if (tTitle.includes(w))              score += 4;
        if (tSubject.includes(w))            score += 3;
        if (tTags.some(t => t.includes(w)))  score += 3;
        if (tContent.includes(w))            score += 1;
      }

      if (score > bestScore) { bestScore = score; best = art; }
    }

    return bestScore >= 3 ? best : null;
  } catch { return null; }
}

/** Fluxo principal local: contexto → calculadora → banco → Wikipédia → null */
async function responderLocalAI(question) {
  // 1. Mensagem conversacional? Responde com contexto, sem buscar
  if (isConversacional(question)) {
    const resposta = gerarRespostaContextual(question);
    return { ok: true, answer: resposta, cost: 0, source: 'kb' };
  }

  // 2. Calculadora
  if (isCalculo(question)) {
    const res = calcular(question);
    if (res !== null) {
      return { ok: true, answer: `🧮 **Resultado: ${res}**`, cost: 0, source: 'calc' };
    }
  }

  const intencao = detectarIntencao(question);

  // 2. Base de conhecimento local
  const art = await buscarNoBanco(question);
  if (art) {
    const tagsLine = art.tags?.length ? `\n\n*Tags: ${art.tags.join(', ')}*` : '';
    const body = intencao === 'prova'
      ? gerarProva(art.title, art.content)
      : intencao === 'resumo'
        ? `📚 **${art.title}** — Resumo\n\n${art.content.slice(0, 400)}${art.content.length > 400 ? '…' : ''}${tagsLine}`
        : `📚 **${art.title}**\n\n${art.content}${tagsLine}`;
    return { ok: true, answer: body, cost: 0, source: 'kb' };
  }

  // 3. Wikipédia
  const wiki = await buscarWikipedia(question);

  if (wiki?.error === 'wiki_unavailable' || wiki?.error === 'wiki_timeout') {
    return { ok: false, error: 'Wikipédia temporariamente indisponível. Tente novamente mais tarde.', source: 'wiki_err' };
  }
  if (wiki?.error) {
    return { ok: false, error: 'Não consegui acessar a Wikipédia. Verifique sua conexão.', source: 'wiki_err' };
  }
  if (wiki) {
    const linkLine = wiki.url ? `\n\n🔗 [Ver artigo completo na Wikipédia](${wiki.url})` : '';
    const body = intencao === 'prova'
      ? gerarProva(wiki.title, wiki.extract)
      : intencao === 'resumo'
        ? `🌐 **${wiki.title}** — Resumo\n\n${wiki.extract.slice(0, 400)}${wiki.extract.length > 400 ? '…' : ''}${linkLine}`
        : `🌐 **${wiki.title}**\n\n${wiki.extract}${linkLine}`;
    return { ok: true, answer: body, cost: 0, source: 'wikipedia' };
  }

  return null;
}

/** Função principal da IA: IA local → cache Gemini → API Gemini */
async function askAI(question, mode) {
  // 1. IA local gratuita (calculadora → banco → Wikipédia)
  const local = await responderLocalAI(question);
  if (local?.ok) return local; // encontrou resposta local → devolve direto

  // 2. Verificar saldo para Gemini
  const cost = IA_COSTS[mode] || 1;
  if ((state.iacoins || 0) < cost) {
    // Se a Wikipédia retornou erro, inclui isso no aviso
    const extra = local?.error ? ` (${local.error})` : '';
    return { ok: false, error: `Não encontrei resposta gratuita${extra}. Saldo insuficiente para IA avançada: precisa de ${cost} 🧠, você tem ${state.iacoins || 0} 🧠.` };
  }

  // 3. Cache Gemini
  const cached = await checkKnowledgeBase(question, mode);
  if (cached) {
    return { ok: true, answer: cached, cost: 0, source: 'gemini_cache' };
  }

  // 4. API Gemini
  try {
    const answer = await callGeminiAPI(question, mode);
    spendIACoins(cost);
    await saveToKnowledgeBase(question, answer, mode);
    return { ok: true, answer, cost, source: 'gemini' };
  } catch (e) {
    if (e.message === 'NO_KEY') return { ok: false, error: 'Não encontrei resposta local nem na Wikipédia. Configure a chave Gemini no painel Admin para respostas avançadas.' };
    return { ok: false, error: `Erro da IA: ${e.message}` };
  }
}

/** Renderiza a página de IA */
function renderAIPage() {
  const page = document.getElementById('page-ai');
  if (!page) return;

  if (!state.isAdmin) {
    page.innerHTML = `
      <div class="page-header"><h1>🧠 IA Educacional</h1></div>
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4rem 1rem;text-align:center;gap:1rem">
        <div style="font-size:4rem">🚧</div>
        <h2 style="margin:0">Em breve!</h2>
        <p style="color:var(--text-secondary);max-width:340px;margin:0">
          A IA Educacional ainda está em fase de testes. Em breve estará disponível para todos!
        </p>
      </div>`;
    return;
  }

  const iacoins = state.iacoins || 0;
  const hasKey  = !!localStorage.getItem(_GEMINI_LS);

  const modeButtons = IA_MODES.map(m => `
    <button class="ia-mode-btn ${_aiCurrentMode === m.id ? 'active' : ''}" onclick="setAIMode('${m.id}')">
      ${m.label} <span class="ia-mode-cost">${m.cost} 🧠</span>
    </button>`).join('');

  const history = (state.aiHistory || []).map(msg => `
    <div class="ia-msg ia-msg-${msg.role}">
      <div class="ia-msg-bubble">${msg.role === 'ai' ? marked(msg.content) : escHtml(msg.content)}</div>
      ${msg.source === 'kb'           ? '<span class="ia-source-tag ia-src-kb">📚 base local</span>'    : ''}
      ${msg.source === 'calc'         ? '<span class="ia-source-tag ia-src-calc">🧮 calculadora</span>'  : ''}
      ${msg.source === 'wikipedia'    ? '<span class="ia-source-tag ia-src-wiki">🌐 Wikipédia</span>'    : ''}
      ${msg.source === 'gemini_cache' ? '<span class="ia-source-tag ia-src-cache">📦 cache</span>'      : ''}
      ${msg.source === 'gemini'       ? '<span class="ia-source-tag ia-src-gemini">🤖 Gemini</span>'    : ''}
      ${msg.cost ? `<span class="ia-cost-tag">-${msg.cost} 🧠</span>` : ''}
    </div>`).join('');

  page.innerHTML = `
    <div class="page-header">
      <h1>🧠 IA Educacional</h1>
      <p class="page-subtitle">Use IACoin para interagir com a IA</p>
    </div>

    <div class="ia-topbar">
      <div class="ia-balance-card">
        <span class="ia-balance-icon">🧠</span>
        <div>
          <div class="ia-balance-val"><span class="iacoin-count">${iacoins}</span> IACoin</div>
          <div class="ia-balance-sub">100 💰 = 10 🧠</div>
        </div>
        <button class="btn-sm btn-convert" onclick="convertCoinsToIACoins()">Converter</button>
      </div>
      ${!hasKey ? `<div class="ia-key-warn">⚠️ <a href="#" onclick="openAISettings()">Configure sua chave Gemini</a></div>` : ''}
    </div>

    <div class="ia-modes">${modeButtons}</div>
    <div class="ia-mode-info">Modo: <strong>${IA_MODES.find(m=>m.id===_aiCurrentMode)?.label}</strong> — Custo: <strong>${IA_COSTS[_aiCurrentMode]} 🧠</strong></div>

    <div class="ia-chat" id="ia-chat-history">${history || '<div class="ia-empty">Faça uma pergunta para começar! 🚀</div>'}</div>

    <div class="ia-input-row">
      <textarea id="ia-question" class="ia-textarea" placeholder="Digite sua pergunta..." rows="2"></textarea>
      <button class="btn-primary ia-send-btn" onclick="handleAISubmit()">Enviar 🚀</button>
    </div>
    <div class="ia-actions-row">
      <button class="btn-sm btn-ghost" onclick="clearAIHistory()">🗑️ Limpar conversa</button>
    </div>
  `;

  // Scroll chat para o final
  const chat = document.getElementById('ia-chat-history');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function setAIMode(modeId) {
  _aiCurrentMode = modeId;
  renderAIPage();
}

async function handleAISubmit() {
  const textarea = document.getElementById('ia-question');
  if (!textarea) return;
  const question = textarea.value.trim();
  if (!question) return showNotification('Digite uma pergunta!', 'warning');

  const cost = IA_COSTS[_aiCurrentMode] || 1;
  if ((state.iacoins || 0) < cost) {
    showNotification(`Saldo insuficiente! Você tem ${state.iacoins || 0} 🧠 e precisa de ${cost} 🧠.`, 'error');
    return;
  }

  textarea.value = '';
  textarea.disabled = true;

  // Adiciona pergunta ao histórico
  state.aiHistory = state.aiHistory || [];
  state.aiHistory.push({ role: 'user', content: question });
  renderAIPage();
  document.getElementById('ia-chat-history').innerHTML += '<div class="ia-msg ia-msg-loading">⏳ Buscando resposta (base local → Wikipédia → Gemini)…</div>';

  const result = await askAI(question, _aiCurrentMode);

  state.aiHistory.push({
    role: 'ai',
    content: result.ok ? result.answer : `❌ ${result.error}`,
    source: result.source || null,
    cost: result.cost || 0,
  });

  if (state.aiHistory.length > 40) state.aiHistory = state.aiHistory.slice(-40);
  saveState();
  renderAIPage();

  const ta = document.getElementById('ia-question');
  if (ta) ta.disabled = false;
}

function clearAIHistory() {
  state.aiHistory = [];
  saveState();
  renderAIPage();
}

function openAISettings() {
  const key = localStorage.getItem(_GEMINI_LS) || '';
  const newKey = prompt('Cole sua chave da API Gemini (google.dev/gemini):', key);
  if (newKey === null) return;
  if (newKey.trim()) {
    localStorage.setItem(_GEMINI_LS, newKey.trim());
    showNotification('✅ Chave Gemini salva!', 'success');
  } else {
    localStorage.removeItem(_GEMINI_LS);
    showNotification('Chave removida.', 'info');
  }
  renderAIPage();
}

// Markdown mínimo para formatar respostas da IA
function marked(text) {
  return escHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/^#{1,3} (.+)$/gm, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

// ============================================================
// DETECÇÃO DE FRAUDE
// ============================================================

/** Verifica uma ação e gera flag se suspeita */
async function _fraudCheck(action, meta = {}) {
  if (!authUserId || state.isAdmin) return; // admin não é flagado

  let reason = null;
  let score  = 0;

  if (action === 'task_complete') {
    const elapsed = meta.elapsed || 0;
    if (elapsed < 300) {
      reason = `Tarefa concluída em ${Math.round(elapsed / 60)} min (< 5 min)`;
      score  = 2;
    }
  } else if (action === 'study_item') {
    if ((meta.elapsed || 0) < 60) {
      reason = `Item de estudo concluído em menos de 1 min`;
      score  = 1;
    }
  } else if (action === 'rapid_xp') {
    if ((meta.xp || 0) > 500) {
      reason = `+${meta.xp} XP em menos de 5 min`;
      score  = 3;
    }
  } else if (action === 'grade_spam') {
    if ((meta.recent || 0) >= 4 && (meta.grade || 0) >= 9.5) {
      reason = `${meta.recent} notas ≥ 9.5 em sequência`;
      score  = 1;
    }
  }

  if (!reason) return;
  await flagUser(reason, score);
}

/** Insere flag no banco e marca como suspeito se score total ≥ 5 */
async function flagUser(reason, score = 1) {
  if (!sb || !authUserId) return;
  try {
    await sb.from('user_flags').insert({ user_id: authUserId, reason, score });

    const { data } = await sb.from('user_flags').select('score').eq('user_id', authUserId);
    const total = (data || []).reduce((s, r) => s + (r.score || 1), 0);
    if (total >= 5) {
      await sb.from('users').update({ is_suspect: true }).eq('id', authUserId);
      state.isSuspect = true;
    }
  } catch (e) {
    console.warn('[flagUser]', e);
  }
}

// Integra detecção na conclusão de tarefa
const _taskCreationTimes = {}; // taskId → timestamp de criação
function _recordTaskCreation(taskId) { _taskCreationTimes[taskId] = Date.now(); }
async function _checkTaskFraud(taskId) {
  const created = _taskCreationTimes[taskId];
  if (!created) return;
  const elapsed = (Date.now() - created) / 1000;
  await _fraudCheck('task_complete', { elapsed });
  delete _taskCreationTimes[taskId];
}

// ============================================================
// SISTEMA ADMIN
// ============================================================

/** Carrega todos os usuários suspeitos para o painel admin */
async function loadSuspects() {
  if (!sb || !state.isAdmin) return [];
  try {
    const { data } = await sb.from('users')
      .select('id, name, xp, level, coins, is_suspect, penalty_type, penalty_until, data')
      .eq('is_suspect', true);
    return data || [];
  } catch { return []; }
}

/** Carrega flags de um usuário específico */
async function loadUserFlags(userId) {
  if (!sb) return [];
  try {
    const { data } = await sb.from('user_flags').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
    return data || [];
  } catch { return []; }
}

/** Carrega histórico de ações admin */
async function loadAdminHistory() {
  if (!sb || !state.isAdmin) return [];
  try {
    const { data } = await sb.from('admin_actions').select('*').order('created_at', { ascending: false }).limit(50);
    return data || [];
  } catch { return []; }
}

/** Executa uma ação administrativa */
async function adminAction(userId, action, reason = '') {
  if (!sb || !authUserId || !state.isAdmin) return false;
  try {
    switch (action) {
      case 'ok':
        await sb.from('users').update({ is_suspect: false, penalty_type: null, penalty_until: null }).eq('id', userId);
        break;
      case 'warn':
        await sb.from('motivations').insert({ from_id: authUserId, to_id: userId, phrase: `⚠️ Aviso do sistema: ${reason}`, read: false });
        break;
      case 'limit':
        await sb.from('users').update({ penalty_type: 'limit' }).eq('id', userId);
        break;
      case 'reset':
        await sb.from('users').update({ xp: 0, coins: 0, level: 1, data: {} }).eq('id', userId);
        break;
      case 'remove_penalty':
        await sb.from('users').update({ is_suspect: false, penalty_type: null, penalty_until: null }).eq('id', userId);
        break;
    }
    await sb.from('admin_actions').insert({ admin_id: authUserId, user_id: userId, action, reason });
    return true;
  } catch (e) {
    console.error('[adminAction]', e);
    return false;
  }
}

/** Renderiza o painel admin */
/** Carrega todos os usuários cadastrados */
async function loadAllUsers() {
  if (!sb || !state.isAdmin) return [];
  try {
    const { data } = await sb.from('users')
      .select('id, name, xp, level, coins, iacoins, is_admin, is_suspect, penalty_type, data')
      .order('xp', { ascending: false })
      .limit(100);
    return data || [];
  } catch { return []; }
}

/** Carrega todos os códigos de resgate existentes */
async function loadRedeemCodes() {
  if (!sb || !state.isAdmin) return [];
  try {
    const { data } = await sb.from('redeem_codes')
      .select('*').order('created_at', { ascending: false }).limit(50);
    return data || [];
  } catch { return []; }
}

/** Cria um código de resgate novo */
async function adminCreateCode(code, type, value, usesMax, expiresAt) {
  if (!sb || !state.isAdmin) return { ok: false, msg: 'Sem permissão.' };
  try {
    const { error } = await sb.from('redeem_codes').insert({
      code:      code.trim().toUpperCase(),
      type,
      value:     Number(value) || 0,
      uses_max:  Number(usesMax) || 1,
      expires_at: expiresAt || null,
    });
    if (error) return { ok: false, msg: error.message };
    return { ok: true };
  } catch (e) { return { ok: false, msg: e.message }; }
}

/** Deleta um código de resgate */
async function adminDeleteCode(codeId) {
  if (!sb || !state.isAdmin) return { ok: false, msg: 'Sem permissão.' };
  try {
    // Remove resgates vinculados primeiro (evita violação de FK)
    try {
      await sb.from('user_redeems').delete().eq('code_id', codeId);
    } catch(e) {
      console.warn('[adminDeleteCode] Erro ao limpar user_redeems:', e.message);
      // Continua mesmo assim — pode ser que a tabela esteja vazia para este código
    }

    // Agora deleta o código em si
    const { error } = await sb.from('redeem_codes').delete().eq('id', codeId);
    if (error) {
      console.error('[adminDeleteCode]', error.code, error.message, error.hint);
      return { ok: false, msg: error.message || 'Erro ao deletar.' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[adminDeleteCode] catch:', e);
    return { ok: false, msg: e.message || 'Erro inesperado.' };
  }
}

/**
 * Deleta o perfil de um usuário da tabela `users` (dados de jogo).
 * Não remove da tabela auth.users do Supabase (requer service-role key ou painel).
 * Para contas duplicadas, basta remover o perfil.
 */
async function adminDeleteUser(userId) {
  if (!sb || !state.isAdmin) return { ok: false, msg: 'Sem permissão.' };

  // Helper: executa delete ignorando erros (tabela pode não existir ou estar vazia)
  const tryDelete = async (table, filter) => {
    try {
      let q = sb.from(table).delete();
      if (filter.col) q = q.eq(filter.col, filter.val);
      if (filter.or)  q = q.or(filter.or);
      await q;
    } catch(e) {
      console.warn(`[adminDeleteUser] ${table}:`, e.message);
    }
  };

  try {
    // Remove dados relacionados na ordem certa para evitar FK violations
    await tryDelete('user_redeems',    { col: 'user_id',   val: userId });
    await tryDelete('push_subscriptions', { col: 'user_id', val: userId });
    await tryDelete('admin_actions',   { col: 'user_id',   val: userId });
    await tryDelete('user_flags',      { col: 'user_id',   val: userId });
    await tryDelete('group_medals',    { col: 'user_id',   val: userId });
    await tryDelete('group_xp_logs',   { col: 'user_id',   val: userId });
    await tryDelete('friends',         { or: `user_id.eq.${userId},friend_id.eq.${userId}` });
    await tryDelete('friend_requests', { or: `from_id.eq.${userId},to_id.eq.${userId}` });
    await tryDelete('group_members',   { col: 'user_id',   val: userId });
    await tryDelete('notifications',   { or: `user_id.eq.${userId},from_id.eq.${userId}` });

    // Por último, o perfil em si
    const { error } = await sb.from('users').delete().eq('id', userId);
    if (error) {
      console.error('[adminDeleteUser]', error.code, error.message);
      return { ok: false, msg: error.message || 'Erro ao deletar usuário.' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[adminDeleteUser] catch:', e);
    return { ok: false, msg: e.message || 'Erro inesperado.' };
  }
}

async function handleAdminDeleteUser(userId, userName) {
  const confirmed = confirm(
    `⚠️ DELETAR CONTA\n\nUsuário: ${userName}\nID: ${userId}\n\nIsso remove o perfil e todos os dados de jogo do usuário.\nA conta de login no Supabase pode precisar ser removida manualmente.\n\nTem certeza?`
  );
  if (!confirmed) return;
  const res = await adminDeleteUser(userId);
  if (res.ok) {
    showNotification(`🗑️ Conta de "${userName}" deletada.`, 'success');
    renderAdminPage('usuarios');
  } else {
    showNotification('❌ ' + res.msg, 'error');
    console.error('[handleAdminDeleteUser] falhou:', res.msg);
  }
}

let _adminTab = 'usuarios';

function _adminStatCard(icon, label, val, sub) {
  sub = sub || '';
  return '<div class="admin-stat-card">'
    + '<div class="admin-stat-icon">' + icon + '</div>'
    + '<div class="admin-stat-val">' + val + '</div>'
    + '<div class="admin-stat-label">' + label + '</div>'
    + (sub ? '<div class="admin-stat-sub">' + sub + '</div>' : '')
    + '</div>';
}

async function renderAdminPage(tab) {
  const page = document.getElementById('page-admin');
  if (!page) return;

  if (!state.isAdmin) {
    page.innerHTML = `<div class="page-header"><h1>🛡️ Admin</h1></div><div class="social-empty">Acesso restrito.</div>`;
    return;
  }

  if (tab) _adminTab = tab;

  // Skeleton enquanto carrega
  page.innerHTML = `
    <div class="page-header"><h1>👑 Painel Admin</h1><p class="page-subtitle">Moderação e gerenciamento</p></div>
    <div class="admin-tabs">
      <button class="admin-tab-btn ${_adminTab==='usuarios'?'active':''}" onclick="renderAdminPage('usuarios')">👥 Usuários</button>
      <button class="admin-tab-btn ${_adminTab==='codigos' ?'active':''}" onclick="renderAdminPage('codigos')">🎟️ Códigos</button>
      <button class="admin-tab-btn ${_adminTab==='stats'   ?'active':''}" onclick="renderAdminPage('stats')">📊 Estatísticas</button>
      <button class="admin-tab-btn ${_adminTab==='ia'      ?'active':''}" onclick="renderAdminPage('ia')">🤖 IA</button>
      <button class="admin-tab-btn ${_adminTab==='teste'   ?'active':''}" onclick="renderAdminPage('teste')">🧪 Teste</button>
    </div>
    <div id="admin-tab-content"><div class="social-loading">Carregando...</div></div>`;

  const content = document.getElementById('admin-tab-content');

  if (_adminTab === 'usuarios') {
    const [allUsers, suspects, history] = await Promise.all([
      loadAllUsers(), loadSuspects(), loadAdminHistory(),
    ]);

    const _userCard = (u, highlight = false) => {
      const d = u.data || {};
      const badges = [
        u.is_admin    ? '<span class="admin-badge-tag admin-tag-admin">👑 admin</span>'    : '',
        u.is_suspect  ? '<span class="admin-badge-tag admin-tag-suspect">⚠️ suspeito</span>' : '',
        u.penalty_type? `<span class="admin-badge-tag admin-tag-limit">🔒 ${u.penalty_type}</span>` : '',
      ].filter(Boolean).join('');
      return `
      <div class="admin-user-card${highlight ? ' admin-card-danger' : ''}">
        <div class="admin-user-info">
          <div class="admin-user-avatar">${d.avatar || '🧙'}</div>
          <div style="flex:1;min-width:0">
            <div class="admin-user-name">${escHtml(u.name || 'Sem nome')} ${badges}</div>
            <div class="admin-user-stats">Nv ${u.level} · ${u.xp} XP · ${u.coins} 💰 · ${u.iacoins || 0} 🧠</div>
            <div class="admin-user-id">${u.id}</div>
          </div>
        </div>
        <div class="admin-actions">
          ${u.is_suspect ? `<button class="btn-admin-ok" onclick="handleAdminAction('${u.id}','ok','Verificado')">✅ OK</button>` : ''}
          <button class="btn-admin-warn"  onclick="adminPromptAction('${u.id}','warn')">⚠️ Avisar</button>
          <button class="btn-admin-limit" onclick="adminPromptAction('${u.id}','limit')">🔒 Limitar</button>
          <button class="btn-admin-reset" onclick="adminPromptAction('${u.id}','reset')">♻️ Resetar</button>
          ${u.penalty_type ? `<button class="btn-admin-remove" onclick="handleAdminAction('${u.id}','remove_penalty','')">🔓 Remover punição</button>` : ''}
          <button class="btn-sm btn-ghost" onclick="showUserFlags('${u.id}')">🚩 Flags</button>
          <button class="btn-sm btn-ghost" style="color:#f87171;border-color:rgba(248,113,113,.3)" onclick="handleAdminDeleteUser('${u.id}','${escHtml(u.name||'Herói')}')">🗑️ Deletar</button>
        </div>
      </div>`;
    };

    const histHtml = history.length ? history.map(a => `
      <div class="admin-history-row">
        <span class="admin-hist-action admin-act-${a.action}">${a.action}</span>
        <span class="admin-hist-user">${a.user_id.slice(0,8)}…</span>
        <span class="admin-hist-reason">${escHtml(a.reason || '—')}</span>
        <span class="admin-hist-date">${new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
      </div>`).join('') : '<div class="social-empty">Sem histórico ainda.</div>';

    content.innerHTML = `
      <div class="admin-section-title">🚨 Suspeitos (${suspects.length})</div>
      <div class="admin-suspects">
        ${suspects.length ? suspects.map(u => _userCard(u, true)).join('') : '<div class="social-empty">Nenhum usuário suspeito. ✅</div>'}
      </div>

      <div class="admin-section-title" style="margin-top:1.5rem">👥 Todos os Usuários (${allUsers.length})</div>
      <div class="admin-suspects">${allUsers.length ? allUsers.map(u => _userCard(u)).join('') : '<div class="social-empty">Nenhum usuário ainda.</div>'}</div>

      <div class="admin-section-title" style="margin-top:1.5rem">📜 Histórico de Ações</div>
      <div class="admin-history">${histHtml}</div>`;

  } else if (_adminTab === 'codigos') {
    const codes = await loadRedeemCodes();

    const codesHtml = codes.length ? `
      <div class="admin-codes-table">
        <div class="admin-codes-header">
          <span>Código</span><span>Tipo</span><span>Valor</span><span>Usos</span><span>Expira</span><span></span>
        </div>
        ${codes.map(c => `
        <div class="admin-codes-row">
          <span class="admin-code-val">${escHtml(c.code)}</span>
          <span class="admin-code-type admin-type-${c.type}">${c.type}</span>
          <span>${c.value}</span>
          <span>${c.uses_current}/${c.uses_max > 0 ? c.uses_max : '∞'}</span>
          <span style="font-size:.72rem">${c.expires_at ? new Date(c.expires_at).toLocaleDateString('pt-BR') : '—'}</span>
          <button class="btn-sm btn-ghost" style="color:#f87171" onclick="handleAdminDeleteCode('${c.id}')">🗑️</button>
        </div>`).join('')}
      </div>` : '<div class="social-empty">Nenhum código criado ainda.</div>';

    content.innerHTML = `
      <div class="admin-section-title">➕ Criar Novo Código</div>
      <div class="admin-create-code-form">
        <div class="admin-form-row">
          <input id="adm-code-val" placeholder="CÓDIGO (ex: BONUS2025)" style="text-transform:uppercase;letter-spacing:.05em;font-weight:700;flex:2">
          <select id="adm-code-type">
            <option value="coins">💰 Moedas</option>
            <option value="iacoins">🧠 IACoin</option>
            <option value="xp">✨ XP</option>
            <option value="admin">👑 Admin</option>
          </select>
        </div>
        <div class="admin-form-row" style="margin-top:.5rem">
          <input id="adm-code-amount" type="number" placeholder="Valor" min="0" value="100">
          <input id="adm-code-uses"   type="number" placeholder="Nº de usos" min="1" value="1">
          <input id="adm-code-exp"    type="datetime-local" placeholder="Expira em (opcional)">
        </div>
        <button class="btn-primary" onclick="handleAdminCreateCode()" style="margin-top:.75rem;width:100%">➕ Criar Código</button>
        <div id="adm-code-result" style="margin-top:.5rem;font-size:.85rem;font-weight:700"></div>
      </div>

      <div class="admin-section-title" style="margin-top:1.5rem">📋 Códigos Existentes (${codes.length})</div>
      ${codesHtml}`;

  } else if (_adminTab === 'stats') {
    // ── Datas de corte em UTC (evita problemas de timezone vs Supabase) ────
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const weekUTC  = new Date(todayUTC); weekUTC.setUTCDate(todayUTC.getUTCDate() - todayUTC.getUTCDay());
    const monthUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const yearUTC  = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

    // Helper: conta no servidor via .gte() — sem parsing de datas no cliente
    const serverCount = async (col, since) => {
      try {
        const { count } = await sb.from('users')
          .select('id', { count: 'exact', head: true })
          .gte(col, since.toISOString());
        return count ?? 0;
      } catch(e) { return 0; }
    };

    // Executa todas as contagens em paralelo
    const [
      totalUsers,
      newToday, newWeek, newMonth, newYear,
      activeToday, activeWeek, activeMonth, activeYear,
    ] = await Promise.all([
      sb.from('users').select('id', { count: 'exact', head: true }).then(r => r.count ?? 0),
      serverCount('created_at', todayUTC),
      serverCount('created_at', weekUTC),
      serverCount('created_at', monthUTC),
      serverCount('created_at', yearUTC),
      serverCount('updated_at', todayUTC),
      serverCount('updated_at', weekUTC),
      serverCount('updated_at', monthUTC),
      serverCount('updated_at', yearUTC),
    ]);

    const inactiveMonth = totalUsers - activeMonth;

    // ── Bulk fetch só para o gráfico dos últimos 30 dias ─────────────────
    let allUsersStats = [];
    try {
      const { data } = await sb.from('users')
        .select('id, created_at')
        .gte('created_at', new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29)).toISOString())
        .order('created_at', { ascending: false });
      allUsersStats = data || [];
    } catch(e) { console.warn('[admin stats] Gráfico:', e.message); }

    // Últimos 30 dias — novos por dia para mini-gráfico
    const last30 = [];
    for (let i = 29; i >= 0; i--) {
      const d    = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      const next = new Date(d); next.setUTCDate(d.getUTCDate() + 1);
      const n = allUsersStats.filter(u => {
        if (!u.created_at) return false;
        const c = new Date(u.created_at);
        return c >= d && c < next;
      }).length;
      last30.push({ label: `${d.getUTCDate()}/${d.getUTCMonth()+1}`, value: n });
    }
    const maxDay = Math.max(...last30.map(d => d.value), 1);
    const chartBars = last30.map(d => {
      const pct = Math.round((d.value / maxDay) * 100);
      return `<div class="admin-stat-bar-wrap" title="${d.label}: ${d.value} novos">
        <div class="admin-stat-bar" style="height:${Math.max(pct,2)}%"></div>
        <div class="admin-stat-bar-val">${d.value > 0 ? d.value : ''}</div>
      </div>`;
    }).join('');

    const statCard = (icon, label, val, sub = '') => `
      <div class="admin-stat-card">
        <div class="admin-stat-icon">${icon}</div>
        <div class="admin-stat-val">${val}</div>
        <div class="admin-stat-label">${label}</div>
        ${sub ? `<div class="admin-stat-sub">${sub}</div>` : ''}
      </div>`;

    content.innerHTML = `
      <div class="admin-section-title">👤 Total de Usuários</div>
      <div class="admin-stat-grid">
        ${statCard('👥', 'Total cadastrados', totalUsers, 'todos os tempos')}
        ${statCard('🆕', 'Novos hoje', newToday)}
        ${statCard('📅', 'Novos esta semana', newWeek)}
        ${statCard('📆', 'Novos este mês', newMonth)}
        ${statCard('📊', 'Novos este ano', newYear)}
      </div>

      <div class="admin-section-title" style="margin-top:1.5rem">🟢 Usuários Ativos (por último acesso)</div>
      <div class="admin-stat-grid">
        ${statCard('⚡', 'Ativos hoje', activeToday, 'acessaram hoje')}
        ${statCard('🔥', 'Ativos esta semana', activeWeek)}
        ${statCard('✅', 'Ativos este mês', activeMonth)}
        ${statCard('🌟', 'Ativos este ano', activeYear)}
        ${statCard('📈', 'Inativos', inactiveMonth, 'sem acesso este mês')}
      </div>

      <div class="admin-section-title" style="margin-top:1.5rem">📅 Novos Usuários — Últimos 30 dias</div>
      <div class="admin-chart-wrap">
        <div class="admin-chart-bars">${chartBars}</div>
        <div class="admin-chart-label">Cada barra = 1 dia · máximo do período: ${maxDay}</div>
      </div>`;

  } else if (_adminTab === 'ia') {
    const key = localStorage.getItem(_GEMINI_LS) || '';
    let cacheCount = 0;
    try {
      const { count } = await sb.from('knowledge_base').select('*', { count: 'exact', head: true });
      cacheCount = count || 0;
    } catch {}
    const articles = await loadKBArticles();

    const articlesHtml = articles.length ? articles.map(a => {
      const editing = _kbEditingId === a.id;
      if (editing) return `
      <div class="admin-kb-row admin-kb-row-editing">
        <div class="admin-kb-info" style="width:100%">
          <div class="admin-form-row" style="margin-bottom:.4rem">
            <input id="adm-kb-edit-title"   value="${escHtml(a.title)}"   placeholder="Título" style="flex:2">
            <input id="adm-kb-edit-subject" value="${escHtml(a.subject || '')}" placeholder="Matéria">
          </div>
          <textarea id="adm-kb-edit-content" rows="5"
            style="width:100%;box-sizing:border-box;border-radius:8px;padding:.6rem;font-size:.85rem;resize:vertical"
          >${escHtml(a.content)}</textarea>
          <input id="adm-kb-edit-tags" value="${escHtml((a.tags || []).join(', '))}"
            placeholder="Tags separadas por vírgula" style="margin-top:.4rem;width:100%;box-sizing:border-box">
          <div style="display:flex;gap:.5rem;margin-top:.6rem">
            <button class="btn-primary" style="flex:1" onclick="handleAdminUpdateKBArticle('${a.id}')">💾 Salvar</button>
            <button class="btn-sm btn-ghost" onclick="_kbEditingId=null;renderAdminPage('ia')">✖ Cancelar</button>
          </div>
          <div id="adm-kb-edit-result" style="margin-top:.4rem;font-size:.82rem;font-weight:700"></div>
        </div>
      </div>`;
      return `
      <div class="admin-kb-row">
        <div class="admin-kb-info">
          <div class="admin-kb-title">${escHtml(a.title)}</div>
          <div class="admin-kb-meta">
            ${a.subject ? `<span class="admin-kb-subject">${escHtml(a.subject)}</span>` : ''}
            ${(a.tags || []).map(t => `<span class="admin-kb-tag">${escHtml(t)}</span>`).join('')}
          </div>
          <div class="admin-kb-preview">${escHtml((a.content || '').slice(0, 120))}${a.content?.length > 120 ? '…' : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:.35rem;flex-shrink:0">
          <button class="btn-sm btn-ghost" onclick="_kbEditingId='${a.id}';renderAdminPage('ia')">✏️ Editar</button>
          <button class="btn-sm btn-ghost" style="color:#f87171" onclick="handleAdminDeleteKBArticle('${a.id}')">🗑️</button>
        </div>
      </div>`;
    }).join('') : '<div class="social-empty">Nenhum artigo na base ainda.</div>';

    content.innerHTML = `
      <div class="admin-section-title">📝 Adicionar ao Conhecimento</div>
      <div class="admin-create-code-form">
        <div class="admin-form-row">
          <input id="adm-kb-title"   placeholder="Título (ex: Equações do 2º grau)" style="flex:2">
          <input id="adm-kb-subject" placeholder="Matéria (ex: Matemática)">
        </div>
        <textarea id="adm-kb-content" placeholder="Conteúdo completo do artigo..." rows="5"
          style="width:100%;box-sizing:border-box;margin-top:.5rem;border-radius:8px;padding:.6rem;font-size:.85rem;resize:vertical"></textarea>
        <input id="adm-kb-tags" placeholder="Tags separadas por vírgula (ex: algebra, equação, bhaskara)"
          style="margin-top:.5rem;width:100%;box-sizing:border-box">
        <button class="btn-primary" onclick="handleAdminSaveKBArticle()" style="margin-top:.75rem;width:100%">➕ Salvar Artigo</button>
        <div id="adm-kb-result" style="margin-top:.5rem;font-size:.85rem;font-weight:700"></div>
      </div>

      <div class="admin-section-title" style="margin-top:1.5rem">📚 Base de Conhecimento (${articles.length} artigos)</div>
      <div class="admin-kb-list">${articlesHtml}</div>

      <div class="admin-section-title" style="margin-top:1.5rem">🔑 Chave da API Gemini (modo avançado)</div>
      <div class="admin-create-code-form">
        <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:.75rem">
          Usada como fallback quando a base local não tem resposta. Obtenha em <strong>aistudio.google.com</strong>
        </p>
        <div style="display:flex;gap:.5rem;align-items:center">
          <input type="password" id="adm-gemini-key" placeholder="AIza..." value="${escHtml(key)}" style="flex:1;font-size:.85rem">
          <button class="btn-primary" onclick="handleAdminSaveGeminiKey()">💾 Salvar</button>
          ${key ? `<button class="btn-sm btn-ghost" onclick="handleAdminRemoveGeminiKey()">🗑️ Remover</button>` : ''}
        </div>
        <div style="margin-top:.5rem;font-size:.8rem;font-weight:700;color:${key?'#34d399':'#f59e0b'}">
          ${key ? '✅ Chave configurada — modo Gemini ativo' : '⚠️ Sem chave — só a base local funcionará'}
        </div>
      </div>

      <div class="admin-section-title" style="margin-top:1.5rem">📦 Cache Gemini (${cacheCount} respostas)</div>
      <div class="admin-create-code-form">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:.78rem;color:var(--text-muted)">Respostas Gemini repetidas são servidas grátis do cache.</div>
          <button class="btn-sm btn-ghost" style="color:#f87171" onclick="handleAdminClearKB()">🗑️ Limpar</button>
        </div>
      </div>`;

  } else if (_adminTab === 'teste') {
    // ── Renderiza imediatamente (sem esperar o banco) ──────────────────
    const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unknown';
    const permColor = { granted: '#34d399', denied: '#f87171', default: '#f59e0b', unknown: '#888' };
    const permLabel = { granted: '✅ Concedida', denied: '🚫 Bloqueada (reative no navegador)', default: '○ Ainda não pedida', unknown: '❓ Não suportado' };

    content.innerHTML = `
      <div class="admin-section-title">🔔 Notificações Push</div>

      <div class="admin-stat-grid" style="margin-bottom:1rem">
        ${_adminStatCard('🔐', 'Permissão', permLabel[perm] || perm, '')}
        <div id="adm-teste-mysubs-card">${_adminStatCard('📱', 'Minha sub.', '…', 'carregando…')}</div>
        <div id="adm-teste-totalsubs-card">${_adminStatCard('🌐', 'Total subscrito', '…', 'carregando…')}</div>
      </div>

      <div class="admin-create-code-form" style="margin-bottom:1rem">
        <div class="profile-field" style="margin-bottom:.5rem">
          <label class="grades-label">Título</label>
          <input type="text" id="test-push-title" value="🧪 StudyQuest — Teste" placeholder="Título da notificação" style="font-size:16px">
        </div>
        <div class="profile-field" style="margin-bottom:.75rem">
          <label class="grades-label">Mensagem</label>
          <input type="text" id="test-push-body" value="Esta é uma notificação de teste! 🎉" placeholder="Corpo da mensagem" style="font-size:16px">
        </div>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap" id="adm-teste-btns">
          <button class="btn-primary" onclick="adminTestPushSelf()" disabled id="adm-teste-push-btn">
            🔔 Enviar Push para Mim
          </button>
          <button class="btn-secondary" onclick="adminTestLocalNotif()">
            💬 Notificação Local (sem push)
          </button>
          <button class="btn-secondary" onclick="adminCheckSwStatus()">
            ⚙️ Status do Service Worker
          </button>
        </div>
        <div id="admin-test-result" style="margin-top:.75rem;font-size:.85rem;font-weight:700"></div>
      </div>

      <div class="admin-section-title" style="margin-top:1.25rem">📋 Como configurar o Push</div>
      <div class="admin-create-code-form">
        <div style="font-size:.82rem;line-height:1.8;color:var(--text-muted)">
          <b style="color:var(--text)">1. Gerar chaves VAPID</b><br>
          <code style="background:var(--bg-base);padding:.1rem .4rem;border-radius:4px">npx web-push generate-vapid-keys</code><br><br>
          <b style="color:var(--text)">2. Atualizar a chave pública em script.js</b><br>
          Procure por <code style="background:var(--bg-base);padding:.1rem .4rem;border-radius:4px">VAPID_PUBLIC_KEY</code> e substitua pelo valor gerado<br><br>
          <b style="color:var(--text)">3. Configurar Secrets no Supabase</b><br>
          <code style="background:var(--bg-base);padding:.1rem .4rem;border-radius:4px">npx supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:admin@studyquestxp.com.br"</code><br><br>
          <b style="color:var(--text)">4. Deploy da Edge Function</b><br>
          <code style="background:var(--bg-base);padding:.1rem .4rem;border-radius:4px">npx supabase functions deploy send-push --no-verify-jwt</code>
        </div>
      </div>`;

    // ── Busca contagens do banco em background (não bloqueia a UI) ────
    const _timeout = (ms) => new Promise(res => setTimeout(() => res(null), ms));
    Promise.race([
      Promise.all([
        sb.from('push_subscriptions').select('id', { count: 'exact', head: true }),
        sb.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', authUserId),
      ]),
      _timeout(8000),
    ]).then((result) => {
      const totalSubs = result ? (result[0]?.count ?? 0) : '?';
      const mySubs    = result ? (result[1]?.count ?? 0) : '?';
      const mySubsEl  = document.getElementById('adm-teste-mysubs-card');
      const totSubsEl = document.getElementById('adm-teste-totalsubs-card');
      const pushBtn   = document.getElementById('adm-teste-push-btn');
      if (mySubsEl)  mySubsEl.innerHTML  = _adminStatCard('📱', 'Minha sub.', mySubs > 0 ? '✅ Ativo' : '❌ Sem sub', mySubs > 0 ? 'dispositivo inscrito' : 'ative nas configurações');
      if (totSubsEl) totSubsEl.innerHTML = _adminStatCard('🌐', 'Total subscrito', totalSubs, 'dispositivos no banco');
      if (pushBtn && mySubs > 0) { pushBtn.disabled = false; pushBtn.removeAttribute('title'); }
      else if (pushBtn) { pushBtn.title = 'Ative as notificações primeiro'; }
    }).catch((e) => {
      console.warn('[admin teste] falha ao buscar subscriptions:', e);
      const mySubsEl  = document.getElementById('adm-teste-mysubs-card');
      const totSubsEl = document.getElementById('adm-teste-totalsubs-card');
      if (mySubsEl)  mySubsEl.innerHTML  = _adminStatCard('📱', 'Minha sub.', '⚠️ Erro', 'tabela inacessível');
      if (totSubsEl) totSubsEl.innerHTML = _adminStatCard('🌐', 'Total subscrito', '⚠️ Erro', 'tabela inacessível');
    });
  }
}

function handleAdminSaveGeminiKey() {
  const key = document.getElementById('adm-gemini-key')?.value?.trim();
  if (key) {
    localStorage.setItem(_GEMINI_LS, key);
    showNotification('✅ Chave Gemini salva!', 'success');
  } else {
    localStorage.removeItem(_GEMINI_LS);
    showNotification('Chave removida.', 'info');
  }
  renderAdminPage('ia');
}

function handleAdminRemoveGeminiKey() {
  if (!confirm('Remover a chave Gemini?')) return;
  localStorage.removeItem(_GEMINI_LS);
  showNotification('Chave removida.', 'info');
  renderAdminPage('ia');
}

async function handleAdminClearKB() {
  if (!confirm('Limpar todo o cache de respostas da IA? Isso não afeta usuários.')) return;
  try {
    await sb.from('knowledge_base').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    showNotification('Cache limpo.', 'success');
  } catch (e) { showNotification('Erro ao limpar cache.', 'error'); }
  renderAdminPage('ia');
}

/* ── Admin: base de conhecimento (kb_articles) ─────────────────────────── */

let _kbEditingId = null;

async function handleAdminSaveKBArticle() {
  const title   = document.getElementById('adm-kb-title')?.value?.trim();
  const subject = document.getElementById('adm-kb-subject')?.value?.trim() || '';
  const content = document.getElementById('adm-kb-content')?.value?.trim();
  const tagsRaw = document.getElementById('adm-kb-tags')?.value?.trim() || '';
  const result  = document.getElementById('adm-kb-result');

  if (!title || !content) {
    if (result) { result.textContent = '⚠️ Título e conteúdo são obrigatórios.'; result.style.color = '#f59e0b'; }
    return;
  }

  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];

  try {
    const { error } = await sb.from('kb_articles').insert({
      title, subject, content, tags, created_by: authUserId,
    });
    if (error) throw error;
    if (result) { result.textContent = `✅ "${title}" salvo!`; result.style.color = '#34d399'; }
    showNotification('✅ Artigo salvo na base!', 'success');
    setTimeout(() => renderAdminPage('ia'), 1000);
  } catch (e) {
    if (result) { result.textContent = `❌ ${e.message}`; result.style.color = '#f87171'; }
    console.error('[handleAdminSaveKBArticle]', e);
  }
}

async function handleAdminUpdateKBArticle(id) {
  const title   = document.getElementById('adm-kb-edit-title')?.value?.trim();
  const subject = document.getElementById('adm-kb-edit-subject')?.value?.trim() || '';
  const content = document.getElementById('adm-kb-edit-content')?.value?.trim();
  const tagsRaw = document.getElementById('adm-kb-edit-tags')?.value?.trim() || '';
  const result  = document.getElementById('adm-kb-edit-result');

  if (!title || !content) {
    if (result) { result.textContent = '⚠️ Título e conteúdo são obrigatórios.'; result.style.color = '#f59e0b'; }
    return;
  }

  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];

  try {
    const { error } = await sb.from('kb_articles').update({ title, subject, content, tags }).eq('id', id);
    if (error) throw error;
    _kbEditingId = null;
    showNotification('✅ Artigo atualizado!', 'success');
    renderAdminPage('ia');
  } catch (e) {
    if (result) { result.textContent = `❌ ${e.message}`; result.style.color = '#f87171'; }
    console.error('[handleAdminUpdateKBArticle]', e);
  }
}

async function handleAdminDeleteKBArticle(id) {
  if (!confirm('Remover este artigo da base de conhecimento?')) return;
  try {
    const { error } = await sb.from('kb_articles').delete().eq('id', id);
    if (error) throw error;
    _kbEditingId = null;
    showNotification('Artigo removido.', 'info');
    renderAdminPage('ia');
  } catch (e) {
    showNotification('❌ Erro ao remover: ' + e.message, 'error');
    console.error('[handleAdminDeleteKBArticle]', e);
  }
}

async function handleAdminCreateCode() {
  const code   = document.getElementById('adm-code-val')?.value;
  const type   = document.getElementById('adm-code-type')?.value;
  const value  = document.getElementById('adm-code-amount')?.value;
  const uses   = document.getElementById('adm-code-uses')?.value;
  const exp    = document.getElementById('adm-code-exp')?.value;
  const result = document.getElementById('adm-code-result');

  if (!code?.trim()) {
    if (result) { result.textContent = '⚠️ Digite o código.'; result.style.color = '#f59e0b'; }
    return;
  }

  const res = await adminCreateCode(code, type, value, uses, exp || null);
  if (result) {
    result.textContent = res.ok ? `✅ Código "${code.trim().toUpperCase()}" criado!` : `❌ ${res.msg}`;
    result.style.color  = res.ok ? '#34d399' : '#f87171';
  }
  if (res.ok) {
    showNotification('✅ Código criado!', 'success');
    setTimeout(() => renderAdminPage('codigos'), 1200);
  }
}

async function handleAdminDeleteCode(codeId) {
  if (!confirm('Deletar este código?')) return;
  const res = await adminDeleteCode(codeId);
  if (res.ok) {
    showNotification('Código deletado.', 'info');
    renderAdminPage('codigos');
  } else {
    showNotification('❌ ' + res.msg, 'error');
    console.error('[handleAdminDeleteCode] falhou:', res.msg);
  }
}

async function handleAdminAction(userId, action, defaultReason) {
  const ok = await adminAction(userId, action, defaultReason);
  if (ok) {
    showNotification(`Ação "${action}" aplicada.`, 'success');
    renderAdminPage();
  } else {
    showNotification('Erro ao aplicar ação.', 'error');
  }
}

// ── Admin: funções da aba Teste ──────────────────────────────────────────────

/**
 * Envia notificação push para si mesmo via Edge Function (ignora o filtro
 * toUserId === authUserId que existe em sendPushToUser() normal).
 */
async function adminTestPushSelf() {
  const result = document.getElementById('admin-test-result');
  if (!result) return;
  const title = document.getElementById('test-push-title')?.value || '🧪 StudyQuest';
  const body  = document.getElementById('test-push-body')?.value  || 'Teste de push!';

  result.textContent = '⏳ Enviando...';
  result.style.color = 'var(--text-muted)';

  if (!sb || !authUserId) {
    result.textContent = '❌ Não autenticado.';
    result.style.color = '#f87171';
    return;
  }

  try {
    const { error, data: resp } = await sb.functions.invoke('send-push', {
      body: { toUserId: authUserId, title, body, data: { page: 'dashboard', tag: 'admin-test' } },
    });

    if (error) {
      result.textContent = `❌ Edge Function erro: ${error.message}`;
      result.style.color = '#f87171';
    } else if (resp?.sent > 0) {
      result.textContent = `✅ Push enviado para ${resp.sent} dispositivo(s)!`;
      result.style.color = '#34d399';
    } else if (resp?.error) {
      result.textContent = `⚠️ ${resp.error}`;
      result.style.color = '#f59e0b';
    } else {
      result.textContent = `⚠️ Nenhum dispositivo recebeu (sent=0). Verifique se a Edge Function está deployada.`;
      result.style.color = '#f59e0b';
    }
  } catch(e) {
    result.textContent = `❌ Exceção: ${e.message}`;
    result.style.color = '#f87171';
  }
}

/** Exibe uma notificação local do browser (não passa pelo servidor). */
async function adminTestLocalNotif() {
  const result = document.getElementById('admin-test-result');
  const title  = document.getElementById('test-push-title')?.value || '🧪 StudyQuest';
  const body   = document.getElementById('test-push-body')?.value  || 'Teste local!';

  if (!('Notification' in window)) {
    if (result) { result.textContent = '❌ Notificações não suportadas neste navegador.'; result.style.color = '#f87171'; }
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    if (result) { result.textContent = '🚫 Permissão negada.'; result.style.color = '#f87171'; }
    return;
  }

  const reg = await navigator.serviceWorker?.ready.catch(() => null);
  if (reg) {
    await reg.showNotification(title, { body, icon: './icon.svg', badge: './icon.svg', tag: 'admin-local-test', renotify: true });
    if (result) { result.textContent = '✅ Notificação local enviada via Service Worker!'; result.style.color = '#34d399'; }
  } else {
    new Notification(title, { body, icon: './icon.svg' });
    if (result) { result.textContent = '✅ Notificação local enviada (sem SW).'; result.style.color = '#34d399'; }
  }
}

/** Mostra o status do Service Worker na aba teste. */
async function adminCheckSwStatus() {
  const result = document.getElementById('admin-test-result');
  if (!result) return;

  if (!('serviceWorker' in navigator)) {
    result.innerHTML = '❌ Service Worker não suportado.';
    result.style.color = '#f87171';
    return;
  }

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    if (!regs.length) {
      result.textContent = '⚠️ Nenhum Service Worker registrado.';
      result.style.color = '#f59e0b';
      return;
    }

    const reg  = regs[0];
    const sub  = await reg.pushManager?.getSubscription();
    const ctrl = navigator.serviceWorker.controller;

    result.innerHTML = `
      <div style="line-height:1.9">
        🔧 <b>SW scope:</b> ${reg.scope}<br>
        📡 <b>Estado:</b> ${reg.active ? '✅ Ativo' : reg.installing ? '⏳ Instalando' : '❌ Inativo'}<br>
        🎛️ <b>Controlando aba:</b> ${ctrl ? '✅ Sim' : '⚠️ Não (recarregue a página)'}<br>
        🔔 <b>Push subscription:</b> ${sub ? '✅ Inscrito' : '❌ Sem subscription'}<br>
        ${sub ? `🔗 <b>Endpoint:</b> <span style="font-size:.75rem;word-break:break-all">${sub.endpoint.slice(0, 60)}...</span>` : ''}
      </div>`;
    result.style.color = 'var(--text)';
  } catch(e) {
    result.textContent = `❌ Erro: ${e.message}`;
    result.style.color = '#f87171';
  }
}

async function adminPromptAction(userId, action) {
  const labels = { warn: 'Motivo do aviso:', limit: 'Motivo da limitação:', reset: 'Motivo do reset (irreversível!):' };
  const reason = prompt(labels[action] || 'Motivo:');
  if (reason === null) return;
  await handleAdminAction(userId, action, reason);
}

async function showUserFlags(userId) {
  const flags = await loadUserFlags(userId);
  const total = flags.reduce((s, f) => s + (f.score || 1), 0);
  const msg = flags.length
    ? `Score total: ${total}\n\n` + flags.map(f => `[${new Date(f.created_at).toLocaleDateString('pt-BR')}] +${f.score} — ${f.reason}`).join('\n')
    : 'Nenhuma flag encontrada.';
  alert(msg);
}

// ============================================================
// CÓDIGOS DE RESGATE
// ============================================================

async function redeemCode(code) {
  if (!authUserId) return { ok: false, msg: 'Faça login para resgatar códigos.' };
  const clean = (code || '').trim().toUpperCase();
  if (!clean) return { ok: false, msg: 'Digite um código válido.' };

  try {
    const { data: row } = await sb.from('redeem_codes').select('*').eq('code', clean).maybeSingle();
    if (!row) return { ok: false, msg: 'Código inválido ou inexistente.' };

    if (row.expires_at && new Date(row.expires_at) < new Date())
      return { ok: false, msg: 'Código expirado.' };

    if (row.uses_max > 0 && row.uses_current >= row.uses_max)
      return { ok: false, msg: 'Código esgotado.' };

    const { count } = await sb.from('user_redeems')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', authUserId).eq('code_id', row.id);
    if (count > 0) return { ok: false, msg: 'Você já usou este código.' };

    let msg = '';
    switch (row.type) {
      case 'coins':
        addCoins(row.value);
        msg = `+${row.value} 💰 moedas adicionadas!`;
        break;
      case 'iacoins':
        addIACoins(row.value);
        msg = `+${row.value} 🧠 IACoin adicionados!`;
        break;
      case 'xp':
        addXp(row.value);
        msg = `+${row.value} ✨ XP adicionados!`;
        break;
      case 'admin':
        state.isAdmin = true;
        await sb.from('users').update({ is_admin: true }).eq('id', authUserId);
        msg = '👑 Acesso admin ativado!';
        break;
      default:
        msg = `Código tipo "${row.type}" resgatado!`;
    }

    await sb.from('user_redeems').insert({ user_id: authUserId, code_id: row.id });
    await sb.from('redeem_codes').update({ uses_current: row.uses_current + 1 }).eq('id', row.id);
    saveState();
    return { ok: true, msg };
  } catch (e) {
    console.error('[redeemCode]', e);
    return { ok: false, msg: 'Erro ao resgatar código. Tente novamente.' };
  }
}

function openRedeemModal() {
  openModal('modal-redeem');
  const inp = document.getElementById('redeem-code-input');
  if (inp) { inp.value = ''; inp.focus(); }
  const res = document.getElementById('redeem-result');
  if (res) res.textContent = '';
}

async function handleRedeemSubmit() {
  const inp = document.getElementById('redeem-code-input');
  const res = document.getElementById('redeem-result');
  if (!inp || !res) return;

  const btn = document.getElementById('redeem-submit-btn');
  if (btn) btn.disabled = true;

  const result = await redeemCode(inp.value);
  res.textContent = result.msg;
  res.className   = 'redeem-result ' + (result.ok ? 'redeem-ok' : 'redeem-err');

  if (result.ok) {
    showNotification(result.msg, 'success');
    inp.value = '';
  }
  if (btn) btn.disabled = false;
}

async function handleShopRedeemSubmit() {
  const inp = document.getElementById('shop-redeem-input');
  const res = document.getElementById('shop-redeem-result');
  if (!inp || !res) return;

  const btn = inp.parentElement?.querySelector('button');
  if (btn) btn.disabled = true;

  const result = await redeemCode(inp.value);
  res.textContent = result.msg;
  res.className   = 'redeem-result ' + (result.ok ? 'redeem-ok' : 'redeem-err');

  if (result.ok) {
    showNotification(result.msg, 'success');
    inp.value = '';
  }
  if (btn) btn.disabled = false;
}

// ============================================================
// SISTEMA DE FAMÍLIA / CONTROLE PARENTAL
// ============================================================

/* ── Estado local ─────────────────────────────────────────── */
let _familiaTab      = 'familia';
let _familyConnectRole = 'parent';
let _searchFamilyTimer = null;

/* ── Helpers ─────────────────────────────────────────────── */
function _myFamiliaId() { return authUserId || userId; }

function _fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function _daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(dateStr + 'T00:00:00');
  return Math.round((due - today) / 86400000);
}

// Formata a data para exibição: "hoje", "amanhã", "ontem", "atrasada", ou a data
function _formatDueDate(dateStr) {
  if (!dateStr) return '';
  const days = _daysUntil(dateStr);
  if (days < 0) return 'atrasada';
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  if (days === -1) return 'ontem';

  // Para datas futuras, mostra a data formatada
  const date = new Date(dateStr + 'T00:00:00');
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function _calcChildAverage(childState) {
  if (!childState?.subjects) return null;
  const allNums = [];

  // 1) gradeEntries: { subjectId: { typeId: [val,...] } }
  const ge = childState.gradeEntries || {};
  for (const subj of childState.subjects) {
    const entries = ge[subj.id];
    if (!entries) continue;
    Object.values(entries).forEach(arr => {
      (arr || []).forEach(v => {
        if (v !== null && v !== undefined && v !== '') allNums.push(Number(v));
      });
    });
  }

  // 2) exams: [{ grade, subjectId, ... }]  — inclui notas de provas
  (childState.exams || []).forEach(e => {
    if (e.grade !== null && e.grade !== undefined && e.grade !== '') {
      allNums.push(Number(e.grade));
    }
  });

  if (!allNums.length) return null;
  return (allNums.reduce((a,b) => a + b, 0) / allNums.length).toFixed(1);
}

/* ── Notificação parental ─────────────────────────────────── */
async function _sendParentalNotif(receiverId, type, title, message) {
  if (!sb || !receiverId) return;
  try {
    await sb.from('parental_notifications').insert({
      sender_id: _myFamiliaId(), receiver_id: receiverId, type, title, message,
    });
    sendPushToUser(receiverId, title, message, { page: 'familia', tag: 'parental-notif' });
  } catch(e) { console.warn('[Família] notif error:', e); }
}

async function notifyParentsOf(studentId, type, title, message) {
  if (!sb || !studentId) return;
  try {
    const { data: conns } = await sb.from('parental_connections')
      .select('parent_id').eq('student_id', studentId).eq('status', 'accepted');
    if (!conns?.length) return;
    for (const c of conns) await _sendParentalNotif(c.parent_id, type, title, message);
  } catch(e) {}
}

/* ── Hooks públicos (chamados pelo restante do app) ──────── */
function familyNotifyTaskDone(taskTitle) {
  const uid = _myFamiliaId(), name = state.name || 'Seu filho';
  notifyParentsOf(uid, 'task_done', `📚 ${name} concluiu uma tarefa!`, `"${taskTitle}" foi concluída.`);
}
function familyNotifyStudy(subjectName, minutes) {
  const uid = _myFamiliaId(), name = state.name || 'Seu filho';
  notifyParentsOf(uid, 'study', `🧠 ${name} estudou ${subjectName}!`,
    minutes ? `Sessão de ${minutes} minuto${minutes!==1?'s':''} concluída.` : 'Sessão concluída.');
}
function familyNotifyPomodoro(cycles) {
  const uid = _myFamiliaId(), name = state.name || 'Seu filho';
  notifyParentsOf(uid, 'pomodoro', `⏰ ${name} completou ${cycles} ciclo${cycles!==1?'s':''} Pomodoro!`, 'Ótima concentração hoje!');
}
function familyNotifyAchievement(achieveName) {
  const uid = _myFamiliaId(), name = state.name || 'Seu filho';
  notifyParentsOf(uid, 'achievement', `🏅 ${name} ganhou uma conquista!`, `"${achieveName}" desbloqueada!`);
}
function familyNotifyStreak(days) {
  const uid = _myFamiliaId(), name = state.name || 'Seu filho';
  notifyParentsOf(uid, 'streak', `🔥 ${name} está em sequência de ${days} dia${days!==1?'s':''}!`, 'Continue incentivando!');
}

/* ── Renderizar página Família ───────────────────────────── */
async function renderFamiliaPage(tab) {
  const page = document.getElementById('page-familia');
  if (!page) return;

  if (!authUserId) {
    page.innerHTML = `
      <div class="page-header"><h1>👨‍👩‍👧 Família</h1></div>
      <div class="social-empty" style="padding:2rem">
        <div style="font-size:3rem;margin-bottom:.75rem">🔒</div>
        <div style="font-weight:700;margin-bottom:.5rem">Login necessário</div>
        <div style="font-size:.85rem;color:var(--text-muted)">Faça login para usar o sistema de família.</div>
      </div>`;
    return;
  }

  if (tab) _familiaTab = tab;

  page.innerHTML = `<div class="page-header"><h1>👨‍👩‍👧 Família</h1></div><div class="social-loading">Carregando…</div>`;

  const myId = _myFamiliaId();
  let allConns = [], ptasks = [], msgs = [];

  try {
    const [r1, r2, r3] = await Promise.all([
      sb.from('parental_connections').select('*').or(`student_id.eq.${myId},parent_id.eq.${myId}`),
      sb.from('parental_tasks').select('*').or(`parent_id.eq.${myId},student_id.eq.${myId}`).order('created_at',{ascending:false}),
      sb.from('parental_notifications').select('*').eq('receiver_id', myId).order('created_at',{ascending:false}).limit(30),
    ]);
    allConns = r1.data || [];
    ptasks   = r2.data || [];
    msgs     = r3.data || [];
  } catch(e) { console.warn('[Família] load error:', e); }

  const conns      = allConns.filter(c => c.status === 'accepted');
  const pending    = allConns.filter(c => c.status === 'pending' && c.initiated_by !== myId);
  const pendingOut = allConns.filter(c => c.status === 'pending' && c.initiated_by === myId);

  const myChildren = conns.filter(c => c.parent_id  === myId).map(c => c.student_id);
  const myParents  = conns.filter(c => c.student_id === myId).map(c => c.parent_id);

  const allIds = [...new Set([
    ...myChildren, ...myParents,
    ...pending.map(c => c.initiated_by),
    ...pendingOut.map(c => c.student_id === myId ? c.parent_id : c.student_id),
  ])].filter(Boolean);

  let userNames = {};
  if (allIds.length && sb) {
    try {
      const { data: rows } = await sb.from('users').select('id,name').in('id', allIds);
      if (rows) rows.forEach(r => { userNames[r.id] = r.name || '?'; });
    } catch(e) {}
  }

  const unreadMsgs    = msgs.filter(m => !m.read).length;
  const myPendTasks   = ptasks.filter(t => t.student_id === myId && !t.completed);
  const pendingBadge  = pending.length ? `<span class="notif-badge-inline">${pending.length}</span>` : '';
  const msgBadge      = unreadMsgs ? `<span class="notif-badge-inline">${unreadMsgs}</span>` : '';
  const taskBadge     = myPendTasks.length ? `<span class="notif-badge-inline">${myPendTasks.length}</span>` : '';

  const tabsHtml = `<div class="familia-tabs">
    ${[
      {id:'familia',   icon:'👨‍👩‍👧', label:'Conexões',  badge:pendingBadge},
      {id:'mensagens', icon:'💌',     label:'Mensagens', badge:msgBadge},
    ].map(t=>`
      <button class="familia-tab${_familiaTab===t.id?' active':''}" onclick="renderFamiliaPage('${t.id}')">
        <span class="ft-icon">${t.icon}</span>
        <span class="ft-label">${t.label}</span>
        ${t.badge}
      </button>`).join('')}
  </div>`;

  let contentHtml = '';

  /* ── Tab: Conexões ─────────────────────────────────────── */
  if (_familiaTab === 'familia') {
    const pendingHtml = pending.length ? `
      <div class="familia-section-title">🔔 Pedidos Recebidos</div>
      ${pending.map(c => {
        const oid  = c.student_id === myId ? c.parent_id : c.student_id;
        const role = c.student_id === myId ? 'Responsável' : 'Filho(a)';
        const nm   = userNames[oid] || oid.slice(0,8)+'…';
        return `<div class="familia-card familia-card-pending">
          <div class="familia-card-avatar">👤</div>
          <div class="familia-card-info">
            <div class="familia-card-name">${escHtml(nm)}</div>
            <div class="familia-card-role">${role} • Aguardando resposta</div>
          </div>
          <div class="familia-card-actions">
            <button class="btn-sm btn-primary" onclick="acceptFamilyConnection('${c.id}')">✅ Aceitar</button>
            <button class="btn-sm btn-ghost"   onclick="rejectFamilyConnection('${c.id}')">✕</button>
          </div>
        </div>`;
      }).join('')}` : '';

    const pendingOutHtml = pendingOut.length ? `
      <div class="familia-section-title">⏳ Pedidos Enviados</div>
      ${pendingOut.map(c => {
        const oid  = c.student_id === myId ? c.parent_id : c.student_id;
        const role = c.parent_id === myId ? 'Meu filho(a)' : 'Meu responsável';
        const nm   = userNames[oid] || oid.slice(0,8)+'…';
        return `<div class="familia-card" style="opacity:.75">
          <div class="familia-card-avatar">👤</div>
          <div class="familia-card-info">
            <div class="familia-card-name">${escHtml(nm)}</div>
            <div class="familia-card-role">${role} · Aguardando confirmação…</div>
          </div>
          <button class="btn-sm btn-ghost" style="color:#f87171" onclick="cancelFamilyConnection('${c.id}')">Cancelar</button>
        </div>`;
      }).join('')}` : '';

    const childrenWithoutAccounts = state.childrenWithoutAccounts || [];
    const childrenHtml = (myChildren.length || childrenWithoutAccounts.length) ? `
      <div class="familia-section-title">🎒 Meus Filhos</div>
      ${myChildren.map(cid => {
        const conn = conns.find(c => c.student_id===cid && c.parent_id===myId);
        const nm   = userNames[cid] || cid.slice(0,8)+'…';
        return `<div class="familia-card familia-card-clickable" onclick="openFamilyMemberProfile('${cid}','${escHtml(nm)}','child','${conn?.id||''}')">
          <div class="familia-card-avatar familia-avatar-child">🎒</div>
          <div class="familia-card-info">
            <div class="familia-card-name">${escHtml(nm)}</div>
            <div class="familia-card-role">Filho(a) · Toque para ver opções</div>
          </div>
          <span class="familia-card-chevron">›</span>
        </div>`;
      }).join('')}
      ${childrenWithoutAccounts.map(child => {
        return `<div class="familia-card familia-card-clickable" onclick="openChildWithoutAccountProfile('${escHtml(child.id)}','${escHtml(child.name)}')">
          <div class="familia-card-avatar familia-avatar-child">👶</div>
          <div class="familia-card-info">
            <div class="familia-card-name">${escHtml(child.name)}</div>
            <div class="familia-card-role">Filho(a) (sem conta) · Toque para ver opções</div>
          </div>
          <span class="familia-card-chevron">›</span>
        </div>`;
      }).join('')}` : '';

    const parentsHtml = myParents.length ? `
      <div class="familia-section-title">👨‍👩‍👧 Meus Responsáveis</div>
      ${myParents.map(pid => {
        const conn = conns.find(c => c.parent_id===pid && c.student_id===myId);
        const nm   = userNames[pid] || pid.slice(0,8)+'…';
        return `<div class="familia-card familia-card-clickable" onclick="openFamilyMemberProfile('${pid}','${escHtml(nm)}','parent','${conn?.id||''}')">
          <div class="familia-card-avatar familia-avatar-parent">👨‍👩‍👧</div>
          <div class="familia-card-info">
            <div class="familia-card-name">${escHtml(nm)}</div>
            <div class="familia-card-role">Responsável · Toque para ver opções</div>
          </div>
          <span class="familia-card-chevron">›</span>
        </div>`;
      }).join('')}` : '';

    const hasAny = myChildren.length || myParents.length || pending.length || pendingOut.length || childrenWithoutAccounts.length;
    contentHtml = `
      ${pendingHtml}${pendingOutHtml}${childrenHtml}${parentsHtml}
      ${!hasAny ? `<div class="social-empty" style="padding:2rem">
        <div style="font-size:3rem;margin-bottom:.75rem">👨‍👩‍👧</div>
        <div style="font-weight:700;margin-bottom:.5rem">Nenhuma conexão ainda</div>
        <div style="font-size:.85rem;color:var(--text-muted);margin-bottom:1rem">Conecte-se com responsáveis ou filhos para começar.</div>
      </div>` : ''}
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem">
        <button class="btn-primary"   onclick="openFamilyConnectModal('parent')">➕ Adicionar Responsável</button>
        <button class="btn-secondary" onclick="openFamilyConnectModal('child')">➕ Adicionar Filho(a)</button>
        <button class="btn-secondary" onclick="openAddChildWithoutAccountModal()">➕ Adicionar Criança</button>
      </div>`;
  }

  /* ── Tab: Mensagens ────────────────────────────────────── */
  else if (_familiaTab === 'mensagens') {
    if (msgs.some(m => !m.read)) {
      sb.from('parental_notifications').update({read:true}).eq('receiver_id',myId).then(()=>{});
    }
    const icons = {task_done:'📚',study:'🧠',pomodoro:'⏰',achievement:'🏅',streak:'🔥',motivational:'💌',new_task:'📋',connection:'🔗',info:'ℹ️'};
    const msgsHtml = msgs.length ? msgs.map(m => {
      const senderNm = userNames[m.sender_id] || m.sender_id?.slice(0,8)+'…';
      const dt = new Date(m.created_at);
      const ts = dt.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
      return `<div class="familia-msg-card">
        <div class="familia-msg-icon">${icons[m.type]||'🔔'}</div>
        <div class="familia-msg-body">
          <div class="familia-msg-title">${escHtml(m.title)}</div>
          ${m.message?`<div class="familia-msg-text">${escHtml(m.message)}</div>`:''}
          <div class="familia-msg-meta">${escHtml(senderNm)} · ${ts}</div>
        </div>
      </div>`;
    }).join('')
    : `<div class="social-empty" style="padding:1.5rem"><div style="font-size:2.5rem;margin-bottom:.5rem">💌</div><div style="font-weight:700">Nenhuma mensagem</div></div>`;

    contentHtml = `
      <div class="familia-section-title">📨 Notificações Familiares</div>
      ${msgsHtml}
      ${myChildren.length ? `<div style="margin-top:1rem">
        <div class="familia-section-title">💌 Enviar Mensagem</div>
        <div style="display:flex;flex-wrap:wrap;gap:.5rem">
          ${myChildren.map(cid=>{
            const nm=userNames[cid]||cid.slice(0,8)+'…';
            return `<button class="btn-secondary btn-sm" onclick="openMotivationalModal('${cid}','${escHtml(nm)}')">💌 Para ${escHtml(nm)}</button>`;
          }).join('')}
        </div>
      </div>` : ''}`;
  }

  page.innerHTML = `
    <div class="page-header"><h1>👨‍👩‍👧 Família</h1></div>
    <div class="page-content">${tabsHtml}${contentHtml}</div>`;

  _updateParentalSettingsSummary(myChildren.length, myParents.length, pending.length);
  updateFamiliaBadge();
}

/* ── Resumo nas configurações ─────────────────────────────── */
function _updateParentalSettingsSummary(children, parents, pendingCount) {
  const el = document.getElementById('settings-parental-summary');
  if (!el) return;
  const parts = [];
  if (parents)      parts.push(`${parents} responsável${parents>1?'is':''}`);
  if (children)     parts.push(`${children} filho${children>1?'s':''}`);
  if (pendingCount) parts.push(`${pendingCount} pedido${pendingCount>1?'s':''} pendente${pendingCount>1?'s':''}`);
  el.textContent = parts.length ? parts.join(' · ') : 'Nenhuma conexão ainda.';
}

/* ── Dashboard do filho ───────────────────────────────────── */
async function viewChildDashboard(childId, childName) {
  const page = document.getElementById('page-familia');
  if (!page) return;

  page.innerHTML = `
    <div class="page-header">
      <button class="btn-back" onclick="renderFamiliaPage('familia')">‹ Voltar</button>
      <h1>📊 ${escHtml(childName)}</h1>
    </div>
    <div class="social-loading">Carregando dados…</div>`;

  try {
    const { data: row, error } = await sb.from('users')
      .select('data,name,level,xp').eq('id', childId).single();

    if (error || !row) throw new Error(error?.message || 'Not found');

    const cd  = (typeof row.data === 'object' && row.data) ? row.data : {};
    const approvalAvg = Number(cd.settings?.schoolAverage) || 7;
    const subjects    = cd.subjects || [];
    const gradeEntries = cd.gradeEntries || {};
    const exams       = [...(cd.exams || [])].reverse().slice(0, 8);
    const allTasks    = cd.tasks || [];
    const doneTasks   = allTasks.filter(t => t.done).slice(-6).reverse();
    const pendTasks   = allTasks.filter(t => !t.done).slice(0, 6);
    const studyItems  = (cd.studyItems || []).filter(i => i.done).slice(-5).reverse();

    // Média geral
    const avg = _calcChildAverage(cd);
    const avgColor = avg === null ? 'var(--text-muted)' : Number(avg) >= approvalAvg ? '#34d399' : '#f87171';

    // XP da semana
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    let xpWeek = 0;
    Object.entries(cd.xpHistory || {}).forEach(([d, x]) => {
      if (new Date(d + 'T00:00:00') >= weekStart) xpWeek += (x || 0);
    });

    // Helper: mini stat pill
    const pill = (icon, val, label) => `
      <div class="child-stat-pill">
        <span class="csp-icon">${icon}</span>
        <div><div class="csp-val">${val}</div><div class="csp-lbl">${label}</div></div>
      </div>`;

    // Helper: lista com nota colorida
    const gradeTag = (g) => {
      if (g === null || g === undefined || g === '') return '';
      const n = Number(g);
      const c = n >= approvalAvg ? '#34d399' : '#f87171';
      return `<span class="child-grade-badge" style="background:${c}20;color:${c};border-color:${c}40">${g}</span>`;
    };

    // Matérias com médias (gradeEntries + provas daquela matéria)
    const subjectsHtml = subjects.length ? subjects.map(s => {
      const sE  = gradeEntries[s.id] || {};
      const fromEntries = Object.values(sE).flatMap(a => (a || []).filter(v => v !== null && v !== undefined && v !== '').map(Number));
      const fromExams   = exams.filter(e => e.subjectId === s.id && e.grade !== null && e.grade !== undefined && e.grade !== '').map(e => Number(e.grade));
      const aN  = [...fromEntries, ...fromExams];
      const sA  = aN.length ? (aN.reduce((a, b) => a + b, 0) / aN.length).toFixed(1) : null;
      const sc  = sA !== null ? (Number(sA) >= approvalAvg ? '#34d399' : '#f87171') : 'var(--text-muted)';
      const barPct = sA !== null ? Math.min((Number(sA) / 10) * 100, 100) : 0;
      return `<div class="child-subject-row">
        <span class="child-subj-icon">${s.icon || s.emoji || '📚'}</span>
        <div class="child-subj-info">
          <div class="child-subj-name">${escHtml(s.name)}</div>
          <div class="child-subj-bar-wrap">
            <div class="child-subj-bar" style="width:${barPct}%;background:${sc}"></div>
          </div>
        </div>
        <span class="child-grade-badge" style="background:${sA!==null?sc+'20':'transparent'};color:${sc};border-color:${sA!==null?sc+'40':'var(--border)'}">${sA !== null ? sA : '—'}</span>
      </div>`;
    }).join('') : `<div style="color:var(--text-muted);font-size:.85rem;padding:.5rem 0">Sem matérias cadastradas.</div>`;

    // Provas
    const examsHtml = exams.length ? exams.map(e => {
      const subj = subjects.find(s => s.id === e.subjectId);
      const g    = (e.grade !== null && e.grade !== undefined) ? e.grade : null;
      return `<div class="child-list-row">
        <span>${subj?.icon || '📝'} ${escHtml(e.name || subj?.name || 'Prova')}</span>
        <div style="display:flex;align-items:center;gap:.5rem">
          <span style="font-size:.78rem;color:var(--text-muted)">${_fmtDate(e.examDate)}</span>
          ${gradeTag(g)}
        </div>
      </div>`;
    }).join('') : `<div style="color:var(--text-muted);font-size:.85rem;padding:.5rem 0">Sem provas registradas.</div>`;

    // Tarefas pendentes
    const pendHtml = pendTasks.length ? pendTasks.map(t => {
      const subj = subjects.find(s => s.id === t.subjectId);
      const taskName = t.name || t.title || '(sem nome)';
      const days = _daysUntil(t.dueDate);
      const dateFormatted = _formatDueDate(t.dueDate);
      const dateColor = days < 0 ? '#f87171' : days === 0 ? '#f59e0b' : 'var(--text-muted)';
      const dTag = t.dueDate
        ? `<span style="color:${dateColor};font-size:.75rem">${dateFormatted}</span>`
        : '';
      return `<div class="child-list-row">
        <span>${subj?.icon || subj?.emoji || '📋'} ${escHtml(taskName)}</span>
        ${dTag}
      </div>`;
    }).join('') : `<div style="color:var(--text-muted);font-size:.85rem;padding:.5rem 0">Nenhuma tarefa pendente.</div>`;

    // Tarefas concluídas
    const doneHtml = doneTasks.length ? doneTasks.map(t => {
      const taskName = t.name || t.title || '(sem nome)';
      const subj = subjects.find(s => s.id === t.subjectId);
      return `<div class="child-list-row">
        <span>${subj?.icon || subj?.emoji || '✅'} ${escHtml(taskName)}</span>
        <span style="color:#34d399;font-size:.78rem;font-weight:700">Concluída</span>
      </div>`;
    }).join('')
      : `<div style="color:var(--text-muted);font-size:.85rem;padding:.5rem 0">Sem tarefas concluídas recentes.</div>`;

    // Conteúdos estudados  (campo correto é 'content')
    const studiedHtml = studyItems.length ? studyItems.map(i => {
      const subj = subjects.find(s => s.id === i.subjectId);
      const itemName = i.content || i.title || i.name || '(sem título)';
      return `<div class="child-list-row">
        <span>${subj?.icon || subj?.emoji || '📘'} ${escHtml(itemName)}</span>
        <span style="color:#34d399;font-size:.78rem">Estudado</span>
      </div>`;
    }).join('') : `<div style="color:var(--text-muted);font-size:.85rem;padding:.5rem 0">Sem conteúdos estudados registrados.</div>`;

    page.innerHTML = `
      <div class="page-header">
        <button class="btn-back" onclick="renderFamiliaPage('familia')">‹ Voltar</button>
        <h1>📊 ${escHtml(childName)}</h1>
      </div>
      <div class="page-content">

        <!-- Hero stats -->
        <div class="child-stats-hero">
          ${pill('⚡', cd.xp || 0, `XP · Nível ${cd.level || 1}`)}
          ${pill('🔥', `${cd.streak || 0}d`, cd.maxStreak ? `Recorde ${cd.maxStreak}d` : 'Streak')}
          ${pill('📊', avg !== null ? `<span style="color:${avgColor}">${avg}</span>` : '—', avg !== null ? (Number(avg) >= approvalAvg ? '✅ Aprovado' : '⚠️ Atenção') : 'Média geral')}
          ${pill('⚡', xpWeek, 'XP esta semana')}
          ${pill('✅', cd.totalTasksDone || 0, 'Tarefas feitas')}
          ${pill('⏱️', cd.totalPomodoros || 0, 'Pomodoros')}
        </div>

        <!-- Matérias -->
        <div class="child-section">
          <div class="child-section-title">📚 Matérias e Médias</div>
          <div class="child-section-body">${subjectsHtml}</div>
        </div>

        <!-- Provas -->
        <div class="child-section">
          <div class="child-section-title">📝 Provas</div>
          <div class="child-section-body">${examsHtml}</div>
        </div>

        <!-- Tarefas pendentes -->
        <div class="child-section">
          <div class="child-section-title">⏳ Tarefas Pendentes</div>
          <div class="child-section-body">${pendHtml}</div>
        </div>

        <!-- Tarefas concluídas -->
        <div class="child-section">
          <div class="child-section-title">✅ Tarefas Concluídas Recentes</div>
          <div class="child-section-body">${doneHtml}</div>
        </div>

        <!-- Conteúdos estudados -->
        <div class="child-section">
          <div class="child-section-title">📘 Conteúdos Estudados</div>
          <div class="child-section-body">${studiedHtml}</div>
        </div>

        <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.25rem">
          <button class="btn-primary"   onclick="openParentalTaskModal('${childId}','${escHtml(childName)}')">📋 Criar Tarefa</button>
          <button class="btn-secondary" onclick="openMotivationalModal('${childId}','${escHtml(childName)}')">💌 Mensagem</button>
        </div>
      </div>`;

  } catch(e) {
    page.innerHTML = `
      <div class="page-header">
        <button class="btn-back" onclick="renderFamiliaPage('familia')">‹ Voltar</button>
        <h1>📊 ${escHtml(childName)}</h1>
      </div>
      <div class="social-empty" style="padding:2rem">
        <div style="font-size:2.5rem;margin-bottom:.5rem">⚠️</div>
        <div style="font-weight:700">Não foi possível carregar os dados.</div>
        <div style="font-size:.83rem;color:var(--text-muted);margin-top:.5rem">${e.message}</div>
        <div style="font-size:.78rem;color:var(--text-muted);margin-top:.25rem">Verifique a política RLS no Supabase.</div>
      </div>`;
    console.warn('[Família] viewChildDashboard:', e);
  }
}

/* ── Perfil de membro familiar (modal com ações) ─────────── */
async function openFamilyMemberProfile(memberId, memberName, role, connId) {
  // role: 'child' | 'parent'
  const avatarEl  = document.getElementById('fp-avatar');
  const nameEl    = document.getElementById('fp-name');
  const roleEl    = document.getElementById('fp-role');
  const statsEl   = document.getElementById('fp-stats');
  const actionsEl = document.getElementById('fp-actions');

  if (!avatarEl) return;

  // Reset
  avatarEl.textContent  = role === 'child' ? '🎒' : '👨‍👩‍👧';
  nameEl.textContent    = memberName;
  roleEl.textContent    = role === 'child' ? 'Filho(a) conectado(a)' : 'Responsável conectado';
  statsEl.innerHTML     = '<span style="color:var(--text-muted);font-size:.82rem">Carregando…</span>';
  actionsEl.innerHTML   = '';

  openModal('modal-familia-profile');

  // Carrega dados básicos do membro
  try {
    const { data: row } = await sb.from('users').select('data,name,level,xp').eq('id', memberId).single();
    if (row) {
      const cd = row.data || {};
      // Avatar
      const userObj = {
        avatar: cd.avatar || '🧙', avatarType: cd.avatarType || 'emoji',
        avatarUrl: cd.avatarUrl || '', equippedFrame: cd.cosmetics?.equippedFrame || null,
        name: row.name || memberName,
      };
      avatarEl.innerHTML = '';
      avatarEl.style.fontSize = '3rem';
      const avatarDiv = document.createElement('div');
      avatarDiv.innerHTML = _avatarHtml(userObj, 'friend-profile-avatar');
      avatarEl.appendChild(avatarDiv.firstChild);

      // Stats
      const streak = cd.streak || 0;
      const avg    = _calcChildAverage(cd);
      statsEl.innerHTML = `
        <div style="text-align:center">
          <div style="font-weight:800;font-size:1.1rem">${row.level || 1}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">Nível</div>
        </div>
        <div style="text-align:center">
          <div style="font-weight:800;font-size:1.1rem">${row.xp || 0}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">XP</div>
        </div>
        <div style="text-align:center">
          <div style="font-weight:800;font-size:1.1rem">${streak}🔥</div>
          <div style="font-size:.72rem;color:var(--text-muted)">Streak</div>
        </div>
        ${avg !== null ? `<div style="text-align:center">
          <div style="font-weight:800;font-size:1.1rem;color:${Number(avg)>=7?'#34d399':'#f87171'}">${avg}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">Média</div>
        </div>` : ''}`;
    }
  } catch(e) {
    statsEl.innerHTML = '<span style="color:var(--text-muted);font-size:.82rem">Sem dados</span>';
  }

  // Ações contextuais
  if (role === 'child') {
    actionsEl.innerHTML = `
      <button class="btn-primary" style="width:100%" onclick="closeModal('modal-familia-profile');viewChildDashboard('${memberId}','${escHtml(memberName)}')">
        📊 Ver Progresso Completo
      </button>
      <button class="btn-secondary" style="width:100%" onclick="closeModal('modal-familia-profile');openParentalTaskModal('${memberId}','${escHtml(memberName)}')">
        📋 Criar Tarefa
      </button>
      <button class="btn-secondary" style="width:100%" onclick="closeModal('modal-familia-profile');openMotivationalModal('${memberId}','${escHtml(memberName)}')">
        💌 Enviar Mensagem Motivacional
      </button>
      <button class="btn-ghost" style="width:100%;color:#f87171;margin-top:.25rem" onclick="closeModal('modal-familia-profile');removeFamilyConnection('${connId}')">
        🔌 Desconectar
      </button>`;
  } else {
    // parent
    actionsEl.innerHTML = `
      <button class="btn-ghost" style="width:100%;color:#f87171" onclick="closeModal('modal-familia-profile');removeFamilyConnection('${connId}')">
        🔌 Desconectar
      </button>`;
  }
}

/* ── Modal: Conectar ──────────────────────────────────────── */
function openFamilyConnectModal(role) {
  _familyConnectRole = role;
  const isParent = role === 'parent';
  const titleEl  = document.getElementById('familia-connect-title');
  const descEl   = document.getElementById('familia-connect-desc');
  if (titleEl) titleEl.textContent = isParent ? '➕ Adicionar Responsável' : '➕ Adicionar Filho(a)';
  if (descEl)  descEl.textContent  = isParent ? 'Busque o responsável pelo nome ou e-mail.' : 'Busque seu filho(a) pelo nome ou e-mail.';
  const search  = document.getElementById('familia-connect-search');
  const results = document.getElementById('familia-connect-results');
  const status  = document.getElementById('familia-connect-status');
  if (search)  search.value       = '';
  if (results) results.innerHTML  = '';
  if (status)  status.textContent = '';
  openModal('modal-familia-connect');
}

async function searchFamilyUser(query) {
  const resultsEl = document.getElementById('familia-connect-results');
  if (!resultsEl) return;
  clearTimeout(_searchFamilyTimer);
  if (!query || query.trim().length < 2) { resultsEl.innerHTML = ''; return; }
  _searchFamilyTimer = setTimeout(async () => {
    resultsEl.innerHTML = '<div class="social-loading" style="padding:.75rem;font-size:.85rem">Buscando…</div>';
    try {
      const found = await searchUsers(query.trim());
      if (!found.length) {
        resultsEl.innerHTML = '<div class="social-empty" style="padding:.75rem;font-size:.85rem">Nenhum usuário encontrado.</div>';
        return;
      }
      resultsEl.innerHTML = found.map(u => `
        <div class="friend-card search-result" style="cursor:pointer" onclick="sendFamilyConnectionTo('${u.id}','${escHtml(u.name)}')">
          ${_avatarHtml(u, 'friend-avatar')}
          <div class="friend-info">
            <div class="friend-name">${escHtml(u.name)}</div>
            <div class="friend-username">@${escHtml(u.username)}</div>
            <div class="friend-level">⚔️ Nível ${u.level} · ✨ ${u.xp} XP</div>
          </div>
          <button class="btn-add-friend" onclick="event.stopPropagation();sendFamilyConnectionTo('${u.id}','${escHtml(u.name)}')">
            Conectar
          </button>
        </div>`).join('');
    } catch(e) {
      resultsEl.innerHTML = '<div style="padding:.5rem;font-size:.83rem;color:#f87171">Erro na busca.</div>';
    }
  }, 350);
}

async function sendFamilyConnectionTo(otherId, otherName) {
  const status = document.getElementById('familia-connect-status');
  if (!sb) return;
  const myId = _myFamiliaId();
  // role='parent' → estou adicionando um RESPONSÁVEL → eu sou o estudante, o outro é o pai
  // role='child'  → estou adicionando um FILHO      → eu sou o pai, o outro é o estudante
  const studentId = _familyConnectRole === 'parent' ? myId    : otherId;
  const parentId  = _familyConnectRole === 'parent' ? otherId : myId;
  try {
    const { data: ex } = await sb.from('parental_connections').select('id,status')
      .eq('student_id',studentId).eq('parent_id',parentId).maybeSingle();
    if (ex) {
      if (status) { status.textContent = ex.status==='accepted'?'✅ Já conectados!':'⏳ Pedido já enviado.'; status.style.color='#f59e0b'; }
      return;
    }
  } catch(e) {}
  try {
    await sb.from('parental_connections').insert({ student_id:studentId, parent_id:parentId, status:'pending', initiated_by:myId });
    const myName = state.name||'Alguém';
    // role='parent' → eu adicionei o outro como meu responsável → aviso para ele que sou estudante
    // role='child'  → eu adicionei o outro como meu filho        → aviso para ele que sou responsável
    const notifTitle = _familyConnectRole === 'parent'
      ? `🎒 ${myName} quer te adicionar como responsável`
      : `👨‍👩‍👧 ${myName} quer se conectar como responsável de você`;
    await _sendParentalNotif(otherId, 'connection', notifTitle, 'Acesse Família para aceitar ou recusar.');
    if (status) { status.textContent = `✅ Pedido enviado para ${otherName}!`; status.style.color='#34d399'; }
    showNotification(`Pedido enviado para ${otherName}!`, 'success');
    setTimeout(() => closeModal('modal-familia-connect'), 1500);
  } catch(e) {
    if (status) { status.textContent = '❌ Erro ao enviar pedido.'; status.style.color='#f87171'; }
  }
}

async function acceptFamilyConnection(id) {
  try { await sb.from('parental_connections').update({status:'accepted'}).eq('id',id); showNotification('Conexão aceita! 🎉','success'); renderFamiliaPage('familia'); }
  catch(e) { showNotification('Erro ao aceitar.','error'); }
}
async function rejectFamilyConnection(id) {
  try { await sb.from('parental_connections').update({status:'rejected'}).eq('id',id); showNotification('Pedido recusado.','info'); renderFamiliaPage('familia'); }
  catch(e) { showNotification('Erro.','error'); }
}
async function cancelFamilyConnection(id) {
  try { await sb.from('parental_connections').delete().eq('id',id); showNotification('Pedido cancelado.','info'); renderFamiliaPage('familia'); }
  catch(e) { showNotification('Erro.','error'); }
}
async function removeFamilyConnection(id) {
  if (!id || !confirm('Remover esta conexão familiar?')) return;
  try { await sb.from('parental_connections').delete().eq('id',id); showNotification('Conexão removida.','info'); renderFamiliaPage('familia'); }
  catch(e) { showNotification('Erro ao remover.','error'); }
}

/* ── Tarefas Parentais ────────────────────────────────────── */
function openParentalTaskModal(studentId, studentName) {
  document.getElementById('parental-task-student-id').value = studentId;
  document.getElementById('pt-title').value  = '';
  document.getElementById('pt-desc').value   = '';
  document.getElementById('pt-difficulty').value = 'easy';
  document.getElementById('pt-result').textContent = '';

  // Reset difficulty buttons
  document.querySelectorAll('.pt-diff-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === 'easy');
  });

  const d = new Date(); d.setDate(d.getDate()+7);
  document.getElementById('pt-due').value = d.toISOString().slice(0,10);
  openModal('modal-parental-task');
}

function selectParentalDifficulty(diff) {
  document.getElementById('pt-difficulty').value = diff;
  document.querySelectorAll('.pt-diff-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === diff);
  });
}

async function submitParentalTask() {
  const studentId = document.getElementById('parental-task-student-id').value;
  const title     = document.getElementById('pt-title').value.trim();
  const desc      = document.getElementById('pt-desc').value.trim();
  const difficulty = document.getElementById('pt-difficulty').value || 'easy';
  const xp        = XP_REWARDS[difficulty] || 10;
  const due       = document.getElementById('pt-due').value||null;
  const result    = document.getElementById('pt-result');
  if (!title) { result.textContent='⚠️ Título obrigatório.'; result.style.color='#f59e0b'; return; }

  try {
    // Verifica se é uma criança sem conta (ID começa com 'child_')
    if (studentId.startsWith('child_')) {
      // Salva localmente para crianças sem conta
      if (!state.childrenTasksLocal) state.childrenTasksLocal = [];
      state.childrenTasksLocal.push({
        id: 'task_' + Date.now(),
        childId: studentId,
        title,
        description: desc,
        difficulty,
        xp_reward: xp,
        due_date: due,
        completed: false,
        created_at: new Date().toISOString()
      });
      saveState();
      result.textContent='✅ Tarefa criada!'; result.style.color='#34d399';
      showNotification('Tarefa criada!','success');
    } else {
      // Salva no Supabase para filhos com conta
      await sb.from('parental_tasks').insert({ parent_id:_myFamiliaId(), student_id:studentId, title, description:desc, difficulty, xp_reward:xp, due_date:due });
      await _sendParentalNotif(studentId,'new_task',`📋 Nova tarefa: "${title}"`, desc||`Prazo: ${due?_fmtDate(due):'sem prazo'} · ⚡${xp} XP`);
      result.textContent='✅ Tarefa criada!'; result.style.color='#34d399';
      showNotification('Tarefa criada!','success');
    }
    setTimeout(() => { closeModal('modal-parental-task'); renderFamiliaPage('familia'); }, 1000);
  } catch(e) {
    console.error('Erro ao criar tarefa:', e);
    result.textContent='❌ Erro ao criar.'; result.style.color='#f87171';
  }
}

async function completeParentalTask(taskId, xpReward, taskTitle, parentId) {
  try {
    await sb.from('parental_tasks')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('id', taskId);

    const gained = xpReward || 50;

    // Usa addXp() que cuida de: nível, dailyXp, xpHistory, updateDashboard, checkMissionGoals
    addXp(gained);
    // Conta como dia de estudo → streak + calendário
    markStudyToday();
    // Conta para missões
    updateMissionProgress('tasksToday', 1);
    updateWeeklyMissionProgress('tasksThisWeek', 1);
    state.totalTasksDone = (state.totalTasksDone || 0) + 1;
    saveState();

    showNotification(`+${gained} XP! "${taskTitle}" concluída! 🎉`, 'success');
    showXpPopup(gained, false);
    playSound('complete');

    // Atualiza a seção na aba Tarefas sem recarregar a página toda
    loadParentalTasksSection().catch(() => {});

    // Notifica o pai
    const myName = state.name || 'Seu filho';
    _sendParentalNotif(parentId, 'task_done',
      `📚 ${myName} concluiu uma tarefa!`,
      `"${taskTitle}" concluída. +${gained} XP`
    ).catch(() => {});

  } catch(e) {
    console.error('[completeParentalTask]', e);
    showNotification('Erro ao concluir tarefa.', 'error');
  }
}

async function deleteParentalTask(taskId) {
  if (!confirm('Excluir esta tarefa?')) return;
  try { await sb.from('parental_tasks').delete().eq('id',taskId); showNotification('Tarefa excluída.','info'); renderFamiliaPage('familia'); }
  catch(e) { showNotification('Erro.','error'); }
}

/* ── Mensagem motivacional ────────────────────────────────── */
function openMotivationalModal(studentId, studentName) {
  document.getElementById('motiv-student-id').value      = studentId;
  document.getElementById('motiv-student-name').textContent = studentName;
  document.getElementById('motiv-message').value         = '';
  document.getElementById('motiv-result').textContent    = '';
  openModal('modal-motivational');
}

async function submitMotivationalMessage() {
  const studentId = document.getElementById('motiv-student-id').value;
  const msg       = document.getElementById('motiv-message').value.trim();
  const result    = document.getElementById('motiv-result');
  if (!msg) { result.textContent='⚠️ Escreva uma mensagem.'; result.style.color='#f59e0b'; return; }
  try {
    await _sendParentalNotif(studentId,'motivational',`💌 Mensagem de ${state.name||'Seu responsável'}`, msg);
    result.textContent='✅ Enviada! 💌'; result.style.color='#34d399';
    showNotification('Mensagem enviada!','success');
    setTimeout(()=>closeModal('modal-motivational'), 1200);
  } catch(e) { result.textContent='❌ Erro.'; result.style.color='#f87171'; }
}

/* ── Badge de pendentes na nav ───────────────────────────── */
async function updateFamiliaBadge() {
  if (!sb || !authUserId) return;
  const myId = _myFamiliaId();
  try {
    const [r1, r2] = await Promise.all([
      sb.from('parental_connections').select('id',{count:'exact',head:true})
        .eq('status','pending').neq('initiated_by',myId)
        .or(`student_id.eq.${myId},parent_id.eq.${myId}`),
      sb.from('parental_notifications').select('id',{count:'exact',head:true})
        .eq('receiver_id',myId).eq('read',false),
    ]);
    const total = (r1.count||0)+(r2.count||0);
    const badge = document.getElementById('familia-nav-badge');
    if (badge) { badge.textContent=total||''; badge.style.display=total?'':'none'; }
  } catch(e) {}
}

/* ── Seção de tarefas parentais na aba Tarefas ───────────── */
async function loadParentalTasksSection() {
  if (!sb) return;
  const myId = _myFamiliaId();
  try {
    let tasksForMe = [];
    let tasksFromMe = [];

    // Se for um usuário autenticado, carrega do Supabase
    if (authUserId) {
      try {
        // Tarefas criadas PARA mim por pais (student_id = myId)
        const r1 = await sb.from('parental_tasks')
          .select('*').eq('student_id', myId).eq('completed', false)
          .order('due_date', { ascending: true });
        tasksForMe = r1.data || [];

        // Tarefas que criei PARA meus filhos (parent_id = myId)
        const r2 = await sb.from('parental_tasks')
          .select('*').eq('parent_id', myId).eq('completed', false)
          .order('due_date', { ascending: true });
        tasksFromMe = r2.data || [];
      } catch(e) {
        console.warn('[ParentalTasks] Erro ao carregar do Supabase:', e);
      }
    }

    // Carrega tarefas locais para crianças sem conta
    const localTasks = (state.childrenTasksLocal || []).filter(t => !t.completed);

    // Combina as tarefas (remover duplicatas, manter diferentes)
    const tasksMap = new Map();
    (tasksForMe || []).forEach(t => tasksMap.set(t.id, { ...t, isForMe: true }));
    (tasksFromMe || []).forEach(t => {
      if (!tasksMap.has(t.id)) {
        tasksMap.set(t.id, { ...t, isFromMe: true });
      }
    });
    // Adiciona tarefas locais (para crianças sem conta)
    (localTasks || []).forEach(t => {
      tasksMap.set(t.id, { ...t, isFromMe: true, isLocal: true });
    });

    const ptasks = Array.from(tasksMap.values());
    if (!ptasks || !ptasks.length) {
      const section = document.getElementById('parental-tasks-section');
      const list = document.getElementById('parental-tasks-list');
      if (section) section.style.display = 'none';
      return;
    }

    // Busca nomes dos pais/filhos envolvidos
    const ids = [...new Set([
      ...ptasks.filter(t => !t.isLocal).map(t => t.parent_id),
      ...ptasks.filter(t => !t.isLocal).map(t => t.student_id)
    ])];
    let names = {};
    if (ids.length > 0 && authUserId) {
      try {
        const { data: rows } = await sb.from('users').select('id,name').in('id', ids);
        if (rows) rows.forEach(r => { names[r.id] = r.name || '?'; });
      } catch(e) { console.warn('[ParentalTasks] Erro ao buscar nomes:', e); }
    }

    // Adiciona nomes das crianças sem conta
    const childrenWithoutAccounts = state.childrenWithoutAccounts || [];
    childrenWithoutAccounts.forEach(child => {
      names[child.id] = child.name;
    });

    const section = document.getElementById('parental-tasks-section');
    const list = document.getElementById('parental-tasks-list');
    if (!section || !list) return;

    section.style.display = '';
    list.innerHTML = ptasks.sort((a, b) => {
      const aDate = a.due_date ? new Date(a.due_date) : new Date('2999-12-31');
      const bDate = b.due_date ? new Date(b.due_date) : new Date('2999-12-31');
      return aDate - bDate;
    }).map(t => {
      const parentName = names[t.parent_id] || '?';
      const studentName = t.isLocal ? names[t.childId] : names[t.student_id] || '?';
      const days = _daysUntil(t.due_date);
      const dateFormatted = _formatDueDate(t.due_date);
      const dateColor = days < 0 ? '#f87171' : days === 0 ? '#f59e0b' : 'var(--text-muted)';
      const dTag = t.due_date
        ? `<span style="color:${dateColor};font-size:.75rem"> ${dateFormatted}</span>`
        : '';

      const metaText = t.isForMe || t.isLocal
        ? (t.isLocal ? `Para: <b>${escHtml(studentName)}</b> · ⚡${t.xp_reward} XP${dTag}` : `De: <b>${escHtml(parentName)}</b> · ⚡${t.xp_reward} XP${dTag}`)
        : `Para: <b>${escHtml(studentName)}</b> · ⚡${t.xp_reward} XP${dTag}`;

      return `<div class="parental-task-card" style="margin-bottom:.4rem">
        <div class="ptask-icon">📋</div>
        <div class="ptask-info" style="flex:1">
          <div class="ptask-title">${escHtml(t.title)}</div>
          <div class="ptask-meta">${metaText}</div>
        </div>
        ${t.isForMe ? `<button class="btn-sm btn-primary" style="flex-shrink:0"
          onclick="completeParentalTask('${t.id}',${t.xp_reward},'${escHtml(t.title)}','${t.parent_id}')">✅</button>` : ''}
      </div>`;
    }).join('');
  } catch(e) { console.warn('[Família] loadParentalTasksSection:', e); }
}

/* ── Crianças sem conta ──────────────────────────────────── */
function openAddChildWithoutAccountModal() {
  const inp = document.getElementById('cwa-name');
  if (inp) {
    inp.value = '';
    inp.focus();
  }
  const result = document.getElementById('cwa-result');
  if (result) result.textContent = '';
  openModal('modal-child-without-account');
}

function addChildWithoutAccount() {
  const nameInp = document.getElementById('cwa-name');
  const name = nameInp ? nameInp.value.trim() : '';
  const result = document.getElementById('cwa-result');

  if (!name) {
    if (result) { result.textContent = '⚠️ Digite o nome da criança.'; result.style.color = '#f59e0b'; }
    return;
  }

  if (!state.childrenWithoutAccounts) state.childrenWithoutAccounts = [];

  const id = 'child_' + Date.now();
  state.childrenWithoutAccounts.push({ id, name });
  saveState();

  if (result) { result.textContent = '✅ Criança adicionada!'; result.style.color = '#34d399'; }
  showNotification(`Criança ${name} adicionada!`, 'success');
  setTimeout(() => { closeModal('modal-child-without-account'); renderFamiliaPage('familia'); }, 1000);
}

function removeChildWithoutAccount(childId) {
  if (!confirm('Remover esta criança?')) return;
  state.childrenWithoutAccounts = (state.childrenWithoutAccounts || []).filter(c => c.id !== childId);
  saveState();
  showNotification('Criança removida.', 'info');
  renderFamiliaPage('familia');
}

function openChildWithoutAccountProfile(childId, childName) {
  const avatarEl = document.getElementById('fp-avatar');
  const nameEl = document.getElementById('fp-name');
  const roleEl = document.getElementById('fp-role');
  const statsEl = document.getElementById('fp-stats');
  const actionsEl = document.getElementById('fp-actions');

  if (!avatarEl) return;

  avatarEl.textContent = '👶';
  nameEl.textContent = childName;
  roleEl.textContent = 'Filho(a) conectado(a) - Sem conta';
  statsEl.innerHTML = '<span style="color:var(--text-muted);font-size:.82rem">Sem dados</span>';

  actionsEl.innerHTML = `
    <button class="btn-primary" style="width:100%" onclick="closeModal('modal-familia-profile');openParentalTaskModal('${childId}','${escHtml(childName)}')">
      📋 Criar Tarefa
    </button>
    <button class="btn-ghost" style="width:100%;color:#f87171;margin-top:.25rem" onclick="closeModal('modal-familia-profile');removeChildWithoutAccount('${childId}')">
      🗑️ Remover
    </button>`;

  openModal('modal-familia-profile');
}
