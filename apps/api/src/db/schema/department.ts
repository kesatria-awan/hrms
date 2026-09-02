import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const departments = sqliteTable("departments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(), // Technology & Engineering
  code: text("code").unique(), // TE
  parentId: text("parent_id"), // self-ref for org chart (set via FK in migration)
  headEmployeeId: text("head_employee_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const designations = sqliteTable("designations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(), // IT Support
  level: text("level"), // optional grading (L1, L2, Management)
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const selectDepartmentSchema = createSelectSchema(departments);
export const insertDepartmentSchema = createInsertSchema(departments, {
  name: z.string().min(1).max(100),
}).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });

export const selectDesignationSchema = createSelectSchema(designations);
export const insertDesignationSchema = createInsertSchema(designations, {
  title: z.string().min(1).max(100),
}).omit({ id: true, createdAt: true, deletedAt: true });

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type Designation = typeof designations.$inferSelect;
export type NewDesignation = typeof designations.$inferInsert;