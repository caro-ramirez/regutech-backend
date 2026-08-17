const bcrypt = require("bcrypt");
const pool = require("../config/db");

const PASSWORD_TEMPORAL = "Regutech2026!";

async function listarEntidades(req, res) {
  try {
    const result = await pool.query(
      `SELECT e.id_entidad, e.razon_social, e.tipo_entidad, e.fecha_alta,
              (SELECT COUNT(*) FROM usuario u WHERE u.id_entidad = e.id_entidad) as cantidad_usuarios
       FROM entidad_financiera e
       ORDER BY e.fecha_alta DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function crearEntidad(req, res) {
  const { razonSocial, tipoEntidad, adminNombre, adminEmail } = req.body;

  if (!razonSocial || !tipoEntidad || !adminNombre || !adminEmail) {
    return res.status(400).json({ error: "Completá todos los campos antes de guardar." });
  }

  const client = await pool.connect();
  try {
    const existente = await client.query(`SELECT id_usuario FROM usuario WHERE email = $1`, [adminEmail]);
    if (existente.rows.length > 0) {
      return res.status(400).json({ error: "Ya existe un usuario con ese correo." });
    }

    await client.query("BEGIN");

    const entidad = await client.query(
      `INSERT INTO entidad_financiera (razon_social, tipo_entidad) VALUES ($1, $2) RETURNING *`,
      [razonSocial, tipoEntidad]
    );
    const idEntidad = entidad.rows[0].id_entidad;

    const passwordHash = await bcrypt.hash(PASSWORD_TEMPORAL, 10);
    const admin = await client.query(
      `INSERT INTO usuario (id_entidad, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, 'Administrador')
       RETURNING id_usuario, nombre, email, rol`,
      [idEntidad, adminNombre, adminEmail, passwordHash]
    );

    await client.query("COMMIT");
    res.status(201).json({ entidad: entidad.rows[0], administrador: admin.rows[0], passwordTemporal: PASSWORD_TEMPORAL });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  } finally {
    client.release();
  }
}

module.exports = { listarEntidades, crearEntidad };
