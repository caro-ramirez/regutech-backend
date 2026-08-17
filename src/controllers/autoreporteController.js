const pool = require("../config/db");

async function crear(req, res) {
  const { puntajeLikert, comentario } = req.body;
  const idColaborador = req.usuario.id;

  if (!puntajeLikert) {
    return res.status(400).json({ error: "Seleccioná un puntaje antes de continuar." });
  }

  try {
    await pool.query(
      `INSERT INTO autoreporte (id_colaborador, puntaje_likert, comentario) VALUES ($1, $2, $3)`,
      [idColaborador, puntajeLikert, comentario || null]
    );
    res.json({ mensaje: "Autoreporte registrado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function listarPropios(req, res) {
  const idColaborador = req.usuario.id;
  try {
    const result = await pool.query(
      `SELECT id_autoreporte, fecha, puntaje_likert, comentario FROM autoreporte
       WHERE id_colaborador = $1 ORDER BY fecha DESC`,
      [idColaborador]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

module.exports = { crear, listarPropios };
