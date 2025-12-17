CREATE TABLE "ESSL"."att_departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ESSL"."att_designations" (
	"id" serial PRIMARY KEY NOT NULL,
	"designation" varchar(255) NOT NULL,
	"description" text,
	"department_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ESSL"."att_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"ip" varchar(50) NOT NULL,
	"serial_number" varchar(100),
	"device_model" varchar(100),
	"port" integer DEFAULT 4370 NOT NULL,
	"password" varchar(50) DEFAULT '000000',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ESSL"."att_fp_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(50) NOT NULL,
	"finger_index" varchar(10) NOT NULL,
	"template" text NOT NULL,
	"template_length" integer NOT NULL,
	"flag" integer DEFAULT 1,
	"device_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "att_fp_data_user_finger_device_unique" UNIQUE("user_id","finger_index","device_id")
);
--> statement-breakpoint
CREATE TABLE "ESSL"."att_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_sn" integer,
	"user_id" varchar(50) NOT NULL,
	"record_time" timestamp NOT NULL,
	"type" integer DEFAULT 1,
	"state" integer DEFAULT 0,
	"device_ip" varchar(50),
	"device_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "att_logs_record_time_device_id_unique" UNIQUE("record_time","device_id")
);
--> statement-breakpoint
CREATE TABLE "ESSL"."att_shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ESSL"."att_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" varchar(100) DEFAULT '0',
	"card_no" varchar(50),
	"password" varchar(100),
	"stored_devices" varchar(500),
	"shift_id" integer,
	"designation_id" integer,
	"join_date" timestamp,
	"relieving_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "att_users_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "ESSL"."att_designations" ADD CONSTRAINT "att_designations_department_id_att_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "ESSL"."att_departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ESSL"."att_fp_data" ADD CONSTRAINT "att_fp_data_device_id_att_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "ESSL"."att_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ESSL"."att_logs" ADD CONSTRAINT "att_logs_device_id_att_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "ESSL"."att_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ESSL"."att_users" ADD CONSTRAINT "att_users_shift_id_att_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "ESSL"."att_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ESSL"."att_users" ADD CONSTRAINT "att_users_designation_id_att_designations_id_fk" FOREIGN KEY ("designation_id") REFERENCES "ESSL"."att_designations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "att_departments_name_idx" ON "ESSL"."att_departments" USING btree ("name");--> statement-breakpoint
CREATE INDEX "att_designations_designation_idx" ON "ESSL"."att_designations" USING btree ("designation");--> statement-breakpoint
CREATE INDEX "att_designations_department_id_idx" ON "ESSL"."att_designations" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "att_devices_ip_idx" ON "ESSL"."att_devices" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "att_devices_ip_unique" ON "ESSL"."att_devices" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "att_fp_data_user_id_idx" ON "ESSL"."att_fp_data" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "att_fp_data_finger_index_idx" ON "ESSL"."att_fp_data" USING btree ("finger_index");--> statement-breakpoint
CREATE INDEX "att_fp_data_device_id_idx" ON "ESSL"."att_fp_data" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "att_fp_data_user_finger_device_idx" ON "ESSL"."att_fp_data" USING btree ("user_id","finger_index","device_id");--> statement-breakpoint
CREATE INDEX "att_logs_user_id_idx" ON "ESSL"."att_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "att_logs_record_time_idx" ON "ESSL"."att_logs" USING btree ("record_time");--> statement-breakpoint
CREATE INDEX "att_logs_device_sn_idx" ON "ESSL"."att_logs" USING btree ("device_sn");--> statement-breakpoint
CREATE INDEX "att_logs_device_ip_idx" ON "ESSL"."att_logs" USING btree ("device_ip");--> statement-breakpoint
CREATE INDEX "att_logs_device_id_idx" ON "ESSL"."att_logs" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "att_logs_user_record_idx" ON "ESSL"."att_logs" USING btree ("user_id","record_time");--> statement-breakpoint
CREATE INDEX "att_shifts_name_idx" ON "ESSL"."att_shifts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "att_users_user_id_idx" ON "ESSL"."att_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "att_users_designation_id_idx" ON "ESSL"."att_users" USING btree ("designation_id");--> statement-breakpoint
CREATE INDEX "att_users_shift_id_idx" ON "ESSL"."att_users" USING btree ("shift_id");