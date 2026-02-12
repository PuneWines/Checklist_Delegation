
import supabase from "../../SupabaseClient";

// Fetch Maintenance Tasks (Active/Pending)
export const fetchMaintenanceDataSortByDate = async (page = 1, limit = 50, searchTerm = '') => {
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('user-name');
    const userAccess = localStorage.getItem('user_access');

    try {
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        const endOfTodayISO = endOfToday.toISOString();

        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // Query without strict date filtering for debugging
        let query = supabase
            .from('maintenance_tasks')
            .select('*', { count: 'exact' })
            // .lte('task_start_date', endOfTodayISO) // Commented out for debugging
            // .order('task_start_date', { ascending: true }) // Can keep order
            .is("submission_date", null)
        // .is("status", null) // Removed status check, pending tasks usually have status='Pending'
        // .range(from, to);

        console.log(`Fetching Maintenance Pending: Page ${page}, Role: ${role}, User: ${username}`);

        if (searchTerm && searchTerm.trim() !== '') {
            const searchValue = searchTerm.trim();
            query = query.or(`task_id.ilike.%${searchValue}%,name.ilike.%${searchValue}%,given_by.ilike.%${searchValue}%,department.ilike.%${searchValue}%,machine_name.ilike.%${searchValue}%,part_name.ilike.%${searchValue}%,part_area.ilike.%${searchValue}%,task_description.ilike.%${searchValue}%`);
        }

        if (role === 'user' && username) {
            query = query.eq('name', username);
        }

        const { data, error, count } = await query;

        if (error) {
            console.error("Error fetching maintenance data:", error);
            // console.error("Query used:", query); // You can't print the query object easily to see string, but error helps.
            return { data: [], totalCount: 0 };
        }

        return { data, totalCount: count };

    } catch (error) {
        console.log("Error from Supabase", error);
        return { data: [], totalCount: 0 };
    }
};

// Fetch Maintenance History (Completed)
export const fetchMaintenanceDataForHistory = async (page = 1, searchTerm = '') => {
    const itemsPerPage = 50;
    const start = (page - 1) * itemsPerPage;
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('user-name');
    const userAccess = localStorage.getItem('user_access');

    try {
        let query = supabase
            .from('maintenance_tasks')
            .select('*', { count: 'exact' })
            .order('task_start_date', { ascending: false })
            .not('submission_date', 'is', null)
        // .not('status', 'is', null)
        // .range(start, start + itemsPerPage - 1);

        console.log(`Fetching Maintenance History: Page ${page}, Role: ${role}, User: ${username}`);

        if (searchTerm && searchTerm.trim() !== '') {
            const searchValue = searchTerm.trim();
            query = query.or(`task_id.ilike.%${searchValue}%,name.ilike.%${searchValue}%,given_by.ilike.%${searchValue}%,department.ilike.%${searchValue}%,machine_name.ilike.%${searchValue}%,part_name.ilike.%${searchValue}%,part_area.ilike.%${searchValue}%,task_description.ilike.%${searchValue}%`);
        }

        if (role === 'user' && username) {
            query = query.eq('name', username);
        }

        const { data, error } = await query;

        if (error) {
            console.error("Error fetching maintenance history:", error);
            return [];
        }

        return data;

    } catch (error) {
        console.log("Error from Supabase", error);
        return [];
    }
};

// Fetch ALL Maintenance Tasks (Both Pending and Completed) for Dashboard
export const fetchAllMaintenanceTasksForDashboard = async (page = 1, limit = 1000) => {
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('user-name');
    const userAccess = localStorage.getItem('user_access');

    try {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // Query to fetch ALL maintenance tasks (no submission_date filter)
        let query = supabase
            .from('maintenance_tasks')
            .select('*', { count: 'exact' })
            .order('task_start_date', { ascending: false })
            .range(from, to);

        console.log(`Fetching ALL Maintenance Tasks for Dashboard: Page ${page}, Role: ${role}, User: ${username}`);

        // Apply role-based filtering
        if (role === 'user' && username) {
            query = query.eq('name', username);
        }

        const { data, error, count } = await query;

        if (error) {
            console.error("Error fetching all maintenance tasks:", error);
            return { data: [], totalCount: 0 };
        }

        console.log(`Fetched ${data?.length || 0} maintenance tasks (Total: ${count})`);
        return { data, totalCount: count };

    } catch (error) {
        console.log("Error from Supabase", error);
        return { data: [], totalCount: 0 };
    }
};

// Update Maintenance Tasks
export const updateMaintenanceData = async (submissionData) => {
    try {
        if (!Array.isArray(submissionData) || submissionData.length === 0) {
            throw new Error('Invalid submission data');
        }

        const updates = await Promise.all(submissionData.map(async (item) => {
            let imageUrl = null;

            if (item.image && item.image.previewUrl) {
                try {
                    const response = await fetch(item.image.previewUrl);
                    const blob = await response.blob();
                    const file = new File([blob], item.image.name, { type: item.image.type });
                    const fileExt = item.image.name.split('.').pop();
                    const fileName = `mnt_${Date.now()}_${crypto.randomUUID()}.${fileExt}`;
                    const { error: uploadError } = await supabase.storage.from('maintenance').upload(fileName, file);

                    if (uploadError) throw uploadError;

                    const { data: { publicUrl } } = supabase.storage.from('maintenance').getPublicUrl(fileName);
                    imageUrl = publicUrl;

                } catch (uploadError) {
                    console.error("Image upload failed", uploadError);
                    throw uploadError;
                }
            }

            return {
                task_id: item.taskId,
                status: item.status, // 'Done' or 'Issue'
                remarks: item.remarks, // Note: Schema might be 'remarks' or 'remark' - check assumption. Schema likely 'remarks' if copied from checklist pattern, or check previous code.
                submission_date: new Date().toISOString(),
                uploaded_image_url: imageUrl
            };
        }));

        const { data, error } = await supabase
            .from('maintenance_tasks')
            .upsert(updates, { onConflict: ['task_id'] });

        if (error) throw error;
        return data;

    } catch (error) {
        console.error('Error in updateMaintenanceData:', error);
        throw error;
    }
};

export const postMaintenanceTaskApi = async (taskData) => {
    try {
        console.log("Attempting to insert maintenance task:", taskData);
        const { data, error } = await supabase
            .from('maintenance_tasks')
            .insert(taskData)
            .select();

        if (error) {
            console.error("Error creating maintenance task:", error);
            console.error("Error details:", error.message, error.details, error.hint);
            throw error;
        }
        console.log("Successfully created maintenance task:", data);
        return data;
    } catch (error) {
        console.error("Exception in postMaintenanceTaskApi:", error);
        throw error;
    }
};
