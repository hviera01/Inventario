(function () {
  const INV = window.INV;
  const { CLAVES } = window.Campos;
  const B = window.Busqueda;

  const oyentes = {};
  const bus = {
    on(ev, fn) { (oyentes[ev] = oyentes[ev] || new Set()).add(fn); return () => oyentes[ev].delete(fn); },
    emit(ev, d) { (oyentes[ev] || []).forEach((fn) => { try { fn(d); } catch (e) { console.error(e); } }); },
  };

  const guardado = (k, def = '') => { try { return localStorage.getItem(k) ?? def; } catch (_) { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { return; } };

  const cid = (() => {
    try {
      let v = sessionStorage.getItem('inv.cid');
      if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); sessionStorage.setItem('inv.cid', v); }
      return v;
    } catch (_) { return String(Math.random()).slice(2); }
  })();

  const S = {
    usuario: guardado('inv.nombre', ''),
    cid,
    local: false,
    rev: -1,
    activos: [],
    porId: new Map(),
    numero: new Map(),
    indice: [],
    existentes: {},
    ignorados: [],
    ajustes: {},
    presencia: [],
    conectado: true,
    cargando: true,
    consulta: '',
    filtros: { valores: {}, texto: {}, vacios: [], llenos: [] },
    orden: null,
    modoDup: false,
    modoPendiente: false,
    dupVerIgnorados: false,
    dupInfo: new Map(),
    dupGrupos: [],
    seleccion: new Set(),
    activoId: null,
    celda: null,
    vista: 'completa',
    recientes: new Map(),
    recienteIds: new Set(),
    resultado: { filas: [], aproximado: false, relajado: false },
    base: [],
  };

  async function pedir(metodo, ruta, cuerpo, opc = {}) {
    const cab = { 'X-Usuario': encodeURIComponent(S.usuario || 'Sin nombre') };
    let body;
    if (cuerpo instanceof ArrayBuffer || cuerpo instanceof Blob) { body = cuerpo; cab['Content-Type'] = 'application/octet-stream'; }
    else if (cuerpo !== undefined) { body = JSON.stringify(cuerpo); cab['Content-Type'] = 'application/json'; }
    let r;
    try {
      r = await fetch(ruta, { method: metodo, headers: cab, body, credentials: 'same-origin' });
    } catch (e) {
      setConectado(false);
      throw Object.assign(new Error('Sin conexión con el servidor'), { red: true });
    }
    setConectado(true);
    if (opc.blob && r.ok) return r.blob();
    let data = null;
    try { data = await r.json(); } catch (_) { data = null; }
    if (r.status === 401) { bus.emit('sin-sesion'); throw Object.assign(new Error((data && data.error) || 'No autenticado'), { status: 401, data }); }
    if (!r.ok) throw Object.assign(new Error((data && data.error) || `Error ${r.status}`), { status: r.status, data });
    return data;
  }

  function setConectado(v) {
    if (S.conectado !== v) { S.conectado = v; bus.emit('conexion'); }
  }

  const ordenar = (a, b) => (a.orden - b.orden) || (a.creado_en - b.creado_en) || (a.id < b.id ? -1 : 1);

  function reconstruir() {
    S.activos.sort(ordenar);
    S.porId = new Map(S.activos.map((f) => [f.id, f]));
    S.numero = new Map(S.activos.map((f, i) => [f.id, i + 1]));
    S.indice = B.construirIndice(S.activos);
    for (const id of [...S.seleccion]) if (!S.porId.has(id)) S.seleccion.delete(id);
    if (S.activoId && !S.porId.has(S.activoId)) S.activoId = null;
    memoConteos.clear();
    memoDup.rev = null;
    recalcular();
  }

  function ordenarPor(filas) {
    if (!S.orden) return filas;
    const { campo, dir } = S.orden;
    const col = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
    const vacio = (f) => !String(f[campo] || '').trim();
    return [...filas].sort((a, b) => {
      const va = vacio(a), vb = vacio(b);
      if (va !== vb) return va ? 1 : -1;
      return dir * col.compare(String(a[campo] || ''), String(b[campo] || ''));
    });
  }

  const CAMPO_DUP = { mac: 'mac', ip: 'ip', serie: 'serie', codigo: 'codigo', id_activo: 'id_activo' };

  function calcularDup() {
    const grupos = duplicados().filter((g) => !g.probable && (S.dupVerIgnorados || !g.ignorado));
    const info = new Map();
    const orden = [];
    grupos.forEach((g, gi) => {
      const campo = CAMPO_DUP[g.tipo];
      [...g.filas].sort(ordenar).forEach((f) => {
        let it = info.get(f.id);
        if (!it) { it = { campos: new Set(), grupo: gi, claves: [], ini: false }; info.set(f.id, it); orden.push(f.id); }
        if (campo) it.campos.add(campo);
        it.claves.push(g.clave);
      });
    });
    const vistos = new Set();
    for (const id of orden) {
      const it = info.get(id);
      if (!vistos.has(it.grupo)) { vistos.add(it.grupo); it.ini = true; }
    }
    S.dupInfo = info;
    S.dupGrupos = grupos;
    return orden;
  }

  function recalcular() {
    const r = B.buscar(S.indice, S.consulta);
    S.base = r.filas;
    let filas;
    if (S.modoDup) {
      const orden = calcularDup();
      const permitidos = new Set(B.filtrar(r.filas, S.filtros).map((f) => f.id));
      filas = orden.filter((id) => permitidos.has(id)).map((id) => S.porId.get(id)).filter(Boolean);
    } else if (S.modoPendiente) {
      S.dupInfo = new Map();
      filas = ordenarPor(B.filtrar(r.filas, S.filtros).filter((f) => f.pendiente));
    } else {
      S.dupInfo = new Map();
      filas = ordenarPor(B.filtrar(r.filas, S.filtros));
    }
    S.resultado = { filas, aproximado: r.aproximado, relajado: r.relajado };
    bus.emit('resultado');
  }

  function ponerModoDup(v) {
    S.modoDup = !!v;
    if (S.modoDup) S.modoPendiente = false;
    recalcular();
    bus.emit('modo-dup');
  }

  function ponerModoPendiente(v) {
    S.modoPendiente = !!v;
    if (S.modoPendiente) S.modoDup = false;
    recalcular();
    bus.emit('modo-pendiente');
  }

  const pendientesCount = () => S.activos.filter((f) => f.pendiente).length;

  const candidatosSeparar = () => S.activos.filter((f) => B.separarDepartamento(f.departamento));

  const memoConteos = new Map();
  function conteosDe(campo) {
    if (!memoConteos.has(campo)) {
      const m = new Map();
      for (const f of S.activos) { const v = String(f[campo] || ''); if (v.trim()) m.set(v, (m.get(v) || 0) + 1); }
      memoConteos.set(campo, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')));
    }
    return memoConteos.get(campo);
  }

  const memoDup = { rev: null, grupos: [] };
  function duplicados() {
    if (memoDup.rev !== S.rev + '|' + S.ignorados.length) {
      memoDup.grupos = B.duplicados(S.activos, S.ignorados);
      memoDup.rev = S.rev + '|' + S.ignorados.length;
    }
    return memoDup.grupos;
  }
  const pendientesDuplicados = () => duplicados().filter((g) => !g.ignorado && !g.probable).length;

  let cargaEnCurso = null;
  let cargaPendiente = false;
  function cargar() {
    if (cargaEnCurso) { cargaPendiente = true; return cargaEnCurso; }
    cargaEnCurso = (async () => {
      try {
        const d = await pedir('GET', '/api/datos');
        aplicarDatos(d);
      } finally {
        cargaEnCurso = null;
        if (cargaPendiente) { cargaPendiente = false; cargar(); }
      }
    })();
    return cargaEnCurso;
  }

  function aplicarDatos(d) {
    const previas = new Map(S.activos.map((f) => [f.id, f.version]));
    const primera = S.rev < 0;
    S.rev = d.rev;
    S.activos = d.activos;
    S.ignorados = d.ignorados;
    S.existentes = d.existentes;
    S.ajustes = d.ajustes;
    S.presencia = d.presencia || S.presencia;
    S.local = !!d.local;
    S.cargando = false;
    if (!primera) {
      for (const f of d.activos) {
        const antes = previas.get(f.id);
        if ((antes === undefined || antes !== f.version) && f.actualizado_por && f.actualizado_por !== S.usuario) {
          S.recientes.set(f.id, { quien: f.actualizado_por, ts: f.actualizado_en, nueva: antes === undefined });
        }
      }
    }
    for (const [id, v] of [...S.recientes]) if (Date.now() - v.ts > 45000) S.recientes.delete(id);
    S.recienteIds = primera ? new Set() : new Set(S.recientes.keys());
    reconstruir();
    bus.emit('datos');
  }

  let fuente = null;
  let reconectando = null;
  function conectarEventos() {
    if (fuente) fuente.close();
    fuente = new EventSource(`/api/eventos?cid=${encodeURIComponent(cid)}&nombre=${encodeURIComponent(S.usuario || 'Sin nombre')}`);
    fuente.addEventListener('hola', (e) => {
      const d = JSON.parse(e.data);
      setConectado(true);
      if (d.rev !== S.rev) cargar().catch(() => {});
    });
    fuente.addEventListener('cambio', (e) => {
      const d = JSON.parse(e.data);
      if (d.rev > S.rev) cargar().catch(() => {});
    });
    fuente.addEventListener('presencia', (e) => { S.presencia = JSON.parse(e.data); bus.emit('presencia'); });
    fuente.onerror = () => {
      setConectado(false);
      if (fuente.readyState === 2 && !reconectando) {
        reconectando = setTimeout(() => { reconectando = null; conectarEventos(); }, 2500);
      }
    };
  }

  function ponerConsulta(q) { S.consulta = q; recalcular(); }
  function ponerFiltros(fn) { fn(S.filtros); recalcular(); bus.emit('filtros'); }
  function limpiarFiltros() { S.filtros = { valores: {}, texto: {}, vacios: [], llenos: [] }; recalcular(); bus.emit('filtros'); }
  function hayFiltros() {
    const f = S.filtros;
    return Object.values(f.valores).some((v) => v.length) || Object.values(f.texto || {}).some((t) => String(t).trim()) || f.vacios.length || f.llenos.length;
  }
  function filtroDe(campo) {
    const f = S.filtros;
    return (f.valores[campo] && f.valores[campo].length) || String((f.texto || {})[campo] || '').trim() || f.vacios.includes(campo) || f.llenos.includes(campo);
  }

  const Hist = { pila: [], rehacer: [], aplicando: false };
  const avisarHist = () => bus.emit('historial');
  const TEXTO_CAMPO = { nomenclatura: 'Nomenclatura', tipo: 'Tipo', categoria: 'Categoría', codigo: 'Código', serie: 'No. Serie' };
  const etiquetaCampo = (k) => TEXTO_CAMPO[k] || window.Campos.ETIQUETA[k] || k;

  function registrar(op) {
    if (Hist.aplicando) return;
    Hist.pila.push(op);
    if (Hist.pila.length > 100) Hist.pila.shift();
    Hist.rehacer = [];
    avisarHist();
  }

  async function aplicarHist(desde, hacia, metodo) {
    const op = desde.pop();
    if (!op) return null;
    Hist.aplicando = true;
    try {
      await op[metodo]();
      hacia.push(op);
    } finally {
      Hist.aplicando = false;
      avisarHist();
    }
    return op;
  }

  const Deshacer = {
    registrar,
    limpiar() { Hist.pila = []; Hist.rehacer = []; avisarHist(); },
    deshacer: () => aplicarHist(Hist.pila, Hist.rehacer, 'deshacer'),
    rehacer: () => aplicarHist(Hist.rehacer, Hist.pila, 'rehacer'),
    estado() {
      const u = Hist.pila[Hist.pila.length - 1];
      const r = Hist.rehacer[Hist.rehacer.length - 1];
      return { puedeDeshacer: !!u, puedeRehacer: !!r, etiquetaDeshacer: u ? u.etiqueta : '', etiquetaRehacer: r ? r.etiqueta : '' };
    },
  };

  const tomar = (fila, claves) => {
    const o = {};
    for (const k of claves) o[k] = fila[k] == null ? '' : fila[k];
    return o;
  };
  const camposDe = (datos) => CLAVES.filter((k) => datos[k] !== undefined);
  const textoCampos = (claves) => (claves.length === 1 ? etiquetaCampo(claves[0]) : claves.length + ' campos');

  const A = {
    async crear(datos, despuesDe) {
      const fila = await pedir('POST', '/api/activos', { datos, despuesDe });
      S.activos.push(fila);
      S.recientes.delete(fila.id);
      S.recienteIds = new Set([fila.id]);
      reconstruir();
      bus.emit('datos');
      registrar({ etiqueta: 'agregar registro', deshacer: () => A.eliminar([fila.id]), rehacer: () => A.restaurar([fila.id]) });
      return fila;
    },
    async guardar(id, datos, version, opciones = {}) {
      const antes = S.porId.get(id);
      const fila = await pedir('PUT', `/api/activos/${id}`, { datos, version });
      const i = S.activos.findIndex((f) => f.id === id);
      if (i >= 0) S.activos[i] = fila;
      S.recienteIds = opciones.silencioso ? new Set() : new Set([id]);
      reconstruir();
      bus.emit('datos');
      if (antes) {
        const ks = camposDe(datos).filter((k) => String(antes[k] || '') !== String(fila[k] || ''));
        if (ks.length) {
          const previo = tomar(antes, ks);
          const nuevo = tomar(fila, ks);
          registrar({
            etiqueta: 'edición de ' + textoCampos(ks),
            deshacer: () => A.guardar(id, previo, undefined, { silencioso: true }),
            rehacer: () => A.guardar(id, nuevo, undefined, { silencioso: true }),
          });
        }
      }
      return fila;
    },
    async eliminar(ids) {
      const r = await pedir('POST', '/api/activos/eliminar', { ids });
      const set = new Set(r.ids);
      S.activos = S.activos.filter((f) => !set.has(f.id));
      S.recienteIds = new Set();
      reconstruir();
      bus.emit('datos');
      if (r.ids.length) {
        const hechos = [...r.ids];
        registrar({ etiqueta: hechos.length === 1 ? 'eliminar registro' : `eliminar ${hechos.length} registros`, deshacer: () => A.restaurar(hechos), rehacer: () => A.eliminar(hechos) });
      }
      return r.ids;
    },
    async restaurar(ids) {
      const r = await pedir('POST', '/api/activos/restaurar', { ids });
      await cargar();
      if (r.ids.length) {
        const hechos = [...r.ids];
        registrar({ etiqueta: hechos.length === 1 ? 'recuperar registro' : `recuperar ${hechos.length} registros`, deshacer: () => A.eliminar(hechos), rehacer: () => A.restaurar(hechos) });
      }
      return r.ids;
    },
    async lote(ids, datos) {
      const ks = camposDe(datos);
      const previos = ids.map((id) => S.porId.get(id)).filter(Boolean).map((f) => ({ id: f.id, datos: tomar(f, ks) }));
      const r = await pedir('POST', '/api/activos/lote', { ids, datos });
      await cargar();
      if (r.ids.length) {
        const tocados = new Set(r.ids);
        registrar({
          etiqueta: `edición de ${textoCampos(ks)} en ${r.ids.length} filas`,
          deshacer: () => A.varios(previos.filter((p) => tocados.has(p.id))),
          rehacer: () => A.lote([...tocados], datos),
        });
      }
      return r.ids;
    },
    async varios(items) {
      const previos = items.map((it) => {
        const f = S.porId.get(it.id);
        return f ? { id: f.id, datos: tomar(f, camposDe(it.datos || {})) } : null;
      }).filter(Boolean);
      const r = await pedir('POST', '/api/activos/varios', { items });
      await cargar();
      if (r.ids.length) {
        const tocados = new Set(r.ids);
        registrar({
          etiqueta: `edición de ${r.ids.length} registros`,
          deshacer: () => A.varios(previos.filter((p) => tocados.has(p.id))),
          rehacer: () => A.varios(items.filter((it) => tocados.has(it.id))),
        });
      }
      return r.ids;
    },
    async ignorar(clave, ignorar) {
      await pedir('POST', '/api/ignorados', { clave, ignorar });
      if (ignorar) { if (!S.ignorados.includes(clave)) S.ignorados.push(clave); }
      else S.ignorados = S.ignorados.filter((c) => c !== clave);
      bus.emit('datos');
      recalcular();
      registrar({
        etiqueta: ignorar ? 'marcar duplicado como correcto' : 'restablecer duplicado',
        deshacer: () => A.ignorar(clave, !ignorar),
        rehacer: () => A.ignorar(clave, ignorar),
      });
    },
    editando(id) { return pedir('POST', '/api/edicion', { cid, id: id || null }).catch(() => {}); },
    async marcarPendiente(id, motivo) {
      const antes = S.porId.get(id);
      const motivoAntes = antes ? antes.motivo_pendiente || '' : '';
      const pendienteAntes = !!(antes && antes.pendiente);
      const fila = await pedir('POST', '/api/activos/pendiente', { id, motivo });
      const i = S.activos.findIndex((f) => f.id === id);
      if (i >= 0) S.activos[i] = fila;
      reconstruir();
      bus.emit('datos');
      registrar({
        etiqueta: 'marcar pendiente',
        deshacer: () => (pendienteAntes ? A.marcarPendiente(id, motivoAntes) : A.quitarPendiente(id)),
        rehacer: () => A.marcarPendiente(id, motivo),
      });
      return fila;
    },
    async quitarPendiente(id) {
      const antes = S.porId.get(id);
      const motivoAntes = antes ? antes.motivo_pendiente || '' : '';
      const fila = await pedir('POST', '/api/activos/pendiente/quitar', { id });
      const i = S.activos.findIndex((f) => f.id === id);
      if (i >= 0) S.activos[i] = fila;
      reconstruir();
      bus.emit('datos');
      registrar({ etiqueta: 'quitar pendiente', deshacer: () => A.marcarPendiente(id, motivoAntes), rehacer: () => A.quitarPendiente(id) });
      return fila;
    },
  };

  async function reordenar() {
    await pedir('POST', '/api/reordenar');
    await cargar();
  }

  function canon(campo, valor) {
    return window.Campos.canonizar(campo, valor, S.existentes);
  }

  function numeroDe(id) { return S.numero.get(id) || 0; }
  function quienEdita(id) {
    return S.presencia.find((p) => p.editando === id && p.cid !== cid) || null;
  }

  Object.assign(INV, { bus, S, pedir, cargar, aplicarDatos, conectarEventos, ponerConsulta, ponerFiltros, limpiarFiltros, hayFiltros, filtroDe, ponerModoDup, ponerModoPendiente, pendientesCount, candidatosSeparar, A, Deshacer, conteosDe, duplicados, pendientesDuplicados, guardado, guardar, canon, numeroDe, quienEdita, recalcular, reordenar, CLAVES });
})();
