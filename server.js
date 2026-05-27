const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3090;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'torneo.json');
const DB_JUGADORES_PATH = path.join(DATA_DIR, 'jugadores.json');
const DB_TORNEOS_PATH = path.join(DATA_DIR, 'torneos.json');

// ── Load/Save Torneo ───────────────────────────

function loadTorneo() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
  catch { return { jugadores: [], rondas: [] }; }
}

function saveTorneo(t) {
  fs.writeFileSync(DB_PATH, JSON.stringify(t, null, 2));
}

// ── Load/Save Base de Jugadores ────────────────

function loadJugadoresBase() {
  try { return JSON.parse(fs.readFileSync(DB_JUGADORES_PATH, 'utf-8')); }
  catch { return []; }
}

function saveJugadoresBase(lista) {
  fs.writeFileSync(DB_JUGADORES_PATH, JSON.stringify(lista, null, 2));
}

// ── Load/Save Historial de Torneos ────────────

function loadHistorialTorneos() {
  try { return JSON.parse(fs.readFileSync(DB_TORNEOS_PATH, 'utf-8')); }
  catch { return []; }
}

function saveHistorialTorneos(lista) {
  fs.writeFileSync(DB_TORNEOS_PATH, JSON.stringify(lista, null, 2));
}
// ── Cálculo Elo ────────────────────────────────

const K_FACTOR = 32;

function calcularEloEsperado(Ra, Rb) {
  return 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
}

function recalcularElos(jugadores, rondas) {
  // Asignar Elo base 1500 a quienes tengan 0 (no inicializado)
  jugadores.forEach(j => { if (!j.elo || j.elo === 0) j.elo = 1500; });

  // Crear mapa de resultados para recalcular desde cero
  // Inicializar Elos base (los que tenían al empezar el torneo)
  jugadores.forEach(j => {
    j.elo = j.elo_inicial || 1500;
  });

  for (const r of rondas) {
    for (const p of r.partidas) {
      if (!p.resultado || p.negras === null) continue;

      const blanco = jugadores.find(j => j.id === p.blancas);
      const negro = jugadores.find(j => j.id === p.negras);
      if (!blanco || !negro) continue;

      let Sa_blanco, Sa_negro;
      if (p.resultado === '1-0') { Sa_blanco = 1; Sa_negro = 0; }
      else if (p.resultado === '0-1') { Sa_blanco = 0; Sa_negro = 1; }
      else if (p.resultado === '1/2-1/2') { Sa_blanco = 0.5; Sa_negro = 0.5; }
      else continue;

      const Ea_blanco = calcularEloEsperado(blanco.elo, negro.elo);
      const Ea_negro = calcularEloEsperado(negro.elo, blanco.elo);

      blanco.elo = Math.round(blanco.elo + K_FACTOR * (Sa_blanco - Ea_blanco));
      negro.elo = Math.round(negro.elo + K_FACTOR * (Sa_negro - Ea_negro));
    }
  }
}

// ── Recalcular puntos y desempates ─────────────

function recalcularPuntajes(jugadores, rondas) {
  jugadores.forEach(j => { j.puntos = 0; j.desempate = 0; j.victorias = 0; j.empates = 0; j.derrotas = 0; });

  for (const r of rondas) {
    for (const p of r.partidas) {
      const blanco = jugadores.find(j => j.id === p.blancas);
      const negro = p.negras ? jugadores.find(j => j.id === p.negras) : null;
      if (!blanco) continue;

      if (p.resultado === '1-0') { blanco.puntos += 1; blanco.victorias += 1; if (negro) { negro.derrotas += 1; } }
      else if (p.resultado === '0-1') { if (negro) { negro.puntos += 1; negro.victorias += 1; } blanco.derrotas += 1; }
      else if (p.resultado === '1/2-1/2') { blanco.puntos += 0.5; blanco.empates += 1; if (negro) { negro.puntos += 0.5; negro.empates += 1; } }
    }
  }

  // Buchholz y Sonneborn
  for (const jugador of jugadores) {
    let buchholz = 0;
    let sonneborn = 0;

    for (const r of rondas) {
      for (const p of r.partidas) {
        let oponenteId = null;
        let resultadoJugador = null;

        if (p.blancas === jugador.id) {
          oponenteId = p.negras;
          resultadoJugador = p.resultado === '1-0' ? 'win' : p.resultado === '0-1' ? 'loss' : p.resultado === '1/2-1/2' ? 'draw' : null;
        } else if (p.negras === jugador.id) {
          oponenteId = p.blancas;
          resultadoJugador = p.resultado === '0-1' ? 'win' : p.resultado === '1-0' ? 'loss' : p.resultado === '1/2-1/2' ? 'draw' : null;
        }

        if (oponenteId && resultadoJugador) {
          const oponente = jugadores.find(j => j.id === oponenteId);
          if (oponente) {
            buchholz += oponente.puntos;
            if (resultadoJugador === 'win') sonneborn += oponente.puntos;
            else if (resultadoJugador === 'draw') sonneborn += oponente.puntos / 2;
          }
        }
      }
    }

    jugador.buchholz = buchholz;
    jugador.sonneborn = sonneborn;
    jugador.desempate = buchholz;
  }
}

