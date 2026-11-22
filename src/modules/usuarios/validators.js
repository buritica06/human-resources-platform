import { z } from 'zod';
import { cedula } from '../auth/validators.js';

const ROLES = ['COLABORADOR', 'DIRECTOR', 'ADMIN'];
const nombre = z
  .string({ error: 'Escriba el nombre completo.' })
  .trim()
  .min(3, 'Escriba el nombre completo.')
  .max(150)
  .regex(/^[\p{L} .'-]+$/u, 'El nombre solo puede tener letras y espacios.')
  .transform((s) => s.replace(/\s+/g, ' ').toUpperCase());

export const esquemaCrear = z.object({
  cedula,
  nombre,
  rol: z.enum(ROLES, { error: 'Elija un rol válido.' }).default('COLABORADOR'),
  sedes: z.array(z.coerce.number().int().positive()).max(50).default([]),
});

export const esquemaActualizar = z
  .object({
    nombre: nombre.optional(),
    rol: z.enum(ROLES, { error: 'Elija un rol válido.' }).optional(),
    activo: z.boolean().optional(),
    sedes: z.array(z.coerce.number().int().positive()).max(50).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay cambios.' });

export const esquemaListar = z.object({
  q: z.string().trim().max(60).optional(),
  rol: z.enum(ROLES).optional(),
  activo: z.enum(['true', 'false']).optional(),
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const esquemaId = z.object({ id: z.coerce.number().int().positive() });
