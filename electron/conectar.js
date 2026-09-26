const api = window.electronAPI;
const el = (id) => document.getElementById(id);
const barrido = el('barrido');
const estado = el('estado-busqueda');
const lista = el('lista');
const ayuda = el('ayuda');
let buscando = false;

function texto(nodo, t) { nodo.textContent = t; }

async function conectarA(s) {
  texto(estado, `Conectando con ${s.nombrePc || s.ip}…`);
  barrido.className = 'barrido hallado';
  await api.conectar(s);
}

async function buscar() {
  if (buscando) return;
  buscando = true;
  barrido.className = 'barrido';
  lista.replaceChildren();
  ayuda.classList.add('oculto');
  texto(estado, 'Buscando el equipo servidor en la red…');
  let halladas = [];
  try { halladas = await api.buscarServidor(); } catch (_) { halladas = []; }
  buscando = false;
  if (halladas.length === 1) { await conectarA(halladas[0]); return; }
  if (halladas.length > 1) {
    barrido.className = 'barrido hallado';
    texto(estado, 'Se encontró más de un servidor. Seleccione uno:');
    halladas.forEach((s) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.type = 'button';
      b.innerHTML = '<span></span><span class="mono"></span>';
      b.firstChild.textContent = s.nombrePc || 'Servidor';
      b.lastChild.textContent = `${s.ip}:${s.puerto}`;
      b.addEventListener('click', () => conectarA(s));
      lista.appendChild(b);
    });
    return;
  }
  barrido.className = 'barrido quieto';
  texto(estado, 'No se encontró el equipo servidor.');
  ayuda.classList.remove('oculto');
}

el('btn-buscar').addEventListener('click', buscar);
el('btn-modo').addEventListener('click', () => api.cambiarModo());
async function conectarManual() {
  const ip = el('ip').value;
  texto(estado, 'Verificando dirección…');
  const s = await api.probar(ip);
  if (s) await conectarA(s);
  else texto(estado, 'La dirección no corresponde a un servidor del inventario.');
}
el('btn-ip').addEventListener('click', conectarManual);
el('ip').addEventListener('keydown', (e) => { if (e.key === 'Enter') conectarManual(); });

api.ultimo().then((u) => { if (u) el('ip').value = u.split(':')[0]; });
buscar();
