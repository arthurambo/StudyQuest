/* =============================================
   STUDYQUEST — SCRIPT.JS
   Sistema de gamificação completo
   ============================================= */

'use strict';

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
      'sb_publishable_e2WmFQsUAZKsA-BmdOMshw_a8m-lQCG'
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

// Missões diárias
const DAILY_MISSIONS_DEF = [
  { id: 'dm_3tasks', name: 'Completar 3 tarefas', icon: '✅', goal: 3, reward: 30, key: 'tasksToday' },
  { id: 'dm_2subjects', name: 'Estudar 2 matérias diferentes', icon: '📚', goal: 2, reward: 25, key: 'subjectsToday' },
  { id: 'dm_50xp', name: 'Ganhar 50 XP', icon: '⚡', goal: 50, reward: 20, key: 'xpToday' },
  { id: 'dm_1exam', name: 'Registrar 1 prova', icon: '📝', goal: 1, reward: 35, key: 'examsToday' },
  { id: 'dm_pomodoro', name: 'Completar 1 sessão Pomodoro', icon: '⏱️', goal: 1, reward: 20, key: 'pomodorosToday' },
  { id: 'dm_2study',   name: 'Estudar 2 conteúdos',          icon: '📘', goal: 2, reward: 25, key: 'studiedToday' },
];

const WEEKLY_MISSIONS_DEF = [
  { id: 'wm_10tasks',  name: 'Completar 10 tarefas esta semana', icon: '🔥', goal: 10, reward: 100, key: 'tasksThisWeek' },
  { id: 'wm_5days',   name: 'Estudar 5 dias seguidos',          icon: '📅', goal: 5,  reward: 80,  key: 'daysThisWeek' },
  { id: 'wm_3exams',  name: 'Registrar 3 provas',               icon: '📝', goal: 3,  reward: 90,  key: 'examsThisWeek' },
  { id: 'wm_5study',  name: 'Estudar 5 conteúdos esta semana',  icon: '📘', goal: 5,  reward: 75,  key: 'studiedThisWeek' },
];

// ============================================================
// ESTADO GLOBAL
// ============================================================

let state = {
  setup: false,
  name: '',
  avatar: '🧙',
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
  settings: {
    schoolAverage:       7,       // média escolar padrão
    notificationsEnabled: true,   // notificações visuais
    soundsEnabled:        true,   // sons de XP/level
    confirmDeletes:       true,   // pedir confirmação ao excluir
    theme:               'dark',  // 'dark' | 'light'
    focusMode:           false,   // modo foco persistido
  },
};

let pomodoroTimer = null;
let pomodoroSeconds = POMODORO_FOCUS;
let pomodoroRunning = false;
let pomodoroIsBreak = false;
let pomodoroAngle = 0;
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
  try {
    const { data, error } = await sb
      .from('users')
      .select('*')
      .eq('id', getEffectiveUserId())
      .single();

    if (error) {
      // PGRST116 = nenhum registro ainda (primeiro acesso) — completamente normal
      if (error.code !== 'PGRST116')
        console.warn('[Supabase] Erro ao carregar:', error.message);
      return null;
    }

    // `data.data` é a coluna JSONB com o state completo
    // Fallback para o próprio row caso a coluna `data` não exista ainda
    const savedState = (data.data && typeof data.data === 'object') ? data.data : data;
    console.log('[Supabase] State carregado — XP:', savedState.xp, '| Nível:', savedState.level, '| Nome:', savedState.name);
    return savedState;
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
  try {
    const { error } = await sb
      .from('users')
      .upsert({
        id:    getEffectiveUserId(),
        name:  data.name  || '',
        xp:    data.xp    || 0,
        level: data.level || 1,
        coins: data.coins || 0,
        data:  data,          // state completo como JSONB
      });
    if (error) console.warn('[Supabase] Erro ao salvar:', error.message);
    else       console.log('[Supabase] State salvo — XP:', data.xp, '| Nível:', data.level, '| Nome:', data.name);
  } catch (e) {
    console.warn('[Supabase] Exceção ao salvar:', e);
  }
}

