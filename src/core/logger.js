// Logger mínimo que enmascara datos personales. Nunca registre cédulas, correos,
// salarios ni diagnósticos en claro: use mascara() o mascaraCorreo().

export const mascara = (v) => {
  const s = String(v ?? '');
  return s.length <= 4 ? '***' : `***${s.slice(-4)}`;
};

export const mascaraCorreo = (c) => {
  const [u, d] = String(c ?? '').split('@');
  if (!d) return '***';
  return `${u.slice(0, 1)}***@${d}`;
};

const nivelActivo = () => (process.env.NODE_ENV === 'test' ? 'silencio' : 'info');

function escribir(nivel, msg, extra) {
  if (nivelActivo() === 'silencio' && nivel !== 'error') return;
  const linea = { t: new Date().toISOString(), nivel, msg, ...(extra || {}) };
  (nivel === 'error' ? console.error : console.log)(JSON.stringify(linea));
}

export const log = {
  info: (msg, extra) => escribir('info', msg, extra),
  warn: (msg, extra) => escribir('warn', msg, extra),
  error: (msg, extra) => escribir('error', msg, extra),
};
