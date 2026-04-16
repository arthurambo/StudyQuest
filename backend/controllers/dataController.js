'use strict';

const { findUserById, saveProgress, getProgress } = require('../dataService');

// ─── Carregar dados ────────────────────────────────────────────────────────────
/**
 * GET /api/data
 * Header: Authorization: Bearer <token>
 *
 * Retorna o state completo do app para o usuário autenticado.
 */
function getData(req, res) {
  try {
    // Garante que o usuário existe no data.json
    const user = findUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const data = getProgress(req.userId);
    return res.status(200).json({ data });
  } catch (err) {
    console.error('[getData]', err.message);
    return res.status(500).json({ error: 'Erro ao carregar dados.' });
  }
}

// ─── Salvar dados ─────────────────────────────────────────────────────────────
/**
 * POST /api/data
 * Header: Authorization: Bearer <token>
 * Body:   { data: { ...state completo do frontend } }
 *
 * Substitui o progresso do usuário pelo novo state enviado.
 */
function saveData(req, res) {
  try {
    const { data } = req.body;

    if (data === undefined) {
      return res.status(400).json({ error: 'Campo "data" ausente no body.' });
    }

    // Garante que o usuário existe antes de salvar
    const user = findUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    saveProgress(req.userId, data);
    return res.status(200).json({ message: 'Dados salvos com sucesso!' });
  } catch (err) {
    console.error('[saveData]', err.message);
    return res.status(500).json({ error: 'Erro ao salvar dados.' });
  }
}

module.exports = { getData, saveData };
