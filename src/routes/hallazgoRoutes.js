const express = require("express");
const router = express.Router();
const verificarToken = require("../middleware/verificarToken");
const verificarRol = require("../middleware/verificarRol");
const ctrl = require("../controllers/hallazgoController");

router.use(verificarToken);
router.get("/", verificarRol("Administrador", "ResponsableCumplimiento"), ctrl.listarPorAuditoria);
router.get("/mis-asignados", verificarRol("Colaborador"), ctrl.listarMisAsignados);
router.get("/:id", verificarRol("Administrador", "ResponsableCumplimiento", "Colaborador"), ctrl.detalle);
router.patch("/:id/asignar", verificarRol("ResponsableCumplimiento"), ctrl.asignarColaborador);
router.patch("/:id/remediar", verificarRol("Colaborador"), ctrl.remediar);
router.patch("/:id/retest", verificarRol("ResponsableCumplimiento"), ctrl.retest);
router.patch("/:id/riesgo-aceptado", verificarRol("ResponsableCumplimiento"), ctrl.riesgoAceptado);
router.patch("/:id/reasignar", verificarRol("Administrador"), ctrl.reasignarResponsable);
router.patch("/:id/extender-plazo", verificarRol("Administrador"), ctrl.extenderPlazo);

module.exports = router;
