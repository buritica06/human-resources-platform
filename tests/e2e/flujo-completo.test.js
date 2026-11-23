// Prueba End-to-End (E2E) de flujo de negocio completo:
// Autenticación → Consulta de expediente → Solicitud de permiso → Aprobación por director y admin →
// Emisión de certificado laboral → Verificación pública sin exposición de PII.
import '../helpers/entorno.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, comoUsuario, cliente, CED } from '../helpers/app.js';

const hoy = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const dia = (n) => new Date(Date.parse(`${hoy()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe('E2E: flujo completo colaborador → director → admincontable → certificado', () => {
  let env;

  before(async () => {
    env = await crearEntorno();
  });

  after(async () => {
    await env.cerrar();
  });

  it('recorre el ciclo completo de autoservicio y aprobación con aislamiento de privacidad', async () => {
    const col = await comoUsuario(env.app, CED.colab1);
    const dir = await comoUsuario(env.app, CED.director);
    const adm = await comoUsuario(env.app, CED.admin);

    // 1. El colaborador consulta su expediente (cuenta bancaria enmascarada)
    const exp = await col.get('/me/expediente');
    assert.equal(exp.status, 200);
    assert.ok(exp.body.colaborador?.cedula);

    // 2. El colaborador crea y envía una solicitud de permiso
    const csrf = (await col.get('/auth/csrf')).body.csrf;
    const crear = await col.agente
      .post('/api/v1/solicitudes')
      .set('X-CSRF-Token', csrf)
      .field('tipo', 'PERMISO')
      .field('subtipo', 'DILIGENCIA PERSONAL')
      .field('fecha_inicio', dia(5))
      .field('hora_inicio', '09:00')
      .field('fecha_fin', dia(5))
      .field('hora_fin', '11:00')
      .field('motivo', 'Trámite personal de prueba E2E')
      .field('enviar', 'true');
    assert.equal(crear.status, 201);
    const solicitudId = crear.body.id;
    assert.equal(crear.body.estado, 'PENDIENTE_DIRECTOR');

    // 3. El director aprueba el paso 1
    const aprDir = await dir.post(`/solicitudes/${solicitudId}/aprobar`, {
      estadoEsperado: 'PENDIENTE_DIRECTOR',
      comentario: 'Aprobado E2E director',
    });
    assert.equal(aprDir.status, 200);
    assert.equal(aprDir.body.estado, 'PENDIENTE_CONTABLE');

    // 4. El admincontable aprueba el paso final
    const aprAdm = await adm.post(`/solicitudes/${solicitudId}/aprobar`, {
      estadoEsperado: 'PENDIENTE_CONTABLE',
      comentario: 'Aprobado E2E contable',
    });
    assert.equal(aprAdm.status, 200);
    assert.equal(aprAdm.body.estado, 'APROBADA');

    // 5. El colaborador emite un certificado laboral sin salario
    const cert = await col.post('/me/certificados/laboral', { conSalario: false, dirigidoA: 'A quien interese' });
    assert.equal(cert.status, 201);
    const codigo = cert.body.codigo;
    assert.ok(codigo);

    // 6. Verificación pública sin sesión (sin datos personales)
    const anon = cliente(env.app);
    const ver = await anon.get(`/certificados/verificar/${codigo}`);
    assert.equal(ver.status, 200);
    assert.equal(ver.body.valido, true);
    assert.equal(ver.body.cedula, undefined);
    assert.equal(ver.body.nombre, undefined);
    assert.equal(ver.body.salario, undefined);
  });
});
