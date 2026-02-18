import supabase from "../../SupabaseClient";

export const fetchUniqueDepartmentDataApi = async () => {
  try {
    console.log("🔍 Fetching unique departments from users table...");

    // Fetch all user_access values for active users
    const { data, error } = await supabase
      .from("users")
      .select("user_access")
      .eq("status", "active")
      .not("user_access", "is", null);

    if (error) throw error;

    // Filter out nulls/empties and get unique values
    const uniqueDepartments = [...new Set(data
      .map(item => item.user_access)
      .filter(dept => dept && dept.trim() !== "")
    )].sort();

    console.log("✅ Unique departments found:", uniqueDepartments);
    return uniqueDepartments;
  } catch (error) {
    console.error("❌ Error fetching departments from users table:", error);
    return [];
  }
};




export const fetchUniqueGivenByDataApi = async () => {
  try {
    const { data, error } = await supabase
      .from('assign_from')
      .select('name')
      .order('name', { ascending: true });

    if (error) throw error;
    return data.map(d => d.name);
  } catch (error) {
    console.log("error from supabase", error);
    return [];
  }
};

export const fetchUniqueDoerNameDataApi = async (department) => {
  try {
    console.log("🔍 Fetching doer data for department:", department);

    let query = supabase
      .from("users")
      .select("user_name, user_access, status, leave_date, leave_end_date")
      .order("user_name", { ascending: true });

    if (department) {
      // Fetch users where user_access matches or contains the department
      query = query.ilike("user_access", `%${department}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error when fetching user data", error);
      return [];
    }

    // Filter unique by user_name just in case there are duplicates
    const uniqueUsers = [];
    const seenNames = new Set();

    data?.forEach(user => {
      if (user.user_name && !seenNames.has(user.user_name)) {
        uniqueUsers.push({
          user_name: user.user_name,
          status: user.status,
          leave_date: user.leave_date,
          leave_end_date: user.leave_end_date
        });
        seenNames.add(user.user_name);
      }
    });

    return uniqueUsers;
  } catch (error) {
    console.error("❌ Error from Supabase:", error);
    return [];
  }
};



export const pushAssignTaskApi = async (generatedTasks, targetTable = null) => {
  // Determine which table to use. Use targetTable if provided, 
  // otherwise fallback to frequency-based logic.
  let submitTable = targetTable;

  if (!submitTable) {
    const firstTaskFrequency = generatedTasks[0]?.frequency?.toLowerCase() || "";
    const isOneTime = firstTaskFrequency === "one-time" ||
      firstTaskFrequency.includes("one time") ||
      firstTaskFrequency.includes("no recurrence");
    submitTable = isOneTime ? "delegation" : "checklist";
  }

  console.log("Submitting to table:", submitTable, "Frequency:", generatedTasks[0]?.frequency);

  const tasksData = generatedTasks.map((task) => ({
    department: task.department,
    given_by: task.givenBy,
    name: task.doer,
    task_description: task.description,
    task_start_date: task.dueDate,
    frequency: task.frequency,
    duration: task.duration || null,
    enable_reminder: task.enableReminders ? "yes" : "no",
    require_attachment: task.requireAttachment ? "yes" : "no",
    status: submitTable === 'checklist' ? null : (task.status || 'pending')
  }));

  try {
    const { data, error } = await supabase
      .from(submitTable)
      .insert(tasksData)
      .select(); // Added select() to return inserted data

    if (error) {
      console.error("Error when posting data:", error);
      throw error;
    }

    console.log("Posted successfully to", submitTable, ":", data);
    return data;
  } catch (error) {
    console.error("Error from supabase:", error);
    throw error;
  }
}


