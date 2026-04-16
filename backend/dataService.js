'use strict';

/**
 * dataService.js — Mini banco de dados baseado em arquivo JSON.
 *
 * Substitui o MongoDB para desenvolvimento local.
 * Todas as leituras e escritas usam fs síncrono para evitar
 * condições de corrida entre requisições simultâneas.
 *
 * Arquivo de dados : backend/data.json
 * Backup automático: backend/data.backup.json (criado antes de cada escrita)
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── Caminhos ──────────────────────────────────────────────────────────────────
const DATA_FILE   = path.join(__dirname, 'data.json');
const BACKUP_FILE = path.join(__dirname, 'data.backup.json');

// ── Estrutura inicial do banco ────────────────────────────────────────────────
const EMPTY_DB = { users: [], progress: [] };

// ── ID único (crypto nativo, sem dependências externas) ───────────────────────
function generateId() {
  // randomUUID disponível no Node ≥ 14.17. Fallback para hex bytes em versões antigas.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// readData
// Lê e parseia o data.json. Se o arquivo não existir, cria com estrutura vazia.
// ─────────────────────────────────────────────────────────────────────────────
function readData() {
  console.log('[DataService] Lendo dados do arquivo...');
  try {
    if (!fs.existsSync(DATA_FILE)) {
      console.log('[DataService] data.json não encontrado — criando arquivo inicial.');
      writeData(EMPTY_DB);
      return { ...EMPTY_DB, users: [], progress: [] };
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[DataService] Erro ao ler data.json:', err.message);
    // Retorna estrutura vazia para não derrubar o servidor
    return { ...EMPTY_DB, users: [], progress: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// writeData
// Cria backup do arquivo atual e depois sobrescreve com os novos dados.
// ─────────────────────────────────────────────────────────────────────────────
function writeData(data) {
  console.log('[DataService] Salvando dados no arquivo...');
  try {
    // Backup automático antes de sobrescrever
    if (fs.existsSync(DATA_FILE)) {
      fs.copyFileSync(DATA_FILE, BACKUP_FILE);
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DataService] Erro ao salvar data.json:', err.message);
    throw err; // propaga para o controller responder com 500
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// findUser — busca por e-mail (case-insensitive)
// ─────────────────────────────────────────────────────────────────────────────
function findUser(email) {
  const db = readData();
  return db.users.find(u => u.email === email.toLowerCase().trim()) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// findUserById — busca pelo id gerado no registro
// ─────────────────────────────────────────────────────────────────────────────
function findUserById(id) {
  const db = readData();
  return db.users.find(u => u.id === id) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// createUser — adiciona usuário ao array users e salva
// O campo `password` deve chegar já hasheado (responsabilidade do controller).
// ─────────────────────────────────────────────────────────────────────────────
function createUser({ email, password }) {
  const db  = readData();
  const now = new Date().toISOString();

  const user = {
    id:        generateId(),
    email:     email.toLowerCase().trim(),
    password,                              // hash bcrypt
    createdAt: now,
    updatedAt: now,
  };

  db.users.push(user);
  writeData(db);

  console.log('[DataService] Usuário criado:', user.email, '| id:', user.id);
  return user;
}

// ─────────────────────────────────────────────────────────────────────────────
// saveProgress — salva/atualiza o state do app para um userId
// ─────────────────────────────────────────────────────────────────────────────
function saveProgress(userId, data) {
  const db  = readData();
  const idx = db.progress.findIndex(p => p.userId === userId);

  const entry = {
    userId,
    data,
    updatedAt: new Date().toISOString(),
  };

  if (idx >= 0) {
    db.progress[idx] = entry; // atualiza entrada existente
  } else {
    db.progress.push(entry);  // cria nova entrada
  }

  writeData(db);
  console.log('[DataService] Progresso salvo para userId:', userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// getProgress — retorna o state do app para um userId (ou {} se não existir)
// ─────────────────────────────────────────────────────────────────────────────
function getProgress(userId) {
  const db    = readData();
  const entry = db.progress.find(p => p.userId === userId);
  return entry ? entry.data : {};
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  readData,
  writeData,
  findUser,
  findUserById,
  createUser,
  saveProgress,
  getProgress,
};
