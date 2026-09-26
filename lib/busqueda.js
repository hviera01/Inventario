(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Busqueda = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const CLAVES = ['id_activo', 'codigo', 'categoria', 'nomenclatura', 'nombre', 'descripcion', 'proveedor', 'mac', 'tipo', 'ip', 'ubicacion', 'cantidad', 'departamento', 'responsable', 'marca', 'modelo', 'serie'];
  const IDENT = new Set(['mac', 'ip', 'serie', 'codigo', 'id_activo']);

  const ALIAS = {
    id: 'id_activo', idactivo: 'id_activo', codigo: 'codigo', cod: 'codigo', cat: 'categoria', categoria: 'categoria',
    nomen: 'nomenclatura', nomenclatura: 'nomenclatura', nombre: 'nombre', equipo: 'nombre', desc: 'descripcion', descripcion: 'descripcion',
    prov: 'proveedor', proveedor: 'proveedor', mac: 'mac', tipo: 'tipo', ip: 'ip', ubi: 'ubicacion', ubicacion: 'ubicacion',
    cant: 'cantidad', cantidad: 'cantidad', dep: 'departamento', depto: 'departamento', departamento: 'departamento',
    resp: 'responsable', responsable: 'responsable', marca: 'marca', modelo: 'modelo', serie: 'serie', sn: 'serie',
  };

  const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = (s) => sinAcentos(String(s == null ? '' : s).toLowerCase());
  const compacto = (s) => norm(s).replace(/[^a-z0-9]/g, '');
  const palabras = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

  function distancia(a, b, max) {
    if (a === b) return 0;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let prev2 = null;
    let prev = Array.from({ length: lb + 1 }, (_, j) => j);
    for (let i = 1; i <= la; i++) {
      const cur = [i];
      let minFila = i;
      for (let j = 1; j <= lb; j++) {
        const costo = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + costo);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v;
        if (v < minFila) minFila = v;
      }
      if (minFila > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[lb];
  }

  function esFuzzyPosible(t) {
    if (t.length < 4) return false;
    const letras = (t.match(/[a-z]/g) || []).length;
    return letras >= Math.ceil(t.length * 0.6);
  }
  function parecida(t, w) {
    const max = t.length >= 8 ? 2 : 1;
    if (distancia(t, w, max) <= max) return true;
    if (w.length > t.length && distancia(t, w.slice(0, t.length), 1) <= 1 && t.length >= 5) return true;
    return false;
  }

  function construirIndice(filas) {
    return filas.map((f) => {
      const campos = {};
      const comp = {};
      const pal = new Set();
      const partes = [];
      for (const k of CLAVES) {
        const v = f[k] == null ? '' : String(f[k]);
        const n = norm(v);
        campos[k] = n;
        if (IDENT.has(k)) comp[k] = compacto(v);
        if (n) { partes.push(n); for (const w of palabras(v)) pal.add(w); }
      }
      const porCampo = {};
      for (const k of CLAVES) porCampo[k] = campos[k] ? new Set(palabras(campos[k])) : new Set();
      return { fila: f, campos, comp, hay: partes.join(' \u0001 '), pal: [...pal], porCampo };
    });
  }

  function tokenizar(q) {
    const tokens = [];
    const re = /(-?)(?:([a-zA-Z_]+):)?(?:"([^"]*)"|(\S+))/g;
    let m;
    while ((m = re.exec(q))) {
      const neg = m[1] === '-';
      let campo = null;
      let texto = m[3] !== undefined ? m[3] : m[4];
      const cita = m[3] !== undefined;
      if (m[2]) {
        const c = ALIAS[m[2].toLowerCase()];
        if (c) campo = c; else texto = `${m[2]}:${texto}`;
      }
      if (!texto || !texto.trim()) continue;
      tokens.push({ neg, campo, texto: texto.trim(), cita });
    }
    return tokens;
  }

  function coincide(ix, tk) {
    const nt = norm(tk.texto);
    if (!nt) return 3;
    const ct = compacto(tk.texto);
    const pareceId = /[0-9]/.test(ct) && /[:.\-_/\s]|^[0-9a-f]{6,}$/i.test(tk.texto) && ct.length >= 4;
    if (tk.campo) {
      if (ix.campos[tk.campo].includes(nt)) return 3;
      if (IDENT.has(tk.campo) && ct.length >= 3 && ix.comp[tk.campo].includes(ct)) return 3;
      if (!tk.cita && esFuzzyPosible(nt)) {
        for (const w of ix.porCampo[tk.campo]) if (parecida(nt, w)) return 1;
      }
      return 0;
    }
    if (ix.hay.includes(nt)) return 3;
    if (pareceId) for (const k of IDENT) if (ix.comp[k] && ix.comp[k].includes(ct)) return 3;
    if (!tk.cita && esFuzzyPosible(nt)) {
      for (const w of ix.pal) if (parecida(nt, w)) return 1;
    }
    return 0;
  }

  function buscar(indice, consulta) {
    const tokens = tokenizar(consulta || '');
    const positivos = tokens.filter((t) => !t.neg);
    const negativos = tokens.filter((t) => t.neg);
    if (!tokens.length) return { filas: indice.map((i) => i.fila), aproximado: false, relajado: false };

    const sinNegativos = indice.filter((ix) => !negativos.some((t) => coincide(ix, { ...t, cita: true }) === 3));
    if (!positivos.length) return { filas: sinNegativos.map((i) => i.fila), aproximado: false, relajado: false };

    const evaluados = sinNegativos.map((ix) => {
      let ok = 0, aprox = 0;
      for (const t of positivos) {
        const r = coincide(ix, t);
        if (r) { ok += 1; if (r === 1) aprox += 1; }
      }
      return { ix, ok, aprox };
    });
    const exactas = evaluados.filter((e) => e.ok === positivos.length && e.aprox === 0).map((e) => e.ix.fila);
    const aprox = evaluados.filter((e) => e.ok === positivos.length && e.aprox > 0).map((e) => e.ix.fila);
    if (exactas.length || aprox.length) return { filas: [...exactas, ...aprox], aproximado: aprox.length > 0, relajado: false, exactas: exactas.length };

    if (positivos.length > 1) {
      const minimo = Math.ceil(positivos.length / 2);
      const rel = evaluados.filter((e) => e.ok >= minimo).sort((a, b) => b.ok - a.ok);
      if (rel.length) return { filas: rel.map((e) => e.ix.fila), aproximado: true, relajado: true, exactas: 0 };
    }
    return { filas: [], aproximado: false, relajado: false, exactas: 0 };
  }

  function filtrar(filas, filtros, excluirCampo) {
    if (!filtros) return filas;
    const valores = filtros.valores || {};
    const vacios = filtros.vacios || [];
    const llenos = filtros.llenos || [];
    const sets = Object.entries(valores).filter(([c, v]) => v && v.length && c !== excluirCampo).map(([c, v]) => [c, new Set(v)]);
    const textos = Object.entries(filtros.texto || {}).filter(([c, v]) => v && String(v).trim() && c !== excluirCampo).map(([c, v]) => [c, norm(v).trim()]);
    return filas.filter((f) => {
      for (const [c, s] of sets) {
        const v = String(f[c] == null ? '' : f[c]);
        if (!s.has(v.trim() === '' ? '' : v)) return false;
      }
      for (const [c, t] of textos) if (!norm(f[c]).includes(t)) return false;
      for (const c of vacios) if (c !== excluirCampo && String(f[c] || '').trim() !== '') return false;
      for (const c of llenos) if (c !== excluirCampo && String(f[c] || '').trim() === '') return false;
      return true;
    });
  }

  function conteos(filas, campo) {
    const m = new Map();
    let vacios = 0;
    for (const f of filas) {
      const v = String(f[campo] == null ? '' : f[campo]);
      if (!v.trim()) { vacios += 1; continue; }
      m.set(v, (m.get(v) || 0) + 1);
    }
    return { valores: [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')), vacios };
  }

  const PLACEHOLDER = new Set(['na', 'nd', 'no', 'ninguno', 'ninguna', 'sinserie', 'sinmac', 'sinip', 'noaplica', 'noesta', 'pendiente', 'null', 'none', 'nt', 'sn']);
  const TIPOS_DUP = [
    { tipo: 'mac', etiqueta: 'MAC', campo: 'mac', min: 6 },
    { tipo: 'ip', etiqueta: 'IP', campo: 'ip', min: 7 },
    { tipo: 'serie', etiqueta: 'No. Serie', campo: 'serie', min: 4 },
    { tipo: 'codigo', etiqueta: 'Código en Inventario', campo: 'codigo', min: 1 },
    { tipo: 'id_activo', etiqueta: 'ID Activo', campo: 'id_activo', min: 1 },
    { tipo: 'nombre', etiqueta: 'Nombre', campo: 'nombre', min: 3, probable: true },
  ];

  function valorClave(tipo, v) {
    if (tipo === 'ip') return String(v).trim().replace(/\s+/g, '');
    if (tipo === 'nombre') return compacto(v);
    return compacto(v);
  }

  function duplicados(filas, ignorados) {
    const ign = new Set(ignorados || []);
    const grupos = [];
    for (const t of TIPOS_DUP) {
      const m = new Map();
      for (const f of filas) {
        const raw = f[t.campo];
        if (raw == null || String(raw).trim() === '') continue;
        const k = valorClave(t.tipo, raw);
        if (k.length < t.min || PLACEHOLDER.has(k) || /^(.)\1+$/.test(k)) continue;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(f);
      }
      for (const [k, lista] of m) {
        if (lista.length < 2) continue;
        const clave = `${t.tipo}:${k}`;
        grupos.push({ clave, tipo: t.tipo, etiqueta: t.etiqueta, probable: !!t.probable, valor: String(lista[0][t.campo]).trim(), filas: lista, ignorado: ign.has(clave) });
      }
    }
    return grupos;
  }

  function conflictosDe(filas, datos, exceptoId) {
    const res = [];
    for (const t of TIPOS_DUP) {
      if (t.probable) continue;
      const raw = datos[t.campo];
      if (raw == null || String(raw).trim() === '') continue;
      const k = valorClave(t.tipo, raw);
      if (k.length < t.min || PLACEHOLDER.has(k)) continue;
      const otras = filas.filter((f) => f.id !== exceptoId && !f.eliminado && f[t.campo] && valorClave(t.tipo, f[t.campo]) === k);
      if (otras.length) res.push({ campo: t.campo, etiqueta: t.etiqueta, filas: otras });
    }
    return res;
  }

  function separarDepartamento(valor) {
    const s = String(valor == null ? '' : valor);
    const i = s.indexOf('/');
    if (i <= 0 || i === s.length - 1) return null;
    const depto = s.slice(0, i).replace(/\s+/g, ' ').trim();
    const resp = s.slice(i + 1).replace(/\s+/g, ' ').trim();
    if (!depto || !resp) return null;
    return { depto, resp };
  }

  return { norm, compacto, buscar, construirIndice, tokenizar, filtrar, conteos, duplicados, conflictosDe, distancia, separarDepartamento, CLAVES };
});
