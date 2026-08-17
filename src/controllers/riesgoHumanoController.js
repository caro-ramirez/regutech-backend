const pool = require("../config/db");

const PALABRAS_RIESGO = [
  "no llegamos",
  "no hay tiempo",
  "no seguimos",
  "no se sigue",
  "no cumplimos",
  "no cumple",
  "presión",
  "sobrecarga",
  "no alcanza",
  "no da el tiempo",
  "saltamos el proceso",
];

function detectarAlertaTextual(comentario) {
  if (!comentario) return { detectada: false, palabra: null };
  const texto = comentario.toLowerCase();
  const encontrada = PALABRAS_RIESGO.find((p) => texto.includes(p));
  return { detectada: Boolean(encontrada), palabra: encontrada || null };
}

function calcularScore({ nota, likert, incidentes, alertaTextual }) {
  const riesgoCapacitacion = nota == null ? 50 : 100 - Number(nota);
  const riesgoAutoreporte = likert == null ? 50 : (5 - Number(likert)) * 20;
  const riesgoIncidentes = Math.min(Number(incidentes) * 15, 100);
  const riesgoTexto = alertaTextual ? 100 : 0;

  const score = Math.round(
    riesgoCapacitacion * 0.3 +
    riesgoAutoreporte * 0.3 +
    riesgoIncidentes * 0.25 +
    riesgoTexto * 0.15
  );
  return Math.max(0, Math.min(100, score));
}

async function obtenerSenales(idColaborador) {
  const cap = await pool.query(
    `SELECT nota FROM registro_capacitacion WHERE id_colaborador = $1 ORDER BY fecha DESC, id_registro DESC LIMIT 1`,
    [idColaborador]
  );
  const auto = await pool.query(
    `SELECT puntaje_likert, comentario FROM autoreporte WHERE id_colaborador = $1 ORDER BY fecha DESC, id_autoreporte DESC LIMIT 1`,
    [idColaborador]
  );
  const inc = await pool.query(
    `SELECT COUNT(*) FROM incidente WHERE id_colaborador = $1 AND fecha >= CURRENT_DATE - INTERVAL '90 days'`,
    [idColaborador]
  );

  const { detectada, palabra } = detectarAlertaTextual(auto.rows[0]?.comentario);

  return {
    nota: cap.rows[0]?.nota != null ? Number(cap.rows[0].nota) : null,
    likert: auto.rows[0]?.puntaje_likert ?? null,
    comentario: auto.rows[0]?.comentario ?? null,
    incidentes: Number(inc.rows[0].count),
    alertaTextual: detectada,
    palabraDetectada: palabra,
  };
}

async function obtenerUltimaAccion(idColaborador) {
  const ultima = await pool.query(
    `SELECT ac.tipo_accion, ac.fecha FROM accion_correctiva ac
     JOIN score_riesgo sr ON sr.id_score = ac.id_score
     WHERE sr.id_colaborador = $1
     ORDER BY ac.fecha DESC, ac.id_accion DESC LIMIT 1`,
    [idColaborador]
  );
  return ultima.rows[0] || null;
}

async function huboSenalNuevaDespues(idColaborador, fecha) {
  const nueva = await pool.query(
    `SELECT 1 FROM (
       SELECT fecha FROM registro_capacitacion WHERE id_colaborador = $1
       UNION ALL
       SELECT fecha FROM autoreporte WHERE id_colaborador = $1
     ) senales WHERE fecha > $2 LIMIT 1`,
    [idColaborador, fecha]
  );
  return nueva.rows.length > 0;
}

async function calcularEstadoConSupresion(idColaborador, score) {
  const estadoBase = score >= 60 ? "Priorizado" : "Sin riesgo";
  const ultimaAccion = await obtenerUltimaAccion(idColaborador);
  if (ultimaAccion && ultimaAccion.tipo_accion === "Revisado sin acción") {
    const nuevaSenal = await huboSenalNuevaDespues(idColaborador, ultimaAccion.fecha);
    if (!nuevaSenal) return "Revisado sin acción";
  }
  return estadoBase;
}

