import supabase from "../SupabaseClient";

/**
 * WhatsApp Messaging Service
 * Sends task notifications to users via WhatsApp
 */

// WhatsApp API Configuration
// WhatsApp API Configuration
// WhatsApp API Configuration (Maytapi)
const WHATSAPP_API_URL = 'https://api.maytapi.com/api'; // Hardcoded to prevent .env conflict
const WHATSAPP_PHONE_NUMBER_ID = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PRODUCT_ID = import.meta.env.VITE_WHATSAPP_PRODUCT_ID;

console.log('WhatsApp Service Config (Maytapi):', {
    hasToken: !!WHATSAPP_ACCESS_TOKEN,
    hasPhoneId: !!WHATSAPP_PHONE_NUMBER_ID,
    hasProductId: !!WHATSAPP_PRODUCT_ID,
    apiUrl: WHATSAPP_API_URL
});

/**
 * Format phone number to international format
 * @param {string} phone - Phone number (can be with or without country code)
 * @returns {string} - Formatted phone number with country code
 */
const formatPhoneNumber = (phone) => {
    if (!phone) return null;

    // Remove all non-digit characters
    let cleaned = String(phone).replace(/\D/g, '');

    // If doesn't start with country code, assume India (+91)
    if (!cleaned.startsWith('91') && cleaned.length === 10) {
        cleaned = '91' + cleaned;
    }

    return cleaned;
};

/**
 * Get user phone number from database
 * @param {string} username - Username to fetch phone for
 * @returns {Promise<string|null>} - Phone number or null
 */
const getUserPhoneNumber = async (username) => {
    try {
        console.log(`🔍 Fetching phone for user: "${username}"`);
        const { data, error } = await supabase
            .from('users')
            .select('number')
            .eq('user_name', username)
            .limit(1);

        if (error) {
            console.error('Supabase User Fetch Error:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            console.warn(`⚠️ User "${username}" not found in database.`);
            return null;
        }

        return data[0]?.number || null;
    } catch (error) {
        console.error('Error fetching user phone:', error);
        return null;
    }
};

/**
 * Send WhatsApp message using Maytapi API
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - Message text
 * @returns {Promise<boolean>} - Success status
 */
const sendWhatsAppMessage = async (phoneNumber, message) => {
    try {
        const formattedPhone = formatPhoneNumber(phoneNumber);
        console.log('WhatsApp Service Config (Sending):', {
            token: !!WHATSAPP_ACCESS_TOKEN,
            phoneId: !!WHATSAPP_PHONE_NUMBER_ID,
            product: !!WHATSAPP_PRODUCT_ID
        });

        if (!formattedPhone) {
            console.error('Invalid phone number:', phoneNumber);
            return false;
        }

        // If API credentials are not configured, log to console instead
        if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_PRODUCT_ID) {
            console.log('📱 WhatsApp Message (API not configured):');
            console.log(`To: +${formattedPhone}`);
            console.log(`Message: ${message}`);
            console.log('---');
            return true; // Return true for development
        }

        const url = `${WHATSAPP_API_URL}/${WHATSAPP_PRODUCT_ID}/${WHATSAPP_PHONE_NUMBER_ID}/sendMessage`;
        console.log(`Posting to Maytapi: ${url}`);

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

        const result = await response.json();

        if (!response.ok) {
            console.error('Maytapi API Error:', response.status, response.statusText);
            console.error('Maytapi API Error Response:', JSON.stringify(result, null, 2));
            return false;
        }

        console.log('✅ WhatsApp message sent successfully via Maytapi:', result);
        return true;
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return false;
    }
};

/**
 * Send WhatsApp voice message (PTT/Audio) using Maytapi API
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} audioUrl - Public URL of the audio file
 * @returns {Promise<boolean>} - Success status
 */
