const express = require("express");
const router = express.Router();
const verificarToken = require("../middleware/verificarToken");
const verificarRol = require("../middleware/verificarRol");
const ctrl = require("../controllers/certificadoController");

router.use(verificarToken);
router.get("/:auditoriaId", verificarRol("Administrador", "ResponsableCumplimiento"), ctrl.obtenerEstado);
router.get("/:auditoriaId/pdf", verificarRol("Administrador"), ctrl.descargarPDF);

module.exports = router;
