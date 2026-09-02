import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-zod";

export const company = sqliteTable("company", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(), // Kesatria Awan Sdn Bhd
  registrationNo: text("registration_no"),
  address: text("address"),
  defaultCurrency: text("default_currency").notNull().default("MYR"),
  payDay: integer("pay_day").notNull().default(25), // day of month
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const selectCompanySchema = createSelectSchema(company);

export type Company = typeof company.$inferSelect;
export type NewCompany = typeof company.$inferInsert;