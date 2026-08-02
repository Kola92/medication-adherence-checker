export const REMINDER_QUEUE_NAME = 'medication-reminders';

export interface ReminderJobData {
	userMedicationId: string;
	userId: string;
	userEmail: string;
	medicationName: string;
	dosageAmount: string; // numeric comes back as string from pg, keep consistent
	dosageUnit: string;
	scheduledDate: string; // 'YYYY-MM-DD', matches dose_logs.scheduled_date
	scheduledTime: string; // 'HH:MM', matches dose_logs.scheduled_time
}
