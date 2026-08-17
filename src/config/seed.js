const bcrypt = require("bcrypt");
const pool = require("../config/db");

async function seed() {
  try {
    const entidad = await pool.query(
      `INSERT INTO entidad_financiera (razon_social, tipo_entidad)
       VALUES ('Finora Créditos S.A.', 'Factoring')
       RETURNING id_entidad`
    );
    const idEntidad = entidad.rows[0].id_entidad;

    const passwordHash = await bcrypt.hash("Regutech2026!", 10);

    const usuarios = [
      { nombre: "Carolina Ramírez", email: "carolina.ramirez@finora.com", rol: "Administrador" },
      { nombre: "Martina Sosa", email: "martina.sosa@finora.com", rol: "ResponsableCumplimiento" },
      { nombre: "Lucas Fernández", email: "lucas.fernandez@finora.com", rol: "Colaborador" },
    ];

    for (const u of usuarios) {
      await pool.query(
        `INSERT INTO usuario (id_entidad, nombre, email, password_hash, rol)
         VALUES ($1, $2, $3, $4, $5)`,
        [idEntidad, u.nombre, u.email, passwordHash, u.rol]
      );
    }

    console.log("Seed completado. Los 3 usuarios de prueba tienen la contraseña: Regutech2026!");
    process.exit(0);
  } catch (error) {
    console.error("Error al ejecutar el seed:", error);
    process.exit(1);
  }
}

seed();
