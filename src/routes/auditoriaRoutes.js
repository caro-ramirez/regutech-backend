const express = require("express");
const router = express.Router();
const verificarToken = require("../middleware/verificarToken");
const verificarRol = require("../middleware/verificarRol");
const ctrl = require("../controllers/auditoriaController");

router.use(verificarToken);
router.post("/", verificarRol("Administrador"), ctrl.solicitar);
router.get("/", verificarRol("Administrador", "ResponsableCumplimiento"), ctrl.listar);
router.get("/:id/checklist", verificarRol("ResponsableCumplimiento"), ctrl.obtenerChecklist);
router.post("/:id/checklist", verificarRol("ResponsableCumplimiento"), ctrl.enviarChecklist);

module.exports = router;
