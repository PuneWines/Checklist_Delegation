import axios from 'axios'

const supabaseUrl = 'https://yxtvvjijtraobzaqdevz.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4dHZ2amlqdHJhb2J6YXFkZXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDA0NTYsImV4cCI6MjA5MjQxNjQ1Nn0.9AZb7aO-lT_8mvsS_dRhgpsJZ6dRkwBbktd45n5j6hE'

async function checkRest() {
    try {
        console.log('Fetching OpenAPI spec from PostgREST...')
        const response = await axios.get(`${supabaseUrl}/rest/v1/`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        })
        
        const tables = Object.keys(response.data.paths)
            .filter(path => path !== '/')
            .map(path => path.replace('/', ''))
        
        console.log('Tables exposed by PostgREST:', tables)
        
        if (tables.includes('checklist')) {
            console.log('SUCCESS: "checklist" table is exposed.')
        } else {
            console.log('FAILURE: "checklist" table is NOT exposed!')
            // Check for similar names
            const similar = tables.filter(t => t.toLowerCase().includes('check'))
            console.log('Similar tables found:', similar)
        }
    } catch (error) {
        console.error('Error fetching PostgREST spec:', error.message)
    }
}

checkRest()
