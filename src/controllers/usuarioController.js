const bcrypt = require("bcrypt");
const pool = require("../config/db");

const PASSWORD_TEMPORAL = "Regutech2026!";

async function listar(req, res) {
  const idEntidad = req.usuario.idEntidad;
  try {
    const result = await pool.query(
      `SELECT id_usuario, nombre, email, rol, area, especialidad FROM usuario WHERE id_entidad = $1 ORDER BY nombre`,
      [idEntidad]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function crear(req, res) {
  const { nombre, email, rol, area, especialidad } = req.body;
  const idEntidad = req.usuario.idEntidad;

  if (!nombre || !email || !rol) {
    return res.status(400).json({ error: "Completá nombre, correo y rol antes de guardar." });
  }

  try {
    const existente = await pool.query(`SELECT id_usuario FROM usuario WHERE email = $1`, [email]);
    if (existente.rows.length > 0) {
      return res.status(400).json({ error: "Ya existe un usuario con ese correo." });
    }

    const passwordHash = await bcrypt.hash(PASSWORD_TEMPORAL, 10);

    const nuevo = await pool.query(
      `INSERT INTO usuario (id_entidad, nombre, email, password_hash, rol, area, especialidad)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id_usuario, nombre, email, rol, area, especialidad`,
      [idEntidad, nombre, email, passwordHash, rol, area || null, especialidad || null]
    );

    res.status(201).json({ usuario: nuevo.rows[0], passwordTemporal: PASSWORD_TEMPORAL });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function eliminar(req, res) {
  const { id } = req.params;
  const idEntidad = req.usuario.idEntidad;
  try {
    await pool.query(`DELETE FROM usuario WHERE id_usuario = $1 AND id_entidad = $2`, [id, idEntidad]);
    res.json({ mensaje: "Usuario eliminado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

module.exports = { listar, crear, eliminar };
