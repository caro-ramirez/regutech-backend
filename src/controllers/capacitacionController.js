const pool = require("../config/db");

async function listarPendientes(req, res) {
  const idColaborador = req.usuario.id;
  const idEntidad = req.usuario.idEntidad;
  try {
    const result = await pool.query(
      `SELECT c.id_capacitacion, c.nombre, c.nota_minima,
              (SELECT nota FROM registro_capacitacion r
               WHERE r.id_colaborador = $1 AND r.id_capacitacion = c.id_capacitacion
               ORDER BY r.fecha DESC LIMIT 1) as ultima_nota
       FROM capacitacion c
       WHERE c.id_entidad = $2
       ORDER BY c.nombre`,
      [idColaborador, idEntidad]
    );

    const data = result.rows.map((c) => ({
      ...c,
      estado: c.ultima_nota != null && Number(c.ultima_nota) >= Number(c.nota_minima) ? "Aprobada" : "Pendiente",
    }));

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function listarTodas(req, res) {
  try {
    const result = await pool.query(
      `SELECT id_capacitacion, nombre, nota_minima FROM capacitacion WHERE id_entidad = $1 ORDER BY nombre`,
      [req.usuario.idEntidad]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function crear(req, res) {
  const { nombre, notaMinima } = req.body;
  const idEntidad = req.usuario.idEntidad;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre de la capacitación es obligatorio." });
  }

  try {
    const nueva = await pool.query(
      `INSERT INTO capacitacion (id_entidad, nombre, nota_minima) VALUES ($1, $2, $3) RETURNING *`,
      [idEntidad, nombre, notaMinima || 60]
    );
    res.status(201).json(nueva.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function eliminar(req, res) {
  const { id } = req.params;
  const idEntidad = req.usuario.idEntidad;
  try {
    await pool.query(`DELETE FROM pregunta_capacitacion WHERE id_capacitacion = $1`, [id]);
    await pool.query(`DELETE FROM capacitacion WHERE id_capacitacion = $1 AND id_entidad = $2`, [id, idEntidad]);
    res.json({ mensaje: "Capacitación eliminada." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

// El Administrador ve las preguntas completas (incluida la respuesta correcta) para gestionarlas.
async function listarPreguntasAdmin(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT id_pregunta, texto, opciones, respuesta_correcta FROM pregunta_capacitacion WHERE id_capacitacion = $1 ORDER BY id_pregunta`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

// El Colaborador NUNCA recibe la respuesta correcta, solo el enunciado y las opciones.
async function listarPreguntasColaborador(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT id_pregunta, texto, opciones FROM pregunta_capacitacion WHERE id_capacitacion = $1 ORDER BY id_pregunta`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function crearPregunta(req, res) {
  const { id } = req.params;
  const { texto, opciones, respuestaCorrecta } = req.body;

  if (!texto || !Array.isArray(opciones) || opciones.length < 2 || !respuestaCorrecta) {
    return res.status(400).json({ error: "Completá el enunciado, al menos 2 opciones y la respuesta correcta." });
  }
  if (!opciones.includes(respuestaCorrecta)) {
    return res.status(400).json({ error: "La respuesta correcta debe ser una de las opciones cargadas." });
  }

  try {
    await pool.query(
      `INSERT INTO pregunta_capacitacion (id_capacitacion, texto, opciones, respuesta_correcta) VALUES ($1, $2, $3, $4)`,
      [id, texto, JSON.stringify(opciones), respuestaCorrecta]
    );
    res.status(201).json({ mensaje: "Pregunta agregada." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function eliminarPregunta(req, res) {
  const { idPregunta } = req.params;
  try {
    await pool.query(`DELETE FROM pregunta_capacitacion WHERE id_pregunta = $1`, [idPregunta]);
    res.json({ mensaje: "Pregunta eliminada." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

// La nota se calcula del lado del servidor, comparando contra respuesta_correcta,
// para no exponerla nunca al Colaborador antes de que envíe sus respuestas.
async function registrarResultado(req, res) {
  const { id } = req.params;
  const { respuestas } = req.body;
  const idColaborador = req.usuario.id;

  if (!respuestas || !Array.isArray(respuestas) || respuestas.length === 0) {
    return res.status(400).json({ error: "Faltan respuestas de la evaluación." });
  }

  try {
    const cap = await pool.query(`SELECT nota_minima FROM capacitacion WHERE id_capacitacion = $1`, [id]);
    if (cap.rows.length === 0) {
      return res.status(404).json({ error: "Capacitación no encontrada." });
    }

    const preguntas = await pool.query(
      `SELECT id_pregunta, respuesta_correcta FROM pregunta_capacitacion WHERE id_capacitacion = $1`,
      [id]
    );
    if (preguntas.rows.length === 0) {
      return res.status(400).json({ error: "Esta capacitación todavía no tiene preguntas cargadas." });
    }

    const correctasPorId = Object.fromEntries(preguntas.rows.map((p) => [p.id_pregunta, p.respuesta_correcta]));
    const correctas = respuestas.filter((r) => correctasPorId[r.idPregunta] === r.respuestaElegida).length;
    const nota = Math.round((correctas / preguntas.rows.length) * 100);

    await pool.query(
      `INSERT INTO registro_capacitacion (id_colaborador, id_capacitacion, nota) VALUES ($1, $2, $3)`,
      [idColaborador, id, nota]
    );

    const aprobado = nota >= Number(cap.rows[0].nota_minima);
    res.json({ aprobado, nota, notaMinima: cap.rows[0].nota_minima });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

module.exports = {
  listarPendientes,
  listarTodas,
  crear,
  eliminar,
  listarPreguntasAdmin,
  listarPreguntasColaborador,
  crearPregunta,
  eliminarPregunta,
  registrarResultado,
};
