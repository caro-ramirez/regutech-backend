const pool = require("../config/db");
const { obtenerSenales, calcularScore, calcularEstadoConSupresion } = require("./riesgoHumanoController");
const { escalarVencidosPorEntidad } = require("./hallazgoController");

async function obtenerIndicadores(req, res) {
  const idEntidad = req.usuario.idEntidad;

  try {
    // Dispara el mismo escalamiento/retroalimentación que el Panel de Hallazgos,
    // para que el Dashboard no dependa de qué pantalla se visitó primero.
    await escalarVencidosPorEntidad(idEntidad);

    const certRows = await pool.query(
      `SELECT
         CASE WHEN c.fecha_vencimiento < CURRENT_DATE THEN 'Vencido' ELSE c.estado END as estado_real
       FROM certificado c
       JOIN auditoria a ON a.id_auditoria = c.id_auditoria
       WHERE a.id_entidad = $1`,
      [idEntidad]
    );
    const certificadosVigentes = certRows.rows.filter((r) => r.estado_real === "Vigente").length;
    const certificadosVencidos = certRows.rows.filter((r) => r.estado_real === "Vencido").length;

    const hallazgosRows = await pool.query(
      `SELECT h.id_hallazgo, h.estado, h.severidad, h.fecha_limite_sla, i.descripcion as item_descripcion, n.nombre as norma_nombre
       FROM hallazgo h
       JOIN respuesta_checklist r ON r.id_respuesta = h.id_respuesta
       JOIN item_checklist_maestro i ON i.id_item = r.id_item
       JOIN auditoria a ON a.id_auditoria = r.id_auditoria
       JOIN norma_compliance n ON n.id_norma = a.id_norma
       WHERE a.id_entidad = $1`,
      [idEntidad]
    );
    const hallazgosAbiertos = hallazgosRows.rows.filter((h) => ["Abierto", "Asignado", "Escalado", "Pendiente de Retest", "Reabierto"].includes(h.estado));
    const hallazgosEscalados = hallazgosRows.rows.filter((h) => h.estado === "Escalado");

    const hallazgosPorSeveridad = ["Alta", "Media", "Baja"].map((severidad) => ({
      severidad,
      cantidad: hallazgosAbiertos.filter((h) => h.severidad === severidad).length,
    }));

    const cumplimientoPorNorma = await pool.query(
      `SELECT n.nombre, a.porcentaje_cumplimiento
       FROM auditoria a
       JOIN norma_compliance n ON n.id_norma = a.id_norma
       WHERE a.id_entidad = $1 AND a.estado = 'Completada'
       ORDER BY n.nombre`,
      [idEntidad]
    );

    const colaboradores = await pool.query(
      `SELECT id_usuario, nombre, area FROM usuario WHERE rol IN ('Colaborador', 'ResponsableCumplimiento') AND id_entidad = $1`,
      [idEntidad]
    );
    const riesgoPorColaborador = [];
    const scoresPorArea = {};
    for (const c of colaboradores.rows) {
      const senales = await obtenerSenales(c.id_usuario);
      const score = calcularScore(senales);
      const estado = await calcularEstadoConSupresion(c.id_usuario, score);
      riesgoPorColaborador.push({ nombre: c.nombre, area: c.area, score, estado });
      if (c.area) {
        if (!scoresPorArea[c.area]) scoresPorArea[c.area] = [];
        scoresPorArea[c.area].push(score);
      }
    }
    riesgoPorColaborador.sort((a, b) => b.score - a.score);
    const casosPriorizados = riesgoPorColaborador.filter((c) => c.estado === "Priorizado").length;

    const riesgoPorArea = Object.entries(scoresPorArea)
      .map(([area, scores]) => ({ area, scorePromedio: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) }))
      .sort((a, b) => b.scorePromedio - a.scorePromedio);

    // Histórico de score por área, para el gráfico de línea de tiempo
    const historico = await pool.query(
      `SELECT sr.fecha_calculo, u.area, sr.valor_score
       FROM score_riesgo sr
       JOIN usuario u ON u.id_usuario = sr.id_colaborador
       WHERE u.id_entidad = $1 AND u.area IS NOT NULL
       ORDER BY sr.fecha_calculo ASC`,
      [idEntidad]
    );
    const historicoPorFechaYArea = {};
    historico.rows.forEach((h) => {
      const fecha = h.fecha_calculo.toISOString().slice(0, 10);
      if (!historicoPorFechaYArea[fecha]) historicoPorFechaYArea[fecha] = { fecha };
      if (!historicoPorFechaYArea[fecha][h.area]) historicoPorFechaYArea[fecha][h.area] = [];
      historicoPorFechaYArea[fecha][h.area].push(Number(h.valor_score));
    });
    const historicoRiesgoPorArea = Object.values(historicoPorFechaYArea).map((punto) => {
      const resultado = { fecha: punto.fecha };
      Object.keys(punto).forEach((k) => {
        if (k !== "fecha") resultado[k] = Math.round(punto[k].reduce((a, b) => a + b, 0) / punto[k].length);
      });
      return resultado;
    });

    const alertas = [];
    certRows.rows.forEach((c) => {
      if (c.estado_real === "Vencido") alertas.push({ descripcion: "Certificado vencido", categoria: "Certificación" });
    });
    hallazgosEscalados.forEach((h) => {
      alertas.push({ descripcion: `Hallazgo "${h.item_descripcion}" escalado`, categoria: "Auditoría", idHallazgo: h.id_hallazgo });
    });
    riesgoPorColaborador.filter((c) => c.estado === "Priorizado").forEach((c) => {
      alertas.push({ descripcion: `Score de riesgo elevado en ${c.nombre}`, categoria: "Riesgo humano" });
    });

    res.json({
      certificadosVigentes,
      certificadosVencidos,
      hallazgosAbiertos: hallazgosAbiertos.length,
      hallazgosPorSeveridad,
      casosPriorizados,
      cumplimientoPorNorma: cumplimientoPorNorma.rows,
      riesgoPorColaborador,
      riesgoPorArea,
      historicoRiesgoPorArea,
      alertas,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

module.exports = { obtenerIndicadores };
