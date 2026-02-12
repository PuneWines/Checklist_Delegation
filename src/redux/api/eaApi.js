import supabase from '../../SupabaseClient';

// Fetch all EA tasks (pending)
export const fetchEATasks = async () => {
    try {
        const { data, error } = await supabase
            .from('ea_tasks')
            .select('*')
            .eq('status', 'pending')
            .order('planned_date', { ascending: true });

        if (error) throw error;
        return (data || []).map(row => ({ ...row, id: row.task_id }));
    } catch (err) {
        console.error('Error fetching EA tasks:', err);
        return [];
    }
};

// Fetch EA task history (completed/extended)
export const fetchEATasksHistory = async () => {
    try {
        const { data, error } = await supabase
            .from('ea_tasks_done')
            .select('*')
            .order('submission_date', { ascending: false });

        if (error) throw error;
        return (data || []).map(row => ({ ...row, id: row.task_id }));
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

// Complete EA task (move to history)
export const completeEATask = async (task, remarks = '', imageUrl = '') => {
    try {
        // Insert into ea_tasks_done
        const { data: doneData, error: doneError } = await supabase
            .from('ea_tasks_done')
            .insert([{
                task_id: task.id,
                doer_name: task.doer_name,
                phone_number: task.phone_number,
                planned_date: task.planned_date,
                task_description: task.task_description,
                status: 'done',
                remarks: remarks,
                image_url: imageUrl,
                given_by: task.given_by
            }])
            .select();

        if (doneError) throw doneError;

        // Update original task status
        const { error: updateError } = await supabase
            .from('ea_tasks')
            .update({ status: 'done' })
            .eq('task_id', task.id || task.task_id);

        if (updateError) throw updateError;

        return { success: true, data: doneData[0] };
    } catch (err) {
        console.error('Error completing EA task:', err);
        return { success: false, error: err.message };
    }
};

// Extend EA task deadline
export const extendEATask = async (task, newPlannedDate, remarks = '') => {
    try {
        // Insert into ea_tasks_done for history
        const { data: doneData, error: doneError } = await supabase
            .from('ea_tasks_done')
            .insert([{
                task_id: task.id,
                doer_name: task.doer_name,
                phone_number: task.phone_number,
                planned_date: task.planned_date,
                task_description: task.task_description,
                status: 'extend',
                remarks: remarks,
                given_by: task.given_by
            }])
            .select();

        if (doneError) throw doneError;

        // Update task with new planned date
        const { error: updateError } = await supabase
            .from('ea_tasks')
            .update({
                planned_date: newPlannedDate,
                status: 'pending',
                updated_at: new Date().toISOString()
            })
            .eq('task_id', task.id || task.task_id);

        if (updateError) throw updateError;

        return { success: true, data: doneData[0] };
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
