(function () {
  const INV = window.INV;
  const { h, esc, ico, pad } = INV;
  const S = INV.S;
  const C = window.Campos;

  function separarDepartamentos() {
    const B = window.Busqueda;
    const items = INV.candidatosSeparar().map((f) => {
      const r = B.separarDepartamento(f.departamento);
      const conflicto = !!String(f.responsable || '').trim() && String(f.responsable).trim() !== r.resp;
      return { f, r, conflicto, marcado: !conflicto };
    });
    if (!items.length) { INV.sello('No hay departamentos con responsable unido.', { dur: 3000 }); return null; }
    const cont = h('div');
    const btnAplicar = h('button', { class: 'btn senal' });
    const hoja = INV.abrirHoja({
      titulo: 'Separar departamentos y responsables', rotulo: 'Vista previa', clase: 'ancha', cuerpo: cont,
      pie: [
        h('button', { class: 'btn', onclick: () => { items.forEach((x) => { x.marcado = true; }); pintar(); } }, 'Marcar todos'),
        h('button', { class: 'btn', onclick: () => { items.forEach((x) => { x.marcado = false; }); pintar(); } }, 'Desmarcar todos'),
        h('span', { class: 'relleno' }),
        h('button', { class: 'btn', onclick: () => hoja.solicitarCierre() }, 'Cancelar'),
        btnAplicar,
      ],
    });

    function pintar() {
      const n = items.filter((x) => x.marcado).length;
      const conflictos = items.filter((x) => x.conflicto).length;
      btnAplicar.replaceChildren(ico('separar'), n ? `Separar ${n}` : 'Separar');
      btnAplicar.disabled = n === 0;
      cont.replaceChildren(
        h('p', { class: 'nota', style: { marginTop: 0 } }, 'Cada valor con formato «Departamento/Responsable» se divide en sus dos columnas. Revise la lista y desmarque los que no correspondan.',
          conflictos ? h('span', null, ` ${conflictos} ya tienen otro responsable y quedan desmarcados.`) : null),
        h('div', { class: 'vista-previa' }, h('table', { class: 'tabla-cambios' },
          h('thead', null, h('tr', null, h('th', { style: { width: '34px' } }, ''), h('th', null, 'N°'), h('th', null, 'Valor actual'), h('th', null, 'Departamento'), h('th', null, 'Responsable'), h('th', null, 'Observación'))),
          h('tbody', null, items.map((x) => h('tr', { style: { cursor: 'pointer' }, onclick: () => { x.marcado = !x.marcado; pintar(); } },
            h('td', null, h('input', { type: 'checkbox', checked: x.marcado, onclick: (e) => e.stopPropagation(), onchange: (e) => { x.marcado = e.target.checked; pintar(); } })),
            h('td', { class: 'mono' }, pad(INV.numeroDe(x.f.id))),
            h('td', null, x.f.departamento),
            h('td', null, h('b', null, x.r.depto)),
            h('td', null, h('b', null, x.r.resp)),
            h('td', { style: { color: x.conflicto ? 'var(--aviso)' : 'var(--texto-3)' } }, x.conflicto ? `Ya tiene responsable «${x.f.responsable}»` : (x.f.nombre || x.f.descripcion || ''))))))));
    }

    btnAplicar.addEventListener('click', async () => {
      const lote = items.filter((x) => x.marcado).map((x) => ({ id: x.f.id, datos: { departamento: x.r.depto, responsable: x.r.resp } }));
      if (!lote.length) return;
      btnAplicar.disabled = true;
      try {
        const ids = await INV.A.varios(lote);
        hoja.cerrar();
        INV.sello(`${ids.length} registros actualizados`, { tipo: 'bien', titulo: 'Departamentos separados' });
      } catch (e) {
        INV.sello(e.message, { tipo: 'mal' });
        btnAplicar.disabled = false;
      }
    });
    pintar();
    return hoja;
  }

  async function conexion() {
    let d;
    try { d = await INV.pedir('GET', '/api/conexion'); } catch (e) { INV.sello(e.message, { tipo: 'mal' }); return; }
    const cont = h('div');
    const hoja = INV.abrirHoja({ titulo: 'Conexión de otro equipo', rotulo: 'Red local · sin internet', clase: 'media', cuerpo: cont });

    function copiar(texto, btn) {
      const listo = () => { btn.textContent = 'COPIADO'; setTimeout(() => { btn.textContent = 'COPIAR'; }, 1400); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(listo, () => {});
      else { const t = h('textarea', { value: texto }); document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); listo(); }
    }

    function pintar() {
      const btnCopia = h('button', { onclick: (e) => copiar(d.principal, e.currentTarget) }, 'COPIAR');
      const fw = d.firewall
        ? h('div', { class: 'fw ok' }, ico('check'), h('b', null, 'Firewall configurado'), h('span', null, 'La regla de entrada de este programa está activa.'))
        : h('div', { class: 'fw mal' }, ico('alerta'), h('b', null, 'Firewall sin configurar'), h('span', null, 'Sin esta regla otros equipos no pueden conectarse. Se configura una sola vez y requiere confirmación de Windows.'),
          h('button', { class: 'btn senal', onclick: async (e) => {
            e.currentTarget.disabled = true;
            try { const r = await INV.pedir('POST', '/api/firewall'); d.firewall = r.ok; } catch (_) { d.firewall = false; }
            d = { ...d, ...(await INV.pedir('GET', '/api/conexion')) };
            pintar();
          } }, 'Configurar'));
      cont.replaceChildren(
        h('div', { class: 'pasos' },
          h('div', { class: 'paso' }, h('div', null, h('h3', null, 'Activar el punto de acceso'), h('p', null, 'En el iPhone: Ajustes › Punto de acceso personal. Ambos equipos deben conectarse a esa red; no requiere datos móviles.'))),
          h('div', { class: 'paso' }, h('div', null, h('h3', null, 'Conectar el otro equipo'), h('p', null, 'Abrir el programa y seleccionar «Buscar de nuevo», o ingresar esta dirección en el navegador:'),
            h('div', { class: 'url-grande' }, h('code', null, d.principal.replace('http://', '')), btnCopia),
            d.redes.length > 1 || d.urlNombre ? h('div', { class: 'redes' }, ...d.redes.map((r, i) => h('div', { class: 'red-fila' + (i === 0 ? ' top' : '') }, r.url.replace('http://', ''), h('em', null, r.nombre))), d.urlNombre ? h('div', { class: 'red-fila' }, d.urlNombre.replace('http://', ''), h('em', null, 'por nombre del equipo')) : null) : null)),
          h('div', { class: 'paso' }, h('div', null, h('h3', null, 'Ingresar el PIN'), h('p', null, 'Se solicita una sola vez por equipo.'),
            h('div', { class: 'pin-tag' }, ...d.pin.split('').map((c) => h('span', null, c))),
            h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn mini', onclick: cambiarPin }, ico('llave'), 'Cambiar PIN')))),
          h('div', { class: 'paso' }, h('div', null, h('h3', null, 'Acceso desde iPhone, iPad o Android'), h('p', null, 'Conectar el dispositivo a la misma red y escanear el código con la cámara.'),
            h('div', { class: 'enlace-fila' }, h('div', { class: 'qr', html: d.qr }), h('p', { class: 'nota' }, 'Para instalarla como aplicación en iOS: Compartir › Añadir a pantalla de inicio. El teléfono que comparte la red puede no tener acceso por sí mismo; use otro dispositivo.'))))),
        fw);
    }

    async function cambiarPin() {
      const nuevo = window.prompt('Nuevo PIN (4 a 8 dígitos). Los demás equipos deberán ingresarlo nuevamente.', d.pin);
      if (!nuevo) return;
      if (!/^\d{4,8}$/.test(nuevo)) { INV.sello('El PIN debe tener entre 4 y 8 dígitos.', { tipo: 'mal' }); return; }
      await INV.pedir('POST', '/api/ajustes', { pin: nuevo });
      d = { ...d, ...(await INV.pedir('GET', '/api/conexion')) };
      pintar();
      INV.sello('PIN actualizado', { tipo: 'bien' });
    }
    pintar();
    return hoja;
  }

  function importar() {
    const cont = h('div');
    const pie = h('div', { style: { display: 'contents' } });
    let archivo = null;
    let esPrueba = S.ajustes.modoDefinido ? !!S.ajustes.modoPrueba : true;
    const hoja = INV.abrirHoja({ titulo: 'Importar Excel', rotulo: 'Carga desde archivo', clase: 'media', cuerpo: cont, pie: [h('span', { class: 'relleno' }), h('button', { class: 'btn', onclick: () => hoja.solicitarCierre() }, 'Cerrar')] });
    const input = h('input', { type: 'file', accept: '.xlsx', class: 'oculto' });

    function inicio() {
      const zona = h('div', { class: 'suelta', tabindex: '0', onclick: () => input.click(), onkeydown: (e) => { if (e.key === 'Enter') input.click(); } },
        h('b', null, 'Seleccionar archivo .xlsx'), h('span', null, 'o arrastrarlo a esta área. Formato esperado: hoja «Inventario Activos de Apoyo», encabezado en la fila 5 y datos desde la fila 6, columnas B a R.'));
      ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('encima'); }));
      ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('encima'); }));
      zona.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) leer(e.dataTransfer.files[0]); });
      cont.replaceChildren(zona, input);
    }
    input.addEventListener('change', () => { if (input.files[0]) leer(input.files[0]); });

    async function leer(f) {
      archivo = await f.arrayBuffer();
      cont.replaceChildren(h('p', { class: 'nota' }, 'Procesando archivo…'));
      try {
        const r = await INV.pedir('POST', '/api/importar?vista=1', archivo);
        vista(r, f.name);
      } catch (e) { INV.sello(e.message, { tipo: 'mal', titulo: 'Archivo no válido' }); inicio(); }
    }

    function vista(r, nombre) {
      const hayDatos = r.actuales > 0;
      cont.replaceChildren(...[
        h('p', { class: 'nota' }, h('b', null, nombre)),
        h('div', { class: 'cifras' },
          h('div', { class: 'cifra' }, h('b', null, r.filas), h('span', null, 'registros en el archivo')),
          h('div', { class: 'cifra' }, h('b', null, r.cambios), h('span', null, 'ajustes de formato')),
          h('div', { class: 'cifra' }, h('b', null, r.actuales), h('span', null, 'registros actuales'))),
        h('p', { class: 'nota' }, 'Ajustes de formato aplicados: Marca y Modelo en mayúsculas, MAC en formato AA:BB:CC:DD:EE:FF, espacios sobrantes y variantes que solo difieren en mayúsculas o minúsculas. ',
          h('b', null, 'No se modifican'), ' los campos Nombre y Departamento.'),
        r.resumen.length ? h('table', { class: 'tabla-cambios' },
          h('thead', null, h('tr', null, h('th', null, 'Columna'), h('th', null, 'Antes → Después'), h('th', null, 'Filas'))),
          h('tbody', null, r.resumen.slice(0, 60).map((c) => h('tr', null,
            h('td', null, C.ETIQUETA[c.campo] || c.campo),
            h('td', null, h('s', null, c.antes || '(vacío)'), ' → ', h('ins', null, c.despues || '(vacío)')),
            h('td', { class: 'x' }, '×' + c.n))))) : null,
        h('label', { class: 'fw ' + (esPrueba ? 'mal' : 'ok'), style: { cursor: 'pointer' } },
          h('input', { type: 'checkbox', checked: esPrueba, onchange: (e) => { esPrueba = e.target.checked; e.target.closest('.fw').className = 'fw ' + (esPrueba ? 'mal' : 'ok'); } }),
          h('b', null, 'Base de prueba'),
          h('span', null, 'Muestra un aviso permanente y agrega «PRUEBA» al nombre de los respaldos. La base puede restablecerse después para cargar los datos reales.')),
        hayDatos ? h('p', { class: 'nota' }, h('b', null, 'La base ya contiene datos.'), ' Al reemplazar, los registros actuales pasan a la papelera y se crea antes una copia de seguridad automática.') : null].filter(Boolean));
      const btn = h('button', { class: 'btn ' + (hayDatos ? 'peligro' : 'senal'), onclick: async (e) => {
        if (hayDatos && !(await INV.confirmar({ titulo: 'Reemplazar datos', texto: `Se reemplazarán ${r.actuales} registros por los ${r.filas} del archivo.`, ok: 'REEMPLAZAR', peligro: true }))) return;
        e.currentTarget.disabled = true;
        try {
          await INV.pedir('POST', `/api/importar?reemplazar=${hayDatos ? 1 : 0}&prueba=${esPrueba ? 1 : 0}`, archivo);
          await INV.cargar();
          INV.Deshacer.limpiar();
          hoja.cerrar();
          INV.sello(`${r.filas} registros importados`, { tipo: 'bien', titulo: 'Importación completada' });
        } catch (er) { INV.sello(er.message, { tipo: 'mal' }); e.currentTarget.disabled = false; }
      } }, ico('subir'), hayDatos ? 'Reemplazar todo' : `Importar ${r.filas} filas`);
      hoja.pieEl.replaceChildren(h('button', { class: 'btn', onclick: () => { archivo = null; inicio(); } }, 'Seleccionar otro archivo'), h('span', { class: 'relleno' }), btn);
    }
    inicio();
    return hoja;
  }

  function respaldo() {
    const cont = h('div');
    const hoja = INV.abrirHoja({ titulo: 'Respaldo y exportación', rotulo: 'Copias de seguridad', clase: 'media', cuerpo: cont, pie: [h('span', { class: 'relleno' }), h('button', { class: 'btn', onclick: () => hoja.solicitarCierre() }, 'Cerrar')] });

    async function exportar(ids, nombre) {
      try {
        const blob = await INV.pedir('POST', '/api/exportar', ids ? { ids } : {}, { blob: true });
        INV.descargar(blob, nombre);
        INV.sello('Archivo Excel generado', { tipo: 'bien' });
      } catch (e) { INV.sello(e.message, { tipo: 'mal' }); }
    }
    const hoy = new Date();
    const nombreArchivo = `Inventario de Hardware${S.ajustes.modoPrueba ? '_PRUEBA' : ''}_${hoy.getFullYear()}-${pad(hoy.getMonth() + 1, 2)}-${pad(hoy.getDate(), 2)}.xlsx`;

    function pintar() {
      const a = S.ajustes;
      const ult = Number(a.ultimoRespaldo || 0);
      const hoyOk = ult && new Date(ult).toDateString() === new Date().toDateString();
      cont.replaceChildren(
        h('div', { class: 'cifras' },
          h('div', { class: 'cifra' }, h('b', null, S.activos.length), h('span', null, 'registros activos')),
          h('div', { class: 'cifra' }, h('b', { style: { color: hoyOk ? 'var(--ok)' : 'var(--senal)' } }, ult ? INV.hora(ult) : '—'), h('span', null, ult ? (hoyOk ? 'último respaldo · hoy' : 'último respaldo · ' + INV.fechaHora(ult).slice(0, 10)) : 'sin respaldos aún'))),
        h('div', { class: 'form-linea' },
          h('div', null, h('h4', { style: { font: '800 13px var(--f-disp)', letterSpacing: '.2em', textTransform: 'uppercase', marginBottom: '6px' } }, 'Carpeta de respaldo (Google Drive)'),
            h('div', { class: 'url-grande', style: { background: 'var(--papel-2)', color: 'var(--tinta)', borderColor: 'var(--tinta)' } },
              h('code', { style: { fontSize: '14px' } }, a.carpetaRespaldo || 'No configurada'),
              S.local ? h('button', { onclick: elegirCarpeta }, 'ELEGIR') : null),
            h('p', { class: 'nota' }, S.local ? 'Seleccionar la carpeta sincronizada de Google Drive en este equipo. Cada respaldo incluye el archivo Excel completo y una copia de la base de datos; Drive los sincroniza cuando hay conexión a internet.' : 'La carpeta se configura desde el equipo servidor.')),
          h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
            h('button', { class: 'btn senal', onclick: hacer }, ico('disco'), 'Generar respaldo'),
            h('button', { class: 'btn', onclick: () => exportar(null, nombreArchivo) }, ico('excel'), 'Exportar Excel (completo)'),
            h('button', { class: 'btn', onclick: () => exportar(S.resultado.filas.map((f) => f.id), nombreArchivo.replace('.xlsx', ' (filtrado).xlsx')) }, ico('excel'), `Exportar vista actual (${S.resultado.filas.length})`)),
          h('div', null,
            h('h4', { style: { font: '800 13px var(--f-disp)', letterSpacing: '.2em', textTransform: 'uppercase', margin: '8px 0 6px' } }, 'Encabezado del Excel'),
            h('div', { class: 'campos', style: { padding: 0, gridTemplateColumns: '1fr' } },
              h('div', { class: 'campo' }, h('label', null, 'Línea 1'), h('input', { id: 'tit1', value: a.titulo1 || '' })),
              h('div', { class: 'campo' }, h('label', null, 'Línea 2'), h('input', { id: 'tit2', value: a.titulo2 || '' }))),
            h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn mini', onclick: guardarTitulos }, 'Guardar encabezado')))));
    }

    async function guardarTitulos() {
      await INV.pedir('POST', '/api/ajustes', { titulo1: cont.querySelector('#tit1').value, titulo2: cont.querySelector('#tit2').value });
      await INV.cargar();
      INV.sello('Encabezado guardado', { tipo: 'bien' });
    }
    async function elegirCarpeta() {
      try { await INV.pedir('POST', '/api/elegir-carpeta'); await INV.cargar(); pintar(); } catch (e) { INV.sello(e.message, { tipo: 'mal' }); }
    }
    async function hacer(e) {
      e.currentTarget.disabled = true;
      try {
        const r = await INV.pedir('POST', '/api/respaldo');
        await INV.cargar();
        INV.sello(`${r.archivos.length} archivos en ${r.carpeta}`, { tipo: 'bien', titulo: 'Respaldo generado', dur: 6000 });
        pintar();
      } catch (er) { INV.sello(er.message, { tipo: 'mal', titulo: 'No se pudo', dur: 7000 }); e.currentTarget.disabled = false; }
    }
    pintar();
    return hoja;
  }

  async function papelera() {
    const cont = h('div', { class: 'lista-papelera' });
    const hoja = INV.abrirHoja({ titulo: 'Papelera', rotulo: 'Registros eliminados', clase: 'media', cuerpo: cont });
    async function cargar() {
      const r = await INV.pedir('GET', '/api/papelera');
      if (!r.activos.length) { cont.replaceChildren(h('div', { class: 'limpio' }, h('b', null, 'Papelera vacía'), 'Los registros eliminados se conservan aquí y pueden recuperarse.')); return; }
      cont.replaceChildren(...r.activos.map((f) => h('div', { class: 'l' },
        h('div', null, h('b', null, f.nombre || f.descripcion || 'sin nombre'), h('div', { class: 'sec' }, [f.descripcion, f.ubicacion, f.responsable].filter(Boolean).join(' · '), ' · eliminado por ', f.actualizado_por || '—', ' ', INV.hace(f.actualizado_en))),
        h('button', { class: 'btn mini', onclick: async () => { await INV.A.restaurar([f.id]); INV.sello('Registro recuperado', { tipo: 'bien' }); cargar(); } }, ico('volver'), 'Recuperar'))));
    }
    try { await cargar(); } catch (e) { INV.sello(e.message, { tipo: 'mal' }); }
    return hoja;
  }

  async function historial(id) {
    const cont = h('div', { class: 'hist' });
    const hoja = INV.abrirHoja({ titulo: 'Historial', rotulo: `Fila N° ${pad(INV.numeroDe(id))}`, clase: 'media', cuerpo: cont });
    try {
      const r = await INV.pedir('GET', `/api/historial/${id}`);
      if (!r.historial.length) { cont.replaceChildren(h('div', { class: 'limpio' }, 'Sin movimientos registrados.')); return hoja; }
      cont.replaceChildren(...r.historial.map((x) => {
        let det = '';
        try {
          const d = JSON.parse(x.detalle);
          if (x.accion.startsWith('editar')) det = Object.entries(d).map(([k, v]) => `<div><b>${esc(C.ETIQUETA[k] || k)}:</b> <s>${esc(v.antes || '—')}</s> → <ins>${esc(v.despues || '—')}</ins></div>`).join('');
          else if (x.accion === 'crear') det = `<div>${esc(d.nombre || d.descripcion || '')}</div>`;
        } catch (_) { det = ''; }
        return h('div', { class: 'h' }, h('span', { class: 't' }, INV.fechaHora(x.ts)), h('span', { class: 'u' }, x.usuario || '—'), h('div', { html: `<b style="text-transform:uppercase;letter-spacing:.1em;font-size:11px">${esc(x.accion)}</b>${det}` }));
      }));
    } catch (e) { INV.sello(e.message, { tipo: 'mal' }); }
    return hoja;
  }

  function reiniciar() {
    let modo = 'real';
    const opcion = (valor, titulo, texto) => h('label', { class: 'fw', style: { cursor: 'pointer', marginTop: '10px' } },
      h('input', { type: 'radio', name: 'modo', value: valor, checked: valor === modo, onchange: () => { modo = valor; } }),
      h('b', null, titulo), h('span', null, texto));
    const hoja = INV.abrirHoja({
      titulo: 'Restablecer base de datos', rotulo: 'Reinicio de datos', clase: 'media',
      cuerpo: [
        h('p', { style: { fontSize: '15px' } }, 'Se eliminarán todos los registros, el historial y los duplicados descartados. Antes se guarda una copia de seguridad automática.'),
        opcion('real', 'Datos reales', 'La base queda vacía y sin aviso de prueba, lista para importar el inventario real.'),
        opcion('prueba', 'Mantener modo prueba', 'La base queda vacía y marcada como prueba.'),
      ],
      pie: [h('span', { class: 'relleno' }), h('button', { class: 'btn', onclick: () => hoja.solicitarCierre() }, 'Cancelar'),
        h('button', { class: 'btn peligro', onclick: async (e) => {
          e.currentTarget.disabled = true;
          try {
            await INV.pedir('POST', '/api/reiniciar', { modo });
            await INV.cargar();
            INV.Deshacer.limpiar();
            hoja.cerrar();
            INV.sello(modo === 'real' ? 'Base restablecida para datos reales.' : 'Base restablecida en modo prueba.', { tipo: 'bien', titulo: 'Completado', dur: 6000 });
          } catch (er) { INV.sello(er.message, { tipo: 'mal' }); e.currentTarget.disabled = false; }
        } }, ico('papelera'), 'Restablecer')],
    });
    return hoja;
  }

  function pedirNombre() {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'text', maxlength: 24, autocomplete: 'off', placeholder: 'Nombre y apellido', value: S.usuario || '' });
      const ir = () => {
        const v = inp.value.trim();
        if (!v) { inp.focus(); return; }
        S.usuario = v;
        INV.guardar('inv.nombre', v);
        pantalla.remove();
        resolve(v);
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); });
      const pantalla = h('div', { class: 'pantalla' }, h('div', { class: 'acceso' },
        h('header', null, h('h1', null, 'Inventario'), h('small', null, 'Registro de activos')),
        h('div', { class: 'cuerpo' },
          h('p', { style: { color: '#98A0A8' } }, 'Ingrese su nombre. Se utiliza para registrar quién crea o modifica cada registro.'),
          h('div', { class: 'campo' }, h('label', null, 'Nombre de usuario'), inp),
          h('button', { class: 'btn senal', onclick: ir }, 'Continuar'))));
      document.body.appendChild(pantalla);
      setTimeout(() => inp.focus(), 30);
    });
  }

  function pedirPin() {
    return new Promise((resolve) => {
      const celdas = Array.from({ length: 4 }, (_, i) => h('input', { type: 'password', inputmode: 'numeric', maxlength: 1, autocomplete: 'one-time-code', 'aria-label': 'Dígito ' + (i + 1) }));
      const err = h('div', { class: 'err' });
      async function enviar() {
        const pin = celdas.map((c) => c.value).join('');
        if (pin.length < 4) return;
        try {
          await INV.pedir('POST', '/api/login', { pin });
          pantalla.remove();
          resolve();
        } catch (e) {
          err.textContent = e.message.toUpperCase();
          celdas.forEach((c) => { c.value = ''; });
          celdas[0].focus();
        }
      }
      celdas.forEach((c, i) => {
        c.addEventListener('input', () => {
          c.value = c.value.replace(/\D/g, '').slice(-1);
          if (c.value && i < celdas.length - 1) celdas[i + 1].focus();
          if (celdas.every((x) => x.value)) enviar();
        });
        c.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !c.value && i > 0) celdas[i - 1].focus(); });
        c.addEventListener('paste', (e) => {
          const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
          if (!t) return;
          e.preventDefault();
          t.split('').forEach((ch, j) => { celdas[j].value = ch; });
          enviar();
        });
      });
      const pantalla = h('div', { class: 'pantalla' }, h('div', { class: 'acceso' },
        h('header', null, h('h1', null, 'Acceso'), h('small', null, 'PIN del equipo servidor')),
        h('div', { class: 'cuerpo' },
          h('p', { style: { color: '#98A0A8' } }, 'Ingrese el PIN que se muestra en el equipo servidor, en Más › Conexión de otro equipo.'),
          h('div', { class: 'pin-in' }, celdas), err)));
      document.body.appendChild(pantalla);
      setTimeout(() => celdas[0].focus(), 30);
    });
  }

  function columnas() {
    const lee = () => new Set(INV.guardado('inv.ocultas', '').split(',').filter(Boolean));
    const lista = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: '8px' } });
    function pintar() {
      const ocultas = lee();
      lista.replaceChildren(...C.CAMPOS.map((c) => h('label', { class: 'fw ' + (ocultas.has(c.k) ? '' : 'ok'), style: { cursor: 'pointer', marginTop: 0, padding: '9px 12px' } },
        h('input', { type: 'checkbox', checked: !ocultas.has(c.k), onchange: (e) => {
          const o = lee();
          if (e.target.checked) o.delete(c.k); else o.add(c.k);
          if (o.size >= C.CAMPOS.length) { e.target.checked = true; o.delete(c.k); }
          INV.guardar('inv.ocultas', [...o].join(','));
          INV.Libro.pintar();
          pintar();
        } }),
        h('span', { style: { flex: 1 } }, c.l.replace('Nomenclatura Categoría de Activo', 'Nomenclatura Categoría'), ' '),
        h('span', { class: 'mono', style: { opacity: '.6' } }, C.LETRA[c.k]))));
    }
    const hoja = INV.abrirHoja({
      titulo: 'Columnas visibles', rotulo: 'Vista de la tabla', clase: 'media',
      cuerpo: [h('p', { class: 'nota', style: { marginTop: 0 } }, 'Define qué columnas se muestran en la tabla. La exportación a Excel siempre incluye todas.'), lista],
      pie: [h('button', { class: 'btn', onclick: () => { INV.guardar('inv.ocultas', ''); INV.Libro.pintar(); pintar(); } }, 'Mostrar todas'), h('span', { class: 'relleno' }), h('button', { class: 'btn senal', onclick: () => hoja.cerrar() }, 'Cerrar')],
    });
    pintar();
    return hoja;
  }

  function atajos() {
    const grupos = [
      ['Tabla', [
        ['Flechas', 'Moverse entre celdas y filas'],
        ['F2  ·  Enter', 'Editar la celda seleccionada'],
        ['Enter', 'Guardar la celda y bajar a la fila siguiente'],
        ['Tab  ·  Mayús+Tab', 'Guardar y pasar a la celda siguiente o anterior'],
        ['Esc', 'Cancelar la edición o soltar la celda'],
        ['Ctrl+Z', 'Deshacer el último cambio'],
        ['Ctrl+Y  ·  Ctrl+Mayús+Z', 'Rehacer'],
        ['Doble clic  ·  Ctrl+E', 'Abrir la ficha completa'],
        ['Ctrl+D', 'Duplicar la fila (sin nombre, MAC, IP ni serie)'],
        ['Ctrl+Supr', 'Eliminar la fila'],
        ['Espacio  ·  Ctrl+A', 'Marcar la fila  ·  marcar todo lo visible'],
      ]],
      ['Ficha', [
        ['Enter', 'Siguiente campo'],
        ['Ctrl+Enter', 'Guardar; en registros nuevos, guardar y abrir otro'],
        ['Ctrl+S', 'Guardar y cerrar'],
        ['Alt+1 … Alt+4', 'Usar los datos de un equipo similar'],
        ['Esc', 'Cerrar'],
      ]],
      ['General', [
        ['/  ·  Ctrl+K', 'Ir al buscador'],
        ['N  ·  Alt+N', 'Agregar registro'],
        ['campo:valor  ·  “frase”  ·  -palabra', 'Búsqueda por campo, frase exacta o exclusión'],
        ['F1  ·  ?', 'Esta ayuda'],
        ['Ctrl+1  ·  Ctrl+2  ·  Ctrl+0', 'Agrandar, reducir o restablecer el tamaño del texto (también Ctrl+rueda del mouse)'],
        ['F11', 'Pantalla completa en el programa de Windows'],
      ]],
    ];
    const cuerpo = h('div', { style: { display: 'grid', gap: '18px' } }, grupos.map(([t, filas]) => h('section', null,
      h('h3', { style: { font: '800 15px var(--f-disp)', letterSpacing: '.18em', textTransform: 'uppercase', borderBottom: '2px solid var(--tinta)', paddingBottom: '5px', marginBottom: '4px' } }, t),
      ...filas.map(([k, d]) => h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(190px,auto) 1fr', gap: '14px', padding: '6px 0', borderBottom: '1px solid var(--regla)', alignItems: 'baseline' } },
        h('span', { class: 'mono', style: { fontWeight: '600', fontSize: '12.5px' } }, k), h('span', { style: { color: 'var(--tinta-2)' } }, d))))));
    const hoja = INV.abrirHoja({ titulo: 'Atajos de teclado', rotulo: 'Ayuda', clase: 'media', cuerpo, pie: [h('span', { class: 'relleno' }), h('button', { class: 'btn senal', onclick: () => hoja.cerrar() }, 'Cerrar')] });
    return hoja;
  }

  INV.Paneles = { separarDepartamentos, conexion, importar, respaldo, papelera, historial, pedirNombre, pedirPin, reiniciar, columnas, atajos };
})();
