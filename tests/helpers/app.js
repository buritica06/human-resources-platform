// Crea una app aislada con su propia base SQLite temporal y datos ficticios.
import './entorno.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { cargarConfig } from '../../src/core/config.js';
import { crearContexto, crearApp } from '../../src/core/app.js';
import { migrar } from '../../src/core/db.js';
import { sembrarBase, sembrarDemo } from '../../seeds/sembrar.js';

export const CLAVE_DEMO = 'Demo2026clave';
export const CED = { admin: '1000000001', director: '1000000002', colab1: '1000000003', colab2: '1000000004' };

export async function crearEntorno({ limites, config = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-test-'));
  const cfg = cargarConfig({
    env: 'test',
    produccion: false,
    appUrl: 'http://localhost:3000',
    claveCifrado: 'a'.repeat(64),
    db: { client: 'sqlite', filename: path.join(dir, 'prueba.sqlite') },
    modulos: ['auth', 'usuarios', 'colaboradores', 'nomina', 'notificaciones', 'solicitudes', 'permisos', 'vacaciones', 'incapacidades'],
    almacenamiento: { driver: 'local', dir: path.join(dir, 'uploads') },
    ...config,
  });
  const ctx = crearContexto(cfg);
  ctx.limites = { login: 1000, recuperar: 1000, ventanaMs: 60_000, ...limites };
  await migrar(ctx.db);
  await sembrarBase(ctx.db);
  await sembrarDemo(ctx.db, { clave: CLAVE_DEMO, cifrador: ctx.cifrador });
  const app = crearApp(ctx);
  return {
    ctx,
    app,
    async cerrar() {
      await ctx.db.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

// Cliente con cookies + CSRF automáticos.
export function cliente(app) {
  const agente = request.agent(app);
  let csrf = null;
  const token = async () => {
    if (!csrf) csrf = (await agente.get('/api/v1/auth/csrf')).body.csrf;
    return csrf;
  };
  const conCsrf = (metodo) => async (ruta, cuerpo) => {
    // El token se pide ANTES de crear la petición: el agente adjunta las cookies al crearla.
    const t = await token();
    return agente[metodo](`/api/v1${ruta}`).set('X-CSRF-Token', t).send(cuerpo);
  };
  return {
    agente,
    get: (ruta) => agente.get(`/api/v1${ruta}`),
    post: conCsrf('post'),
    patch: conCsrf('patch'),
    async subir(ruta, archivo, campos = {}) {
      const t = await token();
      let r = agente.post(`/api/v1${ruta}`).set('X-CSRF-Token', t);
      for (const [k, v] of Object.entries(campos)) r = r.field(k, v);
      return r.attach('archivo', archivo);
    },
    async login(cedula, clave = CLAVE_DEMO) {
      const r = await conCsrf('post')('/auth/login', { cedula, clave });
      if (r.body.csrf) csrf = r.body.csrf;
      const sid = (r.headers['set-cookie'] ?? []).find((x) => x.startsWith('th_sid='));
      if (sid) this.sid = decodeURIComponent(sid.split(';')[0].slice('th_sid='.length));
      return r;
    },
    sid: null,
    olvidarCsrf: () => {
      csrf = null;
    },
  };
}

export async function comoUsuario(app, cedula, clave) {
  const c = cliente(app);
  const r = await c.login(cedula, clave);
  if (r.status !== 200) throw new Error(`login falló (${r.status}): ${JSON.stringify(r.body)}`);
  return c;
}

export const tokenDeEnlace = (enlace) => new URL(enlace).searchParams.get('token');
