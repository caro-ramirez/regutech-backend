const express = require("express");
const router = express.Router();
const verificarToken = require("../middleware/verificarToken");
const verificarRol = require("../middleware/verificarRol");
const ctrl = require("../controllers/dashboardController");

router.use(verificarToken);
router.get("/", verificarRol("Administrador"), ctrl.obtenerIndicadores);

module.exports = router;
