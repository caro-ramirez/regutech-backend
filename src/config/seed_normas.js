const pool = require("../config/db");

async function seedNormas() {
  try {
    const norma = await pool.query(
      `INSERT INTO norma_compliance (nombre, descripcion) VALUES ($1, $2) RETURNING id_norma`,
      ["ISO 9001 - Gestión de Calidad", "Norma internacional de sistemas de gestión de calidad."]
    );
    const idNorma = norma.rows[0].id_norma;

    const checklist = await pool.query(
      `INSERT INTO checklist_maestro (id_norma, version) VALUES ($1, 1) RETURNING id_checklist`,
      [idNorma]
    );
    const idChecklist = checklist.rows[0].id_checklist;

    const items = [
      { descripcion: "La organización cuenta con una política de calidad documentada y aprobada", criticidad: "Alta" },
      { descripcion: "Existen registros de auditorías internas de los últimos 12 meses", criticidad: "Media" },
      { descripcion: "El personal recibió capacitación sobre el sistema de gestión de calidad", criticidad: "Media" },
      { descripcion: "Se documentan las no conformidades y sus acciones correctivas", criticidad: "Alta" },
    ];

    for (const item of items) {
      await pool.query(
        `INSERT INTO item_checklist_maestro (id_checklist, descripcion, criticidad) VALUES ($1, $2, $3)`,
        [idChecklist, item.descripcion, item.criticidad]
      );
    }

    console.log("Norma ISO 9001 y su checklist maestro cargados correctamente.");
    process.exit(0);
  } catch (error) {
    console.error("Error al cargar normas:", error);
    process.exit(1);
  }
}

seedNormas();
