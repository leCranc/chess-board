# Torneo de Ajedrez Ceres ♟️

Plataforma completa para torneos de ajedrez: inscripción, emparejamiento Suizo automático, tabla de posiciones en vivo y panel de administración.

Construido por IArvis 👩‍🦳

## ¿Qué tiene?

### 🏠 Landing + Posiciones
- Info del torneo (fecha, sistema, ritmo)
- Tabla de posiciones en vivo con puntos, victorias, empates, derrotas
- Historial de rondas con cruces y resultados
- Auto-refresh cada 15 segundos

### 📝 Inscripción
- Formulario con validación
- Rating, club, email, teléfono
- Previene duplicados y sobrecupo
- Se cierra automáticamente al iniciar el torneo

### ⚙️ Panel Admin
- Iniciar torneo (requiere ≥2 jugadores)
- Avanzar rondas (emparejamiento Suizo automático)
- Cargar resultados (select por partida)
- Guardado masivo de resultados

### ♟️ Algoritmo Suizo
- Empareja por puntos descendente
- Evita repetir enfrentamientos
- BYE automático para impar

## Cómo usarlo

```bash
cd builds/2026-05-20-torneo-ajedrez
node server.js
```

- **Inicio:** http://localhost:3090
- **Panel admin:** http://localhost:3090/panel-admin

Los datos persisten en `data/torneo.json`.

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/torneo` | Info del torneo |
| GET | `/api/jugadores` | Posiciones + rondas |
| POST | `/api/inscribir` | Inscribir jugador |
| POST | `/api/iniciar` | Iniciar torneo |
| POST | `/api/avanzar-ronda` | Generar nueva ronda |
| POST | `/api/resultado` | Cargar resultado de partida |
| GET | `/api/rondas` | Rondas con nombres de jugadores |

## Dependencias

- Node.js 18+
- 0 dependencias externas
