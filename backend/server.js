'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Aceita qualquer origin: localhost, file://, etc.
const corsOptions = {
  origin: function (origin, callback) {
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // responde preflight em todas as rotas

// ─── Body parser ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// ─── Log de requisições (debug) ───────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Health-check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'StudyQuest API rodando! (modo arquivo local)' });
});

// ─── Rotas de autenticação e dados ────────────────────────────────────────────
app.use('/api', authRoutes); // POST /api/register  |  POST /api/login
app.use('/api', dataRoutes); // GET  /api/data       |  POST /api/data

// ─── Qualquer outra rota /api não encontrada ──────────────────────────────────
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// ─── Servir frontend como arquivos estáticos ──────────────────────────────────
const frontendPath = path.join(__dirname, '..');
app.use(express.static(frontendPath, { index: 'index.html' }));

// Fallback SPA: qualquer rota não-API → index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ─── Inicialização do servidor ────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

if (!process.env.JWT_SECRET) {
  console.error('❌  JWT_SECRET não definida no .env');
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`🚀  Servidor rodando em http://localhost:${PORT}`);
  console.log(`🌐  Abra o app em:  http://localhost:${PORT}`);
  console.log(`📡  API em:         http://localhost:${PORT}/api`);
  console.log(`💾  Banco de dados: ${require('path').join(__dirname, 'data.json')}`);
});
