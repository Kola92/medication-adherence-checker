export const REMINDER_QUEUE_NAME = 'medication-reminders';

export interface ReminderJobData {
  userMedicationId: string;
  userId: string;
  userEmail: string;
  medicationName: string;
  dosage: string;
  scheduledFor: string; // ISO 8601
}
