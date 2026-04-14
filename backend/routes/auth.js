const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');

// POST /api/register → cria uma nova conta
router.post('/register', register);

// POST /api/login → autentica e retorna token JWT
router.post('/login', login);

module.exports = router;
