import nodemailer from 'nodemailer';
import { NotificationPayload } from '../types';

let transporter: nodemailer.Transporter | null = null;

export const sendEmail = async (emailAddress: string, payload: NotificationPayload): Promise<any> => {
  if (!transporter) {
    if (process.env.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
  }

  const htmlBody = `
    <h2>${payload.title}</h2>
    <p>${payload.body}</p>
    <ul>
      <li><strong>Flight:</strong> ${payload.flightInfo.flightNumber}</li>
      <li><strong>Status:</strong> ${payload.flightInfo.status}</li>
      <li><strong>Departure:</strong> ${payload.flightInfo.updatedDepartureTime || payload.flightInfo.scheduledDepartureTime}</li>
      ${payload.flightInfo.gate ? `<li><strong>Gate:</strong> ${payload.flightInfo.gate}</li>` : ''}
      ${payload.flightInfo.terminal ? `<li><strong>Terminal:</strong> ${payload.flightInfo.terminal}</li>` : ''}
    </ul>
    <a href="${payload.deepLink}">View details in app</a>
  `;

  if (!transporter) {
    console.log(`[MOCK EMAIL] Sending to ${emailAddress}`);
    console.log(`[MOCK EMAIL] Body:`, htmlBody);
    return { messageId: 'mock-message-id' };
  }

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || '"Travel App" <noreply@example.com>',
    to: emailAddress,
    subject: payload.title,
    html: htmlBody,
  });

  return info;
};
