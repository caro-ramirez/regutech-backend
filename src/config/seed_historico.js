const bcrypt = require("bcrypt");
const pool = require("../config/db");

async function seedHistorico() {
  try {
    const entidad = await pool.query(`SELECT id_entidad FROM entidad_financiera LIMIT 1`);
    const idEntidad = entidad.rows[0].id_entidad;
    const passwordHash = await bcrypt.hash("Regutech2026!", 10);

    const capacitacion = await pool.query(`SELECT id_capacitacion, nota_minima FROM capacitacion LIMIT 1`);
    const idCapacitacion = capacitacion.rows[0].id_capacitacion;

    const colaboradores = [
      { nombre: "Sofía Molina", email: "sofia.molina@finora.com", area: "Tesorería" },
      { nombre: "Diego Ramos", email: "diego.ramos@finora.com", area: "Atención al Cliente" },
      { nombre: "Valentina Cruz", email: "valentina.cruz@finora.com", area: "Sistemas" },
      { nombre: "Nicolás Ibarra", email: "nicolas.ibarra@finora.com", area: "Operaciones" },
    ];

    const idsColaboradores = [];
    for (const c of colaboradores) {
      const existe = await pool.query(`SELECT id_usuario FROM usuario WHERE email = $1`, [c.email]);
      if (existe.rows.length > 0) {
        idsColaboradores.push({ id: existe.rows[0].id_usuario, area: c.area });
        continue;
      }
      const nuevo = await pool.query(
        `INSERT INTO usuario (id_entidad, nombre, email, password_hash, rol, area)
         VALUES ($1, $2, $3, $4, 'Colaborador', $5) RETURNING id_usuario`,
        [idEntidad, c.nombre, c.email, passwordHash, c.area]
      );
      idsColaboradores.push({ id: nuevo.rows[0].id_usuario, area: c.area });
    }

    // Asignar área a Lucas Fernández si ya existía sin área
    await pool.query(`UPDATE usuario SET area = 'Operaciones' WHERE email = 'lucas.fernandez@finora.com' AND area IS NULL`);

    // Histórico de capacitaciones y autoreportes con distintos perfiles de riesgo
    const historico = [
      // Sofía: perfil de bajo riesgo (buena nota, buen autoreporte)
      { idx: 0, notas: [90, 95], likerts: [5, 4], comentarios: ["Todo en orden en el equipo.", ""] },
      // Diego: perfil de riesgo medio (nota regular, autoreporte con alerta textual)
      { idx: 1, notas: [65], likerts: [2], comentarios: ["No llegamos a seguir todos los pasos del procedimiento por la carga de trabajo."] },
      // Valentina: perfil de bajo riesgo
      { idx: 2, notas: [88], likerts: [4], comentarios: ["Bien, sin observaciones."] },
      // Nicolás: perfil de alto riesgo (nota baja + autoreporte bajo + alerta textual)
      { idx: 3, notas: [45, 50], likerts: [1, 2], comentarios: ["Hay mucha presión y no da el tiempo para revisar todo.", "Seguimos con el mismo problema de siempre."] },
    ];

    for (const perfil of historico) {
      const idColaborador = idsColaboradores[perfil.idx].id;

      for (let i = 0; i < perfil.notas.length; i++) {
        const diasAtras = (perfil.notas.length - i) * 30;
        await pool.query(
          `INSERT INTO registro_capacitacion (id_colaborador, id_capacitacion, nota, fecha)
           VALUES ($1, $2, $3, CURRENT_DATE - $4::int)`,
          [idColaborador, idCapacitacion, perfil.notas[i], diasAtras]
        );
      }

      for (let i = 0; i < perfil.likerts.length; i++) {
        const diasAtras = (perfil.likerts.length - i) * 30;
        await pool.query(
          `INSERT INTO autoreporte (id_colaborador, puntaje_likert, comentario, fecha)
           VALUES ($1, $2, $3, CURRENT_DATE - $4::int)`,
          [idColaborador, perfil.likerts[i], perfil.comentarios[i] || null, diasAtras]
        );
      }
    }

    console.log("Colaboradores de distintas áreas e histórico cargados correctamente.");
    console.log("Todos con contraseña: Regutech2026!");
    process.exit(0);
  } catch (error) {
    console.error("Error al cargar histórico:", error);
    process.exit(1);
  }
}

seedHistorico();
