import { runDailyReminders } from '../src/cron/dailyReminderJob.js';

export default async function handler(req, res) {
    try {
        await runDailyReminders();
        res.status(200).json({ success: true, message: "Daily reminders executed successfully via Vercel Serverless." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}
