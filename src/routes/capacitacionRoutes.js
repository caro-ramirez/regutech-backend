const express = require("express");
const router = express.Router();
const verificarToken = require("../middleware/verificarToken");
const verificarRol = require("../middleware/verificarRol");
const ctrl = require("../controllers/capacitacionController");

router.use(verificarToken);
router.get("/", verificarRol("Colaborador"), ctrl.listarPendientes);
router.get("/todas", verificarRol("Administrador"), ctrl.listarTodas);
router.post("/", verificarRol("Administrador"), ctrl.crear);
router.delete("/:id", verificarRol("Administrador"), ctrl.eliminar);

router.get("/:id/preguntas-admin", verificarRol("Administrador"), ctrl.listarPreguntasAdmin);
router.get("/:id/preguntas", verificarRol("Colaborador"), ctrl.listarPreguntasColaborador);
router.post("/:id/preguntas", verificarRol("Administrador"), ctrl.crearPregunta);
router.delete("/preguntas/:idPregunta", verificarRol("Administrador"), ctrl.eliminarPregunta);

router.post("/:id/registrar", verificarRol("Colaborador"), ctrl.registrarResultado);

module.exports = router;
