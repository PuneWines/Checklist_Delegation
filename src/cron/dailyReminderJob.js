import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const WHATSAPP_API_URL = 'https://api.maytapi.com/api';
const WHATSAPP_PRODUCT_ID = process.env.VITE_WHATSAPP_PRODUCT_ID;
const WHATSAPP_PHONE_NUMBER_ID = process.env.VITE_WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.VITE_WHATSAPP_ACCESS_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const formatPhoneNumber = (phone) => {
    if (!phone) return null;
    let cleaned = String(phone).replace(/\D/g, '');
    if (!cleaned.startsWith('91') && cleaned.length === 10) {
        cleaned = '91' + cleaned;
    }
    return cleaned;
};

const sendWhatsAppMessage = async (phoneNumber, message) => {
    try {
        const formattedPhone = formatPhoneNumber(phoneNumber);
        if (!formattedPhone) return false;

        const url = `${WHATSAPP_API_URL}/${WHATSAPP_PRODUCT_ID}/${WHATSAPP_PHONE_NUMBER_ID}/sendMessage`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-maytapi-key': WHATSAPP_ACCESS_TOKEN,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to_number: formattedPhone,
                type: 'text',
                message: message
            })
        });

        if (!response.ok) {
            console.error('Maytapi API Error:', response.status, response.statusText);
            return false;
        }

        console.log('✅ Daily reminder WhatsApp message sent to:', formattedPhone);
        return true;
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return false;
    }
};

export const startDailyRemindersCron = () => {
    // Schedule task between 9 am and 10 am, e.g., 9:30 AM every day
    console.log('⏰ Initializing Daily Task Reminder Cron Job (runs at 09:30 AM)');

    cron.schedule('30 9 * * *', async () => {
        console.log('⏳ Running Daily Task Reminder Cron Job...');
        try {
            // 1. Fetch all users
            const { data: users, error: userError } = await supabase.from('users').select('user_name, number');
            if (userError || !users) {
                console.error('Error fetching users:', userError);
                return;
            }

            const today = new Date().toISOString().split('T')[0];

            for (const user of users) {
                if (!user.user_name || !user.number) continue;
                
                const name = user.user_name;
                let pendingCount = 0;

                // 2. Count Pending Tasks from all tables
                // Checklist
                const { count: checklistCount } = await supabase.from('checklist')
                    .select('*', { count: 'exact', head: true })
                    .is('submission_date', null)
                    .lte('planned_date', `${today}T23:59:59`)
                    .eq('name', name);
                
                // Delegation
                const { count: delegationCount } = await supabase.from('delegation')
                    .select('*', { count: 'exact', head: true })
                    .is('submission_date', null)
                    .neq('status', 'done')
                    .lte('planned_date', `${today}T23:59:59`)
                    .eq('name', name);

                // Maintenance
                const { count: maintenanceCount } = await supabase.from('maintenance_tasks')
                    .select('*', { count: 'exact', head: true })
                    .is('submission_date', null)
                    .lte('planned_date', `${today}T23:59:59`)
                    .eq('name', name);

                // Repair
                const { count: repairCount } = await supabase.from('repair_tasks')
                    .select('*', { count: 'exact', head: true })
                    .is('submission_date', null)
                    .lte('planned_date', `${today}T23:59:59`)
                    .eq('assigned_person', name);

                // Work Tasks
                const { count: workCount } = await supabase.from('work_task')
                    .select('*', { count: 'exact', head: true })
                    .is('submission_date', null)
                    .lte('current_date', `${today}T23:59:59`)
                    .eq('name', name);

                // EA Tasks
                const { count: eaCount } = await supabase.from('ea_tasks')
                    .select('*', { count: 'exact', head: true })
                    .in('status', ['pending', 'extend', 'extended', 'Pending'])
                    .lte('planned_date', `${today}T23:59:59`)
                    .eq('doer_name', name);

                pendingCount = (checklistCount || 0) + 
                               (delegationCount || 0) + 
                               (maintenanceCount || 0) + 
                               (repairCount || 0) + 
                               (workCount || 0) + 
                               (eaCount || 0);

                if (pendingCount > 0) {
                    const message = `☀️ *Daily Task Reminder*\n\n` +
                        `Hi ${name},\n` +
                        `You have *${pendingCount} pending task(s)* today.\n\n` +
                        `🔗 View tasks: https://checklist-delegation-five.vercel.app/login\n\n` +
                        `_Drinqkart_`;

                    await sendWhatsAppMessage(user.number, message);
                    // Add slight delay to avoid rate limiting
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
            
            console.log('✅ Daily Task Reminder Cron Job Finished!');

        } catch (error) {
            console.error('Error executing cron job:', error);
        }
    });
};