/** Debounce: sincroniza state completo com Supabase 3s após qualquer mudança. */
let _supabaseSyncTimer = null;
function scheduleSyncToSupabase() {
  clearTimeout(_supabaseSyncTimer);
  _supabaseSyncTimer = setTimeout(() => saveUserData(state), 3000);
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

window.addEventListener('DOMContentLoaded', async () => {
  // Always init UI components first
  initSetup();
  initNavigation();
  initModals();
  initPomodoro();
  initCalendar();
  initTheme();
  initExportImport();
  initEditDelete();
  initEditProfile();
  initAuth();          // telas de login/cadastro (inclui botões Google)
  initOfflineStatus(); // indicador online/offline + listeners de rede

  // ── Supabase Google Auth: verifica sessão ativa ────────
  // Cobre dois casos:
  //   A) Retorno do redirect OAuth (URL tem ?code=...)
  //   B) Sessão já existente (usuário recarregou a página)
  if (sb) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session && session.user) {
        // Sessão Google ativa → lança o app direto, sem precisar logar novamente
        await handleSupabaseSession(session);
        return; // Não prosseguir para o auth gate abaixo
      }
    } catch (e) {
      console.warn('[Google Auth] Falha ao verificar sessão:', e.message);
    }

    // Monitora mudanças futuras de estado (sign-in/sign-out/token refresh)
    sb.auth.onAuthStateChange(async (event, session) => {
      console.log('[Supabase Auth]', event);
      if (event === 'SIGNED_OUT') {
        authUserId = null;
      }
      // SIGNED_IN disparado após callback OAuth já é tratado pelo getSession() acima
    });
  }

  // ── Auth gate (e-mail+senha / modo offline) ────────────
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

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.querySelectorAll('.page').forEach(el => {
    el.classList.toggle('active', el.id === `page-${page}`);
  });
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
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('active');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
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

// Missão automática de revisão quando nota < 7
function triggerRevisionMission(exam) {
  const subj = exam.subjectId ? state.subjects.find(s => s.id === exam.subjectId) : null;
  const subjName = subj ? subj.name : 'o conteúdo';
  const missionId = 'revision_' + exam.id;
  if (!state.dynamicMissions) state.dynamicMissions = [];
  if (!state.dynamicMissions.find(m => m.id === missionId)) {
    state.dynamicMissions.push({
      id: missionId,
      name: 'Revisar ' + subjName + ' (nota ' + exam.grade + ')',
      icon: '📖',
      goal: 2,
      progress: 0,
      reward: 30,
      key: 'tasksToday',
      completed: false,
      type: 'revision',
      subjectId: exam.subjectId,
      createdAt: Date.now(),
    });
    showNotification('📖 Nova missão criada: Revisar ' + subjName + '!', 'info');
  }
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
}

function addCoins(amount) {
  state.coins += amount;
  updateDashboard();
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
}

