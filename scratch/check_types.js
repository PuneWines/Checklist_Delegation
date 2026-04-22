import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yxtvvjijtraobzaqdevz.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4dHZ2amlqdHJhb2J6YXFkZXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDA0NTYsImV4cCI6MjA5MjQxNjQ1Nn0.9AZb7aO-lT_8mvsS_dRhgpsJZ6dRkwBbktd45n5j6hE'

const supabase = createClient(supabaseUrl, supabaseKey)

async function getColumnTypes() {
    console.log('Fetching column types for checklist...')
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'checklist' })
    
    if (error) {
        console.log('RPC get_table_columns failed (expected if not defined).')
        
        // Try a direct query if possible (usually blocked)
        const { data: data2, error: error2 } = await supabase
            .from('checklist')
            .select('*')
            .limit(1)
        
        if (data2 && data2.length > 0) {
            console.log('Sample Row:', data2[0])
            for (const [key, value] of Object.entries(data2[0])) {
                console.log(`Column: ${key}, Value Type: ${typeof value}`)
            }
        } else {
            console.log('Table is empty.')
        }
    } else {
        console.log('Columns:', data)
    }
}

getColumnTypes()
