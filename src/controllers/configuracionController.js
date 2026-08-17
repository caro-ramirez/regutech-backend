const pool = require("../config/db");

const DEFAULTS = { sla_alta_dias: 15, sla_media_dias: 30, sla_baja_dias: 60, umbral_certificacion: 90 };

async function obtenerConfigInterna(idEntidad) {
  const result = await pool.query(`SELECT * FROM configuracion_entidad WHERE id_entidad = $1`, [idEntidad]);
  if (result.rows.length === 0) {
    return { id_entidad: idEntidad, ...DEFAULTS };
  }
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
  const { slaAltaDias, slaMediaDias, slaBajaDias, umbralCertificacion } = req.body;
  const idEntidad = req.usuario.idEntidad;

  if (!slaAltaDias || !slaMediaDias || !slaBajaDias || !umbralCertificacion) {
    return res.status(400).json({ error: "Completá todos los valores de configuración." });
  }

  try {
    await pool.query(
      `INSERT INTO configuracion_entidad (id_entidad, sla_alta_dias, sla_media_dias, sla_baja_dias, umbral_certificacion)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id_entidad) DO UPDATE SET
         sla_alta_dias = $2, sla_media_dias = $3, sla_baja_dias = $4, umbral_certificacion = $5`,
      [idEntidad, slaAltaDias, slaMediaDias, slaBajaDias, umbralCertificacion]
    );
    res.json({ mensaje: "Configuración actualizada." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

module.exports = { obtener, actualizar, obtenerConfigInterna };
