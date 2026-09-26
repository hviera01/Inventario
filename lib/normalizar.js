const {
  ESPACIOS_COLS, UNIFICAR_COLS, CLAVES, canonizar, colapsar, claveUnificar, formatearMac,
} = require('./campos');

function sinUnaLetra(largo, corto) {
  if (largo.length !== corto.length + 1) return false;
  const a = largo.toLowerCase();
  const b = corto.toLowerCase();
  let i = 0;
  while (i < b.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i);
}

const primeraPalabra = (v) => v.toLowerCase().split(' ')[0];

function completarNombres(valores) {
  const destino = new Map();
  for (const corto of valores) {
    if (corto.length < 6) continue;
    let mejor = null;
    for (const largo of valores) {
      if (sinUnaLetra(largo, corto) && primeraPalabra(largo) === primeraPalabra(corto)) mejor = mejor && mejor.length >= largo.length ? mejor : largo;
    }
    if (mejor) destino.set(corto, mejor);
  }
  return destino;
}

function normalizarLote(filas) {
  const out = filas.map((f) => ({ ...f }));
  const cambios = [];
  const anotar = (i, campo, antes, despues) => {
    if (antes !== despues) cambios.push({ fila: i + 1, campo, antes, despues });
  };

  out.forEach((f, i) => {
    if (f.mac !== undefined && f.mac !== null) {
      const antes = String(f.mac);
      f.mac = canonizar('mac', antes);
      anotar(i, 'mac', antes, f.mac);
    }
    for (const c of ESPACIOS_COLS) {
      if (f[c] === undefined || f[c] === null) continue;
      const antes = String(f[c]);
      f[c] = canonizar(c, antes);
      anotar(i, c, antes, f[c]);
    }
  });

  for (const c of UNIFICAR_COLS) {
    const grupos = new Map();
    out.forEach((f) => {
      const v = f[c];
      if (!v) return;
      const k = claveUnificar(v);
      if (!grupos.has(k)) grupos.set(k, new Map());
      const g = grupos.get(k);
      g.set(v, (g.get(v) || 0) + 1);
    });
    const canon = new Map();
    for (const [k, g] of grupos) {
      if (g.size < 2) continue;
      let mejor = null;
      for (const [v, n] of g) if (!mejor || n > mejor.n) mejor = { v, n };
      canon.set(k, mejor.v);
    }
    out.forEach((f, i) => {
      const v = f[c];
      if (!v) return;
      const dest = canon.get(claveUnificar(v));
      if (dest && dest !== v) {
        anotar(i, c, v, dest);
        f[c] = dest;
      }
    });
  }
  const nombres = [...new Set(out.map((f) => f.responsable).filter(Boolean))];
  const completos = completarNombres(nombres);
  out.forEach((f, i) => {
    const dest = completos.get(f.responsable);
    if (dest) {
      anotar(i, 'responsable', f.responsable, dest);
      f.responsable = dest;
    }
  });
  return { filas: out, cambios };
}

function canonizarEntrada(datos, existentes) {
  const r = { ...datos };
  for (const c of CLAVES) {
    if (typeof r[c] === 'string') r[c] = canonizar(c, r[c], existentes);
  }
  return r;
}

module.exports = { normalizarLote, canonizarEntrada, colapsar, formatearMac };
