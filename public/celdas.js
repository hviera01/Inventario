(function () {
  const INV = window.INV;
  const { h } = INV;
  const S = INV.S;
  const C = window.Campos;
  const B = window.Busqueda;

  const SELECTS = { categoria: C.CATEGORIAS, nomenclatura: C.NOMENCLATURAS, tipo: C.TIPOS };
  const COMBOS = new Set(['descripcion', 'marca', 'modelo', 'proveedor', 'ubicacion', 'departamento', 'responsable']);
  const MONO = new Set(['id_activo', 'codigo', 'mac', 'ip', 'serie', 'modelo']);
  const UNICOS = ['mac', 'ip', 'serie', 'codigo', 'id_activo'];

  let contenedor = null;
  let editor = null;
  let diferido = false;

  const esMovil = () => window.matchMedia('(max-width: 860px)').matches;
  const habilitado = () => !esMovil() && S.vista === 'completa';
  const columnas = () => INV.Libro.columnas().map((c) => c.k);
  const ids = () => S.resultado.filas.map((f) => f.id);

  function celdaPorDefecto() {
    const cols = columnas();
    return cols.includes('nombre') ? 'nombre' : cols[0] || null;
  }

  function marcar() {
    if (!contenedor) return;
    contenedor.querySelectorAll('td.celda-sel').forEach((td) => td.classList.remove('celda-sel'));
    if (!S.activoId || !S.celda || !habilitado()) return;
    const td = contenedor.querySelector(`tr[data-id="${S.activoId}"] td.k-${S.celda}`);
    if (td) td.classList.add('celda-sel');
  }

  function seleccionar(id, campo, { desplazar = true } = {}) {
    if (!habilitado()) return;
    S.celda = campo;
    INV.Libro.ponerActiva(id, { desplazar });
    marcar();
    if (desplazar) {
      const td = contenedor.querySelector(`tr[data-id="${id}"] td.k-${campo}`);
      if (td && td.scrollIntoView) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    INV.bus.emit('celda');
  }

  function limpiarSeleccion() {
    S.celda = null;
    marcar();
    INV.bus.emit('celda');
  }

  function moverHorizontal(delta) {
    const cols = columnas();
    if (!cols.length) return;
    if (!S.celda) S.celda = celdaPorDefecto();
    const i = Math.max(0, Math.min(cols.length - 1, cols.indexOf(S.celda) + delta));
    seleccionar(S.activoId, cols[i]);
  }

  function opcionesSelect(campo, actual) {
    const lista = [...SELECTS[campo]];
    if (campo === 'categoria') (S.existentes.categoria || []).forEach((v) => { if (!lista.includes(v)) lista.push(v); });
    if (actual && !lista.includes(actual)) lista.push(actual);
    return lista;
  }

  function iniciar(id, campo, { texto = null } = {}) {
    if (!habilitado() || editor) return false;
    const fila = S.porId.get(id);
    const td = contenedor.querySelector(`tr[data-id="${id}"] td.k-${campo}`);
    if (!fila || !td) return false;
    const original = String(fila[campo] || '');
    let control;
    if (SELECTS[campo]) {
      control = h('select', { 'aria-label': C.ETIQUETA[campo] }, h('option', { value: '' }, '—'), ...opcionesSelect(campo, original).map((o) => h('option', { value: o }, o)));
      control.value = original;
    } else {
      control = h('input', { type: 'text', value: texto !== null ? texto : original, autocomplete: 'off', spellcheck: 'false', class: MONO.has(campo) ? 'mono' : null, 'aria-label': C.ETIQUETA[campo], maxlength: 200 });
    }
    const cont = h('div', { class: 'celda-edit' }, control);
    td.classList.add('editando');
    td.replaceChildren(cont);
    editor = { id, campo, control, original, terminado: false };
    if (COMBOS.has(campo)) INV.crearCombo(control, campo, fila);
    control.addEventListener('keydown', alTeclaEditor);
    control.addEventListener('blur', () => {
      setTimeout(() => { if (editor && editor.control === control && !editor.terminado) confirmar(null); }, 120);
    });
    control.focus();
    if (control.mostrarSugerencias) control.mostrarSugerencias();
    if (control.setSelectionRange && texto !== null) control.setSelectionRange(control.value.length, control.value.length);
    else if (control.select) control.select();
    INV.A.editando(id);
    return true;
  }

  function alTeclaEditor(e) {
    if (e.key === 'Enter') { e.preventDefault(); confirmar('abajo'); }
    else if (e.key === 'Tab') { e.preventDefault(); confirmar(e.shiftKey ? 'izquierda' : 'derecha'); }
    else if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); cancelar(); }
  }

  function cerrarEditor() {
    editor = null;
    INV.A.editando(null);
  }

  function liberar() {
    if (diferido) { diferido = false; INV.Libro.pintar(); }
  }

  function cancelar() {
    if (!editor) return;
    cerrarEditor();
    INV.Libro.pintar();
    marcar();
  }

  async function guardarCelda(fila, campo, valor) {
    const conflictos = valor && UNICOS.includes(campo) ? B.conflictosDe(S.activos, { [campo]: valor }, fila.id) : [];
    try {
      await INV.A.guardar(fila.id, { [campo]: valor }, fila.version, { silencioso: true });
      INV.bus.emit('celda-guardada', { id: fila.id, campo });
      if (conflictos.length) {
        const c = conflictos[0];
        const otra = c.filas[0];
        INV.sello(`${c.etiqueta} ya registrada en N° ${INV.pad(INV.numeroDe(otra.id))} · ${otra.nombre || otra.descripcion || 'sin nombre'}`, {
          tipo: 'mal', titulo: 'Duplicado', dur: 7000, accion: { texto: 'Ver', fn: () => INV.Libro.irA(otra.id) },
        });
      }
    } catch (e) {
      if (e.status === 409) {
        INV.sello('Otro usuario modificó este registro. Se actualizó la fila; repita el cambio.', { tipo: 'mal', titulo: 'Conflicto', dur: 6000 });
        await INV.cargar().catch(() => {});
      } else {
        INV.sello(e.red ? 'Sin conexión con el servidor. El cambio no se guardó.' : e.message, { tipo: 'mal', titulo: 'No se guardó', dur: 6000 });
        INV.Libro.pintar();
      }
    }
  }

  async function confirmar(direccion) {
    const ed = editor;
    if (!ed || ed.terminado) return;
    ed.terminado = true;
    const nuevo = INV.canon(ed.campo, ed.control.value);
    const fila = S.porId.get(ed.id);
    const lista = ids();
    const i = lista.indexOf(ed.id);
    const siguiente = i >= 0 && i < lista.length - 1 ? lista[i + 1] : null;
    const cols = columnas();
    const ci = cols.indexOf(ed.campo);
    let destino = { id: ed.id, campo: ed.campo };
    if (direccion === 'abajo') destino = { id: siguiente || ed.id, campo: ed.campo };
    else if (direccion === 'derecha') destino = ci < cols.length - 1 ? { id: ed.id, campo: cols[ci + 1] } : { id: siguiente || ed.id, campo: cols[0] };
    else if (direccion === 'izquierda') destino = ci > 0 ? { id: ed.id, campo: cols[ci - 1] } : destino;
    cerrarEditor();
    S.activoId = destino.id;
    S.celda = destino.campo;
    const cambio = fila && nuevo !== String(fila[ed.campo] || '');
    if (cambio) await guardarCelda(fila, ed.campo, nuevo);
    else INV.Libro.pintar();
    INV.Libro.ponerActiva(destino.id, { desplazar: true });
    marcar();
    liberar();
    INV.bus.emit('celda');
  }

  function alTecla(e) {
    if (!habilitado() || editor) return false;
    const ctrl = e.ctrlKey || e.metaKey;
    if (!S.activoId) return false;
    if (e.key === 'ArrowLeft' && !ctrl) { moverHorizontal(-1); return true; }
    if (e.key === 'ArrowRight' && !ctrl) { moverHorizontal(1); return true; }
    if (e.key === 'Tab' && S.celda) { moverHorizontal(e.shiftKey ? -1 : 1); return true; }
    if (e.key === 'Escape' && S.celda) { limpiarSeleccion(); return true; }
    if (e.key === 'Enter' || e.key === 'F2') {
      if (!S.celda) seleccionar(S.activoId, celdaPorDefecto());
      iniciar(S.activoId, S.celda);
      return true;
    }
    return false;
  }

  function montar(el) {
    contenedor = el;
  }

  INV.Celdas = {
    montar, marcar, seleccionar, limpiarSeleccion, iniciar, alTecla,
    activo: () => !!editor,
    diferir: () => { diferido = true; },
    habilitado,
  };
})();
