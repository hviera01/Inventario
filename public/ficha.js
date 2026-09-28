(function () {
  const INV = window.INV;
  const { h, esc, ico, pad } = INV;
  const B = window.Busqueda;
  const C = window.Campos;
  const S = INV.S;

  const SECCIONES = [
    { t: 'Equipo', campos: [['descripcion', 'c3'], ['nombre', 'c3'], ['marca', 'c2'], ['modelo', 'c2'], ['serie', 'c2']] },
    { t: 'Red', campos: [['mac', 'c3'], ['ip', 'c3']] },
    { t: 'Ubicación', campos: [['ubicacion', 'c2'], ['departamento', 'c2'], ['responsable', 'c2']] },
    { t: 'Clasificación', campos: [['categoria', 'c3'], ['nomenclatura', 'c3'], ['tipo', 'c2'], ['cantidad', 'c2'], ['proveedor', 'c2']] },
    { t: 'Registro', campos: [['id_activo', 'c3'], ['codigo', 'c3']] },
  ];
  const COMBOS = new Set(['descripcion', 'marca', 'modelo', 'proveedor', 'ubicacion', 'departamento', 'responsable']);
  const SELECTS = { categoria: () => C.CATEGORIAS, nomenclatura: () => C.NOMENCLATURAS, tipo: () => C.TIPOS };
  const MONO = new Set(['mac', 'ip', 'serie', 'modelo', 'codigo', 'id_activo']);
  const MAYUS = new Set(['marca', 'modelo']);
  const COMUNES = ['categoria', 'nomenclatura', 'tipo', 'cantidad', 'proveedor', 'ubicacion', 'departamento', 'responsable'];
  const DEFECTOS = { categoria: C.CATEGORIAS[0], nomenclatura: 'HW', tipo: 'Fisico', cantidad: '1', ubicacion: 'Oficina Principal' };

  function resaltar(texto, q) {
    if (!q) return esc(texto);
    const i = B.norm(texto).indexOf(q);
    if (i < 0) return esc(texto);
    return `${esc(texto.slice(0, i))}<mark>${esc(texto.slice(i, i + q.length))}</mark>${esc(texto.slice(i + q.length))}`;
  }

  function crearCombo(input, campo, valores) {
    let lista = null;
    let items = [];
    let sel = -1;
    let alDesplazar = null;

    function opciones() {
      const base = INV.conteosDe(campo);
      if (campo === 'modelo') {
        const marca = B.norm(valores.marca || '');
        if (marca) {
          const m = new Map();
          for (const f of S.activos) if (f.modelo && B.norm(f.marca) === marca) m.set(f.modelo, (m.get(f.modelo) || 0) + 1);
          const propios = [...m.entries()].sort((a, b) => b[1] - a[1]);
          const usados = new Set(propios.map(([v]) => v));
          return [...propios, ...base.filter(([v]) => !usados.has(v))];
        }
      }
      if ((campo === 'marca' || campo === 'modelo') && (valores.descripcion || '').trim()) {
        const familia = C.familiaEquipo(valores.descripcion).id;
        if (familia !== 'otro') {
          const m = new Map();
          for (const f of S.activos) {
            if (!f[campo] || C.familiaEquipo(f.descripcion).id !== familia) continue;
            m.set(f[campo], (m.get(f[campo]) || 0) + 1);
          }
          const propios = [...m.entries()].sort((a, b) => b[1] - a[1]);
          const usados = new Set(propios.map(([v]) => v));
          return [...propios, ...base.filter(([v]) => !usados.has(v))];
        }
      }
      return base;
    }

    function cerrar() {
      if (!lista) return;
      window.removeEventListener('scroll', alDesplazar, true);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', posicionar);
      lista.remove();
      lista = null;
      sel = -1;
    }

    function pintar() {
      const q = B.norm(input.value.trim());
      const todas = opciones();
      let f = q ? todas.filter(([v]) => B.norm(v).includes(q)) : todas;
      if (q) f = [...f.filter(([v]) => B.norm(v).startsWith(q)), ...f.filter(([v]) => !B.norm(v).startsWith(q))];
      items = f.slice(0, 40).map(([v, n]) => ({ v, n }));
      if (!items.length) { cerrar(); return; }
      if (!lista) {
        lista = h('div', { class: 'sugs', role: 'listbox' });
        lista.addEventListener('mousedown', (e) => {
          const b = e.target.closest('.sug');
          if (b) { e.preventDefault(); elegir(Number(b.dataset.i)); }
        });
        document.body.appendChild(lista);
        alDesplazar = () => posicionar();
        window.addEventListener('scroll', alDesplazar, true);
        if (window.visualViewport) window.visualViewport.addEventListener('resize', posicionar);
      }
      sel = Math.min(sel, items.length - 1);
      lista.innerHTML = items.map((it, i) => `<button type="button" class="sug${i === sel ? ' sel' : ''}" data-i="${i}" role="option"><span>${resaltar(it.v, q)}</span><span class="n">${it.n}</span></button>`).join('');
      posicionar();
      const s = lista.querySelector('.sel');
      if (s) s.scrollIntoView({ block: 'nearest' });
    }

    function posicionar() {
      if (!lista) return;
      const r = input.getBoundingClientRect();
      const vv = window.visualViewport;
      const limite = vv ? vv.offsetTop + vv.height : window.innerHeight;
      lista.style.position = 'fixed';
      lista.style.right = 'auto';
      lista.style.marginTop = '0';
      lista.style.zIndex = '170';
      lista.style.minWidth = Math.max(r.width, 240) + 'px';
      lista.style.maxWidth = Math.max(240, window.innerWidth - 16) + 'px';
      lista.style.left = Math.max(8, Math.min(r.left, window.innerWidth - lista.offsetWidth - 8)) + 'px';
      const alto = lista.offsetHeight;
      const arriba = r.top - alto - 2;
      lista.style.top = (r.bottom + 2 + alto > limite - 8 && arriba > 8 ? arriba : r.bottom + 2) + 'px';
    }

    function elegir(i) {
      const it = items[i];
      if (!it) return;
      input.value = it.v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      cerrar();
    }

    input.mostrarSugerencias = pintar;
    input.addEventListener('focus', pintar);
    input.addEventListener('input', () => { sel = -1; pintar(); });
    input.addEventListener('blur', () => {
      setTimeout(cerrar, 100);
      const v = INV.canon(campo, input.value);
      if (v !== input.value) { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!lista) pintar(); sel = Math.min(items.length - 1, sel + 1); pintar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(-1, sel - 1); pintar(); }
      else if (e.key === 'Enter' && lista && sel >= 0) { e.preventDefault(); e.stopPropagation(); elegir(sel); }
      else if (e.key === 'Escape' && lista) { e.preventDefault(); e.stopPropagation(); cerrar(); }
    });
  }

  function diferencias(a, b) {
    return C.CLAVES.filter((k) => String(a[k] || '') !== String(b[k] || ''));
  }

  function abrir({ id = null, base = null, despuesDe = null } = {}) {
    const original = id ? S.porId.get(id) : null;
    if (id && !original) { INV.sello('El registro ya no existe', { tipo: 'mal' }); return null; }
    const esNuevo = !original;
    const vals = {};
    C.CLAVES.forEach((k) => { vals[k] = original ? String(original[k] || '') : String((base && base[k]) || ''); });
    if (esNuevo) for (const [k, v] of Object.entries(DEFECTOS)) if (!vals[k]) vals[k] = v;
    const inicial = { ...vals };
    const controles = {};
    const campoEls = {};
    let guardando = false;

    const banda = h('div', { class: 'banda oculto' });
    const avisoRed = h('div', { class: 'aviso-campo oculto' });
    const avisoMac = h('div', { class: 'aviso-campo rojo oculto' });
    const separar = h('div', { class: 'separar oculto' });
    const plantillas = h('div', { class: 'aviso-campo oculto' });
    const avisoPendiente = h('div', { class: 'aviso-campo oculto' });

    function crearCampo(k, ancho) {
      let control;
      if (SELECTS[k]) {
        control = h('select', { id: 'f-' + k, 'data-k': k });
        const opciones = [...SELECTS[k]()];
        if (k === 'categoria') (S.existentes.categoria || []).forEach((v) => { if (!opciones.includes(v)) opciones.push(v); });
        if (vals[k] && !opciones.includes(vals[k])) opciones.push(vals[k]);
        control.appendChild(h('option', { value: '' }, '—'));
        opciones.forEach((o) => control.appendChild(h('option', { value: o }, o)));
        control.value = vals[k];
      } else {
        control = h('input', {
          id: 'f-' + k, 'data-k': k, type: 'text', value: vals[k], autocomplete: 'off', spellcheck: 'false',
          class: MONO.has(k) ? 'mono' : null, 'data-mayus': MAYUS.has(k) ? '1' : null,
          inputmode: k === 'cantidad' ? 'numeric' : null, maxlength: 200,
          autocapitalize: k === 'mac' || MAYUS.has(k) ? 'characters' : 'sentences',
        });
      }
      controles[k] = control;
      const cont = COMBOS.has(k) ? h('div', { class: 'combo' }, control) : control;
      const el = h('div', { class: 'campo ' + ancho }, h('label', { for: 'f-' + k }, C.ETIQUETA[k].replace('Nomenclatura Categoría de Activo', 'Nomenclatura').replace('Tipo (Virtual o Fisico )', 'Tipo'), h('i', null, C.LETRA[k])), cont);
      campoEls[k] = el;
      control.addEventListener('input', () => alEscribir(k));
      control.addEventListener('change', () => alEscribir(k));
      if (COMBOS.has(k)) crearCombo(control, k, vals);
      if (k === 'descripcion') control.addEventListener('blur', () => setTimeout(autoPlantilla, 130));
      if (k === 'mac') control.addEventListener('blur', () => { const v = C.formatearMac(control.value); if (v !== control.value) { control.value = v; alEscribir('mac'); } });
      if (k === 'ip') control.addEventListener('blur', () => { const v = control.value.trim(); if (v !== control.value) { control.value = v; alEscribir('ip'); } });
      return el;
    }

    const secciones = SECCIONES.map((s) => {
      const hijos = s.campos.map(([k, a]) => crearCampo(k, a));
      if (s.t === 'Equipo') hijos.unshift(plantillas);
      if (s.t === 'Red') hijos.push(avisoMac, avisoRed);
      if (s.t === 'Ubicación') hijos.push(separar);
      return h('section', { class: 'seccion' }, h('div', { class: 'espina' }, h('span', null, s.t)), h('div', { class: 'campos' }, hijos));
    });

    const meta = h('div', { class: 'meta-ficha' });
    const cuerpo = h('div', { class: 'secciones' }, meta, banda, avisoPendiente, ...secciones);

    function pintarMeta() {
      const f = original && S.porId.get(id);
      if (!f) {
        const propios = S.activos.filter((x) => x.creado_por === S.usuario && x.origen === 'manual');
        const ultimo = propios[propios.length - 1];
        meta.innerHTML = despuesDe
          ? `<span>Se insertará a continuación del registro <b>N° ${pad(INV.numeroDe(despuesDe))}</b></span>`
          : (ultimo ? `<span>Se agregará junto a los registros que usted creó, a continuación del <b>N° ${pad(INV.numeroDe(ultimo.id))}</b></span>` : '<span>Se agregará al final de la lista</span>');
        return;
      }
      meta.innerHTML = `<span>Registro <b>N° ${pad(INV.numeroDe(id))}</b> · fila Excel <b>${INV.numeroDe(id) + 5}</b></span><span>Creado por <b>${esc(f.creado_por || '—')}</b> · ${INV.fechaHora(f.creado_en)}</span><span>Modificado por <b>${esc(f.actualizado_por || '—')}</b> · ${INV.fechaHora(f.actualizado_en)}</span>`;
    }

    function avisosDuplicados() {
      const cs = B.conflictosDe(S.activos, vals, id);
      avisoMac.classList.add('oculto');
      avisoRed.classList.add('oculto');
      Object.values(campoEls).forEach((e) => e.classList.remove('alerta'));
      if (!cs.length) return;
      const nodo = h('div', { style: { display: 'grid', gap: '6px', width: '100%' } });
      cs.forEach((c) => {
        campoEls[c.campo] && campoEls[c.campo].classList.add('alerta');
        c.filas.slice(0, 3).forEach((f) => {
          nodo.appendChild(h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
            h('b', null, `${c.etiqueta} duplicada`),
            h('span', null, `N° ${pad(INV.numeroDe(f.id))} · ${f.nombre || f.descripcion || 'sin nombre'}${f.ubicacion ? ' · ' + f.ubicacion : ''}${f.responsable ? ' · ' + f.responsable : ''}`),
            h('button', { type: 'button', class: 'btn mini', onclick: () => cambiarA(f.id) }, 'Abrir registro')));
        });
      });
      avisoMac.replaceChildren(nodo);
      avisoMac.classList.remove('oculto');
    }

    function pintarPendiente() {
      const f = original && S.porId.get(id);
      const esPendiente = !!(f && f.pendiente);
      avisoPendiente.classList.toggle('oculto', !esPendiente);
      if (!esPendiente) return;
      avisoPendiente.replaceChildren(ico('alerta'), h('span', null, h('b', null, 'Marcado como pendiente'), ': ' + (f.motivo_pendiente || '')),
        h('button', { type: 'button', class: 'btn mini', onclick: async () => {
          try { await INV.A.quitarPendiente(id); INV.sello('Pendiente quitado', { tipo: 'bien', dur: 2200 }); } catch (e) { INV.sello(e.message, { tipo: 'mal' }); }
        } }, 'Quitar pendiente'));
    }

    function avisosSeparar() {
      const d = vals.departamento || '';
      const i = d.indexOf('/');
      if (i <= 0 || i === d.length - 1) { separar.classList.add('oculto'); return; }
      const depto = d.slice(0, i).trim(), resp = d.slice(i + 1).trim();
      if (!depto || !resp) { separar.classList.add('oculto'); return; }
      separar.replaceChildren(h('b', null, 'Departamento y responsable unidos'), h('span', null, `Separar en Departamento «${depto}» y Responsable «${resp}»`),
        h('button', { type: 'button', class: 'btn mini marino', onclick: () => {
          controles.departamento.value = depto;
          controles.responsable.value = INV.canon('responsable', resp);
          alEscribir('departamento');
          alEscribir('responsable');
        } }, ico('separar'), 'Separar'));
      separar.classList.remove('oculto');
    }

    const CAMPOS_PLANTILLA = ['marca', 'modelo', 'proveedor', 'categoria', 'nomenclatura', 'tipo', 'cantidad'];
    let plantillaAplicada = null;

    function plantillasDe() {
      const d = B.norm((vals.descripcion || '').trim());
      if (!d) return [];
      const m = new Map();
      for (const f of S.activos) {
        if (B.norm(f.descripcion) !== d) continue;
        const k = [f.marca, f.modelo, f.proveedor, f.categoria, f.nomenclatura, f.tipo, f.cantidad].join('\u0001');
        if (!m.has(k)) m.set(k, { f, n: 0 });
        m.get(k).n += 1;
      }
      return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 4);
    }

    function aplicarPlantilla(f) {
      const previo = {};
      for (const k of CAMPOS_PLANTILLA) {
        if (!controles[k]) continue;
        previo[k] = controles[k].value;
        controles[k].value = f[k] || '';
        vals[k] = controles[k].value;
      }
      Object.keys(controles).forEach(marcarCambio);
      return previo;
    }

    function avisosPlantillas() {
      if (plantillaAplicada) return;
      if (!esNuevo) { plantillas.classList.add('oculto'); return; }
      if (vals.marca || vals.modelo) { plantillas.classList.add('oculto'); return; }
      const top = plantillasDe();
      if (!top.length) { plantillas.classList.add('oculto'); return; }
      plantillas.replaceChildren(h('b', { style: { color: 'var(--marino)' } }, 'Completar con datos de equipos similares'),
        ...top.map(({ f, n }, i) => h('button', { type: 'button', class: 'btn mini', 'data-alt': String(i + 1), onclick: () => {
          aplicarPlantilla(f);
          plantillas.classList.add('oculto');
          controles.nombre.focus();
        } }, `${f.marca || 'sin marca'}${f.modelo ? ' · ' + f.modelo : ''} ×${n}`, h('span', { class: 'mono', style: { opacity: '.55', marginLeft: '6px' } }, 'Alt+' + (i + 1)))));
      plantillas.classList.remove('oculto');
    }

    function autoPlantilla() {
      if (!esNuevo || plantillaAplicada || vals.marca || vals.modelo) return;
      const top = plantillasDe();
      if (top.length !== 1) return;
      const { f, n } = top[0];
      const previo = aplicarPlantilla(f);
      plantillaAplicada = previo;
      plantillas.replaceChildren(h('b', { style: { color: 'var(--marino)' } }, 'Datos completados'),
        h('span', null, `Se copiaron marca, modelo y clasificación de ${n} ${n === 1 ? 'equipo igual' : 'equipos iguales'}.`),
        h('button', { type: 'button', class: 'btn mini', onclick: () => {
          for (const k of Object.keys(previo)) { controles[k].value = previo[k]; vals[k] = previo[k]; }
          Object.keys(controles).forEach(marcarCambio);
          plantillaAplicada = null;
          plantillas.classList.add('oculto');
        } }, 'Deshacer'));
      plantillas.classList.remove('oculto');
    }

    function marcarCambio(k) {
      if (esNuevo) { campoEls[k].classList.remove('cambiado'); return; }
      campoEls[k].classList.toggle('cambiado', String(vals[k] || '') !== String(original[k] || ''));
    }

    const revisar = INV.debounce(() => { avisosDuplicados(); }, 120);

    function alEscribir(k) {
      if (k === 'descripcion' && plantillaAplicada && controles[k].value !== vals[k]) {
        const previo = plantillaAplicada;
        plantillaAplicada = null;
        for (const c of Object.keys(previo)) { controles[c].value = previo[c]; vals[c] = previo[c]; marcarCambio(c); }
        plantillas.classList.add('oculto');
      }
      vals[k] = controles[k].value;
      marcarCambio(k);
      if (k === 'mac' || k === 'ip' || k === 'serie' || k === 'codigo' || k === 'id_activo') revisar();
      if (k === 'departamento') avisosSeparar();
      if (k === 'descripcion' || k === 'marca' || k === 'modelo') avisosPlantillas();
    }

    const hayCambios = () => C.CLAVES.some((k) => String(vals[k] || '') !== String(inicial[k] || ''));

    function contenidoCanonico() {
      const r = {};
      for (const k of C.CLAVES) r[k] = INV.canon(k, vals[k] || '');
      return r;
    }

    async function cambiarA(otroId) {
      if (hayCambios() && !(await INV.confirmar({ titulo: 'Cambios sin guardar', texto: 'Al abrir otro registro se perderán los cambios de esta ficha.', ok: 'DESCARTAR Y ABRIR', peligro: true }))) return;
      hoja.cerrar();
      abrir({ id: otroId });
    }

    async function guardar(modo) {
      if (guardando) return;
      const datos = contenidoCanonico();
      if (!datos.nombre && !datos.descripcion) {
        INV.sello('Ingrese al menos el nombre o la descripción del equipo.', { tipo: 'mal', titulo: 'Dato requerido' });
        (controles.descripcion || controles.nombre).focus();
        return;
      }
      if (!esNuevo && !hayCambios()) { hoja.cerrar(); return; }
      guardando = true;
      setBotones(true);
      try {
        let fila;
        if (esNuevo) fila = await INV.A.crear(datos, despuesDe);
        else fila = await guardarConflicto(datos, original.version);
        if (!fila) { guardando = false; setBotones(false); return; }
        INV.sello(`Guardado · N° ${pad(INV.numeroDe(fila.id))} ${fila.nombre || fila.descripcion || ''}`, { tipo: 'bien', dur: 2600 });
        inicial.__ok = true;
        Object.assign(inicial, vals);
        hoja.cerrar();
        INV.bus.emit('ficha-guardada', { id: fila.id, otro: modo === 'otro', nuevo: esNuevo });
        if (modo === 'otro') {
          const b = {};
          COMUNES.forEach((k) => { b[k] = datos[k]; });
          abrir({ base: b, despuesDe: fila.id });
        }
      } catch (e) {
        guardando = false;
        setBotones(false);
        INV.sello(e.red ? 'Sin conexión con el servidor. Los datos permanecen en pantalla; intente guardar nuevamente.' : e.message, { tipo: 'mal', titulo: 'No se guardó el registro', dur: 6000 });
      }
    }

    async function guardarConflicto(datos, version) {
      try {
        return await INV.A.guardar(id, datos, version);
      } catch (e) {
        if (e.status !== 409 || !e.data || !e.data.actual) throw e;
        const actual = e.data.actual;
        const difs = diferencias(datos, actual).filter((k) => String(datos[k] || '') !== String(original[k] || ''));
        const tabla = h('table', { class: 'tabla-cambios', style: { marginTop: '10px' } },
          h('thead', null, h('tr', null, h('th', null, 'Campo'), h('th', null, 'Valor actual'), h('th', null, 'Su cambio'))),
          h('tbody', null, difs.map((k) => h('tr', null, h('td', null, C.ETIQUETA[k]), h('td', null, actual[k] || '—'), h('td', null, h('b', null, datos[k] || '—'))))));
        const sobre = await INV.confirmar({
          titulo: 'Registro modificado por otro usuario', ok: 'SOBRESCRIBIR', cancelar: 'VER VERSIÓN ACTUAL',
          texto: `${actual.actualizado_por || 'Otro usuario'} modificó este registro mientras estaba abierto.`, extra: difs.length ? tabla : null, peligro: true,
        });
        if (sobre) return INV.A.guardar(id, datos, actual.version);
        hoja.cerrar();
        abrir({ id });
        return null;
      }
    }

    function setBotones(x) { hoja.pieEl.querySelectorAll('.btn').forEach((b) => { b.disabled = x; }); }

    async function duplicar() {
      if (hayCambios() && !(await INV.confirmar({ titulo: 'Cambios sin guardar', texto: 'La copia se genera a partir del registro guardado; los cambios de esta ficha se descartarán.', ok: 'DUPLICAR', peligro: true }))) return;
      const b = { ...original };
      ['nombre', 'mac', 'ip', 'serie', 'codigo', 'id_activo'].forEach((k) => { b[k] = ''; });
      hoja.cerrar();
      abrir({ base: b, despuesDe: id });
    }

    async function eliminar() {
      if (!(await INV.confirmar({ titulo: 'Eliminar registro', texto: `Se eliminará el registro N° ${pad(INV.numeroDe(id))} · ${original.nombre || original.descripcion}. Permanece en la papelera y puede recuperarse.`, ok: 'ELIMINAR', peligro: true }))) return;
      inicial.__ok = true;
      Object.assign(inicial, vals);
      hoja.cerrar();
      try {
        await INV.A.eliminar([id]);
        INV.sello('Registro eliminado', { accion: { texto: 'Deshacer', fn: () => INV.A.restaurar([id]) }, dur: 6000 });
      } catch (e) { INV.sello(e.message, { tipo: 'mal' }); }
    }

    const pie = esNuevo
      ? [h('button', { class: 'btn senal', onclick: () => guardar('otro') }, ico('check'), 'Guardar y agregar otro ', h('span', { class: 'mono', style: { opacity: '.6', fontSize: '10px' } }, 'Ctrl+Enter')),
        h('button', { class: 'btn', onclick: () => guardar('cerrar') }, 'Guardar y cerrar ', h('span', { class: 'mono', style: { opacity: '.6', fontSize: '10px' } }, 'Ctrl+S')),
        h('span', { class: 'relleno' }),
        h('button', { class: 'btn', onclick: () => hoja.solicitarCierre() }, 'Cancelar')]
      : [h('button', { class: 'btn senal', onclick: () => guardar('cerrar') }, ico('check'), 'Guardar ', h('span', { class: 'mono', style: { opacity: '.6', fontSize: '10px' } }, 'Ctrl+Enter')),
        h('button', { class: 'btn', onclick: duplicar }, ico('duplicar'), 'Duplicar'),
        h('button', { class: 'btn', onclick: () => INV.Paneles.historial(id) }, ico('reloj'), 'Historial'),
        h('span', { class: 'relleno' }),
        h('button', { class: 'btn peligro', onclick: eliminar }, ico('papelera'), 'Eliminar'),
        h('button', { class: 'btn', onclick: () => hoja.solicitarCierre() }, 'Cancelar')];

    const rotulo = esNuevo ? 'Ficha de activo' : `Ficha de activo · Fila Excel ${INV.numeroDe(id) + 5}`;
    const hoja = INV.abrirHoja({
      titulo: esNuevo ? 'Nuevo activo' : `N° ${pad(INV.numeroDe(id))} — ${original.nombre || original.descripcion || 'sin nombre'}`,
      rotulo, clase: 'completa', cuerpo, pie, minimizable: true,
      sello: { texto: esNuevo ? 'Nuevo' : 'Editando', clase: esNuevo ? 'nuevo' : '' },
      alCerrar: () => { desuscribir.forEach((f) => f()); INV.A.editando(null); },
    });
    hoja.guardia = async () => {
      if (!hayCambios()) return true;
      return INV.confirmar({ titulo: 'Cambios sin guardar', texto: 'La ficha tiene cambios sin guardar. ¿Desea descartarlos?', ok: 'DESCARTAR', cancelar: 'CONTINUAR EDITANDO', peligro: true });
    };
    hoja.el.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); guardar(esNuevo ? 'otro' : 'cerrar'); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); guardar('cerrar'); }
      else if (e.altKey && /^[1-4]$/.test(e.key)) {
        const chip = plantillas.querySelector(`[data-alt="${e.key}"]`);
        if (chip && !plantillas.classList.contains('oculto')) { e.preventDefault(); chip.click(); }
      } else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !document.querySelector('.sugs')) {
        e.preventDefault();
        const orden = [...hoja.el.querySelectorAll('.campo input,.campo select')];
        const i = orden.indexOf(e.target);
        if (i >= 0 && i < orden.length - 1) orden[i + 1].focus(); else guardar(esNuevo ? 'otro' : 'cerrar');
      }
    });

    function pintarBanda() {
      const q = original ? INV.quienEdita(id) : null;
      const actual = original ? S.porId.get(id) : null;
      banda.classList.add('oculto');
      if (q) {
        banda.replaceChildren(ico('alerta'), h('span', null, h('b', null, q.nombre), ' tiene abierto este mismo registro. Si ambos guardan, se mostrará una comparación de cambios.'));
        banda.classList.remove('oculto');
      } else if (actual && actual.version !== original.version) {
        banda.replaceChildren(ico('alerta'), h('span', null, h('b', null, actual.actualizado_por || 'Alguien'), ' modificó este registro mientras estaba abierto. Al guardar se mostrará la comparación de cambios.'));
        banda.classList.remove('oculto');
      }
    }
    const desuscribir = [INV.bus.on('presencia', pintarBanda), INV.bus.on('datos', () => { pintarBanda(); pintarPendiente(); })];

    Object.keys(controles).forEach(marcarCambio);
    pintarMeta();
    avisosDuplicados();
    avisosSeparar();
    pintarBanda();
    pintarPendiente();
    if (id) INV.A.editando(id);
    setTimeout(() => {
      const primero = esNuevo && !vals.descripcion ? controles.descripcion : controles.nombre;
      if (primero) { primero.focus(); primero.select && primero.select(); }
    }, 30);
    return hoja;
  }

  INV.crearCombo = crearCombo;
  INV.Ficha = { abrir };
})();
