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
 * Send urgent task notification
 */
export const sendUrgentTaskNotification = async (taskDetails) => {
    try {
        const {
            doerName,
            taskId,
            description,
            dueDate,
            givenBy,
            taskType,
            machineName,
            partName,
            department
        } = taskDetails;

        const phoneNumber = await getUserPhoneNumber(doerName);
        if (!phoneNumber) return false;

        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
        const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note: ${audioUrl}` : description;

        const header = taskType ? `🚨 URGENT ${taskType.toUpperCase()} ALERT 🚨` : `🚨 URGENT TASK ALERT 🚨`;

        let body = "";
        const type = taskType?.toLowerCase();

        switch (type) {
            case 'maintenance':
                body = `Name: ${doerName}\n` +
                    `Task ID: ${taskId}\n` +
                    `⚙️ Machine: ${machineName || 'N/A'}\n` +
                    `🧩 Part: ${partName || 'N/A'}\n` +
                    `🏢 Dept: ${department || 'N/A'}\n` +
                    `📝 Task: ${displayDescription}\n` +
                    `🗓️ Planned: ${dueDate}\n` +
                    `🧑 Given By: ${givenBy}\n`;
                break;

            case 'repair':
                body = `Name: ${doerName}\n` +
                    `Task ID: ${taskId}\n` +
                    `⚙️ Machine: ${machineName || 'N/A'}\n` +
                    `🏢 Dept: ${department || 'N/A'}\n` +
                    `📝 Issue: ${displayDescription}\n` +
                    `🗓️ Date: ${dueDate}\n` +
                    `🧑 Filled By: ${givenBy}\n`;
                break;

            case 'checklist':
                body = `Name: ${doerName}\n` +
                    `Task ID: ${taskId}\n` +
                    `🏢 Dept: ${department || 'N/A'}\n` +
                    `📝 Task: ${displayDescription}\n` +
                    `⏳ Planned Date: ${dueDate}\n` +
                    `🧑 Given By: ${givenBy}\n`;
                break;

            case 'ea':
                body = `Name: ${doerName}\n` +
                    `Task ID: ${taskId}\n` +
                    `💼 EA Task: ${displayDescription}\n` +
                    `⏳ Deadline: ${dueDate}\n` +
                    `🧑 Assigned By: ${givenBy}\n`;
                break;

            default:
                body = `Name: ${doerName}\n` +
                    `Task ID: ${taskId}\n` +
                    `📝 Task: ${displayDescription}\n` +
                    `Planned Date: ${dueDate}\n` +
                    `Given By: ${givenBy}\n`;
        }

        const message = `${header}\n\n` +
            body +
            `\n📌 Please take immediate action and update once completed.\n` +
            `🔗 App Link: https://checklist-delegation-supabase-five.vercel.app/login`;

        const sent = await sendWhatsAppMessage(phoneNumber, message);
        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }
        return sent;
    } catch (error) {
        console.error('Error sending urgent notification:', error);
        return false;
    }
};

/**
 * Send checklist task notification
 */
export const sendChecklistTaskNotification = async (taskDetails) => {
    try {
        const { doerName, taskId, description, startDate, givenBy, department, duration } = taskDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);
        if (!phoneNumber) return false;

        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
        const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note: ${audioUrl}` : description;

        const message = `📋 *NEW CHECKLIST TASK*\n` +
            `Dear ${doerName},\n\n` +
            `A new checklist task has been assigned to you.\n\n` +
            `📌 Task ID: ${taskId}\n` +
            `🏢 Dept: ${department || 'N/A'}\n` +
            `📝 Task: ${displayDescription}\n` +
            `⏳ Planned Date: ${startDate}\n` +
            (duration ? `⏱ Duration: ${duration}\n` : '') +
            `🧑 Given By: ${givenBy}\n\n` +
            `✅ Link: https://checklist-delegation-supabase-five.vercel.app/login\n` +
            `Best regards,\nAcemark Stationers.`;

        const sent = await sendWhatsAppMessage(phoneNumber, message);
        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }
        return sent;
    } catch (error) {
        console.error('Error sending checklist notification:', error);
        return false;
    }
};

/**
 * Send maintenance task notification
 */
