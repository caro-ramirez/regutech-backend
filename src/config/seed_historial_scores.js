const pool = require("../config/db");

async function seedHistorialScores() {
  try {
    const usuarios = await pool.query(
      `SELECT id_usuario, nombre, area FROM usuario WHERE rol = 'Colaborador' AND area IS NOT NULL`
    );

    // Perfil de tendencia por colaborador (día -60 a día -1), coherente con los perfiles ya cargados
    const tendencias = {
      "Lucas Fernández": [55, 60, 68, 75],
      "Sofía Molina": [25, 20, 15, 12],
      "Diego Ramos": [45, 50, 58, 62],
      "Valentina Cruz": [20, 18, 15, 14],
      "Nicolás Ibarra": [50, 65, 78, 88],
    };

    const offsets = [60, 45, 30, 15];

    for (const u of usuarios.rows) {
      const serie = tendencias[u.nombre];
      if (!serie) continue;

      for (let i = 0; i < offsets.length; i++) {
        await pool.query(
          `INSERT INTO score_riesgo (id_colaborador, valor_score, fecha_calculo)
           VALUES ($1, $2, CURRENT_DATE - $3::int)`,
          [u.id_usuario, serie[i], offsets[i]]
        );
      }
    }

    console.log("Histórico de scores cargado correctamente.");
    process.exit(0);
  } catch (error) {
    console.error("Error al cargar histórico de scores:", error);
    process.exit(1);
  }
}

seedHistorialScores();