// ── Recalcular todo (puntos, Elo, rondas si torneo iniciado) ──

function recalcularTodo(t) {
  if (t.torneo_iniciado) {
    recalcularElos(t.jugadores, t.rondas);
  }
  recalcularPuntajes(t.jugadores, t.rondas);
}

// ── Swiss pairing algorithm ─────────────────────

function generarEmparejamientoSuizo(jugadores, rondasExistentes) {
  const ordenados = [...jugadores].sort((a, b) => {
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    if ((b.buchholz || 0) !== (a.buchholz || 0)) return (b.buchholz || 0) - (a.buchholz || 0);
    return (b.elo || b.rating || 0) - (a.elo || a.rating || 0);
  });

  // Historial de enfrentamientos
  const enfrentados = {};
  for (const ronda of rondasExistentes) {
    for (const partida of ronda.partidas) {
      if (partida.negras === null) continue;
      if (!enfrentados[partida.blancas]) enfrentados[partida.blancas] = new Set();
      if (!enfrentados[partida.negras]) enfrentados[partida.negras] = new Set();
      enfrentados[partida.blancas].add(partida.negras);
      enfrentados[partida.negras].add(partida.blancas);
    }
  }

  const pairings = [];
  const usados = new Set();
  const ids = ordenados.map(j => j.id);

  for (const id of ids) {
    if (usados.has(id)) continue;
    usados.add(id);

    const jugador = ordenados.find(j => j.id === id);
    let oponente = null;

    // Buscar mejor oponente: mismos puntos, no enfrentado antes
    for (const candidato of ordenados) {
      if (usados.has(candidato.id)) continue;
      if (candidato.id === id) continue;
      if (enfrentados[id]?.has(candidato.id)) continue;
      if (jugador.puntos === candidato.puntos) {
        oponente = candidato;
        break;
      }
    }

    if (!oponente) {
      for (const candidato of ordenados) {
        if (usados.has(candidato.id)) continue;
        if (candidato.id === id) continue;
        if (enfrentados[id]?.has(candidato.id)) continue;
        oponente = candidato;
        break;
      }
    }

    if (oponente) {
      usados.add(oponente.id);
      const blancas = pairings.length % 2 === 0 ? id : oponente.id;
      const negras = blancas === id ? oponente.id : id;
      pairings.push({ blancas, negras, resultado: null });
    } else {
      pairings.push({ blancas: id, negras: null, resultado: '1-0' });
    }
  }

  return pairings;
}

