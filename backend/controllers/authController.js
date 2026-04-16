'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { findUser, createUser } = require('../dataService');

const SALT_ROUNDS = 12;   // custo do bcrypt (mais alto = mais seguro, porém mais lento)
const TOKEN_EXPIRY = '7d'; // token válido por 7 dias

// ─── Registro ─────────────────────────────────────────────────────────────────
/**
 * POST /api/register
 * Body: { email, password }
 */
async function register(req, res) {
  try {
    const { email, password } = req.body;

    // Validação básica dos campos
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    // Verifica se o e-mail já está cadastrado
    const existingUser = findUser(email);
    if (existingUser) {
      return res.status(409).json({ error: 'E-mail já cadastrado.' });
    }

    // Criptografa a senha
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Cria o usuário no data.json
    const user = createUser({ email, password: hashedPassword });

    // Gera o token JWT
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: TOKEN_EXPIRY,
    });

    return res.status(201).json({
      message: 'Conta criada com sucesso!',
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    console.error('[register]', err.message);
    return res.status(500).json({ error: 'Erro interno ao criar conta.' });
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────
/**
 * POST /api/login
 * Body: { email, password }
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Validação básica
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    // Busca o usuário no data.json
    const user = findUser(email);
    if (!user) {
      // Mensagem genérica para não revelar se o e-mail existe
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    // Compara a senha enviada com o hash salvo
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    // Gera o token JWT
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: TOKEN_EXPIRY,
    });

    return res.status(200).json({
      message: 'Login realizado com sucesso!',
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    console.error('[login]', err.message);
    return res.status(500).json({ error: 'Erro interno ao fazer login.' });
  }
}

module.exports = { register, login };
