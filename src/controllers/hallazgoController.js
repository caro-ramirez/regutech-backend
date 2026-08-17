const pool = require("../config/db");

const { obtenerConfigInterna } = require("./configuracionController");
const { obtenerAuditoriaDeHallazgo } = require("../utils/autorizacion");

async function escalarVencidosPorEntidad(idEntidad) {
  const vencidos = await pool.query(
    `SELECT h.id_hallazgo, h.severidad, a.id_responsable
     FROM hallazgo h
     JOIN respuesta_checklist r ON r.id_respuesta = h.id_respuesta
     JOIN auditoria a ON a.id_auditoria = r.id_auditoria
     WHERE a.id_entidad = $1 AND h.estado IN ('Abierto', 'Asignado', 'Reabierto') AND h.fecha_limite_sla < CURRENT_DATE`,
    [idEntidad]
  );

  for (const h of vencidos.rows) {
    await pool.query(`UPDATE hallazgo SET estado = 'Escalado' WHERE id_hallazgo = $1`, [h.id_hallazgo]);

    if (h.severidad === "Alta" && h.id_responsable) {
      const yaExiste = await pool.query(
        `SELECT id_incidente FROM incidente WHERE id_hallazgo_relacionado = $1`,
        [h.id_hallazgo]
      );
      if (yaExiste.rows.length === 0) {
        await pool.query(
          `INSERT INTO incidente (id_colaborador, id_hallazgo_relacionado, tipo, origen)
           VALUES ($1, $2, 'Hallazgo de auditoría de severidad alta escalado sin remediar', 'Auditoria')`,
          [h.id_responsable, h.id_hallazgo]
        );
      }
    }
  }
}

// Verifica que quien pide la lista/acciones sobre una auditoría tenga permiso real, no solo el rol.
function verificarAccesoAAuditoria(auditoriaInfo, usuario) {
  if (!auditoriaInfo) return { ok: false, status: 404, error: "Auditoría no encontrada." };
  if (usuario.rol === "Administrador") {
    if (auditoriaInfo.id_entidad !== usuario.idEntidad) {
      return { ok: false, status: 403, error: "Esta auditoría no pertenece a tu entidad." };
    }
  } else if (usuario.rol === "ResponsableCumplimiento") {
    if (auditoriaInfo.id_responsable !== usuario.id) {
      return { ok: false, status: 403, error: "Esta auditoría no está asignada a vos." };
    }
  }
  return { ok: true };
}

