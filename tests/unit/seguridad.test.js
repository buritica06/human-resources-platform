import '../helpers/entorno.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revisarPolitica, generarClaveTemporal, hashClave, verificarClave } from '../../src/core/security/claves.js';
import { crearCifrador, igualesSeguro, sha256, tokenAleatorio } from '../../src/core/security/cripto.js';
import { mascara, mascaraCorreo } from '../../src/core/logger.js';

test('política de contraseña', () => {
  assert.match(revisarPolitica('corta1'), /10 caracteres/);
  assert.match(revisarPolitica('soloLetrasLargas'), /letras y números/);
  assert.match(revisarPolitica('1234567890123'), /letras y números/);
  assert.match(revisarPolitica('abc1000000003xyz', { cedula: '1000000003' }), /cédula/);
  assert.equal(revisarPolitica('ClaveSegura2026'), null);
  assert.match(revisarPolitica('a'.repeat(200) + '1'), /larga/);
});

test('clave temporal: 12 caracteres, letras y números, sin ambiguos, cumple la política', () => {
  const vistas = new Set();
  for (let i = 0; i < 200; i++) {
    const c = generarClaveTemporal();
    assert.equal(c.length, 12);
    assert.match(c, /[A-Za-z]/);
    assert.match(c, /\d/);
    assert.doesNotMatch(c, /[0O1lI]/);
    assert.equal(revisarPolitica(c), null);
    vistas.add(c);
  }
  assert.equal(vistas.size, 200);
});

test('hash argon2id y verificación', async () => {
  const h = await hashClave('ClaveSegura2026');
  assert.match(h, /^\$argon2id\$/);
  assert.equal(await verificarClave(h, 'ClaveSegura2026'), true);
  assert.equal(await verificarClave(h, 'otra'), false);
  assert.equal(await verificarClave('no-es-hash', 'x'), false);
});

test('cifrado AES-256-GCM: ida y vuelta, IV distinto y detección de alteraciones', () => {
  const c = crearCifrador('b'.repeat(64));
  const a = c.cifrar('diagnóstico reservado');
  const b = c.cifrar('diagnóstico reservado');
  assert.notEqual(a, b);
  assert.equal(c.descifrar(a), 'diagnóstico reservado');
  const partes = a.split(':');
  partes[3] = Buffer.from('alterado').toString('base64');
  assert.throws(() => c.descifrar(partes.join(':')));
  assert.equal(c.cifrar(''), null);
  assert.throws(() => crearCifrador('').cifrar('x'), /DATA_ENCRYPTION_KEY/);
});

test('utilidades de tokens', () => {
  const t = tokenAleatorio();
  assert.ok(t.length >= 40);
  assert.equal(sha256('x').length, 64);
  assert.equal(igualesSeguro('abc', 'abc'), true);
  assert.equal(igualesSeguro('abc', 'abd'), false);
  assert.equal(igualesSeguro('', ''), false);
  assert.equal(igualesSeguro(undefined, 'x'), false);
});

test('enmascarado de datos personales en logs', () => {
  assert.equal(mascara('1044393004'), '***3004');
  assert.equal(mascara('12'), '***');
  assert.equal(mascaraCorreo('persona@dominio.com'), 'p***@dominio.com');
});