// Gera missões dinâmicas baseadas no estado atual
function generateDynamicMissions() {
  if (!state.dynamicMissions) state.dynamicMissions = [];
  const today = todayStr();

  // Remove missões dinâmicas antigas (concluídas há mais de 1 dia ou sem tarefas relevantes)
  state.dynamicMissions = state.dynamicMissions.filter(m => {
    if (m.completed) return false; // remove completadas
    if (m.type === 'revision') return true; // mantém revisão até completar
    return true;
  });

  const pendingTasks = state.tasks.filter(t => !t.done);
  const overdueTasks = state.tasks.filter(t => !t.done && t.dueDate && t.dueDate < today);
  const todayTasks = state.tasks.filter(t => !t.done && t.dueDate === today);
  const pendingExams = state.exams.filter(e => e.status === 'pending');

  const existingIds = state.dynamicMissions.map(m => m.id);
  const pendingStudy = (state.studyItems || []).filter(i => !i.done);

  // Missão: tarefas pendentes
  if (pendingTasks.length >= 2 && !existingIds.includes('dm_dyn_2tasks')) {
    state.dynamicMissions.push({ id: 'dm_dyn_2tasks', name: 'Concluir 2 tarefas pendentes', icon: '✅', goal: 2, progress: 0, reward: 25, key: 'tasksToday', completed: false, type: 'auto' });
  }
  // Missão: tarefas atrasadas
  if (overdueTasks.length >= 1 && !existingIds.includes('dm_dyn_overdue')) {
    state.dynamicMissions.push({ id: 'dm_dyn_overdue', name: 'Recuperar 1 tarefa atrasada', icon: '⚠️', goal: 1, progress: 0, reward: 40, key: 'overdueFixed', completed: false, type: 'auto' });
  }
  // Missão: provas pendentes
  if (pendingExams.length >= 1 && !existingIds.includes('dm_dyn_exam')) {
    state.dynamicMissions.push({ id: 'dm_dyn_exam', name: 'Lançar nota de 1 prova', icon: '📝', goal: 1, progress: 0, reward: 35, key: 'examsToday', completed: false, type: 'auto' });
  }
  // Missão: conteúdos para estudar
  if (pendingStudy.length >= 1 && !existingIds.includes('dm_dyn_study')) {
    state.dynamicMissions.push({ id: 'dm_dyn_study', name: 'Estudar 1 conteúdo pendente', icon: '📘', goal: 1, progress: 0, reward: 20, key: 'studiedToday', completed: false, type: 'auto' });
  }
  // Missão: tarefas de hoje
  if (todayTasks.length >= 1 && !existingIds.includes('dm_dyn_today')) {
    state.dynamicMissions.push({ id: 'dm_dyn_today', name: 'Completar tarefa de hoje (' + todayTasks.length + ' pendentes)', icon: '🔔', goal: Math.min(todayTasks.length, 2), progress: 0, reward: 30, key: 'tasksToday', completed: false, type: 'auto' });
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

  // Missões fixas
  html += DAILY_MISSIONS_DEF.map(m => {
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
  container.innerHTML = WEEKLY_MISSIONS_DEF.map(m => {
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
  // Show daily + first dynamic mission
  let missions = [];
  DAILY_MISSIONS_DEF.slice(0, 2).forEach(m => {
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

function renderShop() {
  const container = document.getElementById('shop-list');
  document.getElementById('shop-coins').textContent = state.coins;

  container.innerHTML = SHOP_ITEMS.map(item => {
    const canBuy = state.coins >= item.cost;
    return `
    <div class="shop-item">
      <span class="shop-icon">${item.icon}</span>
      <div class="shop-name">${item.name}</div>
      <div class="shop-desc">${item.desc}</div>
      <button class="shop-buy-btn" onclick="buyItem('${item.id}')" ${!canBuy ? 'disabled' : ''}>
        💰 ${item.cost} moedas
      </button>
    </div>`;
  }).join('');
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

function initPomodoro() {
  document.getElementById('pomo-start').addEventListener('click', togglePomodoro);
  document.getElementById('pomo-reset').addEventListener('click', resetPomodoro);
}

function togglePomodoro() {
  if (pomodoroRunning) {
    clearInterval(pomodoroTimer);
    pomodoroRunning = false;
    document.getElementById('pomo-start').textContent = '▶ Iniciar';
    document.getElementById('pomodoro-circle').classList.remove('active');
  } else {
    pomodoroRunning = true;
    document.getElementById('pomo-start').textContent = '⏸ Pausar';
    document.getElementById('pomodoro-circle').classList.add('active');
    pomodoroTimer = setInterval(tickPomodoro, 1000);
  }
}

function tickPomodoro() {
  pomodoroSeconds--;
  updatePomodoroDisplay();

  if (pomodoroSeconds <= 0) {
    clearInterval(pomodoroTimer);
    pomodoroRunning = false;
    document.getElementById('pomo-start').textContent = '▶ Iniciar';
    document.getElementById('pomodoro-circle').classList.remove('active');

    if (!pomodoroIsBreak) {
      // Sessão de foco completa
      state.totalPomodoros++;
      addXp(15);
      addCoins(8);
      updateMissionProgress('pomodorosToday', 1);
      markStudyToday();
      showNotification('⏱️ Sessão de foco completa! +15 XP 🎉', 'success');
      playSound('complete');
      checkAchievements();

      // Começar pausa
      pomodoroIsBreak = true;
      pomodoroSeconds = POMODORO_BREAK;
      document.getElementById('pomodoro-mode').textContent = 'PAUSA';
    } else {
      pomodoroIsBreak = false;
      pomodoroSeconds = POMODORO_FOCUS;
      document.getElementById('pomodoro-mode').textContent = 'FOCO';
      showNotification('☕ Pausa terminada! Hora de focar!', 'info');
    }
    saveState();
  }
}

function resetPomodoro() {
  clearInterval(pomodoroTimer);
  pomodoroRunning = false;
  pomodoroIsBreak = false;
  pomodoroSeconds = POMODORO_FOCUS;
  document.getElementById('pomo-start').textContent = '▶ Iniciar';
  document.getElementById('pomodoro-mode').textContent = 'FOCO';
  document.getElementById('pomodoro-circle').classList.remove('active');
  updatePomodoroDisplay();
}

function updatePomodoroDisplay() {
  const mins = Math.floor(pomodoroSeconds / 60).toString().padStart(2, '0');
  const secs = (pomodoroSeconds % 60).toString().padStart(2, '0');
  document.getElementById('pomodoro-time').textContent = `${mins}:${secs}`;

  const total = pomodoroIsBreak ? POMODORO_BREAK : POMODORO_FOCUS;
  const pct = 1 - (pomodoroSeconds / total);
  const deg = Math.round(pct * 360);
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
    const isToday = dateStr === today;
    const studied = state.studyDays && state.studyDays.includes(dateStr);
    const hasXp = state.xpHistory[dateStr] > 0;

    html += `
    <div class="cal-day ${isToday ? 'today' : ''} ${studied ? 'studied' : ''} ${hasXp ? 'has-activity' : ''}"
         onclick="showCalDay('${dateStr}')">
      ${d}
      ${studied ? '<div class="cal-dot"></div>' : ''}
    </div>`;
  }

  document.getElementById('cal-grid').innerHTML = html;
}

function showCalDay(dateStr) {
  const xp = state.xpHistory[dateStr] || 0;
  const studied = state.studyDays && state.studyDays.includes(dateStr);
  const tasks = state.tasks.filter(t => t.done && t.doneAt && new Date(t.doneAt).toISOString().slice(0,10) === dateStr);
  const exams = state.exams.filter(e => e.date === dateStr);

  document.getElementById('cal-day-detail').innerHTML = `
    <h3>📅 ${dateStr}</h3>
    <p>⚡ XP: <strong>${xp}</strong> | 🔥 Estudou: <strong>${studied ? 'Sim ✅' : 'Não'}</strong></p>
    ${tasks.length ? `<p>✅ Tarefas: ${tasks.map(t => t.name).join(', ')}</p>` : ''}
    ${exams.length ? `<p>📝 Provas: ${exams.map(e => `${e.name} (${e.grade})`).join(', ')}</p>` : ''}
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
  _setText('dash-name',  state.name);
  _setText('nav-name',   state.name);
  _setText('nav-avatar', state.avatar);
  _setText('nav-level',  `Nível ${state.level}`);

  // Stats
  _setText('stat-xp',     state.xp);
  _setText('stat-coins',  state.coins);
  _setText('stat-streak', `${state.streak} ${state.streak === 1 ? 'dia' : 'dias'}`);
  _setText('stat-level',  state.level);

  // Top bar mobile
  _setText('top-streak', state.streak);
  _setText('top-coins',  state.coins);

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
  // Hide app and setup
  const app   = document.getElementById('app');
  const setup = document.getElementById('setup-screen');
  if (app)   { app.classList.remove('active');   app.style.display   = 'none'; }
  if (setup) { setup.classList.remove('active'); setup.style.display = 'none'; }

  const authScreen = document.getElementById('auth-screen');
  authScreen.classList.add('active');
  authScreen.style.display = '';

  // Pre-fill email da última sessão (se disponível)
  const user = getAuthUser();
  if (user && user.email && user.id) {
    const loginEmail = document.getElementById('login-email');
    if (loginEmail) loginEmail.value = user.email;
  }
  showAuthPanel('login');
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

  // Validações locais — não chega no servidor se inválido
  if (!email)               return showAuthError('login-error', '⚠️ Digite seu e-mail.');
  if (!email.includes('@')) return showAuthError('login-error', '⚠️ E-mail inválido.');
  if (!password)            return showAuthError('login-error', '⚠️ Digite sua senha.');

  // Bloqueia novas chamadas e desabilita o botão visualmente
  _loginInProgress = true;
  const btn = document.getElementById('login-btn');
  btn.disabled    = true;
  btn.textContent = 'Entrando...';

  console.log('[Login] Iniciado para:', email);

  // Controller externo: permite que o botão "Usar modo offline" cancele o fetch
  const loginAbortCtrl = new AbortController();

  // Após 12s sem resposta, mostra opção de entrar no modo offline
  const offlineOfferTimer = setTimeout(() => {
    _showOfflineModeOffer(loginAbortCtrl);
  }, 12000);

  try {
    const res = await apiFetch('/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    }, { signal: loginAbortCtrl.signal });

    // Garante resposta JSON (servidor pode retornar HTML se rota errada)
    let json;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      json = await res.json();
    } else {
      const text = await res.text();
      console.error('[Login] Resposta não-JSON:', text.slice(0, 200));
      throw new Error('Servidor retornou resposta inesperada. Verifique se o backend está rodando.');
    }

    if (!res.ok) {
      console.warn('[Login] Erro ❌', res.status, ':', json.error);
      showAuthError('login-error', '❌ ' + (json.error || 'E-mail ou senha incorretos.'));
      return;
    }

    // ── Sucesso ──────────────────────────────────────────────
    console.log('[Auth] Login online bem-sucedido:', json.user?.email);
    setToken(json.token);
    setAuthUser({ email: json.user.email, id: json.user.id, createdAt: Date.now() });
    setAuthMode('online');
    await launchApp();

  } catch (err) {
    if (err.name === 'AbortError') {
      // Cancelado manualmente pelo usuário via botão offline → modo já ativado
      if (isOfflineMode()) {
        return; // launchApp() já foi chamado por activateOfflineMode
      }
      // Cancelado pelo timeout interno de 60s (sem ação do usuário)
      showAuthError('login-error', '⚠️ Servidor não respondeu. Tente novamente ou use o modo offline abaixo.');
    } else {
      console.error('[Login] ❌ Erro de conexão:', err.message);
      showAuthError('login-error', '⚠️ Não foi possível conectar. Verifique se o backend está rodando.');
    }

  } finally {
    clearTimeout(offlineOfferTimer);
    _removeOfflineModeOffer();
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

  // Validações locais — não chega no servidor se inválido
  if (!email)               return showAuthError('reg-error', '⚠️ Digite seu e-mail.');
  if (!email.includes('@')) return showAuthError('reg-error', '⚠️ E-mail inválido.');
  if (!password)            return showAuthError('reg-error', '⚠️ Crie uma senha.');
  if (password.length < 6)  return showAuthError('reg-error', '⚠️ Senha deve ter ao menos 6 caracteres.');
  if (password !== confirm)  return showAuthError('reg-error', '❌ As senhas não coincidem.');

  _registerInProgress = true;
  const btn = document.getElementById('register-btn');
  btn.disabled    = true;
  btn.textContent = 'Criando conta...';

  console.log('[Register] Tentando criar conta para:', email);

  try {
    const res  = await apiFetch('/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });

    let json;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      json = await res.json();
    } else {
      const text = await res.text();
      console.error('[Register] Resposta não-JSON:', text.slice(0, 200));
      throw new Error('Servidor retornou resposta inesperada. Verifique se o backend está rodando corretamente.');
    }

    if (!res.ok) {
      console.warn('[Register] Falha HTTP', res.status, ':', json.error);
      showAuthError('reg-error', '❌ ' + (json.error || 'Erro ao criar conta.'));
      return;
    }

    // ── Sucesso ──────────────────────────────────────────────
    console.log('[Register] ✅ Conta criada para:', email);
    showNotification('✅ Conta criada com sucesso! Faça login para continuar.', 'success');
    const loginEmail = document.getElementById('login-email');
    if (loginEmail) loginEmail.value = email;
    showAuthPanel('login');

  } catch (err) {
    console.error('[Register] ❌ Erro de conexão:', err.message);
    showAuthError('reg-error', '⚠️ Não foi possível conectar ao servidor. Verifique se o backend está rodando e tente novamente.');

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

  // 1. localStorage como base (fallback garantido para todos os modos)
  console.log('[Auth] Carregando dados locais...');
  loadState();
  console.log('[App] State local carregado. Setup:', state.setup, '| Modo:', getCurrentMode());

  // 2. Decidir entre modo online e offline
  if (isOfflineMode()) {
    // ── OFFLINE: usa apenas localStorage ─────────────────
    console.log('[Auth] Modo offline ativado. Carregando dados locais.');
    showNotification('🔴 Modo offline ativo. Dados locais carregados.', 'info');

  } else if (getToken()) {
    // ── ONLINE: tenta sincronizar com o backend ───────────
    await loadUserDataFromAPI();

    // Se 401 dentro de loadUserDataFromAPI, o token foi limpo → volta p/ login
    if (!getToken()) {
      _showAppLoading(false);
      showAuthScreen();
      showNotification('Sessão expirada. Faça login novamente.', 'warning');
      return;
    }

    // Garante modo online após carga bem-sucedida
    setAuthMode('online');
    console.log('[Auth] Modo online ativo.');
  }

  // 3. Supabase: aplica state completo da nuvem se o XP da nuvem for ≥ local
  //    Feito APÓS o backend para ter a palavra final sobre qualquer xp:0 do backend
  if (navigator.onLine) {
    const cloudState = await loadUserData(); // null = sem dados na nuvem (primeiro acesso)
    if (cloudState) {
      const cloudXP = cloudState.xp || 0;
      const localXP = state.xp      || 0;
      if (cloudXP >= localXP) {
        // Nuvem tem progresso igual ou maior → usa state da nuvem, preserva userId local
        state = { ...state, ...cloudState };
        saveLocalData(state); // espelha no localStorage para acesso offline
        console.log('[Supabase] State da nuvem aplicado — XP:', state.xp, '| Nível:', state.level, '| Nome:', state.name);
      } else {
        // Local tem mais XP (progresso feito offline) → mantém local e sobe para nuvem
        console.log('[Supabase] State local mais recente — mantendo. Local XP:', localXP, '| Nuvem XP:', cloudXP);
        saveUserData(state); // sincroniza o progresso local com a nuvem agora
      }
    } else {
      console.log('[Supabase] Sem dados na nuvem ainda — usando state local.');
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
    updateAllUI();
    navigateTo('dashboard');
    console.log('[App] App iniciado para:', state.name, '| XP:', state.xp, '| Nível:', state.level);
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
      // Sobrepõe o state local com os dados do backend
      state = { ...state, ...json.data };
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
 * Processa uma sessão Supabase ativa (login novo ou restauração ao recarregar).
 * Define authUserId, armazena user info e chama launchApp().
 */
async function handleSupabaseSession(session) {
  if (!session || !session.user) return;
  const user = session.user;

  authUserId = user.id;
  console.log('[Google Auth] Sessão ativa:', user.email, '| ID:', user.id);

  // Guarda e-mail + ID para pré-preencher tela de login em sessões futuras
  setAuthUser({ email: user.email, id: user.id, createdAt: Date.now(), provider: 'google' });
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
  if (cfgAvatar) cfgAvatar.textContent = state.avatar || '🧙';
  if (cfgName)   cfgName.textContent   = state.name   || 'Herói';

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
  // Pre-fill current values
  document.getElementById('profile-name-input').value = state.name || '';

  // Mark current avatar
  const grid = document.getElementById('profile-avatar-grid');
  grid.querySelectorAll('.avatar-opt').forEach(el => {
    el.classList.toggle('selected', el.dataset.av === state.avatar);
  });

  // Update preview
  updateProfilePreview();
  openModal('modal-edit-profile');
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

  if (!name) return showNotification('Digite seu nome de herói!', 'warning');

  const nameChanged   = name   !== state.name;
  const avatarChanged = avatar !== state.avatar;

  state.name   = name;
  state.avatar = avatar;
  saveState();

  // Update all UI elements immediately
  document.getElementById('nav-name').textContent   = name;
  document.getElementById('nav-avatar').textContent = avatar;
  document.getElementById('dash-name').textContent  = name;

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
