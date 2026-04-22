import axios from 'axios'

const supabaseUrl = 'https://yxtvvjijtraobzaqdevz.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4dHZ2amlqdHJhb2J6YXFkZXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDA0NTYsImV4cCI6MjA5MjQxNjQ1Nn0.9AZb7aO-lT_8mvsS_dRhgpsJZ6dRkwBbktd45n5j6hE'

async function finalVerify() {
    const filters = [
        'submission_date=not.is.null', // Completed tasks
        'submission_date=is.null',     // Pending/Overdue
    ]
    
    console.log('Verifying simplified filters on checklist...')
    for (const f of filters) {
        const url = `${supabaseUrl}/rest/v1/checklist?select=count&${f}`
        try {
            const response = await axios.get(url, {
                headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Range': '0-0' }
            })
            console.log(`PASS: ${f} -> Status ${response.status}`)
        } catch (error) {
            console.error(`FAIL: ${f} -> Status ${error.response?.status}`)
        }
    }
}

finalVerify()
