import supabase from "../../SupabaseClient";

export const fetchUniqueDepartmentDataApi = async () => {
  try {
    console.log("🔍 Fetching unique departments from users table (role=user)...");

    // Fetch all user_access values for users with role='user'
    const { data, error } = await supabase
      .from("users")
      .select("user_access")
      .eq("role", "user")
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
    console.log("🔍 Fetching doer names for department:", department);

    let query = supabase
      .from("users")
      .select("user_name, role, user_access, status")
      .eq("status", "active")
      .eq("role", "user")
      .order("user_name", { ascending: true });

    if (department) {
      query = query.or(`user_access.ilike.%${department}%,role.eq.admin`);
    } else {
      query = query.eq("role", "admin"); // Fallback if no department
    }

    const { data, error } = await query;

    console.log("📊 Raw user data:", data);
    console.log("❌ Error:", error);

    if (error) {
      console.error("Error when fetching data", error);
      return [];
    }

    const uniqueDoerName = [...new Set(data?.map((d) => d.user_name))];

    console.log("✅ Unique doer names:", uniqueDoerName);
    console.log("📈 Total doers found:", uniqueDoerName.length);

    return uniqueDoerName;
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


