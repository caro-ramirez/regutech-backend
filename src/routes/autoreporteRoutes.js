const express = require("express");
const router = express.Router();
const verificarToken = require("../middleware/verificarToken");
const verificarRol = require("../middleware/verificarRol");
const ctrl = require("../controllers/autoreporteController");

router.use(verificarToken);
router.post("/", verificarRol("Colaborador"), ctrl.crear);
router.get("/mios", verificarRol("Colaborador"), ctrl.listarPropios);

module.exports = router;
