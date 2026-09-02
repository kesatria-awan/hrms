# KA HRMS — Data Model Design

**Repo:** https://github.com/kesatria-awan/hrms (scaffold: Tracky @139348b, build green)
**Stack:** Hono on Cloudflare Workers · D1 (SQLite, Drizzle ORM) · R2 (documents) · React + TanStack + shadcn/ui
**Auth:** Email OTP (6-digit → @kesatria.my via mailcow) + JWT; OIDC-ready for authentik.kesatria.my
**Theme:** Kesatria Awan yellow
**Language:** English

---

## Conventions (inherited from Tracky)

- UUID primary keys (`crypto.randomUUID()`)
- `createdAt`/`updatedAt`/`deletedAt` timestamps (unixepoch ints, soft deletes)
- Drizzle `sqliteTable` + drizzle-zod `createInsertSchema`/`createSelectSchema` → typed API routes
- Single-tenant: KA is the only company (no multi-tenant workspace layer — simplify from Tracky)
- Roles: `hr_admin` | `employee` (extensible enum)

## Schema files (apps/api/src/db/schema/)

### 1. user.ts (keep, adapt)
`users` — login identity + profile
- id (uuid), email (unique), firstName, lastName, avatarUrl
- role: `hr_admin` | `employee`
- employeeId → employees.id (nullable; admins are also employees here)
- otpCode (hashed), otpExpiresAt, otpAttempts — for email OTP login
- oidcSubject (unique, nullable) — authentik link, future
- emailVerifiedAt, lastLoginAt

### 2. company.ts
`company` (single row)
- id, name ("Kesatria Awan Sdn Bhd"), registrationNo, address
- defaultCurrency ("MYR"), payDay (int, day of month)

`departments`
- id, name ("Technology & Engineering"), code ("TE"), parentId (nullable — org chart), headEmployeeId
`designations`
- id, title ("IT Support"), level (nullable)

### 3. employee.ts
`employees`
- id, userId (nullable — links to login; every employee gets one)
- employeeNumber (unique: KA-002, MYS-3901…)
- firstName, lastName, fullName
- companyId, departmentId, designationId
- employmentType: `permanent` | `probation` | `contract` | `freelance` | `intern`
- status: `active` | `on_leave` | `suspended` | `resigned` | `terminated`
- dateOfJoining, dateOfResignation (nullable)
- personal: nric, dateOfBirth, placeOfBirth, gender (`male`|`female`), race, religion, bloodGroup, maritalStatus, nationality, bumiStatus
- contact: personalEmail, mobileNo, phoneNo, address
- work: companyEmail (unique), workPhone
- bank: bankName, bankAccountNo
- statutory: epfNo, socsoNo, incomeTaxNo (LHDN)
- emergency: emergencyContactName, emergencyContactPhone
- avatarUrl (R2)

### 4. leave.ts
`leaveTypes`
- id, name, code, defaultDays (annual entitlement)
- isPaid (bool), isLwp (bool), requiresAttachment (bool — hospitalization/MC)
- genderRestriction (`male`|`female`|null — Paternity/Maternity)
- carryForwardMax (0 for most; 5 for Carry Forward type)
- isActive

`holidayLists`
- id, name ("Malaysia Holidays 2026 (KL)"), year, state ("W.P. Kuala Lumpur")
`holidays`
- id, holidayListId, date, description

`leaveBalances`
- id, employeeId, leaveTypeId, year, entitled, carriedForward, used, pending
- (balance = entitled + carriedForward − used − pending)

`leaveApplications`
- id, employeeId, leaveTypeId
- startDate, endDate, days (decimal — half days), isHalfDay
- reason, attachmentId (R2, nullable — MC)
- status: `pending` | `approved` | `rejected` | `cancelled`
- approverId, approvedAt, rejectionReason
- createdAt/updatedAt

### 5. attendance.ts
`attendanceRecords` (one per employee per day, unique index)
- id, employeeId, date
- status: `present` | `late` | `absent` | `leave` | `holiday` | `weekend` | `half_day`
- clockIn (timestamp), clockOut, workedMinutes
- lateMinutes, overtimeMinutes
- source: `checkin` | `auto` | `manual`
- notes

`attendanceCorrections`
- id, employeeId, date, requestedClockIn/Out, reason, status, approvedBy

### 6. payroll.ts
`salaryComponents`
- id, name, code, type: `earning` | `deduction` | `employer_contribution`
- calcType: `fixed` | `formula` | `statutory_table`
- formula (nullable, e.g. "basic * 0.11"), statutoryTable (nullable, JSON — for EPF/SOCSO brackets)
- isTaxable, doNotIncludeInNet, isProrated

`salaryStructures`
- id, name ("KA Staff 2026"), effectiveFrom, isActive
- (component rows via salaryStructureComponents: componentId, value/formula)

`salaryStructureAssignments`
- id, employeeId, salaryStructureId, effectiveFrom, baseSalary

`payrollRuns`
- id, periodMonth (YYYY-MM), periodStart, periodEnd
- status: `draft` | `processing` | `completed` | `paid` | `locked`
- totals (JSON snapshot), createdBy, completedAt

`payslips`
- id, payrollId, employeeId
- grossPay, totalDeductions, netPay
- paymentDays, absentDays, lwpDays
- lineItems (JSON array snapshot of every component + amount — immutable at completion)
- epfEmployee/epfEmployer, socsoEmployee/socsoEmployer, eis, pcb, zakat
- pdfKey (R2 key), sentAt (email)
- unique(employeeId, periodMonth)

`statutoryTables` (versioned — EPF/SOCSO/EIS/PCB rate tables)
- id, kind (`epf`|`socso`|`eis`|`pcb`), effectiveFrom, tableJson, isActive

### 7. claim.ts
`expenseClaims`
- id, employeeId, claimNo (auto), title
- items (JSON: [{type, amount, date, description}]) or child table
- totalAmount, status: `draft`|`submitted`|`approved`|`rejected`|`paid`
- approverId, approvedAt, paidInPayrollId (nullable — paid via salary)
- receipts (attachmentIds, R2)

### 8. document.ts
`employeeDocuments`
- id, employeeId, category (`contract`|`payslip`|`EA_form`|`cert`|`other`)
- fileKey (R2), fileName, mimeType, sizeBytes
- uploadedBy, expiresAt (nullable)

### 9. appraisal.ts (v1 minimal → KPI v2)
`appraisalCycles`, `appraisalTemplates`, `kpis`, `appraisals`, `appraisalScores`

### 10. Keep from Tracky (infrastructure)
`auditLogs`, `notifications`, `notificationPreferences`, `attachments`(R2 meta), `refreshTokens`, `otpCodes` (new)

## Key relationships
- users 1—1 employees (nullable both ways; an admin is also an employee)
- employee → department → parent department (org chart)
- leaveBalances unique(employee, leaveType, year)
- attendanceRecords unique(employee, date)
- payslips unique(employee, periodMonth)

## Data migration (from today's Frappe work)
Seed script: 11 employees + departments + 15 leave types + 2026 KL holidays + leave balances + 73 historical payslips + salary structures — all from the parsed payroll JSON (already at /tmp/payroll_data.json).

## Out of scope v1
Multi-tenant, KPI scoring engine, mobile app (PWA later), authentik OIDC (hook ready).