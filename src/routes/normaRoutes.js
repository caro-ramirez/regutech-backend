const express = require("express");
const router = express.Router();
const verificarToken = require("../middleware/verificarToken");
const verificarRol = require("../middleware/verificarRol");
const ctrl = require("../controllers/normaController");

router.use(verificarToken);
router.use(verificarRol("Administrador", "Backoffice"));
router.get("/", ctrl.listar);
router.post("/", ctrl.crear);
router.get("/:idNorma/items", ctrl.listarItems);
router.post("/:idNorma/items", ctrl.crearItem);
router.put("/items/:idItem", ctrl.editarItem);
router.delete("/items/:idItem", ctrl.eliminarItem);

module.exports = router;
