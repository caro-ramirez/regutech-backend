const express = require("express");
const router = express.Router();
const verificarToken = require("../middleware/verificarToken");
const verificarRol = require("../middleware/verificarRol");
const ctrl = require("../controllers/backofficeController");

router.use(verificarToken);
router.use(verificarRol("Backoffice"));
router.get("/entidades", ctrl.listarEntidades);
router.post("/entidades", ctrl.crearEntidad);

module.exports = router;
