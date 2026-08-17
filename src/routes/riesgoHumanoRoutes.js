const express = require("express");
const router = express.Router();
const verificarToken = require("../middleware/verificarToken");
const verificarRol = require("../middleware/verificarRol");
const ctrl = require("../controllers/riesgoHumanoController");

router.use(verificarToken);
router.get("/", verificarRol("Administrador", "ResponsableCumplimiento"), ctrl.listar);
router.get("/por-area", verificarRol("Administrador", "ResponsableCumplimiento"), ctrl.listarPorArea);
router.get("/:idColaborador", verificarRol("Administrador", "ResponsableCumplimiento"), ctrl.detalle);
router.post("/:idColaborador/accion", verificarRol("ResponsableCumplimiento"), ctrl.registrarAccion);
router.post("/:idColaborador/revisado-sin-accion", verificarRol("ResponsableCumplimiento"), ctrl.revisadoSinAccion);

module.exports = router;
