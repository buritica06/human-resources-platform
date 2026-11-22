import { z } from 'zod';

export const cedula = z
  .string({ error: 'Escriba su número de cédula.' })
  .trim()
  .transform((s) => s.replace(/[.\s]/g, ''))
  .pipe(z.string().regex(/^\d{5,12}$/, 'La cédula debe tener solo números, sin puntos ni espacios.'));

const clave = z.string({ error: 'Escriba la contraseña.' }).min(1, 'Escriba la contraseña.').max(128);

export const esquemaLogin = z.object({ cedula, clave });

export const esquemaCambiarClave = z
  .object({
    actual: clave,
    nueva: z.string({ error: 'Escriba la nueva contraseña.' }).max(128),
    confirmacion: z.string({ error: 'Confirme la nueva contraseña.' }),
  })
  .refine((d) => d.nueva === d.confirmacion, { message: 'Las contraseñas no coinciden.', path: ['confirmacion'] });

export const esquemaCorreo = z.object({
  correo: z
    .string({ error: 'Escriba su correo.' })
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email('Escriba un correo válido, por ejemplo nombre@dominio.com.')),
});

export const esquemaRecuperar = z.object({ cedula });

export const esquemaRestablecer = z
  .object({
    token: z.string().min(20).max(100),
    nueva: z.string({ error: 'Escriba la nueva contraseña.' }).max(128),
    confirmacion: z.string({ error: 'Confirme la nueva contraseña.' }),
  })
  .refine((d) => d.nueva === d.confirmacion, { message: 'Las contraseñas no coinciden.', path: ['confirmacion'] });

export const esquemaToken = z.object({ token: z.string().min(20).max(100) });
