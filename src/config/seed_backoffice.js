const bcrypt = require("bcrypt");
const pool = require("../config/db");

async function seedBackoffice() {
  try {
    const passwordHash = await bcrypt.hash("Backoffice2026!", 10);
    await pool.query(
      `INSERT INTO usuario (id_entidad, nombre, email, password_hash, rol)
       VALUES (NULL, 'Equipo ReguTech', 'backoffice@regutech.com', $1, 'Backoffice')`,
      [passwordHash]
    );
    console.log("Usuario Backoffice creado. Contraseña: Backoffice2026!");
    process.exit(0);
  } catch (error) {
    console.error("Error al crear el usuario Backoffice:", error);
    process.exit(1);
  }
}

seedBackoffice();
