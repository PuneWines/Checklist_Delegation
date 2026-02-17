import supabase from "../../SupabaseClient";

// --- FETCH PENDING REPAIRS ---
export const fetchRepairDataSortByDate = async (page = 1, limit = 50, searchTerm = '') => {
    try {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase
            .from('repair_tasks')
            .select('*', { count: 'exact' })
            .eq('status', 'Pending') // Fetch only pending items
            .order('created_at', { ascending: false })
            .range(from, to);

        // Search logic updated for new columns
        if (searchTerm && searchTerm.trim() !== '') {
            const val = searchTerm.trim();
            // Using cast for integer id search if possible, or just focus on other fields
            query = query.or(`machine_name.ilike.%${val}%,issue_description.ilike.%${val}%,filled_by.ilike.%${val}%`);
        }

        const { data, error, count } = await query;
        if (error) throw error;

        return { data, totalCount: count };
    } catch (error) {
        console.error("Error fetching repair data:", error);
        return { data: [], totalCount: 0 };
    }
};


// --- FETCH ALL REPAIR TASKS (For Dashboard) ---
export const fetchAllRepairTasks = async (page = 1, limit = 1000) => {
    try {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, error, count } = await supabase
            .from('repair_tasks')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;
        return { data, totalCount: count };
    } catch (error) {
        console.error("Error fetching all repair tasks:", error);
        return { data: [], totalCount: 0 };
    }
};

// --- CREATE NEW REPAIR REQUEST ---
export const postRepairTaskApi = async (formData) => {
    try {
        const { data, error } = await supabase
            .from('repair_tasks')
            .insert({
                filled_by: formData.filledBy,           // Matches "Form Filled By"
                assigned_person: formData.assignedPerson, // Matches "To Assign Person"
                machine_name: formData.machineName,     // Matches "Machine Name"
                issue_description: formData.issueDetails, // Matches "Issue Details"
                status: 'Pending'
            })
            .select();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error("Error creating repair task:", error);
        throw error;
    }
};

// --- UPDATE REPAIR (Admin Action) ---
export const updateRepairData = async (updates) => {
    try {
        // This handles the "Admin will complete remaining info" part
        const results = await Promise.all(updates.map(async (item) => {
            const { data, error } = await supabase
                .from('repair_tasks')
                .update({
                    status: item.status,             // e.g., 'Done'
                    part_replaced: item.partReplaced || null,
                    bill_amount: item.billAmount || null,
                    remarks: item.remarks || null,
                    vendor_name: item.vendorName || null,
                    work_done: item.workDone || null,
                    work_photo_url: item.workPhotoUrl || null,
                    bill_copy_url: item.billCopyUrl || null,
                    submission_date: new Date().toISOString(),
                    admin_done: false // Explicitly set to false on completion
                })
                .eq('id', item.taskId)
                .select();

            if (error) throw error;
            return data[0];
        }));

        return results;
    } catch (error) {
        console.error("Error updating repair:", error);
        throw error;
    }
};

// Fetch Repair History
export const fetchRepairDataForHistory = async (page = 1, searchTerm = '') => {
    const itemsPerPage = 50;
    const from = (page - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;

    try {
        let query = supabase
            .from('repair_tasks')
            .select('*', { count: 'exact' })
            .neq('status', 'Pending')
            .order('submission_date', { ascending: false })
            .range(from, to);

        if (searchTerm && searchTerm.trim() !== '') {
            const val = searchTerm.trim();
            query = query.or(`machine_name.ilike.%${val}%,issue_description.ilike.%${val}%,filled_by.ilike.%${val}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    } catch (e) {
        console.error("Error fetching repair history:", e);
        return [];
    }
};

export const fetchPendingRepairApprovals = async () => {
    try {
        const { data, error } = await supabase
            .from('repair_tasks')
            .select('*')
            .neq('status', 'Pending') // Completed tasks
            .or('admin_done.is.null,admin_done.eq.false') // Not yet admin approved
            .order('submission_date', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error("Error fetching pending repair approvals:", error);
        return [];
    }
};

export const approveRepairTask = async (id) => {
    try {
        const { data, error } = await supabase
            .from('repair_tasks')
            .update({ admin_done: true })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error("Error approving repair task:", error);
        throw error;
    }
};