const sendWhatsAppVoiceMessage = async (phoneNumber, audioUrl) => {
    try {
        const formattedPhone = formatPhoneNumber(phoneNumber);

        if (!formattedPhone) {
            console.error('Invalid phone number for voice message:', phoneNumber);
            return false;
        }

        // Development fallback
        if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_PRODUCT_ID) {
            console.log('🎤 WhatsApp Voice Message (API not configured):');
            console.log(`To: +${formattedPhone}`);
            console.log(`Audio URL: ${audioUrl}`);
            return true;
        }

        const url = `${WHATSAPP_API_URL}/${WHATSAPP_PRODUCT_ID}/${WHATSAPP_PHONE_NUMBER_ID}/sendMessage`;
        console.log(`Posting Voice Note to Maytapi: ${url}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-maytapi-key': WHATSAPP_ACCESS_TOKEN,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to_number: formattedPhone,
                type: 'audio', // Changed to 'audio' for better compatibility with .webm files
                message: audioUrl // The URL string itself
            })
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('Maytapi Voice API Error:', response.status, response.statusText);
            return false;
        }

        console.log('✅ WhatsApp voice message sent successfully:', result);
        return true;
    } catch (error) {
        console.error('Error sending WhatsApp voice message:', error);
        return false;
    }
};

/**
 * Send task assignment notification
 * @param {Object} taskDetails - Task details
 * @returns {Promise<boolean>} - Success status
 */
export const sendTaskAssignmentNotification = async (taskDetails) => {
    try {
        const {
            doerName,
            taskType,
            description,
            dueDate,
            frequency,
            department,
            givenBy,
            machineName,
            partName,
            priority
        } = taskDetails;

        // Extract audio URL from description if present (handles standalone URL or text + URL)
        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = match ? match[0] : null;
        const isAudioUrl = !!audioUrl; // Boolean flag for logic flow

        // Get user phone number
        const phoneNumber = await getUserPhoneNumber(doerName);

        if (!phoneNumber) {
            console.warn(`No phone number found for user: ${doerName}`);
            return false;
        }

        // Format task details message with adjusted description if needed
        const message = formatTaskMessage({
            ...taskDetails,
            // If description is JUST the URL, enhance it. If it has text + URL, keep it as is.
            description: (isAudioUrl && description.trim() === audioUrl)
                ? `🎤 Voice Note Link: ${description}`
                : description
        });

        console.log('🚀 Attempting to send WhatsApp message...');

        // 1. Send Text Notification
        const textSent = await sendWhatsAppMessage(phoneNumber, message);

        // 2. If Description contained Audio URL, Send Audio File separately
        if (textSent && isAudioUrl) {
            console.log('🎙️ Sending associated audio file...');
            // Wait a moment purely for sequencing (optional)
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl); // Pass extracted URL, not full description
        }

        return textSent;
    } catch (error) {
        console.error('Error sending task assignment notification:', error);
        return false;
    }
};

/**
 * Format task details into a readable WhatsApp message
 * @param {Object} taskDetails - Task details
 * @returns {string} - Formatted message
 */
const formatTaskMessage = (taskDetails) => {
    const {
        doerName,
        taskType,
        description,
        dueDate,
        frequency,
        department,
        givenBy,
        machineName,
        partName,
        priority
    } = taskDetails;

    let message = `🔔 *New Task Assigned*\n\n`;
    message += `👤 *Assigned to:* ${doerName}\n`;
    message += `📋 *Task Type:* ${taskType || 'General'}\n`;

    if (department) {
        message += `🏢 *Department:* ${department}\n`;
    }

    if (givenBy) {
        message += `👨‍💼 *Assigned by:* ${givenBy}\n`;
    }

    if (machineName) {
        message += `⚙️ *Machine:* ${machineName}\n`;
    }

    if (partName) {
        message += `🔧 *Part:* ${partName}\n`;
    }

    if (priority) {
        message += `⚡ *Priority:* ${priority}\n`;
    }

    message += `\n📝 *Description:*\n${description || 'No description provided'}\n`;

    if (dueDate) {
        const formattedDate = new Date(dueDate).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
        message += `\n📅 *Due Date:* ${formattedDate}\n`;
    }

    if (frequency && frequency !== 'one-time') {
        message += `🔄 *Frequency:* ${frequency}\n`;
    }

    message += `\n✅ Please complete this task on time.`;
    message += `\n\n_This is an automated message from Task Management System_`;

    return message;
};

/**
 * Send task reminder notification
 * @param {Object} taskDetails - Task details
 * @returns {Promise<boolean>} - Success status
 */
export const sendTaskReminderNotification = async (taskDetails) => {
    try {
        const { doerName, description, dueDate } = taskDetails;

        const phoneNumber = await getUserPhoneNumber(doerName);

        if (!phoneNumber) {
            console.warn(`No phone number found for user: ${doerName}`);
            return false;
        }

        const formattedDate = new Date(dueDate).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });

        const message = `⏰ *Task Reminder*\n\n` +
            `Hi ${doerName},\n\n` +
            `This is a reminder for your pending task:\n\n` +
            `📝 ${description}\n` +
            `📅 Due: ${formattedDate}\n\n` +
            `Please complete it as soon as possible.\n\n` +
            `_Task Management System_`;

        return await sendWhatsAppMessage(phoneNumber, message);
    } catch (error) {
        console.error('Error sending task reminder:', error);
        return false;
    }
};

/**
 * Send task completion notification to admin
 * @param {Object} taskDetails - Task details
 * @returns {Promise<boolean>} - Success status
 */
export const sendTaskCompletionNotification = async (taskDetails) => {
    try {
        const { givenBy, doerName, description, completedAt } = taskDetails;

        const phoneNumber = await getUserPhoneNumber(givenBy);

        if (!phoneNumber) {
            console.warn(`No phone number found for admin: ${givenBy}`);
            return false;
        }

        const formattedDate = new Date(completedAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });

        const message = `✅ *Task Completed*\n\n` +
            `${doerName} has completed the task:\n\n` +
            `📝 ${description}\n` +
            `⏱️ Completed at: ${formattedDate}\n\n` +
            `_Task Management System_`;

        return await sendWhatsAppMessage(phoneNumber, message);
    } catch (error) {
        console.error('Error sending completion notification:', error);
        return false;
    }
};

export default {
    sendTaskAssignmentNotification,
    sendTaskReminderNotification,
    sendTaskCompletionNotification
};