export const sendMaintenanceTaskNotification = async (taskDetails) => {
    try {
        const { doerName, taskId, description, startDate, givenBy, machineName, partName, department, duration } = taskDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);
        if (!phoneNumber) return false;

        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
        const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note: ${audioUrl}` : description;

        const message = `🛠️ *MAINTENANCE TASK ASSIGNED*\n` +
            `Dear ${doerName},\n\n` +
            `You have a new maintenance task.\n\n` +
            `📌 Task ID: ${taskId}\n` +
            `⚙️ Machine: ${machineName || 'N/A'}\n` +
            `🧩 Part: ${partName || 'N/A'}\n` +
            `🏢 Dept: ${department || 'N/A'}\n` +
            `📝 Task: ${displayDescription}\n` +
            `🗓️ Planned Date: ${startDate}\n` +
            (duration ? `⏱ Duration: ${duration}\n` : '') +
            `🧑 Given By: ${givenBy}\n\n` +
            `✅ Link: https://checklist-delegation-supabase-five.vercel.app/login\n` +
            `Best regards,\nAcemark Stationers.`;

        const sent = await sendWhatsAppMessage(phoneNumber, message);
        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }
        return sent;
    } catch (error) {
        console.error('Error sending maintenance notification:', error);
        return false;
    }
};

/**
 * Send repair task notification
 */
export const sendRepairTaskNotification = async (taskDetails) => {
    try {
        const { doerName, taskId, description, startDate, givenBy, machineName, department, duration } = taskDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);
        if (!phoneNumber) return false;

        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
        const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note: ${audioUrl}` : description;

        const message = `🔨 *REPAIR REQUEST ASSIGNED*\n` +
            `Dear ${doerName},\n\n` +
            `A repair request has been assigned to you.\n\n` +
            `📌 Task ID: ${taskId}\n` +
            `⚙️ Machine: ${machineName || 'N/A'}\n` +
            `🏢 Dept: ${department || 'N/A'}\n` +
            `📝 Issue: ${displayDescription}\n` +
            `🗓️ Date: ${startDate}\n` +
            (duration ? `⏱ Duration: ${duration}\n` : '') +
            `🧑 Filled By: ${givenBy}\n\n` +
            `✅ Link: https://checklist-delegation-supabase-five.vercel.app/login\n` +
            `Best regards,\nAcemark Stationers.`;

        const sent = await sendWhatsAppMessage(phoneNumber, message);
        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }
        return sent;
    } catch (error) {
        console.error('Error sending repair notification:', error);
        return false;
    }
};

/**
 * Send EA task notification
 */
export const sendEATaskNotification = async (taskDetails) => {
    try {
        const { doerName, taskId, description, startDate, givenBy, duration } = taskDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);
        if (!phoneNumber) return false;

        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
        const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note: ${audioUrl}` : description;

        const message = `💼 *NEW EA TASK*\n` +
            `Dear ${doerName},\n\n` +
            `A new Executive Assistant task has been assigned.\n\n` +
            `📌 Task ID: ${taskId}\n` +
            `📝 Description: ${displayDescription}\n` +
            `⏳ Planned Date: ${startDate}\n` +
            (duration ? `⏱ Duration: ${duration}\n` : '') +
            `🧑 Requested By: ${givenBy}\n\n` +
            `✅ Link: https://checklist-delegation-supabase-five.vercel.app/login\n` +
            `Best regards,\nAcemark Stationers.`;

        const sent = await sendWhatsAppMessage(phoneNumber, message);
        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }
        return sent;
    } catch (error) {
        console.error('Error sending EA notification:', error);
        return false;
    }
};

/**
 * Send delegation task notification
 */
