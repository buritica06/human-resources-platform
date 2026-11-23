// Contraseñas: hash argon2id, política y generación de claves temporales.
import crypto from 'node:crypto';
import argon2 from 'argon2';

const OPCIONES = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }; // OWASP 2024
let hashFicticio = null;

export const hashClave = (clave) => argon2.hash(clave, OPCIONES);

export async function verificarClave(hash, clave) {
  try {
    return await argon2.verify(hash, clave);
  } catch {
    return false;
  }
}

// Para igualar el tiempo de respuesta cuando el usuario no existe.
export async function verificarFicticio(clave) {
  hashFicticio ??= await hashClave(tokenFicticio());
  await verificarClave(hashFicticio, clave);
  return false;
}
const tokenFicticio = () => crypto.randomBytes(16).toString('hex');

export const CLAVE_MIN = 10;

// Devuelve el mensaje de error en lenguaje claro, o null si la clave cumple.
export function revisarPolitica(clave, { cedula } = {}) {
  if (typeof clave !== 'string' || clave.length < CLAVE_MIN) return `La contraseña debe tener al menos ${CLAVE_MIN} caracteres.`;
  if (clave.length > 128) return 'La contraseña es demasiado larga (máximo 128 caracteres).';
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(clave) || !/\d/.test(clave)) return 'La contraseña debe combinar letras y números.';
  if (cedula && clave.includes(String(cedula))) return 'La contraseña no puede contener su número de cédula.';
  if (/^(.)\1+$/.test(clave)) return 'La contraseña no puede ser un solo carácter repetido.';
  return null;
}

// Clave temporal legible (sin 0/O, 1/l/I) con letras y números garantizados.
export function generarClaveTemporal(largo = 12) {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const numeros = '23456789';
  const todos = letras + numeros;
  const elegir = (s) => s[crypto.randomInt(s.length)];
  const chars = [elegir(letras), elegir(numeros)];
  while (chars.length < largo) chars.push(elegir(todos));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
