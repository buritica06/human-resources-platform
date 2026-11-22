// Iconos SVG (trazos propios, 24×24). Uso: icono('llave') → string SVG decorativo.
const P = {
  inicio: 'M12 3 2 11h3v9h5v-6h4v6h5v-9h3L12 3z',
  llave: 'M7 14a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm5.6-4A6 6 0 1 0 12.6 14H16v3h3v-3h2v-4h-8.4z',
  usuario: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-9 2.2-9 5v3h18v-3c0-2.8-4.6-5-9-5z',
  usuarios: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 13c-3.3 0-7 1.7-7 4v3h14v-3c0-2.3-3.7-4-7-4zm7 0c-.5 0-1 0-1.6.1 1.6.9 2.6 2.2 2.6 3.9v3h6v-3c0-2.2-3.6-4-7-4z',
  salir: 'M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h6v-2H5V5h5V3zm6.6 4.6L15.2 9l2 2H9v2h8.2l-2 2 1.4 1.4L21 12l-4.4-4.4z',
  menu: 'M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z',
  cerrar: 'M18.3 5.7 16.9 4.3 12 9.2 7.1 4.3 5.7 5.7 10.6 10.6 5.7 15.5l1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9 4.9-4.9z',
  ojo: 'M12 5C6.5 5 2.7 9.2 1.5 12c1.2 2.8 5 7 10.5 7s9.3-4.2 10.5-7C21.3 9.2 17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  ojoTachado: 'M3.3 2 2 3.3l3.2 3.2C3.3 7.9 2 9.9 1.5 12c1.2 2.8 5 7 10.5 7 1.9 0 3.6-.5 5-1.3l3.7 3.7 1.3-1.3L3.3 2zM12 16a4 4 0 0 1-3.9-4.9l1.6 1.6a2 2 0 0 0 2.5 2.5l1.6 1.6c-.5.1-1.1.2-1.8.2zm0-11c5.5 0 9.3 4.2 10.5 7-.5 1.2-1.5 2.7-2.9 4l-3.5-3.5A4 4 0 0 0 11 7.4L8.6 5.6C9.6 5.2 10.8 5 12 5z',
  ok: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z',
  alerta: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  error: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  reloj: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z',
  candado: 'M18 8h-1V6A5 5 0 0 0 7 6v2H6a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3.1-9H8.9V6a3.1 3.1 0 0 1 6.2 0v2z',
  correo: 'M20 4H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z',
  subir: 'M5 20h14v-2H5v2zm0-10h4v6h6v-6h4l-7-7-7 7z',
  agregar: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  copiar: 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z',
  descargar: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  editar: 'M3 17.2V21h3.8L17.8 9.9l-3.7-3.7L3 17.2zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7L20.7 7z',
  marca: 'M12 2 3 6v6c0 5 3.8 9.7 9 10 5.2-.3 9-5 9-10V6l-9-4zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 14c-2.5-.2-4.6-1.6-5.8-3.6.1-1.9 3.9-3 5.8-3s5.7 1.1 5.8 3c-1.2 2-3.3 3.4-5.8 3.6z',
  recibo: 'M19.5 3.5 18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5zM19 19.1H5V4.9h14v14.2zM6 15h12v2H6v-2zm0-4h12v2H6v-2zm0-4h12v2H6V7z',
  pdf: 'M20 2H8a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-8.5 7.5c0 .8-.7 1.5-1.5 1.5H9v2H7.5V7H10c.8 0 1.5.7 1.5 1.5v1zm5 2c0 .8-.7 1.5-1.5 1.5h-2.5V7H15c.8 0 1.5.7 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z',
  cancelar: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 0 1-6.3-12.9l11.2 11.2A8 8 0 0 1 12 20zm6.3-3.1L7.1 5.7A8 8 0 0 1 18.3 16.9z',
  campana: 'M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11c0-3.1-1.6-5.6-4.5-6.3V4a1.5 1.5 0 0 0-3 0v.7C7.6 5.4 6 7.9 6 11v5l-2 2v1h16v-1l-2-2z',
  calendario: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z',
  sombrilla: 'M12 2C6.5 2 2 6 2 11h9v7.5a1.5 1.5 0 0 1-3 0V17H6v1.5a3.5 3.5 0 0 0 7 0V11h9c0-5-4.5-9-10-9z',
  documento: 'M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
};

export function icono(nombre, { etiqueta } = {}) {
  const d = P[nombre] ?? P.info;
  const a11y = etiqueta ? `role="img" aria-label="${etiqueta}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="icono" viewBox="0 0 24 24" ${a11y}><path d="${d}"/></svg>`;
}

// Reemplaza <span data-icono="x"></span> por el SVG correspondiente.
export function pintarIconos(raiz = document) {
  for (const el of raiz.querySelectorAll('[data-icono]')) {
    el.outerHTML = icono(el.dataset.icono, { etiqueta: el.dataset.etiqueta });
  }
}
