(function () {
  const INV = window.INV;
  const { h, ico, pad } = INV;
  const S = INV.S;
  const C = window.Campos;
  const B = window.Busqueda;

  const refs = {};
  const COMUNES = ['categoria', 'nomenclatura', 'tipo', 'cantidad', 'proveedor', 'ubicacion', 'departamento', 'responsable'];
  let pidiendoPin = false;
  let ultimoGuardado = 0;
  let conexionAvisada = true;
  let presenciaPrevia = null;

  function aplicarPreferencias() {
    const tema = INV.guardado('inv.tema', 'oscuro');
    document.documentElement.dataset.tema = tema === 'claro' ? 'claro' : 'oscuro';
    const z = Number(INV.guardado('inv.z', '1')) || 1;
    document.documentElement.style.setProperty('--z', String(z));
  }
  function cambiarTema() {
    INV.guardar('inv.tema', document.documentElement.dataset.tema === 'claro' ? 'oscuro' : 'claro');
    aplicarPreferencias();
  }
  const PASO_ZOOM = 0.05;
  const ZOOM_MIN = 0.7;
  const ZOOM_MAX = 1.8;
  let alCambiarZoom = null;
  const zoomActual = () => Number(INV.guardado('inv.z', '1')) || 1;
  function fijarZoom(valor) {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(valor * 100) / 100));
    INV.guardar('inv.z', z.toFixed(2));
    aplicarPreferencias();
    if (alCambiarZoom) alCambiarZoom(z);
  }
  function cambiarZoom(delta) { fijarZoom(zoomActual() + delta); }

  function crearControlZoom() {
    const pct = h('button', { type: 'button', class: 'zoom-pct', title: 'Restablecer tamaño (Ctrl+0)', onclick: () => fijarZoom(1) });
    const rango = h('input', { type: 'range', min: String(ZOOM_MIN * 100), max: String(ZOOM_MAX * 100), step: '5', id: 'zoom-rango', 'aria-label': 'Tamaño del texto' });
    rango.addEventListener('input', () => fijarZoom(Number(rango.value) / 100));
    const menos = h('button', { type: 'button', title: 'Reducir tamaño (Ctrl+2)', 'aria-label': 'Reducir tamaño', onclick: () => cambiarZoom(-PASO_ZOOM) }, ico('menos'));
    const mas = h('button', { type: 'button', title: 'Aumentar tamaño (Ctrl+1)', 'aria-label': 'Aumentar tamaño', onclick: () => cambiarZoom(PASO_ZOOM) }, ico('mas'));
    alCambiarZoom = (z) => { rango.value = String(Math.round(z * 100)); pct.textContent = Math.round(z * 100) + '%'; };
    alCambiarZoom(zoomActual());
    return h('div', { class: 'zoom-control' }, menos, rango, mas, pct);
  }

  const marcaSvg = () => h('div', { html: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#4C8DFF"/><rect x="7" y="8" width="18" height="4.5" rx="1.5" fill="#fff"/><rect x="7" y="14" width="18" height="4.5" rx="1.5" fill="#fff" opacity=".8"/><rect x="7" y="20" width="18" height="4.5" rx="1.5" fill="#fff" opacity=".55"/></svg>' }).firstChild;

  function armarPantalla() {
    document.body.replaceChildren();

    const pastilla = h('span', { class: 'pastilla-prueba oculto', title: 'Base de prueba: los datos no corresponden al inventario real' }, ico('alerta'), 'Prueba');
    const entrada = h('input', { id: 'q', type: 'search', placeholder: 'Buscar por nombre, MAC, IP, serie…', title: 'Sintaxis: campo:valor (marca:dell) · “frase exacta” · -excluir', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Buscar en el inventario' });
    const limpiar = h('button', { class: 'limpiar', type: 'button', 'aria-label': 'Borrar búsqueda', onclick: () => { entrada.value = ''; buscar(''); entrada.focus(); } }, ico('cerrar'));
    const nota = h('div', { class: 'aviso-aprox oculto' });
    const slot = h('div', { class: 'buscador' }, ico('buscar'), entrada, h('span', { class: 'tecla' }, '/'), limpiar, nota);
    const alBuscar = INV.debounce((v) => INV.ponerConsulta(v), 80);
    function buscar(v) { slot.classList.toggle('con-texto', !!v); alBuscar(v); }
    entrada.addEventListener('input', () => buscar(entrada.value));
    entrada.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { entrada.value = ''; buscar(''); entrada.blur(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); entrada.blur(); INV.Libro.mover(1); }
    });

    const btnDeshacer = h('button', { class: 'btn cinta icono', id: 'btn-deshacer', type: 'button', disabled: true, 'aria-label': 'Deshacer', onclick: () => ejecutarHistorial('deshacer') }, ico('deshacer'));
    const btnRehacer = h('button', { class: 'btn cinta icono', id: 'btn-rehacer', type: 'button', disabled: true, 'aria-label': 'Rehacer', onclick: () => ejecutarHistorial('rehacer') }, ico('rehacer'));
    const btnFiltros = h('button', { class: 'btn cinta', id: 'btn-filtros', type: 'button', title: 'Filtros por columna', onclick: alternarFiltros }, ico('filtro'), h('span', { class: 'txt-btn' }, 'Filtros'), h('span', { class: 'insignia oculto', id: 'ins-filtros' }));
    const btnSeparar = h('button', { class: 'btn cinta oculto', id: 'btn-separar', type: 'button', title: 'Separar departamento y responsable unidos', onclick: () => INV.Paneles.separarDepartamentos() }, ico('separar'), h('span', { class: 'txt-btn' }, 'Separar departamentos'), h('span', { class: 'insignia', id: 'ins-separar' }));
    const btnDup = h('button', { class: 'btn cinta', id: 'btn-dup', type: 'button', title: 'Ver y corregir duplicados', onclick: () => INV.ponerModoDup(!S.modoDup) }, ico('duplicados'), h('span', { class: 'txt-btn' }, 'Duplicados'), h('span', { class: 'insignia oculto', id: 'ins-dup' }));
    const btnPend = h('button', { class: 'btn cinta', id: 'btn-pend', type: 'button', title: 'Ver filas marcadas como pendientes', onclick: () => INV.ponerModoPendiente(!S.modoPendiente) }, ico('alerta'), h('span', { class: 'txt-btn' }, 'Pendientes'), h('span', { class: 'insignia oculto', id: 'ins-pend' }));
    const btnNuevo = h('button', { class: 'btn cinta senal', type: 'button', title: 'Agregar registro (Alt+N)', onclick: () => nuevo() }, ico('mas'), h('span', { class: 'txt-btn' }, 'Agregar'));
    const btnMas = h('button', { class: 'btn cinta icono', type: 'button', 'aria-label': 'Más opciones', onclick: (e) => menuMas(e.currentTarget) }, ico('menu'));
    const leds = h('div', { class: 'leds', id: 'leds' });
    const enlace = h('div', { class: 'enlace-estado' }, h('i', { class: 'punto', id: 'punto-enlace' }), h('span', { id: 'txt-enlace' }, 'Conectado'));

    const barra = h('header', { id: 'barra' },
      h('div', { class: 'marca' }, marcaSvg(), h('b', null, 'Inventario'), pastilla),
      slot,
      h('div', { class: 'acciones' }, btnDeshacer, btnRehacer, btnFiltros, btnSeparar, btnDup, btnPend, btnNuevo, btnMas));
    leds.appendChild(enlace);

    const panelFiltros = h('section', { id: 'panel-filtros', class: 'panel-filtros oculto', 'aria-label': 'Filtros por columna' });
    const franjaDup = h('div', { class: 'franja-info aviso oculto', id: 'franja-dup' });
    const franjaPend = h('div', { class: 'franja-info aviso oculto', id: 'franja-pend' });
    const barraSel = h('div', { class: 'barra-sel oculto', id: 'barra-sel' });
    const libro = h('main', { id: 'libro', tabindex: '-1' });
    const estadoInfo = h('div', { id: 'estado-info' });
    const estado = h('footer', { id: 'estado' }, estadoInfo, leds, crearControlZoom());
    const fab = h('button', { id: 'fab', type: 'button', 'aria-label': 'Agregar registro', onclick: () => nuevo() }, ico('mas'));
    document.body.append(barra, panelFiltros, franjaDup, franjaPend, barraSel, libro, estado, fab, h('div', { id: 'sellos' }));
    Object.assign(refs, { entrada, slot, nota, pastilla, barraSel, franjaDup, franjaPend, libro, estado, estadoInfo, leds, enlace });
    INV.Filtros.montarPanel(panelFiltros);
    INV.Libro.montar(libro);
  }

  async function ejecutarHistorial(tipo) {
    try {
      const op = await INV.Deshacer[tipo]();
      if (!op) { INV.sello(tipo === 'deshacer' ? 'No hay cambios para deshacer.' : 'No hay cambios para rehacer.', { dur: 1800 }); return; }
      INV.sello((tipo === 'deshacer' ? 'Deshecho: ' : 'Rehecho: ') + op.etiqueta, { tipo: 'bien', dur: 2200 });
    } catch (e) {
      INV.sello(e.message, { tipo: 'mal', titulo: tipo === 'deshacer' ? 'No se pudo deshacer' : 'No se pudo rehacer' });
    }
  }

  function alternarFiltros() {
    if (window.matchMedia('(max-width: 860px)').matches) INV.Filtros.abrirHojaMovil();
    else INV.Filtros.alternarPanel();
  }

  function quitarTodo() {
    INV.limpiarFiltros();
    refs.entrada.value = '';
    refs.slot.classList.remove('con-texto');
    INV.ponerConsulta('');
  }

  function baseDesdeFiltros() {
    const b = {};
    for (const c of ['ubicacion', 'departamento', 'responsable', 'proveedor']) {
      const v = S.filtros.valores[c];
      if (v && v.length === 1 && v[0]) b[c] = v[0];
    }
    return b;
  }
  function nuevo(base) { return INV.Ficha.abrir({ base: base || baseDesdeFiltros() }); }

  function menuMas(ancla) {
    const items = [
      { icono: 'subir', texto: 'Importar Excel', fn: () => INV.Paneles.importar() },
      { icono: 'excel', texto: 'Respaldo y exportación', fn: () => INV.Paneles.respaldo() },
    ];
    if (S.local) items.push({ icono: 'enlace', texto: 'Conexión de otro equipo', fn: () => INV.Paneles.conexion() });
    items.push({ icono: 'papelera', texto: 'Papelera', fn: () => INV.Paneles.papelera() });
    if (S.local) items.push({ icono: 'alerta', texto: 'Restablecer base de datos…', fn: () => INV.Paneles.reiniciar() });
    items.push({ sep: true });
    if (INV.candidatosSeparar().length) items.push({ icono: 'separar', texto: 'Separar departamentos y responsables', fn: () => INV.Paneles.separarDepartamentos() });
    items.push({ icono: 'tabla', texto: 'Reordenar filas por responsable…', fn: reordenarFilas });
    items.push({ icono: 'tabla', texto: 'Columnas visibles…', fn: () => INV.Paneles.columnas() });
    items.push({ icono: document.documentElement.dataset.tema === 'claro' ? 'luna' : 'sol', texto: document.documentElement.dataset.tema === 'claro' ? 'Tema oscuro' : 'Tema claro', fn: cambiarTema });
    items.push({ icono: 'texto', texto: 'Aumentar tamaño de texto', fn: () => cambiarZoom(PASO_ZOOM), pista: 'Ctrl+1' });
    items.push({ icono: 'texto', texto: 'Reducir tamaño de texto', fn: () => cambiarZoom(-PASO_ZOOM), pista: 'Ctrl+2' });
    items.push({ sep: true });
    if (window.electronAPI && window.electronAPI.revisarActualizacion) items.push({ icono: 'refrescar', texto: 'Buscar actualizaciones', fn: () => { INV.sello('Buscando actualizaciones…', { dur: 2500 }); window.electronAPI.revisarActualizacion(); } });
    if (window.electronAPI && window.electronAPI.cambiarModo) items.push({ icono: 'enlace', texto: 'Tipo de equipo…', fn: () => window.electronAPI.cambiarModo() });
    items.push({ icono: 'texto', texto: 'Atajos de teclado', pista: 'F1', fn: () => INV.Paneles.atajos() });
    items.push({ icono: 'usuario', texto: `Cambiar usuario (${S.usuario})`, fn: async () => { await INV.Paneles.pedirNombre(); INV.conectarEventos(); pintarLeds(); } });
    INV.menu(ancla, items);
  }

  function pintarLeds() {
    const gente = new Map();
    S.presencia.forEach((p) => {
      const previo = gente.get(p.nombre) || { nombre: p.nombre, editando: false, yo: false };
      previo.editando = previo.editando || !!p.editando;
      previo.yo = previo.yo || p.cid === S.cid;
      gente.set(p.nombre, previo);
    });
    const ahora = new Set([...gente.values()].filter((g) => !g.yo).map((g) => g.nombre));
    if (presenciaPrevia) {
      for (const nombre of presenciaPrevia) {
        if (!ahora.has(nombre)) INV.sello(`${nombre} se desconectó`, { tipo: 'mal', dur: 5000 });
      }
    }
    presenciaPrevia = ahora;
    const hijos = [...gente.values()].map((g) => h('span', {
      class: 'led en-linea' + (g.yo ? ' yo' : '') + (g.editando ? ' editando' : ''),
      title: `${g.nombre}${g.yo ? ' (este equipo)' : ''}${g.editando ? ' · editando un registro' : ' · en línea'}`,
    }, g.nombre.trim().charAt(0) || '?'));
    refs.leds.replaceChildren(...hijos, refs.enlace);
    pintarEnlace();
  }

  function pintarEnlace() {
    const p = document.getElementById('punto-enlace');
    const t = document.getElementById('txt-enlace');
    if (!p) return;
    p.className = 'punto' + (S.conectado ? '' : ' caido');
    t.textContent = S.conectado ? 'Conectado' : 'Sin conexión';
    refs.enlace.style.color = S.conectado ? '' : 'var(--peligro)';
    if (S.conectado !== conexionAvisada) {
      conexionAvisada = S.conectado;
      if (!S.conectado) INV.sello('Se perdió la conexión con el equipo servidor. Los cambios no se están guardando.', { tipo: 'mal', titulo: 'Sin conexión', dur: 9000 });
      else INV.sello('Conexión restablecida', { tipo: 'bien', dur: 3000 });
    }
  }

  function pintarBarra() {
    document.getElementById('btn-filtros').classList.toggle('activo', INV.Filtros.abierto());
    const hist = INV.Deshacer.estado();
    const bd = document.getElementById('btn-deshacer');
    const br = document.getElementById('btn-rehacer');
    bd.disabled = !hist.puedeDeshacer;
    br.disabled = !hist.puedeRehacer;
    bd.title = hist.puedeDeshacer ? `Deshacer: ${hist.etiquetaDeshacer} (Ctrl+Z)` : 'Deshacer (Ctrl+Z)';
    br.title = hist.puedeRehacer ? `Rehacer: ${hist.etiquetaRehacer} (Ctrl+Y)` : 'Rehacer (Ctrl+Y)';
    const f = S.resultado;
    refs.slot.classList.toggle('aprox', f.aproximado);
    refs.nota.classList.toggle('oculto', !f.aproximado);
    refs.nota.textContent = f.relajado ? 'Coincidencia parcial' : 'Incluye coincidencias aproximadas';
    const nfiltros = Object.values(S.filtros.valores).filter((v) => v.length).length + Object.values(S.filtros.texto || {}).filter((t) => String(t).trim()).length;
    const insF = document.getElementById('ins-filtros');
    insF.textContent = nfiltros;
    insF.classList.toggle('oculto', nfiltros === 0);
    const cand = INV.candidatosSeparar().length;
    document.getElementById('btn-separar').classList.toggle('oculto', cand === 0);
    document.getElementById('ins-separar').textContent = cand;
    const dup = INV.pendientesDuplicados();
    const ins = document.getElementById('ins-dup');
    ins.textContent = dup;
    ins.classList.toggle('oculto', dup === 0);
    document.getElementById('btn-dup').classList.toggle('activo', S.modoDup);
    document.getElementById('btn-dup').classList.toggle('alerta', dup > 0 && !S.modoDup);
    const pend = INV.pendientesCount();
    const insP = document.getElementById('ins-pend');
    insP.textContent = pend;
    insP.classList.toggle('oculto', pend === 0);
    document.getElementById('btn-pend').classList.toggle('activo', S.modoPendiente);
    document.getElementById('btn-pend').classList.toggle('alerta', pend > 0 && !S.modoPendiente);
    refs.pastilla.classList.toggle('oculto', !S.ajustes.modoPrueba);
  }

  function pintarFranjaDup() {
    const el = refs.franjaDup;
    el.classList.toggle('oculto', !S.modoDup);
    if (!S.modoDup) return;
    const grupos = S.dupGrupos.length;
    const regs = S.dupInfo.size;
    el.replaceChildren(
      h('b', null, grupos ? `${grupos} ${grupos === 1 ? 'grupo' : 'grupos'} de duplicados · ${regs} registros` : 'No hay duplicados pendientes'),
      h('span', null, grupos ? 'Corrija los valores resaltados directamente en la tabla. Clic derecho en una fila para marcarla como correcta.' : ''),
      h('span', { class: 'relleno' }),
      h('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: S.dupVerIgnorados, onchange: (e) => { S.dupVerIgnorados = e.target.checked; INV.recalcular(); } }), 'Incluir descartados'),
      h('button', { class: 'btn mini', type: 'button', onclick: () => INV.ponerModoDup(false) }, 'Salir'));
  }

  function pintarFranjaPendiente() {
    const el = refs.franjaPend;
    el.classList.toggle('oculto', !S.modoPendiente);
    if (!S.modoPendiente) return;
    const n = S.resultado.filas.length;
    el.replaceChildren(
      h('b', null, n ? `${n} ${n === 1 ? 'fila pendiente' : 'filas pendientes'}` : 'No hay filas pendientes'),
      h('span', null, n ? 'Clic derecho en una fila para ver el motivo o quitarla de pendientes.' : ''),
      h('span', { class: 'relleno' }),
      h('button', { class: 'btn mini', type: 'button', onclick: () => INV.ponerModoPendiente(false) }, 'Salir'));
  }

  function pintarSeleccion() {
    const n = S.seleccion.size;
    refs.barraSel.classList.toggle('oculto', n === 0);
    if (!n) return;
    refs.barraSel.replaceChildren(
      h('b', null, `${n} ${n === 1 ? 'fila seleccionada' : 'filas seleccionadas'}`),
      h('button', { class: 'btn mini', type: 'button', onclick: () => editarLote([...S.seleccion]) }, ico('lote'), 'Editar campo'),
      h('button', { class: 'btn mini', type: 'button', onclick: () => exportarSeleccion() }, ico('excel'), 'Exportar'),
      h('button', { class: 'btn mini peligro', type: 'button', onclick: () => eliminar([...S.seleccion]) }, ico('papelera'), 'Eliminar'),
      h('span', { class: 'relleno' }),
      h('button', { class: 'btn mini', type: 'button', onclick: () => { S.seleccion.clear(); INV.Libro.actualizarSeleccionVisual(); } }, 'Deseleccionar'));
  }

  function etiquetaCampo(k) {
    return { nomenclatura: 'Nomenclatura', tipo: 'Tipo', categoria: 'Categoría', codigo: 'Código', serie: 'No. Serie' }[k] || C.ETIQUETA[k] || k;
  }

  function pintarEstado() {
    const e = refs.estadoInfo;
    if (!e) return;
    const ult = Number(S.ajustes.ultimoRespaldo || 0);
    const hoyOk = ult && new Date(ult).toDateString() === new Date().toDateString();
    const f = S.activoId ? S.porId.get(S.activoId) : null;
    let ctx;
    if (f) {
      ctx = h('div', { class: 'ctx' }, h('span', { class: 'num' }, 'N° ' + pad(INV.numeroDe(f.id))),
        h('span', null, [f.nombre, f.descripcion].filter(Boolean).join(' · ') || 'Sin nombre'),
        f.ubicacion ? h('em', null, f.ubicacion) : null,
        S.celda ? h('span', { class: 'celda' }, etiquetaCampo(S.celda)) : null);
    } else {
      ctx = h('div', { class: 'ctx' }, h('em', null, 'Ninguna fila seleccionada · F1 muestra los atajos'));
    }
    e.replaceChildren(...[
      ctx,
      h('span', null, h('b', null, S.resultado.filas.length), ' de ', h('b', null, S.activos.length), ' filas'),
      S.seleccion.size ? h('span', null, h('b', null, S.seleccion.size), ' seleccionadas') : null,
      ultimoGuardado ? h('span', { class: 'oculto-movil' }, ico('check'), 'guardado ' + INV.hora(ultimoGuardado)) : null,
      h('span', { class: 'relleno' }),
      h('button', { type: 'button', class: (hoyOk ? '' : 'aviso ') + 'oculto-movil', onclick: () => INV.Paneles.respaldo() }, ico('disco'), hoyOk ? `respaldo hoy ${INV.hora(ult)}` : 'sin respaldo del día'),
    ].filter(Boolean));
  }

  function actualizarTodo() {
    pintarBarra();
    pintarFranjaDup();
    pintarFranjaPendiente();
    pintarSeleccion();
    pintarEstado();
  }

  async function editarLote(ids) {
    const editables = ['ubicacion', 'departamento', 'responsable', 'proveedor', 'marca', 'modelo', 'descripcion', 'categoria', 'nomenclatura', 'tipo', 'cantidad'];
    const sel = h('select', { id: 'lote-campo' }, editables.map((c) => h('option', { value: c }, etiquetaCampo(c))));
    const lista = h('datalist', { id: 'lote-lista' });
    const val = h('input', { type: 'text', list: 'lote-lista', id: 'lote-valor', autocomplete: 'off', placeholder: 'Valor (vacío para limpiar el campo)' });
    const llenar = () => { lista.replaceChildren(...INV.conteosDe(sel.value).slice(0, 80).map(([v]) => h('option', { value: v }))); };
    sel.addEventListener('change', () => { val.value = ''; llenar(); });
    llenar();
    const hoja = INV.abrirHoja({
      titulo: `Edición de ${ids.length} registros`, rotulo: 'Edición en bloque', clase: 'chica',
      cuerpo: h('div', { class: 'form-linea' },
        h('div', { class: 'campo' }, h('label', null, 'Campo'), sel),
        h('div', { class: 'campo' }, h('label', null, 'Nuevo valor'), val, lista),
        h('p', { class: 'nota' }, `El cambio se aplica a los ${ids.length} registros seleccionados y queda registrado en el historial de cada uno.`)),
      pie: [h('span', { class: 'relleno' }), h('button', { class: 'btn', onclick: () => hoja.solicitarCierre() }, 'Cancelar'),
        h('button', { class: 'btn senal', onclick: async () => {
          const campo = sel.value;
          const valor = INV.canon(campo, val.value);
          if (!valor && !(await INV.confirmar({ titulo: 'Limpiar campo', texto: `Se dejará vacío «${etiquetaCampo(campo)}» en ${ids.length} registros.`, ok: 'LIMPIAR', peligro: true }))) return;
          try {
            const r = await INV.A.lote(ids, { [campo]: valor });
            hoja.cerrar();
            INV.sello(`${r.length} registros actualizados`, { tipo: 'bien' });
          } catch (e) { INV.sello(e.message, { tipo: 'mal' }); }
        } }, ico('check'), 'Aplicar')],
    });
    setTimeout(() => sel.focus(), 30);
  }

  async function exportarSeleccion() {
    try {
      const blob = await INV.pedir('POST', '/api/exportar', { ids: [...S.seleccion] }, { blob: true });
      INV.descargar(blob, `Inventario de Hardware${S.ajustes.modoPrueba ? '_PRUEBA' : ''} (selección).xlsx`);
    } catch (e) { INV.sello(e.message, { tipo: 'mal' }); }
  }

  async function eliminar(ids) {
    const lista = ids.filter((id) => S.porId.has(id));
    if (!lista.length) return;
    const f = S.porId.get(lista[0]);
    const texto = lista.length === 1
      ? `Se eliminará el registro N° ${pad(INV.numeroDe(f.id))} · ${f.nombre || f.descripcion || 'sin nombre'}. Permanece en la papelera y puede recuperarse.`
      : `Se eliminarán ${lista.length} registros. Permanecen en la papelera y pueden recuperarse.`;
    if (!(await INV.confirmar({ titulo: 'Eliminar registros', texto, ok: 'ELIMINAR', peligro: true }))) return;
    try {
      const hechos = await INV.A.eliminar(lista);
      S.seleccion.clear();
      INV.sello(`${hechos.length === 1 ? 'Registro eliminado' : hechos.length + ' registros eliminados'}`, { accion: { texto: 'Deshacer', fn: () => ejecutarHistorial('deshacer') }, dur: 7000 });
    } catch (e) { INV.sello(e.message, { tipo: 'mal' }); }
  }

  function duplicar(id) {
    const f = S.porId.get(id);
    if (!f) return;
    const b = { ...f };
    ['nombre', 'mac', 'ip', 'serie', 'codigo', 'id_activo'].forEach((k) => { b[k] = ''; });
    INV.Ficha.abrir({ base: b, despuesDe: id });
  }

  function insertarDebajo(id) {
    const f = S.porId.get(id);
    if (!f) return;
    const b = {};
    COMUNES.forEach((k) => { b[k] = f[k]; });
    INV.Ficha.abrir({ base: b, despuesDe: id });
  }

  async function separarFila(id) {
    const f = S.porId.get(id);
    const r = f && B.separarDepartamento(f.departamento);
    if (!r) return;
    if (f.responsable && f.responsable !== r.resp && !(await INV.confirmar({ titulo: 'Reemplazar responsable', texto: `La fila ya tiene responsable «${f.responsable}». Se reemplazará por «${r.resp}».`, ok: 'REEMPLAZAR', peligro: true }))) return;
    try {
      await INV.A.guardar(id, { departamento: r.depto, responsable: r.resp }, f.version, { silencioso: true });
      INV.sello(`Departamento «${r.depto}» · Responsable «${r.resp}»`, { tipo: 'bien', dur: 3000 });
    } catch (e) { INV.sello(e.message, { tipo: 'mal' }); }
  }

  async function ignorarDuplicado(id) {
    const info = S.dupInfo.get(id);
    if (!info) return;
    for (const clave of new Set(info.claves)) await INV.A.ignorar(clave, true);
    INV.sello('Marcado como correcto', { tipo: 'bien', dur: 2500 });
  }

  async function pedirMotivoPendiente(valorInicial) {
    const area = h('textarea', { rows: '3', maxlength: 300, placeholder: 'Ej. Falta confirmar con el proveedor si esta MAC es correcta', style: { width: '100%', resize: 'vertical', font: 'inherit', padding: '8px 10px' } });
    area.value = valorInicial || '';
    const ok = await INV.confirmar({ titulo: 'Marcar como pendiente', texto: 'Explique brevemente la duda o lo que falta revisar de esta fila.', ok: 'MARCAR PENDIENTE', extra: area });
    if (!ok) return null;
    const motivo = area.value.trim();
    if (!motivo) { INV.sello('Escriba un motivo.', { tipo: 'mal' }); return null; }
    return motivo;
  }

  async function reordenarFilas() {
    const ok = await INV.confirmar({
      titulo: 'Reordenar filas',
      texto: 'Se reacomodan todas las filas: primero por Departamento, luego por Responsable, y dentro de cada responsable por tipo de equipo (Desktop, Laptop, Monitor, Teclado, Mouse, Teléfono IP, Impresora y demás periféricos). Las filas con Departamento y Responsable unidos en un solo campo también se agrupan por ese texto. Esto no se puede deshacer con Ctrl+Z.',
      ok: 'REORDENAR',
    });
    if (!ok) return;
    try {
      await INV.reordenar();
      INV.sello('Filas reordenadas', { tipo: 'bien', dur: 3000 });
    } catch (e) { INV.sello(e.message, { tipo: 'mal' }); }
  }

  async function alternarPendiente(id) {
    const f = S.porId.get(id);
    if (!f) return;
    if (f.pendiente) {
      const quitar = await INV.confirmar({ titulo: 'Fila pendiente', texto: f.motivo_pendiente || '(sin motivo)', ok: 'QUITAR PENDIENTE', cancelar: 'CERRAR' });
      if (!quitar) return;
      try { await INV.A.quitarPendiente(id); INV.sello('Pendiente quitado', { tipo: 'bien', dur: 2200 }); } catch (e) { INV.sello(e.message, { tipo: 'mal' }); }
    } else {
      const motivo = await pedirMotivoPendiente();
      if (!motivo) return;
      try { await INV.A.marcarPendiente(id, motivo); INV.sello('Marcado como pendiente', { tipo: 'bien', dur: 2200 }); } catch (e) { INV.sello(e.message, { tipo: 'mal' }); }
    }
  }

  function enlazarAcciones() {
    INV.bus.on('fila-accion', ({ accion, id }) => {
      if (accion === 'editar' && id) INV.Ficha.abrir({ id });
      else if (accion === 'duplicar' && id) duplicar(id);
      else if (accion === 'insertar' && id) insertarDebajo(id);
      else if (accion === 'separar' && id) separarFila(id);
      else if (accion === 'ignorar-dup' && id) ignorarDuplicado(id);
      else if (accion === 'pendiente' && id) alternarPendiente(id);
      else if (accion === 'eliminar') eliminar(S.seleccion.size ? [...S.seleccion] : [id]);
    });
    INV.bus.on('accion', (a) => {
      if (a === 'importar') INV.Paneles.importar();
      else if (a === 'nuevo') nuevo();
      else if (a === 'quitar-filtros') quitarTodo();
      else if (a === 'lote' && S.seleccion.size) editarLote([...S.seleccion]);
    });
    INV.bus.on('ficha-guardada', ({ id, otro }) => {
      ultimoGuardado = Date.now();
      pintarEstado();
      if (otro) return;
      if (!INV.Libro.irA(id)) {
        INV.sello('Registro guardado. Los filtros o la búsqueda activos lo ocultan de la vista.', { accion: { texto: 'Quitar filtros', fn: () => { quitarTodo(); setTimeout(() => INV.Libro.irA(id), 60); } }, dur: 7000 });
      }
    });
    INV.bus.on('resultado', actualizarTodo);
    INV.bus.on('filtros', pintarBarra);
    INV.bus.on('panel-filtros', pintarBarra);
    INV.bus.on('historial', pintarBarra);
    INV.bus.on('seleccion', () => { pintarSeleccion(); pintarEstado(); });
    INV.bus.on('datos', () => { actualizarTodo(); pintarLeds(); });
    INV.bus.on('modo-dup', actualizarTodo);
    INV.bus.on('modo-pendiente', actualizarTodo);
    INV.bus.on('activa', pintarEstado);
    INV.bus.on('celda', pintarEstado);
    INV.bus.on('celda-guardada', () => { ultimoGuardado = Date.now(); pintarEstado(); });
    INV.bus.on('presencia', pintarLeds);
    INV.bus.on('conexion', pintarEnlace);
    INV.bus.on('sin-sesion', async () => {
      if (pidiendoPin) return;
      pidiendoPin = true;
      await INV.Paneles.pedirPin();
      pidiendoPin = false;
      INV.conectarEventos();
      INV.cargar().catch(() => {});
    });
  }

  function atajos() {
    document.addEventListener('keydown', (e) => {
      const enCampo = e.target.closest && e.target.closest('input,textarea,select,[contenteditable]');
      const modal = document.querySelector('.velo,.pantalla');
      const ctrl = e.ctrlKey || e.metaKey;
      const tecla = e.key.toLowerCase();
      if (ctrl && !e.altKey) {
        if (e.key === '1' || e.key === '+' || e.key === '=') { e.preventDefault(); cambiarZoom(PASO_ZOOM); return; }
        if (e.key === '2' || e.key === '-' || e.key === '_') { e.preventDefault(); cambiarZoom(-PASO_ZOOM); return; }
        if (e.key === '0') { e.preventDefault(); fijarZoom(1); return; }
      }
      if (modal) return;
      if (ctrl && !e.altKey && (tecla === 'k' || tecla === 'f')) { e.preventDefault(); refs.entrada.focus(); refs.entrada.select(); return; }
      if (e.altKey && !ctrl && tecla === 'n') { e.preventDefault(); nuevo(); return; }
      if (ctrl && !e.altKey && !enCampo && (tecla === 'z' || tecla === 'y')) {
        e.preventDefault();
        ejecutarHistorial(tecla === 'y' || e.shiftKey ? 'rehacer' : 'deshacer');
        return;
      }
      if (e.key === 'F1' || (!enCampo && e.key === '?')) { e.preventDefault(); INV.Paneles.atajos(); return; }
      if (!enCampo && e.key === '/') { e.preventDefault(); refs.entrada.focus(); refs.entrada.select(); return; }
      if (!enCampo && !ctrl && !e.altKey && tecla === 'n') { e.preventDefault(); nuevo(); return; }
      if (e.key === 'Escape') {
        if (S.seleccion.size) { S.seleccion.clear(); INV.Libro.actualizarSeleccionVisual(); return; }
      }
      if (INV.Libro.alTecla(e)) e.preventDefault();
    });
    window.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      cambiarZoom(e.deltaY < 0 ? PASO_ZOOM : -PASO_ZOOM);
    }, { passive: false });
    window.addEventListener('beforeunload', () => { INV.A.editando(null); });
  }

  async function iniciar() {
    aplicarPreferencias();
    armarPantalla();
    enlazarAcciones();
    atajos();
    if (!S.usuario) await INV.Paneles.pedirNombre();
    let sesion;
    try { sesion = await INV.pedir('GET', '/api/sesion'); } catch (_) { sesion = { autenticado: true }; }
    if (!sesion.autenticado) await INV.Paneles.pedirPin();
    try { await INV.cargar(); } catch (e) { INV.sello(e.message, { tipo: 'mal', titulo: 'Error de carga', dur: 8000 }); }
    INV.conectarEventos();
    pintarLeds();
    actualizarTodo();
    document.documentElement.dataset.listo = '1';
  }

  iniciar();
})();
