const pool = require("../config/db");
const { obtenerConfigInterna } = require("./configuracionController");
const PDFDocument = require("pdfkit");

async function obtenerEstado(req, res) {
  const { auditoriaId } = req.params;

  try {
    const auditoria = await pool.query(`SELECT * FROM auditoria WHERE id_auditoria = $1`, [auditoriaId]);
    if (auditoria.rows.length === 0) {
      return res.status(404).json({ error: "Auditoría no encontrada." });
    }
    if (auditoria.rows[0].id_entidad !== req.usuario.idEntidad) {
      return res.status(403).json({ error: "Esta auditoría no pertenece a tu entidad." });
    }
    const a = auditoria.rows[0];
    const config = await obtenerConfigInterna(a.id_entidad);

    let certificado = await pool.query(
      `SELECT * FROM certificado WHERE id_auditoria = $1 ORDER BY fecha_emision DESC LIMIT 1`,
      [auditoriaId]
    );

    if (Number(a.porcentaje_cumplimiento) >= Number(config.umbral_certificacion) && certificado.rows.length === 0) {
      const vencimiento = new Date();
      vencimiento.setFullYear(vencimiento.getFullYear() + 1);

      certificado = await pool.query(
        `INSERT INTO certificado (id_auditoria, fecha_vencimiento, porcentaje_cumplimiento, estado)
         VALUES ($1, $2, $3, 'Vigente') RETURNING *`,
        [auditoriaId, vencimiento.toISOString().slice(0, 10), a.porcentaje_cumplimiento]
      );
    }

    if (certificado.rows.length > 0) {
      const cert = certificado.rows[0];
      if (new Date(cert.fecha_vencimiento) < new Date() && cert.estado === "Vigente") {
        await pool.query(`UPDATE certificado SET estado = 'Vencido' WHERE id_certificado = $1`, [cert.id_certificado]);
        cert.estado = "Vencido";
      }
      return res.json({ porcentajeCumplimiento: a.porcentaje_cumplimiento, umbral: config.umbral_certificacion, certificado: cert });
    }

    res.json({ porcentajeCumplimiento: a.porcentaje_cumplimiento, umbral: config.umbral_certificacion, certificado: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function descargarPDF(req, res) {
  const { auditoriaId } = req.params;

  try {
    const auditoriaCheck = await pool.query(`SELECT id_entidad FROM auditoria WHERE id_auditoria = $1`, [auditoriaId]);
    if (auditoriaCheck.rows.length === 0) {
      return res.status(404).json({ error: "Auditoría no encontrada." });
    }
    if (auditoriaCheck.rows[0].id_entidad !== req.usuario.idEntidad) {
      return res.status(403).json({ error: "Esta auditoría no pertenece a tu entidad." });
    }

    const datos = await pool.query(
      `SELECT c.fecha_emision, c.fecha_vencimiento, c.porcentaje_cumplimiento, c.estado,
              n.nombre as norma_nombre, e.razon_social, e.tipo_entidad
       FROM certificado c
       JOIN auditoria a ON a.id_auditoria = c.id_auditoria
       JOIN norma_compliance n ON n.id_norma = a.id_norma
       JOIN entidad_financiera e ON e.id_entidad = a.id_entidad
       WHERE c.id_auditoria = $1
       ORDER BY c.fecha_emision DESC LIMIT 1`,
      [auditoriaId]
    );

    if (datos.rows.length === 0) {
      return res.status(404).json({ error: "No hay un certificado emitido para esta auditoría." });
    }
    const cert = datos.rows[0];

    if (!cert.razon_social) {
      return res.status(400).json({ error: "Faltan datos de la entidad para generar el certificado." });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=certificado_${auditoriaId}.pdf`);

    const doc = new PDFDocument({ margin: 60 });
    doc.pipe(res);

    doc.fontSize(20).text("Certificado de Cumplimiento", { align: "center" });
    doc.moveDown(2);
    doc.fontSize(12).text(`Entidad: ${cert.razon_social}`);
    doc.text(`Tipo de entidad: ${cert.tipo_entidad}`);
    doc.text(`Norma / Política: ${cert.norma_nombre}`);
    doc.moveDown();
    doc.text(`Porcentaje de cumplimiento: ${cert.porcentaje_cumplimiento}%`);
    doc.text(`Estado: ${cert.estado}`);
    doc.moveDown();
    doc.text(`Fecha de emisión: ${new Date(cert.fecha_emision).toLocaleDateString("es-AR")}`);
    doc.text(`Fecha de vencimiento: ${new Date(cert.fecha_vencimiento).toLocaleDateString("es-AR")}`);
    doc.moveDown(2);
    doc.fontSize(9).fillColor("gray").text(
      "Este certificado es generado automáticamente por ReguTech en base al cumplimiento verificado durante el ciclo de auditoría correspondiente.",
      { align: "center" }
    );

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor al generar el PDF." });
  }
}

module.exports = { obtenerEstado, descargarPDF };
