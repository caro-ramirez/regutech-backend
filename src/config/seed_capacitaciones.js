const pool = require("../config/db");

async function seedCapacitaciones() {
  try {
    await pool.query(
      `INSERT INTO capacitacion (nombre, nota_minima) VALUES ($1, $2)`,
      ["Prevención de Lavado de Activos (PLA/FT)", 60]
    );
    console.log("Capacitación PLA/FT cargada correctamente.");
    process.exit(0);
  } catch (error) {
    console.error("Error al cargar capacitaciones:", error);
    process.exit(1);
  }
}

seedCapacitaciones();
