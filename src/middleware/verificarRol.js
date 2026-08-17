function verificarRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: "No tenés permisos para realizar esta acción." });
    }
    next();
  };
}

module.exports = verificarRol;
