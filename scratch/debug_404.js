import axios from 'axios'

const supabaseUrl = 'https://yxtvvjijtraobzaqdevz.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4dHZ2amlqdHJhb2J6YXFkZXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDA0NTYsImV4cCI6MjA5MjQxNjQ1Nn0.9AZb7aO-lT_8mvsS_dRhgpsJZ6dRkwBbktd45n5j6hE'

async function testSimpleFilter() {
    const url = `${supabaseUrl}/rest/v1/checklist?select=count&submission_date=not.is.null`
    
    console.log('Testing simple NOT NULL filter:', url)
    try {
        const response = await axios.get(url, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Range': '0-0'
            }
        })
        console.log('Success! Status:', response.status)
        console.log('Count:', response.headers['content-range'])
    } catch (error) {
        console.error('FAILED! Status:', error.response?.status)
        console.error('Error Body:', JSON.stringify(error.response?.data))
    }
}

testSimpleFilter()
