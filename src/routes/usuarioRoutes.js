const express = require("express");
const router = express.Router();
const verificarToken = require("../middleware/verificarToken");
const verificarRol = require("../middleware/verificarRol");
const ctrl = require("../controllers/usuarioController");

router.use(verificarToken);
router.get("/", verificarRol("Administrador", "ResponsableCumplimiento"), ctrl.listar);
router.post("/", verificarRol("Administrador"), ctrl.crear);
router.delete("/:id", verificarRol("Administrador"), ctrl.eliminar);

module.exports = router;