async function listar(req, res) {
  try {
    const colaboradores = await pool.query(
      `SELECT id_usuario, nombre, area FROM usuario WHERE rol IN ('Colaborador', 'ResponsableCumplimiento') AND id_entidad = $1`,
      [req.usuario.idEntidad]
    );

    const resultado = [];
    for (const c of colaboradores.rows) {
      const senales = await obtenerSenales(c.id_usuario);
      const score = calcularScore(senales);
      await obtenerOCrearScoreHoy(c.id_usuario, score);
      const estado = await calcularEstadoConSupresion(c.id_usuario, score);
      resultado.push({
        id_usuario: c.id_usuario,
        nombre: c.nombre,
        area: c.area,
        score,
        alertaTextual: senales.alertaTextual,
        estado,
      });
    }

    resultado.sort((a, b) => b.score - a.score);
    res.json(resultado);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function listarPorArea(req, res) {
  try {
    const colaboradores = await pool.query(
      `SELECT id_usuario, area FROM usuario WHERE rol IN ('Colaborador', 'ResponsableCumplimiento') AND id_entidad = $1 AND area IS NOT NULL`,
      [req.usuario.idEntidad]
    );

    const scoresPorArea = {};
    for (const c of colaboradores.rows) {
      const senales = await obtenerSenales(c.id_usuario);
      const score = calcularScore(senales);
      if (!scoresPorArea[c.area]) scoresPorArea[c.area] = [];
      scoresPorArea[c.area].push(score);
    }

    const resultado = Object.entries(scoresPorArea).map(([area, scores]) => ({
      area,
      scorePromedio: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      cantidadColaboradores: scores.length,
    }));

    resultado.sort((a, b) => b.scorePromedio - a.scorePromedio);
    res.json(resultado);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function detalle(req, res) {
  const { idColaborador } = req.params;
  try {
    const usuario = await pool.query(`SELECT nombre, area FROM usuario WHERE id_usuario = $1`, [idColaborador]);
    if (usuario.rows.length === 0) {
      return res.status(404).json({ error: "Colaborador no encontrado." });
    }

    const senales = await obtenerSenales(idColaborador);
    const score = calcularScore(senales);

    const acciones = await pool.query(
      `SELECT ac.tipo_accion, ac.fecha, ac.resultado, u.nombre as responsable_nombre
       FROM accion_correctiva ac
       JOIN score_riesgo sr ON sr.id_score = ac.id_score
       JOIN usuario u ON u.id_usuario = ac.id_responsable
       WHERE sr.id_colaborador = $1
       ORDER BY ac.fecha DESC, ac.id_accion DESC`,
      [idColaborador]
    );

    const historialScore = await pool.query(
      `SELECT valor_score, fecha_calculo FROM score_riesgo WHERE id_colaborador = $1 ORDER BY fecha_calculo DESC LIMIT 6`,
      [idColaborador]
    );

    const ultimaAccion = await pool.query(
      `SELECT sr.valor_score, ac.fecha
       FROM accion_correctiva ac
       JOIN score_riesgo sr ON sr.id_score = ac.id_score
       WHERE sr.id_colaborador = $1
       ORDER BY ac.fecha DESC, ac.id_accion DESC LIMIT 1`,
      [idColaborador]
    );

    let seguimiento = null;
    if (ultimaAccion.rows.length > 0) {
      const scoreAlMomentoDeLaAccion = Number(ultimaAccion.rows[0].valor_score);
      seguimiento = {
        scoreAlMomentoDeLaAccion,
        scoreActual: score,
        mejoro: score < scoreAlMomentoDeLaAccion,
        sinCambios: score === scoreAlMomentoDeLaAccion,
      };
    }

    res.json({
      nombre: usuario.rows[0].nombre,
      area: usuario.rows[0].area,
      senales,
      score,
      acciones: acciones.rows,
      historialScore: historialScore.rows,
      seguimiento,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function obtenerOCrearScoreHoy(idColaborador, score) {
  const existente = await pool.query(
    `SELECT id_score FROM score_riesgo WHERE id_colaborador = $1 AND fecha_calculo = CURRENT_DATE`,
    [idColaborador]
  );
  if (existente.rows.length > 0) return existente.rows[0].id_score;

  const nuevo = await pool.query(
    `INSERT INTO score_riesgo (id_colaborador, valor_score) VALUES ($1, $2) RETURNING id_score`,
    [idColaborador, score]
  );
  return nuevo.rows[0].id_score;
}

async function registrarAccion(req, res) {
  const { idColaborador } = req.params;
  const { tipoAccion } = req.body;

  if (!tipoAccion) {
    return res.status(400).json({ error: "Seleccioná el tipo de acción correctiva." });
  }

  try {
    const senales = await obtenerSenales(idColaborador);
    const score = calcularScore(senales);
    const idScore = await obtenerOCrearScoreHoy(idColaborador, score);

    await pool.query(
      `INSERT INTO accion_correctiva (id_score, id_responsable, tipo_accion) VALUES ($1, $2, $3)`,
      [idScore, req.usuario.id, tipoAccion]
    );

    res.json({ mensaje: "Acción correctiva registrada." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function revisadoSinAccion(req, res) {
  const { idColaborador } = req.params;
  const { justificacion } = req.body;

  if (!justificacion || !justificacion.trim()) {
    return res.status(400).json({ error: "La justificación es obligatoria." });
  }

  try {
    const senales = await obtenerSenales(idColaborador);
    const score = calcularScore(senales);
    const idScore = await obtenerOCrearScoreHoy(idColaborador, score);

    await pool.query(
      `INSERT INTO accion_correctiva (id_score, id_responsable, tipo_accion, resultado)
       VALUES ($1, $2, 'Revisado sin acción', $3)`,
      [idScore, req.usuario.id, justificacion]
    );

    res.json({ mensaje: "Registrado como revisado sin acción." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

module.exports = {
  listar,
  listarPorArea,
  detalle,
  registrarAccion,
  revisadoSinAccion,
  obtenerSenales,
  calcularScore,
  calcularEstadoConSupresion,
};
