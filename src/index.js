const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const normaRoutes = require("./routes/normaRoutes");
const auditoriaRoutes = require("./routes/auditoriaRoutes");
const hallazgoRoutes = require("./routes/hallazgoRoutes");
const certificadoRoutes = require("./routes/certificadoRoutes");
const capacitacionRoutes = require("./routes/capacitacionRoutes");
const autoreporteRoutes = require("./routes/autoreporteRoutes");
const riesgoHumanoRoutes = require("./routes/riesgoHumanoRoutes");
const usuarioRoutes = require("./routes/usuarioRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const backofficeRoutes = require("./routes/backofficeRoutes");
const configuracionRoutes = require("./routes/configuracionRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/normas", normaRoutes);
app.use("/api/auditorias", auditoriaRoutes);
app.use("/api/hallazgos", hallazgoRoutes);
app.use("/api/certificados", certificadoRoutes);
app.use("/api/capacitaciones", capacitacionRoutes);
app.use("/api/autoreportes", autoreporteRoutes);
app.use("/api/riesgo-humano", riesgoHumanoRoutes);
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/backoffice", backofficeRoutes);
app.use("/api/configuracion", configuracionRoutes);

app.get("/", (req, res) => {
  res.json({ mensaje: "API de ReguTech funcionando" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