export const sendDelegationTaskNotification = async (taskDetails) => {
    try {
        const { doerName, taskId, description, startDate, givenBy, department, duration } = taskDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);
        if (!phoneNumber) return false;

        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
        const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note: ${audioUrl}` : description;

        const message = `🔔 *NEW DELEGATION TASK*\n` +
            `Dear ${doerName},\n\n` +
            `A new task has been delegated to you.\n\n` +
            `📌 Task ID: ${taskId}\n` +
            `🏢 Dept: ${department || 'N/A'}\n` +
            `📝 Task: ${displayDescription}\n` +
            `⏳ Deadline: ${startDate}\n` +
            (duration ? `⏱ Duration: ${duration}\n` : '') +
            `🧑 Allocated By: ${givenBy}\n\n` +
            `✅ Link: https://checklist-delegation-supabase-five.vercel.app/login\n` +
            `Best regards,\nAcemark Stationers.`;

        const sent = await sendWhatsAppMessage(phoneNumber, message);
        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }
        return sent;
    } catch (error) {
        console.error('Error sending delegation notification:', error);
        return false;
    }
};

/**
 * Send task extension notification
 */
export const sendTaskExtensionNotification = async (taskDetails) => {
    try {
        const { doerName, taskId, givenBy, description, nextExtendDate } = taskDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);

        if (!phoneNumber) return false;

        // Extract audio URL from description if present
        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);

        // If description is JUST the URL, enhance it
        const displayDescription = (audioUrl && description?.trim() === audioUrl)
            ? `🎤 Voice Note Link: ${audioUrl}`
            : description;

        const message = `🔄 *TASK EXTENSION NOTICE*\n` +
            `Dear ${doerName},\n\n` +
            `This is to inform you that the deadline for your delegated task has been extended. Please find the updated details below:\n\n` +
            `📌 Task ID: ${taskId}\n` +
            `🧑💼 Allocated By: ${givenBy}\n` +
            `📝 Task Description: ${displayDescription}\n\n\n` +
            `⏳ Updated Deadline: ${nextExtendDate}\n` +
            `✅ Closure Link: https://checklist-delegation-supabase-five.vercel.app/login\n` +
            `Please ensure the task is completed within the new timeline. If you require any support, feel free to contact the concerned person.\n\n` +
            `Best regards,\n` +
            `Acemark Stationers.`;

        const sent = await sendWhatsAppMessage(phoneNumber, message);

        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }

        return sent;
    } catch (error) {
        console.error('Error sending extension notification:', error);
        return false;
    }
};

/**
 * Send task assignment notification (Delegation Task)
 */
export const sendTaskAssignmentNotification = async (taskDetails) => {
    const { taskType } = taskDetails;

    switch (taskType?.toLowerCase()) {
        case 'checklist':
            return sendChecklistTaskNotification(taskDetails);
        case 'maintenance':
            return sendMaintenanceTaskNotification(taskDetails);
        case 'repair':
            return sendRepairTaskNotification(taskDetails);
        case 'ea':
            return sendEATaskNotification(taskDetails);
        case 'delegation':
            return sendDelegationTaskNotification(taskDetails);
        default:
            // For backward compatibility or if type is not provided
            try {
                const {
                    doerName,
                    taskId,
                    givenBy,
                    description,
                    startDate,
                } = taskDetails;

                const phoneNumber = await getUserPhoneNumber(doerName);

                if (!phoneNumber) {
                    console.warn(`No phone number found for user: ${doerName}`);
                    return false;
                }

                const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
                const match = description && description.match(urlRegex);
                const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
                const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note Link: ${audioUrl}` : description;

                const message = `🔔 *REMINDER: DELEGATION TASK*\n` +
                    `Dear ${doerName},\n\n` +
                    `You have been assigned a new task. Please find the details below:\n\n` +
                    `📌 Task ID: ${taskId}\n` +
                    `🧑 Allocated By: ${givenBy}\n` +
                    `📝 Task Description: ${displayDescription}\n\n\n` +
                    `⏳ Deadline: ${startDate}\n` +
                    `✅ Closure Link: https://checklist-delegation-supabase-five.vercel.app/login\n` +
                    `Please make sure the task is completed before the deadline. For any assistance, feel free to reach out.\n\n` +
                    `Best regards,\n` +
                    `Acemark Stationers.`;

                const sent = await sendWhatsAppMessage(phoneNumber, message);
                if (sent && audioUrl) {
                    await new Promise(r => setTimeout(r, 1000));
                    await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
                }
                return sent;
            } catch (error) {
                console.error('Error sending task assignment notification:', error);
                return false;
            }
    }
};

