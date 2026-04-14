const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getData, saveData } = require('../controllers/dataController');

// Todas as rotas abaixo exigem token válido (authMiddleware aplicado em cada rota)

// GET /api/data → retorna o state completo do usuário logado
router.get('/data', authMiddleware, getData);

// POST /api/data → salva/atualiza o state completo do usuário logado
router.post('/data', authMiddleware, saveData);

module.exports = router;
