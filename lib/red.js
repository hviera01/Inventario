const os = require('node:os');
const http = require('node:http');
const { execFile, spawn } = require('node:child_process');

const NOMBRE_REGLA = 'Inventario';

function prefijo(mascara) {
  return mascara.split('.').reduce((n, o) => n + Number(o).toString(2).replace(/0/g, '').length, 0);
}

function ipsLocales() {
  const res = [];
  for (const [nombre, lista] of Object.entries(os.networkInterfaces())) {
    for (const i of lista || []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      if (i.address.startsWith('169.254.')) continue;
      res.push({ nombre, ip: i.address, mascara: i.netmask, prefijo: prefijo(i.netmask) });
    }
  }
  res.sort((a, b) => Number(b.ip.startsWith('172.20.10.')) - Number(a.ip.startsWith('172.20.10.')));
  return res;
}

function urls(puerto) {
  return ipsLocales().map((i) => `http://${i.ip}:${puerto}`);
}

const aEntero = (ip) => ip.split('.').reduce((n, o) => n * 256 + Number(o), 0);
const deEntero = (n) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.');

function candidatos() {
  const set = new Set();
  const propias = new Set();
  for (const i of ipsLocales()) {
    propias.add(i.ip);
    const pref = Math.max(i.prefijo, 24);
    const tam = 2 ** (32 - pref);
    const base = Math.floor(aEntero(i.ip) / tam) * tam;
    for (let n = base + 1; n < base + tam - 1; n++) set.add(deEntero(n));
  }
  return [...set].filter((ip) => !propias.has(ip));
}

function sondear(ip, puerto, ms = 900) {
  return new Promise((resolve) => {
    const req = http.get({ host: ip, port: puerto, path: '/api/hola', timeout: ms }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; if (body.length > 2000) req.destroy(); });
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          resolve(j && j.app === 'inventario' ? { ip, puerto, ...j } : null);
        } catch (_) { resolve(null); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

async function buscarServidor(puerto, extra = []) {
  const lista = [...new Set([...extra, ...candidatos()])];
  const halladas = [];
  let i = 0;
  async function obrero() {
    while (i < lista.length && !halladas.length) {
      const ip = lista[i++];
      const r = await sondear(ip, puerto);
      if (r) halladas.push(r);
    }
  }
  await Promise.all(Array.from({ length: 64 }, obrero));
  return halladas;
}

function esWindows() { return process.platform === 'win32'; }

function reglaFirewallExiste() {
  if (!esWindows()) return Promise.resolve(true);
  return new Promise((resolve) => {
    execFile('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${NOMBRE_REGLA}`], { windowsHide: true }, (err, out) => {
      resolve(!err && /(Rule Name|Nombre de regla):\s+Inventario\b/i.test(String(out)) && /(Enabled|Habilitad)/i.test(String(out)));
    });
  });
}

function permitirFirewall(puerto) {
  if (!esWindows()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const args = `advfirewall firewall add rule name="${NOMBRE_REGLA}" dir=in action=allow protocol=TCP localport=${puerto} profile=any`;
    const ps = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command',
      `Start-Process -FilePath netsh -ArgumentList '${args}' -Verb RunAs -WindowStyle Hidden -Wait`], { windowsHide: true });
    ps.on('error', () => resolve(false));
    ps.on('close', async () => resolve(await reglaFirewallExiste()));
  });
}

module.exports = { ipsLocales, urls, buscarServidor, sondear, reglaFirewallExiste, permitirFirewall, candidatos, NOMBRE_REGLA };
