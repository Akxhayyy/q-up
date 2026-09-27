import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Normalized (trimmed + uppercased) before it ever reaches a dedup check —
// "ra123" and "RA123" must collide, not slip past the one-active-per-student
// partial unique index as if they were different students.
const studentIdSchema = z
  .string()
  .trim()
  .min(1, "Student ID is required")
  .max(50)
  .regex(/^[A-Za-z0-9-]+$/, "Student ID may only contain letters, numbers, and hyphens")
  .transform((v) => v.toUpperCase());

export const joinTicketSchema = z.object({
  holderName: z.string().trim().min(1, "Name is required").max(100),
  studentId: studentIdSchema,
});
export type JoinTicketInput = z.infer<typeof joinTicketSchema>;

export const bookSlotSchema = z.object({
  holderName: z.string().trim().min(1, "Name is required").max(100),
  studentId: studentIdSchema,
});
export type BookSlotInput = z.infer<typeof bookSlotSchema>;

export const rescheduleBookingSchema = z.object({
  newSlotId: z.string().min(1),
});
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;

export const staffBookingActionSchema = z.object({
  action: z.enum(["CHECK_IN", "NO_SHOW", "CANCEL"]),
});
export type StaffBookingActionInput = z.infer<typeof staffBookingActionSchema>;

export const createSlotSchema = z
  .object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    capacity: z.number().int().min(1).max(500),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });
export type CreateSlotInput = z.infer<typeof createSlotSchema>;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

export const bulkSlotSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day"),
    dailyStartTime: hhmm,
    dailyEndTime: hhmm,
    slotMinutes: z.number().int().min(5).max(480),
    capacity: z.number().int().min(1).max(500),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  })
  .refine((v) => v.dailyEndTime > v.dailyStartTime, {
    message: "dailyEndTime must be after dailyStartTime",
    path: ["dailyEndTime"],
  });
export type BulkSlotInput = z.infer<typeof bulkSlotSchema>;

export const ticketActionSchema = z.object({
  action: z.enum(["SERVE", "NO_SHOW", "RECALL"]),
});
export type TicketActionInput = z.infer<typeof ticketActionSchema>;

export const serviceStatusSchema = z.object({
  status: z.enum(["OPEN", "PAUSED", "CLOSED"]),
});
export type ServiceStatusInput = z.infer<typeof serviceStatusSchema>;

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createServiceSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1).max(50).regex(slugRegex, "Slug must be lowercase, alphanumeric, hyphen-separated"),
  name: z.string().trim().min(1).max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9]+$/, "Code may only contain letters and numbers"),
  description: z.string().trim().max(500).optional(),
  location: z.string().trim().max(200).optional(),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = createServiceSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