async function listarPorAuditoria(req, res) {
  const { auditoriaId } = req.query;
  try {
    const auditoria = await pool.query(
      `SELECT id_entidad, id_responsable FROM auditoria WHERE id_auditoria = $1`,
      [auditoriaId]
    );
    if (auditoria.rows.length === 0) {
      return res.status(404).json({ error: "Auditoría no encontrada." });
    }

    const verificacion = verificarAccesoAAuditoria(auditoria.rows[0], req.usuario);
    if (!verificacion.ok) return res.status(verificacion.status).json({ error: verificacion.error });

    await escalarVencidosPorEntidad(auditoria.rows[0].id_entidad);

    const result = await pool.query(
      `SELECT h.*, r.descripcion_brecha, i.descripcion as item_descripcion, i.area as item_area, a.id_responsable,
              u.nombre as colaborador_asignado_nombre
       FROM hallazgo h
       JOIN respuesta_checklist r ON r.id_respuesta = h.id_respuesta
       JOIN item_checklist_maestro i ON i.id_item = r.id_item
       JOIN auditoria a ON a.id_auditoria = r.id_auditoria
       LEFT JOIN usuario u ON u.id_usuario = h.id_colaborador_asignado
       WHERE r.id_auditoria = $1
       ORDER BY h.fecha_limite_sla ASC`,
      [auditoriaId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function listarMisAsignados(req, res) {
  try {
    const result = await pool.query(
      `SELECT h.id_hallazgo, h.severidad, h.estado, h.fecha_limite_sla, i.descripcion as item_descripcion,
              n.nombre as norma_nombre
       FROM hallazgo h
       JOIN respuesta_checklist r ON r.id_respuesta = h.id_respuesta
       JOIN item_checklist_maestro i ON i.id_item = r.id_item
       JOIN auditoria a ON a.id_auditoria = r.id_auditoria
       JOIN norma_compliance n ON n.id_norma = a.id_norma
       WHERE h.id_colaborador_asignado = $1
       ORDER BY h.fecha_limite_sla ASC`,
      [req.usuario.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function detalle(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT h.*, r.descripcion_brecha, r.id_auditoria, i.descripcion as item_descripcion, i.area as item_area,
              u.nombre as colaborador_asignado_nombre
       FROM hallazgo h
       JOIN respuesta_checklist r ON r.id_respuesta = h.id_respuesta
       JOIN item_checklist_maestro i ON i.id_item = r.id_item
       LEFT JOIN usuario u ON u.id_usuario = h.id_colaborador_asignado
       WHERE h.id_hallazgo = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Hallazgo no encontrado." });
    }

    const hallazgo = result.rows[0];

    // El Colaborador solo puede ver el detalle si el hallazgo es suyo; Admin/Responsable ya se validan por auditoría.
    if (req.usuario.rol === "Colaborador" && hallazgo.id_colaborador_asignado !== req.usuario.id) {
      return res.status(403).json({ error: "Este hallazgo no está asignado a vos." });
    }
    if (req.usuario.rol !== "Colaborador") {
      const auditoriaInfo = await obtenerAuditoriaDeHallazgo(id);
      const verificacion = verificarAccesoAAuditoria(auditoriaInfo, req.usuario);
      if (!verificacion.ok) return res.status(verificacion.status).json({ error: verificacion.error });
    }

    res.json(hallazgo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function asignarColaborador(req, res) {
  const { id } = req.params;
  const { idColaborador } = req.body;

  if (!idColaborador) {
    return res.status(400).json({ error: "Seleccioná el colaborador responsable de la remediación." });
  }

  try {
    const auditoriaInfo = await obtenerAuditoriaDeHallazgo(id);
    const verificacion = verificarAccesoAAuditoria(auditoriaInfo, req.usuario);
    if (!verificacion.ok) return res.status(verificacion.status).json({ error: verificacion.error });

    const colaborador = await pool.query(`SELECT id_entidad, rol FROM usuario WHERE id_usuario = $1`, [idColaborador]);
    if (colaborador.rows.length === 0 || colaborador.rows[0].rol !== "Colaborador") {
      return res.status(400).json({ error: "El colaborador seleccionado no es válido." });
    }
    if (colaborador.rows[0].id_entidad !== auditoriaInfo.id_entidad) {
      return res.status(403).json({ error: "El colaborador debe pertenecer a la misma entidad que la auditoría." });
    }

    await pool.query(
      `UPDATE hallazgo SET id_colaborador_asignado = $2, estado = 'Asignado' WHERE id_hallazgo = $1`,
      [id, idColaborador]
    );
    res.json({ mensaje: "Colaborador asignado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function verificarDuenio(id, idUsuario) {
  const actual = await pool.query(`SELECT id_colaborador_asignado FROM hallazgo WHERE id_hallazgo = $1`, [id]);
  if (actual.rows.length === 0) return { ok: false, status: 404, error: "Hallazgo no encontrado." };
  if (actual.rows[0].id_colaborador_asignado !== idUsuario) {
    return { ok: false, status: 403, error: "Este hallazgo no está asignado a vos." };
  }
  return { ok: true };
}

async function remediar(req, res) {
  const { id } = req.params;
  const { evidencia } = req.body;

  if (!evidencia || !evidencia.trim()) {
    return res.status(400).json({ error: "Debés adjuntar evidencia de la remediación." });
  }

  try {
    const verificacion = await verificarDuenio(id, req.usuario.id);
    if (!verificacion.ok) return res.status(verificacion.status).json({ error: verificacion.error });

    const fechaRetest = new Date();
    fechaRetest.setDate(fechaRetest.getDate() + 5);

    await pool.query(
      `UPDATE hallazgo
       SET estado = 'Pendiente de Retest', tipo_resolucion_propuesta = 'Remediacion',
           evidencia_remediacion = $2, fecha_retest = $3
       WHERE id_hallazgo = $1`,
      [id, evidencia, fechaRetest.toISOString().slice(0, 10)]
    );
    res.json({ mensaje: "Remediación registrada, pendiente de verificación por retest." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function recalcularCumplimiento(idAuditoria) {
  const total = await pool.query(`SELECT COUNT(*) FROM respuesta_checklist WHERE id_auditoria = $1`, [idAuditoria]);
  const cerrados = await pool.query(
    `SELECT COUNT(*) FROM hallazgo h
     JOIN respuesta_checklist r ON r.id_respuesta = h.id_respuesta
     WHERE r.id_auditoria = $1 AND h.estado IN ('Cerrado', 'Riesgo Aceptado', 'Falso Positivo')`,
    [idAuditoria]
  );
  const noConformidades = await pool.query(
    `SELECT COUNT(*) FROM respuesta_checklist WHERE id_auditoria = $1 AND resultado != 'Cumple'`,
    [idAuditoria]
  );
  const cumplidosDirecto = Number(total.rows[0].count) - Number(noConformidades.rows[0].count);
  const totalItems = Number(total.rows[0].count);
  const cumplidosEfectivos = cumplidosDirecto + Number(cerrados.rows[0].count);
  const porcentaje = totalItems > 0 ? Math.round((cumplidosEfectivos / totalItems) * 100) : 0;

  await pool.query(`UPDATE auditoria SET porcentaje_cumplimiento = $2 WHERE id_auditoria = $1`, [idAuditoria, porcentaje]);
  return porcentaje;
}

async function retest(req, res) {
  const { id } = req.params;
  const { resultado } = req.body;

  try {
    const actual = await pool.query(
      `SELECT h.severidad, h.tipo_resolucion_propuesta, r.id_auditoria, a.id_entidad, a.id_responsable FROM hallazgo h
       JOIN respuesta_checklist r ON r.id_respuesta = h.id_respuesta
       JOIN auditoria a ON a.id_auditoria = r.id_auditoria
       WHERE h.id_hallazgo = $1`,
      [id]
    );
    if (actual.rows.length === 0) return res.status(404).json({ error: "Hallazgo no encontrado." });

    const { severidad, tipo_resolucion_propuesta, id_auditoria, id_entidad, id_responsable } = actual.rows[0];
    const verificacion = verificarAccesoAAuditoria({ id_entidad, id_responsable }, req.usuario);
    if (!verificacion.ok) return res.status(verificacion.status).json({ error: verificacion.error });

    if (resultado === "Éxito") {
      const estadoFinal = tipo_resolucion_propuesta === "Riesgo Aceptado" || tipo_resolucion_propuesta === "Falso Positivo"
        ? tipo_resolucion_propuesta
        : "Cerrado";
      await pool.query(`UPDATE hallazgo SET estado = $2, resultado_retest = $3 WHERE id_hallazgo = $1`, [id, estadoFinal, resultado]);
    } else {
      const config = await obtenerConfigInterna(id_entidad);
      const diasPorCriticidad = { Alta: config.sla_alta_dias, Media: config.sla_media_dias, Baja: config.sla_baja_dias };
      const dias = diasPorCriticidad[severidad] || 30;
      await pool.query(
        `UPDATE hallazgo
         SET estado = 'Reabierto', resultado_retest = $2, tipo_resolucion_propuesta = NULL, fecha_limite_sla = CURRENT_DATE + $3::int
         WHERE id_hallazgo = $1`,
        [id, resultado, dias]
      );
    }

    const porcentajeCumplimiento = await recalcularCumplimiento(id_auditoria);
    res.json({ mensaje: "Resultado de retest registrado.", porcentajeCumplimiento });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function riesgoAceptado(req, res) {
  const { id } = req.params;
  const { justificacion, tipo } = req.body;

  if (!justificacion || !justificacion.trim()) {
    return res.status(400).json({ error: "La justificación es obligatoria." });
  }
  if (!["Riesgo Aceptado", "Falso Positivo"].includes(tipo)) {
    return res.status(400).json({ error: "Tipo inválido." });
  }

  try {
    const verificacion = await verificarDuenio(id, req.usuario.id);
    if (!verificacion.ok) return res.status(verificacion.status).json({ error: verificacion.error });

    const actual = await pool.query(
      `SELECT r.id_auditoria FROM hallazgo h JOIN respuesta_checklist r ON r.id_respuesta = h.id_respuesta WHERE h.id_hallazgo = $1`,
      [id]
    );
    await pool.query(
      `UPDATE hallazgo SET estado = 'Pendiente de Retest', tipo_resolucion_propuesta = $2, evidencia_remediacion = $3 WHERE id_hallazgo = $1`,
      [id, tipo, justificacion]
    );
    const porcentajeCumplimiento = await recalcularCumplimiento(actual.rows[0].id_auditoria);
    res.json({ mensaje: `${tipo} registrado, pendiente de verificación por retest.`, porcentajeCumplimiento });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function reasignarResponsable(req, res) {
  const { id } = req.params;
  const { idNuevoResponsable } = req.body;

  if (!idNuevoResponsable) {
    return res.status(400).json({ error: "Seleccioná el nuevo responsable." });
  }

  try {
    const auditoriaInfo = await obtenerAuditoriaDeHallazgo(id);
    const verificacion = verificarAccesoAAuditoria(auditoriaInfo, req.usuario);
    if (!verificacion.ok) return res.status(verificacion.status).json({ error: verificacion.error });

    const nuevoResp = await pool.query(`SELECT id_entidad, rol FROM usuario WHERE id_usuario = $1`, [idNuevoResponsable]);
    if (nuevoResp.rows.length === 0 || nuevoResp.rows[0].rol !== "ResponsableCumplimiento") {
      return res.status(400).json({ error: "El responsable seleccionado no es válido." });
    }
    if (nuevoResp.rows[0].id_entidad !== auditoriaInfo.id_entidad) {
      return res.status(403).json({ error: "El responsable debe pertenecer a la misma entidad que la auditoría." });
    }

    await pool.query(`UPDATE auditoria SET id_responsable = $2 WHERE id_auditoria = $1`, [auditoriaInfo.id_auditoria, idNuevoResponsable]);
    await pool.query(
      `UPDATE hallazgo SET estado = 'Abierto', nota_administrador = 'Reasignado a un nuevo responsable por el Administrador.' WHERE id_hallazgo = $1`,
      [id]
    );

    res.json({ mensaje: "Responsable reasignado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function extenderPlazo(req, res) {
  const { id } = req.params;
  const { dias, justificacion } = req.body;

  if (!dias || !justificacion || !justificacion.trim()) {
    return res.status(400).json({ error: "Completá los días de extensión y la justificación." });
  }

  try {
    const auditoriaInfo = await obtenerAuditoriaDeHallazgo(id);
    const verificacion = verificarAccesoAAuditoria(auditoriaInfo, req.usuario);
    if (!verificacion.ok) return res.status(verificacion.status).json({ error: verificacion.error });

    const previo = await pool.query(`SELECT id_colaborador_asignado FROM hallazgo WHERE id_hallazgo = $1`, [id]);
    const estadoVuelta = previo.rows[0]?.id_colaborador_asignado ? "Asignado" : "Abierto";

    await pool.query(
      `UPDATE hallazgo SET estado = $2, fecha_limite_sla = CURRENT_DATE + $3::int, nota_administrador = $4
       WHERE id_hallazgo = $1`,
      [id, estadoVuelta, dias, justificacion]
    );
    res.json({ mensaje: "Plazo extendido." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

module.exports = {
  listarPorAuditoria,
  listarMisAsignados,
  detalle,
  asignarColaborador,
  remediar,
  retest,
  riesgoAceptado,
  escalarVencidosPorEntidad,
  reasignarResponsable,
  extenderPlazo,
};
