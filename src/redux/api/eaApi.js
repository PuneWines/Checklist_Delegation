import supabase from '../../SupabaseClient';

// Fetch all EA tasks (pending)
export const fetchEATasks = async () => {
    try {
        const { data, error } = await supabase
            .from('ea_tasks')
            .select('*')
            .in('status', ['pending', 'extend', 'extended', 'Pending'])
            .order('planned_date', { ascending: true });

        if (error) throw error;
        return (data || []).map(row => ({ ...row, id: row.task_id }));
    } catch (err) {
        console.error('Error fetching EA tasks:', err);
        return [];
    }
};

// Fetch EA task history (completed/approved)
export const fetchEATasksHistory = async () => {
    try {
        const { data, error } = await supabase
            .from('ea_tasks')
            .select('*')
            .in('status', ['done', 'approved', 'Approved', 'Done'])
            .order('updated_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(row => ({ ...row, id: row.task_id, department: "EA" }));
    } catch (err) {
        console.error('Error fetching EA task history:', err);
        return [];
    }
};

// Create a new EA task
export const createEATask = async (taskData) => {
    try {
        const { data, error } = await supabase
            .from('ea_tasks')
            .insert([taskData])
            .select();

        if (error) throw error;
        return { success: true, data: data[0] };
    } catch (err) {
        console.error('Error creating EA task:', err);
        return { success: false, error: err.message };
    }
};

// Update EA task status
export const updateEATask = async (taskId, updates) => {
    try {
        const { data, error } = await supabase
            .from('ea_tasks')
            .update(updates)
            .eq('task_id', taskId)
            .select();

        if (error) throw error;
        return { success: true, data: data[0] };
    } catch (err) {
        console.error('Error updating EA task:', err);
        return { success: false, error: err.message };
    }
};

// Complete EA task (mark for admin approval)
export const completeEATask = async (task, remarks = '', imageUrl = '') => {
    try {
        const { data, error } = await supabase
            .from('ea_tasks')
            .update({
                status: 'done', // Mark as pending for admin approval
                remarks: remarks,
                image_url: imageUrl,
                updated_at: new Date().toISOString()
            })
            .eq('task_id', task.id || task.task_id)
            .select();

        if (error) throw error;
        return { success: true, data: data[0] };
    } catch (err) {
        console.error('Error completing EA task:', err);
        return { success: false, error: err.message };
    }
};

// Extend EA task deadline
export const extendEATask = async (task, newPlannedDate, remarks = '') => {
    try {
        const { data, error } = await supabase
            .from('ea_tasks')
            .update({
                planned_date: newPlannedDate,
                status: 'pending',
                remarks: remarks,
                updated_at: new Date().toISOString()
            })
            .eq('task_id', task.id || task.task_id)
            .select();

        if (error) throw error;
        return { success: true, data: data[0] };
    } catch (err) {
        console.error('Error extending EA task:', err);
        return { success: false, error: err.message };
    }
};

// Delete EA task
export const deleteEATask = async (taskId) => {
    try {
        const { error } = await supabase
            .from('ea_tasks')
            .delete()
            .eq('task_id', taskId);

        if (error) throw error;
        return { success: true };
    } catch (err) {
        console.error('Error deleting EA task:', err);
        return { success: false, error: err.message };
    }
};

export const fetchPendingEAApprovals = async () => {
    try {
        const { data, error } = await supabase
            .from('ea_tasks')
            .select('*')
            .in('status', ['done', 'Done']) // 'done' status means waiting for admin approval
            .or('admin_done.is.null,admin_done.eq.false') // Only fetch tasks not yet approved
            .order('updated_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(task => ({ ...task, id: task.task_id, department: "EA" }));
    } catch (error) {
        console.error("Error fetching pending EA approvals:", error);
        return [];
    }
};

export const approveEATaskV2 = async (id) => {
    console.log("APPROVING EA TASK WITH ID:", id);
    try {
        const numericId = parseInt(id);
        if (isNaN(numericId)) {
            console.error("Invalid Task ID provided to approveEATaskV2:", id);
            throw new Error("Invalid Task ID: " + id);
        }

        const { data, error } = await supabase
            .from('ea_tasks')
            .update({
                admin_done: true, // Mark as admin approved
                updated_at: new Date().toISOString()
            })
            .eq('task_id', numericId)
            .select();

        if (error) {
            console.error("Supabase Error in approveEATaskV2:", error);
            throw error;
        }

        console.log("EA Task Approved successfully:", data);
        return data && data.length > 0 ? data[0] : null;
    } catch (error) {
        console.error("Error in approveEATaskV2 catch block:", error);
        throw error;
    }
};

export const rejectEATask = async (id, reason) => {
    try {
        const numericId = parseInt(id);
        const { data, error } = await supabase
            .from('ea_tasks')
            .update({
                admin_done: false,
                status: 'pending', // Revert to pending
                remarks: reason
            })
            .eq('task_id', numericId)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error("Error rejecting EA task:", error);
        throw error;
    }
};

export const fetchApprovedEA = async () => {
    try {
        const { data, error } = await supabase
            .from('ea_tasks')
            .select('*')
            .eq('admin_done', true)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(row => ({ ...row, id: row.task_id, department: "EA" }));
    } catch (error) {
        console.error("Error fetching approved EA tasks:", error);
        return [];
    }
};