/**
 * DEPRECATED - use sendTaskAssignmentNotification
 */
const formatTaskMessage = (taskDetails) => {
    return "Please use specific notification functions";
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
            `_Acemark Stationers_`;

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
            `_Acemark Stationers_`;

        return await sendWhatsAppMessage(phoneNumber, message);
    } catch (error) {
        console.error('Error sending completion notification:', error);
        return false;
    }
};



/**
 * Send task rejection notification
 */
export const sendTaskRejectionNotification = async (taskDetails) => {
    try {
        const { doerName, taskId, description, taskType, reason } = taskDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);

        if (!phoneNumber) {
            console.warn(`No phone number found for user: ${doerName}`);
            return false;
        }

        const header = taskType ? `❌ ${taskType.toUpperCase()} TASK REJECTED` : `❌ TASK REJECTED`;

        const message = `${header}\n\n` +
            `Dear ${doerName},\n\n` +
            `Your submitted task has been rejected by the Admin.\n\n` +
            `📌 Task ID: ${taskId}\n` +
            `📝 Task: ${description || 'N/A'}\n` +
            (reason ? `❓ Reason: ${reason}\n` : '') +
            `\n⚠️ The task has been moved back to your pending list. Please review the issues and resubmit.\n\n` +
            `🔗 App Link: https://checklist-delegation-supabase-five.vercel.app/login\n\n` +
            `Best regards,\nAcemark Stationers.`;

        return await sendWhatsAppMessage(phoneNumber, message);
    } catch (error) {
        console.error('Error sending rejection notification:', error);
        return false;
    }
};

/**
 * Send task reassignment notification (Shifted Task)
 */
export const sendTaskReassignmentNotification = async (taskDetails) => {
    try {
        const {
            newDoerName,
            originalDoerName,
            taskId,
            description,
            startDate,
            givenBy,
            department,
            taskType
        } = taskDetails;

        const phoneNumber = await getUserPhoneNumber(newDoerName);
        if (!phoneNumber) return false;

        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
        const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note: ${audioUrl}` : description;

        const message = `🔄 *TASK REASSIGNED*\n` +
            `Dear ${newDoerName},\n\n` +
            `A task has been reassigned to you from ${originalDoerName} (currently on leave).\n\n` +
            `📌 Task ID: ${taskId}\n` +
            `📋 Type: ${taskType ? taskType.toUpperCase() : 'TASK'}\n` +
            `🏢 Dept: ${department || 'N/A'}\n` +
            `📝 Task: ${displayDescription}\n` +
            `⏳ Date: ${startDate}\n` +
            `🧑 Originally Given By: ${givenBy}\n\n` +
            `✅ Link: https://checklist-delegation-supabase-five.vercel.app/login\n` +
            `Please ensure this task is completed on time.\n\n` +
            `Best regards,\nAcemark Stationers.`;

        const sent = await sendWhatsAppMessage(phoneNumber, message);
        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }
        return sent;
    } catch (error) {
        console.error('Error sending reassignment notification:', error);
        return false;
    }
};

/**
 * Send Password Reset OTP to Admin
 */
export const sendPasswordResetOTP = async (username, otp) => {
    try {
        const adminNumber = "9131749390";
        const message = `🔐 *PASSWORD RESET REQUEST*\n\n` +
            `A password reset has been requested for:\n` +
            `👤 User: *${username}*\n` +
            `🔢 OTP Code: *${otp}*\n\n` +
            `Please provide this code to the user if the request is valid.\n\n` +
            `_Acemark Stationers_`;

        return await sendWhatsAppMessage(adminNumber, message);
    } catch (error) {
        console.error('Error sending password reset OTP:', error);
        return false;
    }
};

export default {
    sendUrgentTaskNotification,
    sendTaskExtensionNotification,
    sendTaskAssignmentNotification,
    sendChecklistTaskNotification,
    sendMaintenanceTaskNotification,
    sendRepairTaskNotification,
    sendEATaskNotification,
    sendDelegationTaskNotification,
    sendTaskReminderNotification,
    sendTaskCompletionNotification,
    sendTaskRejectionNotification,
    sendTaskReassignmentNotification,
    sendPasswordResetOTP
};
