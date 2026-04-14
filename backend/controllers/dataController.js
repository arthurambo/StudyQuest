const User = require('../models/User');

// ─── Carregar dados ────────────────────────────────────────────────────────────
/**
 * GET /api/data
 * Header: Authorization: Bearer <token>
 *
 * Retorna o campo `data` do usuário autenticado (o state completo do app).
 */
async function getData(req, res) {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    return res.status(200).json({ data: user.data });
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
 * Substitui o campo `data` do usuário pelo novo state enviado.
 */
async function saveData(req, res) {
  try {
    const { data } = req.body;

    if (data === undefined) {
      return res.status(400).json({ error: 'Campo "data" ausente no body.' });
    }

    // Usa findByIdAndUpdate para evitar sobrescrever campos como email/password
    const user = await User.findByIdAndUpdate(
      req.userId,
      { data },
      { new: true, runValidators: false }
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    return res.status(200).json({ message: 'Dados salvos com sucesso!' });
  } catch (err) {
    console.error('[saveData]', err.message);
    return res.status(500).json({ error: 'Erro ao salvar dados.' });
  }
}

module.exports = { getData, saveData };
