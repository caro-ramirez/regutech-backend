const pool = require("../config/db");

const { obtenerConfigInterna } = require("./configuracionController");

async function solicitar(req, res) {
  const { idNorma } = req.body;
  const idEntidad = req.usuario.idEntidad;

  if (!idNorma) {
    return res.status(400).json({ error: "La norma es obligatoria." });
  }

  try {
    const normaInfo = await pool.query(`SELECT categoria FROM norma_compliance WHERE id_norma = $1`, [idNorma]);
    const categoria = normaInfo.rows[0]?.categoria;

    let respQuery = { rows: [] };
    if (categoria) {
      respQuery = await pool.query(
        `SELECT u.id_usuario, u.nombre, COUNT(a.id_auditoria) as carga
         FROM usuario u
         LEFT JOIN auditoria a ON a.id_responsable = u.id_usuario AND a.estado = 'En progreso'
         WHERE u.rol = 'ResponsableCumplimiento' AND u.id_entidad = $1 AND u.especialidad = $2
         GROUP BY u.id_usuario, u.nombre
         ORDER BY carga ASC
         LIMIT 1`,
        [idEntidad, categoria]
      );
    }

    const asignadoPorEspecialidadExacta = respQuery.rows.length > 0;

    if (!asignadoPorEspecialidadExacta) {
      respQuery = await pool.query(
        `SELECT u.id_usuario, u.nombre, COUNT(a.id_auditoria) as carga
         FROM usuario u
         LEFT JOIN auditoria a ON a.id_responsable = u.id_usuario AND a.estado = 'En progreso'
         WHERE u.rol = 'ResponsableCumplimiento' AND u.id_entidad = $1
         GROUP BY u.id_usuario, u.nombre
         ORDER BY carga ASC
         LIMIT 1`,
        [idEntidad]
      );
    }

    if (respQuery.rows.length === 0) {
      return res.status(400).json({ error: "No hay responsables de cumplimiento disponibles para asignar." });
    }

    const responsable = respQuery.rows[0];

    const auditoria = await pool.query(
      `INSERT INTO auditoria (id_entidad, id_norma, id_responsable, estado)
       VALUES ($1, $2, $3, 'En progreso') RETURNING *`,
      [idEntidad, idNorma, responsable.id_usuario]
    );

    res.status(201).json({
      auditoria: auditoria.rows[0],
      responsableNombre: responsable.nombre,
      asignadoPorEspecialidadExacta,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function listar(req, res) {
  const { id: idUsuario, rol, idEntidad } = req.usuario;

  try {
    let query, params;
    if (rol === "ResponsableCumplimiento") {
      query = `SELECT a.*, n.nombre as norma_nombre FROM auditoria a
                JOIN norma_compliance n ON n.id_norma = a.id_norma
                WHERE a.id_responsable = $1 ORDER BY a.fecha_solicitud DESC`;
      params = [idUsuario];
    } else {
      query = `SELECT a.*, n.nombre as norma_nombre FROM auditoria a
                JOIN norma_compliance n ON n.id_norma = a.id_norma
                WHERE a.id_entidad = $1 ORDER BY a.fecha_solicitud DESC`;
      params = [idEntidad];
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function obtenerChecklist(req, res) {
  const { id } = req.params;
  try {
    const auditoria = await pool.query(`SELECT * FROM auditoria WHERE id_auditoria = $1`, [id]);
    if (auditoria.rows.length === 0) {
      return res.status(404).json({ error: "Auditoría no encontrada." });
    }
    const idNorma = auditoria.rows[0].id_norma;

    const items = await pool.query(
      `SELECT i.id_item, i.descripcion, i.criticidad, r.resultado, r.evidencia, r.descripcion_brecha
       FROM item_checklist_maestro i
       JOIN checklist_maestro c ON c.id_checklist = i.id_checklist
       LEFT JOIN respuesta_checklist r ON r.id_item = i.id_item AND r.id_auditoria = $2
       WHERE c.id_norma = $1
       ORDER BY i.id_item`,
      [idNorma, id]
    );

    res.json({ auditoria: auditoria.rows[0], items: items.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function enviarChecklist(req, res) {
  const { id } = req.params;
  const { respuestas } = req.body;

  if (!respuestas || respuestas.length === 0) {
    return res.status(400).json({ error: "Faltan respuestas del checklist." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const auditoriaRow = await client.query(`SELECT id_entidad FROM auditoria WHERE id_auditoria = $1`, [id]);
    const config = await obtenerConfigInterna(auditoriaRow.rows[0].id_entidad);
    const diasPorCriticidad = {
      Alta: config.sla_alta_dias,
      Media: config.sla_media_dias,
      Baja: config.sla_baja_dias,
    };

    for (const r of respuestas) {
      const insertResp = await client.query(
        `INSERT INTO respuesta_checklist (id_auditoria, id_item, resultado, evidencia, descripcion_brecha)
         VALUES ($1, $2, $3, $4, $5) RETURNING id_respuesta`,
        [id, r.idItem, r.resultado, r.evidencia || null, r.descripcionBrecha || null]
      );
      const idRespuesta = insertResp.rows[0].id_respuesta;

      if (r.resultado !== "Cumple") {
        const itemInfo = await client.query(`SELECT criticidad FROM item_checklist_maestro WHERE id_item = $1`, [r.idItem]);
        const criticidad = itemInfo.rows[0].criticidad;
        const dias = diasPorCriticidad[criticidad] || 30;

        await client.query(
          `INSERT INTO hallazgo (id_respuesta, severidad, estado, fecha_limite_sla)
           VALUES ($1, $2, 'Abierto', CURRENT_DATE + $3::int)`,
          [idRespuesta, criticidad, dias]
        );
      }
    }

    const total = respuestas.length;
    const cumplidos = respuestas.filter((r) => r.resultado === "Cumple").length;
    const porcentaje = Math.round((cumplidos / total) * 100);

    await client.query(
      `UPDATE auditoria SET estado = 'Completada', fecha_completada = CURRENT_DATE, porcentaje_cumplimiento = $2 WHERE id_auditoria = $1`,
      [id, porcentaje]
    );

    await client.query("COMMIT");
    res.json({ mensaje: "Checklist registrado.", porcentajeCumplimiento: porcentaje });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  } finally {
    client.release();
  }
}

module.exports = { solicitar, listar, obtenerChecklist, enviarChecklist };
