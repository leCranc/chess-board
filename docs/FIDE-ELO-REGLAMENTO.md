# Reglamento FIDE de Rating (Elo)

**Fuente:** FIDE Rating Regulations — efectivo desde 1 de marzo de 2024
**Documento original:** https://handbook.fide.com/chapter/B022024

---

## Rating Inicial (jugadores nuevos)

**Requisitos:**
- Mínimo 5 partidas contra rivales con rating FIDE
- Pueden ser de distintos torneos dentro de 26 meses consecutivos
- Si el jugador saca 0% en su primer torneo, ese torneo se descarta

**Cálculo:**
1. `Ra` = promedio de rating de los oponentes **con rating**
2. Si **performance = 50%** → `Ru = Ra`
3. Si **performance > 50%** → `Ru = Ra + 20` por cada medio punto sobre 50%
4. Si **performance < 50%** → `Ru = Ra + dp` (dp se obtiene de la tabla de conversión p→dp)
5. Se redondea al entero más cercano
6. Rating publicado mínimo: **1000**

---

## Cambio de Rating (jugadores con rating)

### Por partida:
1. `D` = diferencia de rating entre jugador y oponente
   - Si `D > 400` → se cuenta como 400 (máximo **una vez por torneo**, la diferencia más grande)
2. Buscar `PD` (probabilidad esperada) en la tabla de conversión D→PD
3. `ΔR partida` = resultado (1 / 0.5 / 0) - PD
4. Cambio total del período: `ΣΔR × K`
5. Se redondea al entero más cercano (el 0.5 se redondea hacia afuera del cero)

### Tabla de conversión rápida:

| Diferencia D | PD (fuerte) | PD (débil) |
|---|---|---|
| 0-3 | 0.50 | 0.50 |
| 4-10 | 0.51 | 0.49 |
| 11-17 | 0.52 | 0.48 |
| 18-25 | 0.53 | 0.47 |
| ... | ... | ... |
| 198-206 | 0.76 | 0.24 |
| 345-357 | 0.89 | 0.11 |
| > 735 | 1.00 | 0.00 |

*(Ver documento original para tabla completa)*

---

## Factor K (coeficiente de desarrollo)

| Situación | K |
|---|---|
| Nuevo en la lista (hasta 30 partidas) | 40 |
| Menor de 18 años con rating < 2300 | 40 |
| Rating < 2400 | 20 |
| Rating publicado ≥ 2400 alguna vez | 10 |
| Límite: si `n_partidas × K > 700`, se reduce K | K = floor(700/n) |

---

## Diferencias con el sistema actual del torneo (K=32, recálculo completo)

| Sistema | Torneo actual | FIDE |
|---|---|---|
| K | Fijo 32 | Variable (40/20/10) |
| Cálculo | Recalcula todo desde 1500 | Acumula/substrae cambios |
| Nuevos jugadores | Rating base 1500 | Depende del promedio de oponentes |
| Diferencia máxima | Sin límite | 400 (1 vez por torneo) |
| Tabla de conversión | Fórmula 1/(1+10^((Rb-Ra)/400)) | Tabla oficial con valores discretos |

---

*Documentado el 2026-05-25 desde el reglamento oficial FIDE.*
