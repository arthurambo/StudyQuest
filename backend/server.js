require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors    = require('cors');
const path    = require('path');

const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Aceita qualquer origin: localhost, file://, Render, etc.
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

// ─── Health-check (ANTES dos demais routers) ──────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'StudyQuest API rodando!' });
});

// ─── Rotas de autenticação e dados ────────────────────────────────────────────
app.use('/api', authRoutes); // POST /api/register  |  POST /api/login
app.use('/api', dataRoutes); // GET  /api/data       |  POST /api/data

// ─── Qualquer outra rota /api não encontrada ──────────────────────────────────
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// ─── Servir frontend como arquivos estáticos ──────────────────────────────────
// Permite acessar o app em http://localhost:3001 sem problemas de CORS
// Serve apenas os arquivos raiz (index.html, style.css, script.js)
const frontendPath = path.join(__dirname, '..');
app.use(express.static(frontendPath, {
  // Não expõe a pasta backend como estática
  index: 'index.html',
}));

// Fallback SPA: qualquer rota não-API → index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ─── Conexão com MongoDB ──────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI;
const PORT      = process.env.PORT || 3001;

if (!MONGO_URI) {
  console.error('❌  MONGO_URI não definida no .env');
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅  MongoDB conectado');
    app.listen(PORT, () => {
      console.log(`🚀  Servidor rodando em http://localhost:${PORT}`);
      console.log(`🌐  Abra o app em:  http://localhost:${PORT}`);
      console.log(`📡  API em:         http://localhost:${PORT}/api`);
    });
  })
  .catch((err) => {
    console.error('❌  Erro ao conectar no MongoDB:', err.message);
    process.exit(1);
  });