// ── MIME types ─────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// ── Router ─────────────────────────────────────

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Invalid JSON')); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── API ────────────────────────────────────

  if (pathname === '/api/config' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const t = loadTorneo();

      if (t.torneo_iniciado) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'No se puede cambiar la configuración con el torneo iniciado' }));
        return;
      }

      if (body.cupo_maximo !== undefined) {
        const n = parseInt(body.cupo_maximo);
        if (isNaN(n) || n < 0) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'cupo_maximo debe ser >= 0 (0 = sin límite)' }));
          return;
        }
        if (n > 0 && n < t.jugadores.length) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: `Ya hay ${t.jugadores.length} jugadores inscriptos. No se puede bajar a ${n}.` }));
          return;
        }
        t.cupo_maximo = n;
      }

      if (body.rondas_total !== undefined) {
        const n = parseInt(body.rondas_total);
        if (isNaN(n) || n < 1 || n > 20) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'rondas_total debe ser entre 1 y 20' }));
          return;
        }
        t.rondas_total = n;
      }

      // Nuevos campos de configuración
      if (body.lugar !== undefined) t.lugar = body.lugar.trim();
      if (body.fecha !== undefined) t.fecha = body.fecha;
      if (body.ritmo !== undefined) t.ritmo = body.ritmo.trim();
      if (body.nombre !== undefined) t.nombre = body.nombre.trim();
      if (body.ciudad !== undefined) t.ciudad = body.ciudad.trim();
      if (body.provincia !== undefined) t.provincia = body.provincia.trim();
      if (body.pais !== undefined) t.pais = body.pais.trim();

      saveTorneo(t);
      res.end(JSON.stringify({ ok: true, cupo_maximo: t.cupo_maximo, rondas_total: t.rondas_total, nombre: t.nombre, lugar: t.lugar, ciudad: t.ciudad, provincia: t.provincia, pais: t.pais, fecha: t.fecha, ritmo: t.ritmo }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Datos inválidos' }));
    }
    return;
  }

  if (pathname === '/api/torneo' && req.method === 'GET') {
    const t = loadTorneo();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      nombre: t.nombre,
      fecha: t.fecha,
      lugar: t.lugar,
      ciudad: t.ciudad,
      provincia: t.provincia,
      pais: t.pais,
      sistema: t.sistema,
      rondas_total: t.rondas_total || 7,
      ritmo: t.ritmo,
      inscripcion_abierta: t.inscripcion_abierta,
      cupo_maximo: t.cupo_maximo,
      jugadores_count: t.jugadores.length,
      ronda_actual: t.rondas.length,
      torneo_iniciado: t.torneo_iniciado || false,
      torneo_finalizado: t.torneo_finalizado || false,
    }));
    return;
  }

  if (pathname === '/api/jugadores' && req.method === 'GET') {
    const t = loadTorneo();
    res.writeHead(200, { 'Content-Type': 'application/json' });

    const ordenados = [...t.jugadores].sort((a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      if ((b.buchholz || 0) !== (a.buchholz || 0)) return (b.buchholz || 0) - (a.buchholz || 0);
      if ((b.sonneborn || 0) !== (a.sonneborn || 0)) return (b.sonneborn || 0) - (a.sonneborn || 0);
      return (b.elo || b.rating || 0) - (a.elo || a.rating || 0);
    });

    res.end(JSON.stringify({
      jugadores: ordenados,
      rondas: t.rondas,
    }));
    return;
  }

  // ── GET /api/jugadores-base ──────────────────

  if (pathname === '/api/jugadores-base' && req.method === 'GET') {
    const base = loadJugadoresBase();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(base));
    return;
  }

  // ── POST /api/inscribir ──────────────────────

  if (pathname === '/api/inscribir' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { nombre, email, telefono, club } = body;

      if (!nombre || nombre.trim().length < 2) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Nombre requerido (mín 2 caracteres)' }));
        return;
      }

      const t = loadTorneo();

      if (t.torneo_iniciado) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'El torneo ya comenzó. No se aceptan más inscripciones.' }));
        return;
      }

      if (t.jugadores.length >= t.cupo_maximo && t.cupo_maximo > 0) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Cupo completo' }));
        return;
      }

      const exists = t.jugadores.some(j => j.nombre.toLowerCase() === nombre.trim().toLowerCase());
      if (exists) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Ya hay un jugador registrado con ese nombre' }));
        return;
      }

      // Chequear si existe en la base de jugadores
      const base = loadJugadoresBase();
      const baseIdx = base.findIndex(j => j.nombre.toLowerCase() === nombre.trim().toLowerCase());

      let jugadorBase = null;
      if (baseIdx >= 0) {
        jugadorBase = base[baseIdx];
      }

      let eloJugador = 1500;
      if (baseIdx >= 0 && base[baseIdx].elo) {
        eloJugador = base[baseIdx].elo;
      }

      const jugador = {
        id: t.jugadores.length + 1,
        nombre: nombre.trim(),
        email: (email || jugadorBase?.email || '').trim(),
        elo: eloJugador,
        elo_inicial: eloJugador,
        telefono: (telefono || jugadorBase?.telefono || '').trim(),
        club: (club || jugadorBase?.club || '').trim(),
        fecha_inscripcion: new Date().toISOString(),
        puntos: 0,
        desempate: 0,
        victorias: 0,
        empates: 0,
        derrotas: 0,
      };

      // Actualizar o crear en la base de jugadores
      if (baseIdx >= 0) {
        base[baseIdx] = {
          ...base[baseIdx],
          email: jugador.email,
          telefono: jugador.telefono,
          club: jugador.club,
          historial: [...(base[baseIdx].historial || []), { torneo: t.nombre || 'Torneo Ceres', puntaje: 0, fecha: new Date().toISOString() }]
        };
      } else {
        base.push({
          nombre: jugador.nombre,
          email: jugador.email,
          telefono: jugador.telefono,
          club: jugador.club,
          elo: 1500,
          historial: [{ torneo: t.nombre || 'Torneo Ceres', puntaje: 0, fecha: new Date().toISOString() }]
        });
      }
      saveJugadoresBase(base);

      t.jugadores.push(jugador);
      saveTorneo(t);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, jugador, conocido: baseIdx >= 0 }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Datos inválidos' }));
    }
    return;
  }

  // ── POST /api/inscribir-admin (admin: torneo iniciado) ─

  if (pathname === '/api/inscribir-admin' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { nombre, email, telefono, club } = body;

      if (!nombre || nombre.trim().length < 2) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Nombre requerido (mín 2 caracteres)' }));
        return;
      }

      const t = loadTorneo();

      // Solo admin puede inscribir con torneo iniciado, y solo hasta el 50% de rondas
      if (t.torneo_iniciado && !t.torneo_finalizado) {
        const rondasMax = Math.floor(t.rondas_total / 2);
        if (t.rondas.length >= rondasMax) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Inscripción tardía no permitida: ya pasó el 50% del torneo.' }));
          return;
        }
      }

      if (t.torneo_finalizado) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'El torneo ya finalizó.' }));
        return;
      }

      if (t.jugadores.length >= t.cupo_maximo && t.cupo_maximo > 0) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Cupo completo' }));
        return;
      }

      const exists = t.jugadores.some(j => j.nombre.toLowerCase() === nombre.trim().toLowerCase());
      if (exists) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Ya hay un jugador registrado con ese nombre' }));
        return;
      }

      const base = loadJugadoresBase();
      const baseIdx = base.findIndex(j => j.nombre.toLowerCase() === nombre.trim().toLowerCase());

      let eloJugador = 1500;
      if (baseIdx >= 0 && base[baseIdx].elo) {
        eloJugador = base[baseIdx].elo;
      }

      const jugador = {
        id: t.jugadores.length + 1,
        nombre: nombre.trim(),
        email: (email || '').trim(),
        elo: eloJugador,
        elo_inicial: eloJugador,
        telefono: (telefono || '').trim(),
        club: (club || '').trim(),
        fecha_inscripcion: new Date().toISOString(),
        puntos: 0,
        desempate: 0,
        victorias: 0,
        empates: 0,
        derrotas: 0,
        inscripcion_tardia: t.torneo_iniciado ? true : false,
      };

      if (baseIdx >= 0) {
        base[baseIdx] = {
          ...base[baseIdx],
          email: jugador.email,
          telefono: jugador.telefono,
          club: jugador.club,
          historial: [...(base[baseIdx].historial || []), { torneo: t.nombre || 'Torneo Ceres', puntaje: 0, fecha: new Date().toISOString() }]
        };
      } else {
        base.push({
          nombre: jugador.nombre,
          email: jugador.email,
          telefono: jugador.telefono,
          club: jugador.club,
          elo: 1500,
          historial: [{ torneo: t.nombre || 'Torneo Ceres', puntaje: 0, fecha: new Date().toISOString() }]
        });
      }
      saveJugadoresBase(base);

      t.jugadores.push(jugador);
      saveTorneo(t);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, jugador, conocido: baseIdx >= 0, inscripcion_tardia: true }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Datos inválidos' }));
    }
    return;
  }

  // ── POST /api/editar-jugador ─────────────────

  if (pathname === '/api/editar-jugador' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { id, nombre, email, telefono, club } = body;

      if (!id) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'ID requerido' }));
        return;
      }

      const t = loadTorneo();
      const jugador = t.jugadores.find(j => j.id === id);

      if (!jugador) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Jugador no encontrado' }));
        return;
      }

      if (nombre && nombre.trim().length >= 2) {
        const duplicado = t.jugadores.find(j => j.id !== id && j.nombre.toLowerCase() === nombre.trim().toLowerCase());
        if (duplicado) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Ya existe otro jugador con ese nombre' }));
          return;
        }
        jugador.nombre = nombre.trim();
      }

      if (email !== undefined) jugador.email = email.trim();
      if (telefono !== undefined) jugador.telefono = telefono.trim();
      if (club !== undefined) jugador.club = club.trim();

      if (t.torneo_iniciado) {
        recalcularTodo(t);
      }

      saveTorneo(t);

      // Actualizar también en la base de jugadores
      const base = loadJugadoresBase();
      const baseIdx = base.findIndex(j => j.nombre.toLowerCase() === jugador.nombre.toLowerCase());
      if (baseIdx >= 0) {
        base[baseIdx].email = jugador.email;
        base[baseIdx].telefono = jugador.telefono;
        base[baseIdx].club = jugador.club;
        saveJugadoresBase(base);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, jugador }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Datos inválidos' }));
    }
    return;
  }

  // ── POST /api/eliminar-jugador ───────────────

  if (pathname === '/api/eliminar-jugador' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { id } = body;

      if (!id) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'ID requerido' }));
        return;
      }

      const t = loadTorneo();
      const idx = t.jugadores.findIndex(j => j.id === id);

      if (idx === -1) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Jugador no encontrado' }));
        return;
      }

      t.jugadores.splice(idx, 1);

      // Reasignar IDs para que sean contiguos
      t.jugadores.forEach((j, i) => j.id = i + 1);

      // Si el torneo ya empezó, regenerar rondas y recalcular
      if (t.torneo_iniciado) {
        // Regenerar rondas desde cero
        const nuevasRondas = [];
        const rondasTotal = t.rondas_total || 7;

        for (let i = 0; i < Math.min(t.rondas.length, rondasTotal); i++) {
          const pairings = generarEmparejamientoSuizo(t.jugadores, nuevasRondas);
          nuevasRondas.push({
            numero: i + 1,
            partidas: pairings.map(p => ({ ...p, resultado: null })),
          });
        }

        t.rondas = nuevasRondas;
        recalcularTodo(t);
      }

      saveTorneo(t);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Datos inválidos' }));
    }
    return;
  }

  if (pathname === '/api/iniciar' && req.method === 'POST') {
    const t = loadTorneo();
    if (t.jugadores.length < 2) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Se necesitan al menos 2 jugadores' }));
      return;
    }
    if (t.torneo_iniciado) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'El torneo ya está iniciado' }));
      return;
    }

    // Guardar elo_inicial para todos los jugadores
    t.jugadores.forEach(j => {
      j.elo = j.elo || 1500;
      j.elo_inicial = j.elo;
    });

    t.torneo_iniciado = true;
    t.torneo_finalizado = false;
    t.rondas = [];
    saveTorneo(t);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (pathname === '/api/finalizar-torneo' && req.method === 'POST') {
    const t = loadTorneo();
    if (!t.torneo_iniciado) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'El torneo no está iniciado' }));
      return;
    }
    if (t.torneo_finalizado) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'El torneo ya está finalizado' }));
      return;
    }
    t.torneo_finalizado = true;
    t.inscripcion_abierta = false;

    // Actualizar base de jugadores con Elo final
    const base = loadJugadoresBase();
    t.jugadores.forEach(j => {
      const idx = base.findIndex(b => b.nombre.toLowerCase() === j.nombre.toLowerCase());
      if (idx >= 0) {
        base[idx].elo = j.elo || 1500;
        if (!base[idx].historial) base[idx].historial = [];
        base[idx].historial.push({
          torneo: t.nombre,
          puntaje: j.puntos,
          posicion: '-',
          fecha: t.fecha || new Date().toISOString()
        });
      }
    });
    saveJugadoresBase(base);

    // Guardar en historial de torneos
    const historial = loadHistorialTorneos();
    historial.push({
      id: historial.length + 1,
      nombre: t.nombre,
      fecha: t.fecha,
      lugar: t.lugar,
      ciudad: t.ciudad,
      provincia: t.provincia,
      pais: t.pais,
      sistema: t.sistema,
      ritmo: t.ritmo,
      rondas_total: t.rondas_total,
      jugadores: t.jugadores.map(j => ({
        id: j.id, nombre: j.nombre, elo: j.elo || 1500,
        puntos: j.puntos, victorias: j.victorias, empates: j.empates, derrotas: j.derrotas,
        buchholz: j.buchholz, sonneborn: j.sonneborn
      })),
      rondas: t.rondas,
      finalizado: new Date().toISOString()
    });
    saveHistorialTorneos(historial);

    saveTorneo(t);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (pathname === '/api/nuevo-torneo' && req.method === 'POST') {
    const t = loadTorneo();
    if (t.torneo_iniciado && !t.torneo_finalizado) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Finalizá el torneo actual antes de crear uno nuevo' }));
      return;
    }
    const nuevo = {
      nombre: t.nombre || 'Torneo de Ajedrez Ceres',
      fecha: '',
      lugar: '',
      sistema: 'Suizo',
      rondas_total: t.rondas_total || 7,
      ritmo: '',
      inscripcion_abierta: true,
      cupo_maximo: 0,
      torneo_iniciado: false,
      torneo_finalizado: false,
      jugadores: [],
      rondas: [],
    };
    saveTorneo(nuevo);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (pathname === '/api/torneos-historial' && req.method === 'GET') {
    const historial = loadHistorialTorneos();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(historial));
    return;
  }

  if (pathname === '/api/avanzar-ronda' && req.method === 'POST') {
    const t = loadTorneo();
    if (!t.torneo_iniciado) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'El torneo no está iniciado' }));
      return;
    }
    if (t.torneo_finalizado) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'El torneo ya está finalizado' }));
      return;
    }
    if (t.rondas.length >= (t.rondas_total || 7)) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Máximo de rondas alcanzado' }));
      return;
    }

    if (t.rondas.length > 0) {
      const ultima = t.rondas[t.rondas.length - 1];
      const sinResultado = ultima.partidas.filter(p => p.resultado === null);
      if (sinResultado.length > 0) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: `Faltan resultados en la ronda ${t.rondas.length}: ${sinResultado.length} partida(s)` }));
        return;
      }
    }

    const rondaNum = t.rondas.length + 1;
    const pairings = generarEmparejamientoSuizo(t.jugadores, t.rondas);

    const ronda = {
      numero: rondaNum,
      partidas: pairings,
    };

    t.rondas.push(ronda);
    saveTorneo(t);

    res.writeHead(201);
    res.end(JSON.stringify({ ok: true, ronda }));
    return;
  }

  if (pathname === '/api/resultado' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { ronda_numero, blancas_id, negras_id, resultado } = body;

      if (!['1-0', '0-1', '1/2-1/2'].includes(resultado)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Resultado inválido. Usar: 1-0, 0-1, 1/2-1/2' }));
        return;
      }

      const t = loadTorneo();
      const ronda = t.rondas.find(r => r.numero === ronda_numero);
      if (!ronda) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Ronda no encontrada' }));
        return;
      }

      const partida = ronda.partidas.find(p => p.blancas === blancas_id && p.negras === negras_id);
      if (!partida) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Partida no encontrada' }));
        return;
      }

      partida.resultado = resultado;

      // Recalcular todo (puntos, desempates, Elo)
      recalcularTodo(t);
      saveTorneo(t);

      // Actualizar Elo en la base de jugadores
      const base = loadJugadoresBase();
      for (const jugador of t.jugadores) {
        const baseIdx = base.findIndex(j => j.nombre.toLowerCase() === jugador.nombre.toLowerCase());
        if (baseIdx >= 0) {
          base[baseIdx].elo = jugador.elo;
          // Actualizar historial con puntaje
          const ultimoHistorial = base[baseIdx].historial && base[baseIdx].historial.length > 0
            ? base[baseIdx].historial[base[baseIdx].historial.length - 1]
            : null;
          if (ultimoHistorial) {
            ultimoHistorial.puntaje = jugador.puntos;
          }
        }
      }
      saveJugadoresBase(base);

      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Datos inválidos' }));
    }
    return;
  }

  if (pathname === '/api/rondas' && req.method === 'GET') {
    const t = loadTorneo();
    res.writeHead(200, { 'Content-Type': 'application/json' });

    const rondasConNombres = t.rondas.map(r => ({
      ...r,
      partidas: r.partidas.map(p => {
        const blanco = t.jugadores.find(j => j.id === p.blancas);
        const negro = p.negras ? t.jugadores.find(j => j.id === p.negras) : null;
        return {
          ...p,
          blanco_nombre: blanco?.nombre || '?',
          negro_nombre: negro?.nombre || '(BYE)',
        };
      }),
    }));

    res.end(JSON.stringify(rondasConNombres));
    return;
  }

  // ── Exportar CSV ──

  if (pathname === '/api/exportar/csv' && req.method === 'GET') {
    const t = loadTorneo();

    // Ordenar igual que la tabla
    const ordenados = [...t.jugadores].sort((a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      if ((b.buchholz || 0) !== (a.buchholz || 0)) return (b.buchholz || 0) - (a.buchholz || 0);
      if ((b.sonneborn || 0) !== (a.sonneborn || 0)) return (b.sonneborn || 0) - (a.sonneborn || 0);
      return b.rating - a.rating;
    });

    let csv = 'Posición,Jugador,Club,Rating,Puntos,Victorias,Empates,Derrotas,Buchholz,Sonneborn\n';
    ordenados.forEach((j, i) => {
      csv += `${i + 1},"${j.nombre}","${j.club || ''}",${j.rating || 0},${j.puntos},${j.victorias || 0},${j.empates || 0},${j.derrotas || 0},${(j.buchholz || 0).toFixed(1)},${(j.sonneborn || 0).toFixed(1)}\n`;
    });

    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="posiciones.csv"',
    });
    res.end(csv);
    return;
  }

  // ── Exportar CSV de rondas ──

  if (pathname === '/api/exportar/rondas-csv' && req.method === 'GET') {
    const t = loadTorneo();

    let csv = 'Ronda,Mesa,Blancas,Negras,Resultado\n';
    for (const r of t.rondas) {
      r.partidas.forEach((p, i) => {
        const blanco = t.jugadores.find(j => j.id === p.blancas);
        const negro = p.negras ? t.jugadores.find(j => j.id === p.negras) : null;
        let res = p.resultado || '—';
        if (res === '1/2-1/2') res = '½-½';
        csv += `${r.numero},${i + 1},"${blanco?.nombre || '(BYE)'}","${negro?.nombre || '(BYE)'}",${res}\n`;
      });
    }

    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="rondas.csv"',
    });
    res.end(csv);
    return;
  }

  // ── Estadísticas ──

  if (pathname === '/api/estadisticas' && req.method === 'GET') {
    const t = loadTorneo();

    // Promedio de rating
    const ratings = t.jugadores.filter(j => j.rating > 0).map(j => j.rating);
    const ratingProm = ratings.length > 0 ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : 0;

    // Partidas jugadas
    let totalPartidas = 0;
    let decididas = 0;
    let empates = 0;
    let blancasGanan = 0;
    let negrasGanan = 0;

    for (const r of t.rondas) {
      for (const p of r.partidas) {
        if (p.resultado && p.negras !== null) {
          totalPartidas++;
          if (p.resultado === '1-0') { decididas++; blancasGanan++; }
          else if (p.resultado === '0-1') { decididas++; negrasGanan++; }
          else if (p.resultado === '1/2-1/2') { empates++; }
        }
      }
    }

    const stats = {
      total_jugadores: t.jugadores.length,
      rondas_completadas: t.rondas.length,
      total_partidas: totalPartidas,
      partidas_decididas: decididas,
      empates,
      blancas_ganan: blancasGanan,
      negras_ganan: negrasGanan,
      pct_blancas: totalPartidas > 0 ? Math.round((blancasGanan / totalPartidas) * 100) : 0,
      pct_empates: totalPartidas > 0 ? Math.round((empates / totalPartidas) * 100) : 0,
      rating_promedio: ratingProm,
      mejor_jugador: t.jugadores.length > 0 ? [...t.jugadores].sort((a, b) => b.puntos - a.puntos)[0]?.nombre : null,
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
    return;
  }


  // ── GET /api/historial-completo ────────────────

  if (pathname === '/api/historial-completo' && req.method === 'GET') {
    const torneos = loadHistorialTorneos();
    const jugadoresBase = loadJugadoresBase();

    // Compilar todas las partidas de todos los torneos
    const todasLasPartidas = [];
    torneos.forEach(t => {
      (t.rondas || []).forEach(r => {
        (r.partidas || []).forEach(p => {
          todasLasPartidas.push({
            torneo: t.nombre || t.lugar || 'Sin nombre',
            torneo_id: t.id,
            torneo_fecha: t.fecha,
            ronda: r.numero,
            blancas_id: p.blancas,
            negras_id: p.negras,
            resultado: p.resultado,
            blanco_nombre: p.blanco_nombre || null,
            negro_nombre: p.negro_nombre || null,
          });
        });
      });
    });

    // Para cada jugador, compilar sus partidas en todos los torneos
    const jugadoresConStats = jugadoresBase.map(j => {
      const partidasDelJugador = todasLasPartidas.filter(p =>
        p.blanco_nombre === j.nombre || p.negro_nombre === j.nombre
      );

      const ganadas = partidasDelJugador.filter(p =>
        (p.blanco_nombre === j.nombre && p.resultado === '1-0') ||
        (p.negro_nombre === j.nombre && p.resultado === '0-1')
      ).length;

      const perdidas = partidasDelJugador.filter(p =>
        (p.blanco_nombre === j.nombre && p.resultado === '0-1') ||
        (p.negro_nombre === j.nombre && p.resultado === '1-0')
      ).length;

      const empatadas = partidasDelJugador.filter(p => p.resultado === '1/2-1/2').length;

      return {
        nombre: j.nombre,
        email: j.email,
        telefono: j.telefono,
        club: j.club,
        elo: j.elo,
        partidas_totales: partidasDelJugador.length,
        ganadas,
        perdidas,
        empatadas,
        rendimiento: partidasDelJugador.length > 0 ? ((ganadas + empatadas * 0.5) / partidasDelJugador.length * 100).toFixed(1) + '%' : '—',
        torneos_jugados: j.historial ? j.historial.length : 0,
      };
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      torneos,
      jugadores: jugadoresConStats,
      partidas: todasLasPartidas,
      resumen: {
        total_torneos: torneos.length,
        total_jugadores: jugadoresBase.length,
        total_partidas: todasLasPartidas.length,
        ultimo_torneo: torneos.length > 0 ? torneos[torneos.length - 1].nombre || torneos[torneos.length - 1].lugar : null,
      }
    }));
    return;
  }

  // ── Static files ───────────────────────────

  const publicDir = path.join(__dirname, 'public');
  let filePath;

  if (pathname === '/' || pathname === '') {
    filePath = path.join(publicDir, 'index.html');
  } else if (pathname === '/panel-admin') {
    filePath = path.join(publicDir, 'admin.html');
  } else {
    filePath = path.join(publicDir, pathname);
  }

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`♟️ Torneo de Ajedrez - Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   Panel admin: http://localhost:${PORT}/panel-admin`);
  console.log(`   Datos: ${DB_PATH}`);
  console.log(`   Base jugadores: ${DB_JUGADORES_PATH}`);
});
