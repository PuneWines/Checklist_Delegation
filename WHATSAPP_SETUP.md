# WhatsApp Integration Setup Guide

## Overview
This application now sends WhatsApp notifications to users when tasks are assigned to them. The notifications include all task details like description, due date, priority, machine name, etc.

## Features
- ✅ Automatic WhatsApp notifications when tasks are assigned
- ✅ Formatted messages with all task details
- ✅ Support for Checklist, Maintenance, and EA tasks
- ✅ Fallback to console logging if API is not configured
- ✅ Error handling - task assignment won't fail if WhatsApp fails

## Setup Instructions

### Option 1: Using Meta WhatsApp Business API (Recommended for Production)

#### Step 1: Create a Meta Business Account
1. Go to [Meta Business Suite](https://business.facebook.com/)
2. Create a business account if you don't have one
3. Navigate to **Business Settings** → **Accounts** → **WhatsApp Accounts**
4. Click **Add** and follow the setup wizard

#### Step 2: Get API Credentials
1. In Meta Business Suite, go to **WhatsApp Manager**
2. Select your WhatsApp Business Account
3. Go to **API Setup**
4. You'll find:
   - **Phone Number ID** (e.g., `123456789012345`)
   - **WhatsApp Business Account ID**
5. Generate a **Permanent Access Token**:
   - Go to **System Users** in Business Settings
   - Create a system user
   - Generate a token with `whatsapp_business_messaging` permission

#### Step 3: Configure Environment Variables
Create or update your `.env` file in the project root:

```env
# WhatsApp Business API Configuration
VITE_WHATSAPP_API_URL=https://graph.facebook.com/v18.0
VITE_WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
VITE_WHATSAPP_ACCESS_TOKEN=your_permanent_access_token_here
```

#### Step 4: Verify Phone Numbers (For Testing)
- During development, you need to verify recipient phone numbers
- Go to WhatsApp Manager → **Phone Numbers** → **Add Phone Number**
- Add test numbers and verify them via OTP

#### Step 5: Restart Your Application
```bash
npm run dev
```

### Option 2: Using Third-Party WhatsApp API Services

You can also use services like:
- **Twilio WhatsApp API**: https://www.twilio.com/whatsapp
- **MessageBird**: https://www.messagebird.com/
- **Vonage (Nexmo)**: https://www.vonage.com/

For these services, you'll need to modify the `whatsappService.js` file to match their API format.

### Option 3: Development Mode (No API Required)

If you don't configure the WhatsApp API credentials, the system will:
- Log messages to the browser console
- Still create tasks successfully
- Show formatted WhatsApp messages in console for testing

This is useful for development and testing without setting up the actual API.

## Message Format

Users will receive messages like this:

```
🔔 *New Task Assigned*

👤 *Assigned to:* John Doe
📋 *Task Type:* Maintenance
🏢 *Department:* Maintenance
👨‍💼 *Assigned by:* Admin
⚙️ *Machine:* CNC Machine
🔧 *Part:* Spindle
⚡ *Priority:* High

📝 *Description:*
Check and replace the spindle bearing

📅 *Due Date:* Feb 17, 2026, 2:00 PM
🔄 *Frequency:* weekly

✅ Please complete this task on time.

_This is an automated message from Task Management System_
```

## Testing

### Test Without API (Console Mode)
1. Don't set the environment variables
2. Assign a task
3. Check the browser console - you'll see:
```
📱 WhatsApp Message (API not configured):
To: +919876543210
Message: [formatted message]
---
```

### Test With API
1. Configure environment variables
2. Verify a test phone number in Meta Business Suite
3. Assign a task to a user with that phone number
4. Check if the message is received

## Phone Number Format

The system automatically handles phone number formatting:
- Accepts: `9876543210` or `+919876543210` or `91-9876-543210`
- Converts to: `919876543210` (international format)
- Default country code: `+91` (India)

To change the default country code, edit `whatsappService.js`:
```javascript
// Change this line in formatPhoneNumber function
if (!cleaned.startsWith('91') && cleaned.length === 10) {
    cleaned = '91' + cleaned;  // Change '91' to your country code
}
```

## Troubleshooting

### Messages Not Sending
1. **Check environment variables**: Ensure they're set correctly
2. **Check phone number**: Must be verified in Meta Business Suite
3. **Check console**: Look for error messages
4. **Check API quota**: Meta has rate limits

### Common Errors

**Error: "Invalid phone number"**
- Solution: Ensure phone numbers are stored correctly in the database

**Error: "401 Unauthorized"**
- Solution: Check your access token, it may have expired

**Error: "Rate limit exceeded"**
- Solution: You've hit Meta's rate limit, wait or upgrade your plan

## User Database Requirements

Ensure your `users` table has a `phone` column with valid phone numbers:

```sql
-- Check if phone column exists
SELECT phone FROM users LIMIT 5;

-- Update phone numbers if needed
UPDATE users SET phone = '9876543210' WHERE name = 'John Doe';
```

## Cost Information

### Meta WhatsApp Business API Pricing
- **Conversations**: Charged per 24-hour conversation window
- **Rates vary by country**: ~$0.005 - $0.02 per conversation
- **Free tier**: 1,000 conversations/month
- **Business-initiated**: Slightly higher cost

### Alternative Services
- **Twilio**: Pay-as-you-go, ~$0.005 per message
- **MessageBird**: Similar pricing
- **Self-hosted**: Free but requires technical setup

## Security Best Practices

1. **Never commit `.env` file**: Add it to `.gitignore`
2. **Use environment variables**: Don't hardcode tokens
3. **Rotate tokens regularly**: Generate new access tokens periodically
4. **Limit permissions**: Only grant necessary WhatsApp permissions
5. **Monitor usage**: Track API calls to detect anomalies

## Support

For issues with:
- **Meta WhatsApp API**: https://developers.facebook.com/support/
- **This integration**: Check console logs and contact your development team

## Future Enhancements

Possible improvements:
- [ ] Task reminder notifications (before due date)
- [ ] Task completion notifications to admins
- [ ] Rich media support (images, PDFs)
- [ ] Interactive buttons in messages
- [ ] Delivery status tracking
- [ ] Bulk messaging for multiple users
