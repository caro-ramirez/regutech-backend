const pool = require("../config/db");

async function listar(req, res) {
  try {
    const esBackoffice = req.usuario.rol === "Backoffice";
    const result = await pool.query(
      esBackoffice
        ? `SELECT id_norma, nombre, descripcion, categoria, id_entidad FROM norma_compliance WHERE id_entidad IS NULL ORDER BY nombre`
        : `SELECT id_norma, nombre, descripcion, categoria, id_entidad FROM norma_compliance
           WHERE id_entidad IS NULL OR id_entidad = $1
           ORDER BY nombre`,
      esBackoffice ? [] : [req.usuario.idEntidad]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function crear(req, res) {
  const { nombre, descripcion, categoria } = req.body;
  const esBackoffice = req.usuario.rol === "Backoffice";
  // Backoffice crea normas globales (id_entidad NULL); el Administrador crea normas propias de su entidad
  const idEntidad = esBackoffice ? null : req.usuario.idEntidad;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre de la norma es obligatorio." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const norma = await client.query(
      `INSERT INTO norma_compliance (nombre, descripcion, categoria, id_entidad) VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre, descripcion || null, categoria || null, idEntidad]
    );
    await client.query(
      `INSERT INTO checklist_maestro (id_norma, version) VALUES ($1, 1)`,
      [norma.rows[0].id_norma]
    );
    await client.query("COMMIT");
    res.status(201).json(norma.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  } finally {
    client.release();
  }
}

async function listarItems(req, res) {
  const { idNorma } = req.params;
  try {
    const result = await pool.query(
      `SELECT i.id_item, i.descripcion, i.criticidad, i.area
       FROM item_checklist_maestro i
       JOIN checklist_maestro c ON c.id_checklist = i.id_checklist
       WHERE c.id_norma = $1
       ORDER BY i.id_item`,
      [idNorma]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

// Backoffice solo puede tocar normas globales (id_entidad NULL).
// Administrador solo puede tocar normas propias de su entidad.
function tienePermisoSobreNorma(idEntidadNorma, usuario) {
  if (usuario.rol === "Backoffice") return idEntidadNorma === null;
  return idEntidadNorma === usuario.idEntidad;
}

async function verificarPropiedadNorma(idNorma, usuario) {
  const norma = await pool.query(`SELECT id_entidad FROM norma_compliance WHERE id_norma = $1`, [idNorma]);
  if (norma.rows.length === 0) return { ok: false, status: 404, error: "Norma no encontrada." };
  if (!tienePermisoSobreNorma(norma.rows[0].id_entidad, usuario)) {
    return { ok: false, status: 403, error: "No tenés permisos para editar el checklist de esta norma." };
  }
  return { ok: true };
}

async function crearItem(req, res) {
  const { idNorma } = req.params;
  const { descripcion, criticidad, area } = req.body;

  if (!descripcion || !criticidad) {
    return res.status(400).json({ error: "Completá descripción y criticidad." });
  }

  try {
    const verificacion = await verificarPropiedadNorma(idNorma, req.usuario);
    if (!verificacion.ok) return res.status(verificacion.status).json({ error: verificacion.error });

    const checklist = await pool.query(`SELECT id_checklist FROM checklist_maestro WHERE id_norma = $1`, [idNorma]);
    await pool.query(
      `INSERT INTO item_checklist_maestro (id_checklist, descripcion, criticidad, area) VALUES ($1, $2, $3, $4)`,
      [checklist.rows[0].id_checklist, descripcion, criticidad, area || null]
    );
    res.status(201).json({ mensaje: "Ítem agregado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function obtenerEntidadDelItem(idItem) {
  const item = await pool.query(
    `SELECT n.id_entidad FROM item_checklist_maestro i
     JOIN checklist_maestro c ON c.id_checklist = i.id_checklist
     JOIN norma_compliance n ON n.id_norma = c.id_norma
     WHERE i.id_item = $1`,
    [idItem]
  );
  return item.rows[0]?.id_entidad;
}

async function editarItem(req, res) {
  const { idItem } = req.params;
  const { descripcion, criticidad } = req.body;

  try {
    const idEntidadNorma = await obtenerEntidadDelItem(idItem);
    if (idEntidadNorma === undefined) return res.status(404).json({ error: "Ítem no encontrado." });
    if (!tienePermisoSobreNorma(idEntidadNorma, req.usuario)) {
      return res.status(403).json({ error: "No tenés permisos para editar este ítem." });
    }

    await pool.query(
      `UPDATE item_checklist_maestro SET descripcion = $2, criticidad = $3 WHERE id_item = $1`,
      [idItem, descripcion, criticidad]
    );
    res.json({ mensaje: "Ítem actualizado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

async function eliminarItem(req, res) {
  const { idItem } = req.params;
  try {
    const idEntidadNorma = await obtenerEntidadDelItem(idItem);
    if (idEntidadNorma === undefined) return res.status(404).json({ error: "Ítem no encontrado." });
    if (!tienePermisoSobreNorma(idEntidadNorma, req.usuario)) {
      return res.status(403).json({ error: "No tenés permisos para eliminar este ítem." });
    }

    await pool.query(`DELETE FROM item_checklist_maestro WHERE id_item = $1`, [idItem]);
    res.json({ mensaje: "Ítem eliminado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}

module.exports = { listar, crear, listarItems, crearItem, editarItem, eliminarItem };
