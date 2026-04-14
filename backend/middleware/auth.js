const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticação JWT.
 *
 * Espera o header:  Authorization: Bearer <token>
 *
 * Se o token for válido, injeta `req.userId` com o ID do usuário
 * e passa para o próximo handler. Caso contrário, retorna 401.
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  // Verifica se o header existe e segue o formato "Bearer <token>"
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id; // disponível em todos os controllers protegidos
    next();
  } catch (err) {
    // Token expirado ou inválido
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

module.exports = authMiddleware;
