const mongoose = require('mongoose');

/**
 * Modelo de usuário do StudyQuest.
 *
 * O campo `data` armazena o state completo do frontend (o mesmo objeto
 * que hoje é salvo no localStorage como "sq_state").
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'E-mail é obrigatório'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Formato de e-mail inválido'],
    },

    password: {
      type: String,
      required: [true, 'Senha é obrigatória'],
      minlength: [6, 'A senha deve ter no mínimo 6 caracteres'],
    },

    // Todo o progresso do app (xp, tarefas, provas, matérias, etc.)
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true, // cria createdAt e updatedAt automaticamente
  }
);

// Nunca retorna o campo password nas queries por padrão
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
