CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`avatar_url` text,
	`role` text DEFAULT 'employee' NOT NULL,
	`employee_id` text,
	`otp_hash` text,
	`otp_expires_at` integer,
	`otp_attempts` integer DEFAULT 0 NOT NULL,
	`otp_last_sent_at` integer,
	`oidc_subject` text,
	`email_verified_at` integer,
	`last_login_at` integer,
	`email_suppressed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_oidc_subject_unique` ON `users` (`oidc_subject`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `company` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`registration_no` text,
	`address` text,
	`default_currency` text DEFAULT 'MYR' NOT NULL,
	`pay_day` integer DEFAULT 25 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`parent_id` text,
	`head_employee_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_code_unique` ON `departments` (`code`);--> statement-breakpoint
CREATE TABLE `designations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`level` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`employee_number` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text,
	`department_id` text,
	`designation_id` text,
	`employment_type` text DEFAULT 'permanent' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`date_of_joining` text NOT NULL,
	`date_of_resignation` text,
	`nric` text,
	`date_of_birth` text,
	`place_of_birth` text,
	`gender` text,
	`race` text,
	`religion` text,
	`blood_group` text,
	`marital_status` text,
	`nationality` text DEFAULT 'Malaysian',
	`bumi_status` text,
	`address` text,
	`personal_email` text,
	`mobile_no` text,
	`phone_no` text,
	`company_email` text,
	`bank_name` text,
	`bank_account_no` text,
	`epf_no` text,
	`socso_no` text,
	`income_tax_no` text,
	`emergency_contact_name` text,
	`emergency_contact_phone` text,
	`avatar_url` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`designation_id`) REFERENCES `designations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_employee_number_unique` ON `employees` (`employee_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `employees_company_email_unique` ON `employees` (`company_email`);--> statement-breakpoint
CREATE INDEX `employees_department_idx` ON `employees` (`department_id`);--> statement-breakpoint
CREATE INDEX `employees_status_idx` ON `employees` (`status`);--> statement-breakpoint
CREATE TABLE `holiday_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`year` integer NOT NULL,
	`state` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `holidays` (
	`id` text PRIMARY KEY NOT NULL,
	`holiday_list_id` text NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	FOREIGN KEY (`holiday_list_id`) REFERENCES `holiday_lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `holidays_list_idx` ON `holidays` (`holiday_list_id`);--> statement-breakpoint
CREATE TABLE `leave_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`leave_type_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`days` integer NOT NULL,
	`is_half_day` integer DEFAULT false NOT NULL,
	`reason` text,
	`attachment_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`approver_id` text,
	`approved_at` integer,
	`rejection_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `leave_applications_employee_idx` ON `leave_applications` (`employee_id`);--> statement-breakpoint
CREATE INDEX `leave_applications_status_idx` ON `leave_applications` (`status`);--> statement-breakpoint
CREATE TABLE `leave_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`leave_type_id` text NOT NULL,
	`year` integer NOT NULL,
	`entitled` integer DEFAULT 0 NOT NULL,
	`carried_forward` integer DEFAULT 0 NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`pending` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leave_balances_emp_type_year_unique` ON `leave_balances` (`employee_id`,`leave_type_id`,`year`);--> statement-breakpoint
CREATE TABLE `leave_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`default_days` integer DEFAULT 0 NOT NULL,
	`is_paid` integer DEFAULT true NOT NULL,
	`is_lwp` integer DEFAULT false NOT NULL,
	`requires_attachment` integer DEFAULT false NOT NULL,
	`gender_restriction` text,
	`carry_forward_max` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leave_types_code_unique` ON `leave_types` (`code`);--> statement-breakpoint
CREATE TABLE `attendance_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`requested_clock_in` text,
	`requested_clock_out` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `attendance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`clock_in` integer,
	`clock_out` integer,
	`worked_minutes` integer,
	`late_minutes` integer DEFAULT 0 NOT NULL,
	`overtime_minutes` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'auto' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_emp_date_unique` ON `attendance_records` (`employee_id`,`date`);--> statement-breakpoint
CREATE INDEX `attendance_date_idx` ON `attendance_records` (`date`);--> statement-breakpoint
CREATE TABLE `check_ins` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`type` text NOT NULL,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `check_ins_emp_ts_idx` ON `check_ins` (`employee_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `payroll_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`period_month` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`totals` text,
	`created_by` text,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_runs_period_month_unique` ON `payroll_runs` (`period_month`);--> statement-breakpoint
CREATE TABLE `payslips` (
	`id` text PRIMARY KEY NOT NULL,
	`payroll_id` text,
	`employee_id` text NOT NULL,
	`period_month` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`gross_pay` real DEFAULT 0 NOT NULL,
	`total_deductions` real DEFAULT 0 NOT NULL,
	`net_pay` real DEFAULT 0 NOT NULL,
	`payment_days` integer,
	`absent_days` real DEFAULT 0 NOT NULL,
	`lwp_days` real DEFAULT 0 NOT NULL,
	`epf_employee` real DEFAULT 0 NOT NULL,
	`epf_employer` real DEFAULT 0 NOT NULL,
	`socso_employee` real DEFAULT 0 NOT NULL,
	`socso_employer` real DEFAULT 0 NOT NULL,
	`eis_employee` real DEFAULT 0 NOT NULL,
	`eis_employer` real DEFAULT 0 NOT NULL,
	`pcb` real DEFAULT 0 NOT NULL,
	`zakat` real DEFAULT 0 NOT NULL,
	`line_items` text,
	`pdf_key` text,
	`sent_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`payroll_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payslips_emp_period_unique` ON `payslips` (`employee_id`,`period_month`);--> statement-breakpoint
CREATE INDEX `payslips_period_idx` ON `payslips` (`period_month`);--> statement-breakpoint
CREATE TABLE `salary_components` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`type` text NOT NULL,
	`calc_type` text DEFAULT 'fixed' NOT NULL,
	`formula` text,
	`statutory_table` text,
	`is_taxable` integer DEFAULT true NOT NULL,
	`do_not_include_in_net` integer DEFAULT false NOT NULL,
	`is_prorated` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `salary_components_name_unique` ON `salary_components` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `salary_components_code_unique` ON `salary_components` (`code`);--> statement-breakpoint
CREATE TABLE `salary_structure_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`structure_id` text NOT NULL,
	`effective_from` text NOT NULL,
	`base_salary` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`structure_id`) REFERENCES `salary_structures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ssa_employee_idx` ON `salary_structure_assignments` (`employee_id`);--> statement-breakpoint
CREATE TABLE `salary_structure_components` (
	`id` text PRIMARY KEY NOT NULL,
	`structure_id` text NOT NULL,
	`component_id` text NOT NULL,
	`value` real DEFAULT 0,
	`formula` text,
	FOREIGN KEY (`structure_id`) REFERENCES `salary_structures`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_id`) REFERENCES `salary_components`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `salary_structures` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`effective_from` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `salary_structures_name_unique` ON `salary_structures` (`name`);--> statement-breakpoint
CREATE TABLE `statutory_tables` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`effective_from` text NOT NULL,
	`table_json` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `statutory_kind_idx` ON `statutory_tables` (`kind`);--> statement-breakpoint
CREATE TABLE `expense_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`claim_no` text,
	`title` text NOT NULL,
	`items` text DEFAULT '[]' NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`approver_id` text,
	`approved_at` integer,
	`rejection_reason` text,
	`paid_in_payroll_id` text,
	`receipt_keys` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paid_in_payroll_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_claims_claim_no_unique` ON `expense_claims` (`claim_no`);--> statement-breakpoint
CREATE INDEX `claims_employee_idx` ON `expense_claims` (`employee_id`);--> statement-breakpoint
CREATE TABLE `employee_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`file_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`uploaded_by` text,
	`expires_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `documents_employee_idx` ON `employee_documents` (`employee_id`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text,
	`uploaded_by_user_id` text,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`r2_key` text NOT NULL,
	`context_type` text NOT NULL,
	`context_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_r2_key_unique` ON `attachments` (`r2_key`);--> statement-breakpoint
CREATE INDEX `attachments_context_idx` ON `attachments` (`context_type`,`context_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`metadata` text,
	`ip_address` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_user_idx` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_resource_idx` ON `audit_logs` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email_enabled` integer DEFAULT true NOT NULL,
	`push_enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_preferences_user_id_unique` ON `notification_preferences` (`user_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `refresh_tokens_user_idx` ON `refresh_tokens` (`user_id`);