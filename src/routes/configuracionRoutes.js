const express = require("express");
const router = express.Router();
const verificarToken = require("../middleware/verificarToken");
const verificarRol = require("../middleware/verificarRol");
const ctrl = require("../controllers/configuracionController");

router.use(verificarToken);
router.use(verificarRol("Administrador"));
router.get("/", ctrl.obtener);
router.put("/", ctrl.actualizar);

module.exports = router;
