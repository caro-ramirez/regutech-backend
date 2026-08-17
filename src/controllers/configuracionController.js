const pool = require("../config/db");

async function obtenerConfigInterna(idEntidad) {
  const result = await pool.query(
    `SELECT sla_critica_dias, sla_alta_dias, sla_media_dias, sla_baja_dias, umbral_certificacion
     FROM entidad_financiera WHERE id_entidad = $1`,
    [idEntidad]
  );
  return result.rows[0];
}

async function obtener(req, res) {
  try {
    const config = await obtenerConfigInterna(req.usuario.idEntidad);
    res.json(config);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function actualizar(req, res) {
  const { slaCriticaDias, slaAltaDias, slaMediaDias, slaBajaDias, umbralCertificacion } = req.body;
  const idEntidad = req.usuario.idEntidad;

  if (!slaCriticaDias || !slaAltaDias || !slaMediaDias || !slaBajaDias || !umbralCertificacion) {
    return res.status(400).json({ error: "Completá todos los valores de configuración." });
  }

  try {
    await pool.query(
      `UPDATE entidad_financiera
       SET sla_critica_dias = $2, sla_alta_dias = $3, sla_media_dias = $4, sla_baja_dias = $5, umbral_certificacion = $6
       WHERE id_entidad = $1`,
      [idEntidad, slaCriticaDias, slaAltaDias, slaMediaDias, slaBajaDias, umbralCertificacion]
    );
    res.json({ mensaje: "Configuración actualizada." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

module.exports = { obtener, actualizar, obtenerConfigInterna };
