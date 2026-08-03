import { Resend } from 'resend';
import { config } from './config';
import type { ReminderJobData } from 'shared';

const resend = new Resend(config.resendApiKey);

export async function sendReminderEmail(data: ReminderJobData): Promise<void> {
  const { userEmail, medicationName, dosageAmount, dosageUnit, scheduledTime } = data;

  const { error } = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: userEmail,
    subject: `Reminder: take your ${medicationName}`,
    html: `
      <p>This is a reminder to take your medication.</p>
      <ul>
        <li><strong>Medication:</strong> ${medicationName}</li>
        <li><strong>Dosage:</strong> ${dosageAmount}${dosageUnit}</li>
        <li><strong>Scheduled time:</strong> ${scheduledTime}</li>
      </ul>
      <p>This is an automated reminder from your medication adherence tracker. Always follow your prescribing doctor's guidance.</p>
    `
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
