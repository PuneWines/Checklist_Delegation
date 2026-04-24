import supabase from "../../SupabaseClient";

const CATEGORY_TO_COLUMN = {
  "Machine Name": "machine_name",
  "Machine Area": "machine_area",
  "Part Name": "part_name",
  "Priority": "priority",
  "Task Priority": "task_priority",
  "Project Type": "project_type",
  "Task Status": "task_status",
  "Sound Test": "sound_test",
  "Temperature": "temperature"
};

export const fetchUserDetailsApi = async () => {
  try {
    const { count, error: countError } = await supabase
      .from("users")
      .select('*', { count: 'exact', head: true });

    console.log("📊 Total rows in users table:", count, "Error:", countError);

    const { data, error } = await supabase
      .from("users")
      .select('*');

    if (error) {
      console.error("❌ Error fetching user details:", error);
      return [];
    }

    console.log("✅ Fetched users successfully:", data?.length, "rows");
    return data || [];
  } catch (error) {
    console.log("Error from Supabase", error);
    return [];
  }
};


// export const fetchUserDetailsApi = async () => {
//   try {
//     const { data, error } = await supabase
//       .from("users")
//       .select('*, user_access, leave_date, leave_end_date, remark') // Add leave_end_date
//       .not("user_name", "is", null)
//       .neq("user_name", "");

//     if (error) {
//       console.log("Error when fetching data", error);
//       return [];
//     }

//     console.log("Fetched successfully", data);
//     return data;
//   } catch (error) {
//     console.log("Error from Supabase", error);
//     return [];
//   }
// };

export const fetchShopDataApi = async () => {
  try {
    const { data, error } = await supabase
      .from('shop')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.log("error when fetching shops", error);
      return [];
    }

    // Format to match old expectations if necessary, 
    // though name is better than shop field name now
    const formatted = data.map(d => ({
      id: d.id,
      shop: d.name,
      given_by: d.given_by || ""
    }));

    console.log("fetch successfully", formatted);
    return formatted;
  } catch (error) {
    console.log("error from supabase", error);
    return [];
  }
};
export const createUserApi = async (newUser) => {
  try {
    // Step 1: Get the current highest ID
    const { data: maxIdData, error: maxIdError } = await supabase
      .from("users")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);

    if (maxIdError) {
      console.error("Error fetching last ID:", maxIdError);
      return;
    }

    // Step 2: Insert user
    // Sanitizing 'number' (bigint) - empty string must be null
    const phoneNumber = newUser.phone && newUser.phone.toString().trim() !== ""
      ? parseInt(newUser.phone.toString().replace(/\D/g, ''))
      : null;

    const insertData = {
      user_name: newUser.username,
      password: newUser.password,
      email_id: newUser.email,
      number: phoneNumber,
      employee_id: newUser.employee_id,
      role: newUser.role,
      status: newUser.status || 'active',
      user_access: newUser.user_access,
      shop_name: newUser.shop,
      profile_image: newUser.profile_image || null,
      leave_date: newUser.leave_date || null,
      leave_end_date: newUser.leave_end_date || null,
      remark: newUser.remark || null,
      reported_by: newUser.reported_by || null,
      can_self_assign: newUser.can_self_assign || false
    };

    // Add designation if provided
    if (newUser.Designation) {
      insertData.Designation = newUser.Designation;
    }

    let { data, error } = await supabase
      .from("users")
      .insert([insertData])
      .select()
      .maybeSingle();

    // Fallback if Designation column doesn't exist
    if (error && (error.code === 'PGRST204' || error.message?.includes('Designation') || error.code === '42703')) {
      console.warn("⚠️ Column 'Designation' likely missing, retrying without it:", error.message);
      const { Designation, ...fallbackData } = insertData;
      const retry = await supabase.from("users").insert([fallbackData]).select().maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.log("Error when posting data:", error);
    } else {
      console.log("Posted successfully", data);
    }

    return data;
  } catch (error) {
    console.log("Error from Supabase:", error);
  }
};

export const updateUserDataApi = async ({ id, updatedUser }) => {
  try {
    // Build the update payload - NEVER include undefined values (causes Supabase 400)
    // Sanitizing 'number' (bigint) - empty string must be null
    const phoneNumber = updatedUser.number && updatedUser.number.toString().trim() !== ""
      ? parseInt(updatedUser.number.toString().replace(/\D/g, ''))
      : null;

    const updateData = {
      user_name: updatedUser.user_name,
      email_id: updatedUser.email_id,
      number: phoneNumber,
      employee_id: updatedUser.employee_id,
      role: updatedUser.role,
      status: updatedUser.status,
      user_access: updatedUser.user_access,
      shop_name: updatedUser.shop_name || updatedUser.shop || null,
      profile_image: updatedUser.profile_image,
      reported_by: updatedUser.reported_by || null,
      can_self_assign: updatedUser.can_self_assign ?? false
    };

    // Only include Designation if explicitly set
    if ('Designation' in updatedUser && updatedUser.Designation !== undefined) {
      updateData.Designation = updatedUser.Designation || null;
    }

    // Only update password if a new one is provided
    if (updatedUser.password && updatedUser.password.trim() !== "") {
      updateData.password = updatedUser.password;
    }

    // Add optional fields
    const optionalFields = ['leave_date', 'leave_end_date', 'remark'];
    optionalFields.forEach(field => {
      if (updatedUser[field] !== undefined) {
        updateData[field] = updatedUser[field];
      }
    });

    console.log("🚀 Attempting to update user ID:", id, "with data:", updateData);

    let { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", id)
      .select()
      .maybeSingle();

    // If 400 error (column not found or invalid column reference)
    // PGRST204: column not found in select
    // 42703: column does not exist in update
    if (error && (error.code === 'PGRST204' || error.code === '42703' || error.message?.toLowerCase().includes('Designation'.toLowerCase()))) {
      console.warn("⚠️ Designation update failed, retrying without Designation field. Error:", error.message);
      const { Designation, ...fallbackData } = updateData;
      const retry = await supabase.from("users").update(fallbackData).eq("id", id).select().maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error("❌ Final update error:", error);
      throw error;
    }

    console.log("✅ Update successful:", data);
    return data;
  } catch (error) {
    console.error("❌ Exception in updateUserDataApi:", error);
    throw error;
  }
};


export const createShopApi = async (newShop) => {
  try {
    const { data, error } = await supabase
      .from("shop")
      .insert([{
        name: newShop.shop,
        given_by: newShop.given_by
      }])
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.log("Error creating shop:", error);
    throw error;
  }
};

export const updateShopDataApi = async ({ id, updatedShop }) => {
  try {
    const { data, error } = await supabase
      .from("shop")
      .update({
        name: updatedShop.shop,
        given_by: updatedShop.given_by
      })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.log("Error updating shop:", error);
    throw error;
  }
};


export const deleteShopApi = async (id) => {
  try {
    const { error } = await supabase
      .from("shop")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return id;
  } catch (error) {
    console.log("Error deleting shop:", error);
    throw error;
  }
};

export const deleteAssignFromApi = async (id) => {
  try {
    const { error } = await supabase
      .from("assign_from")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return id;
  } catch (error) {
    console.log("Error deleting assign_from:", error);
    throw error;
  }
};

export const updateCustomDropdownApi = async ({ id, category, value, image_url = undefined }) => {
  try {
    const column = CATEGORY_TO_COLUMN[category];
    if (!column) throw new Error(`Invalid category: ${category}`);

    const updatePayload = { [column]: value };
    if (image_url !== undefined) {
      updatePayload.image_url = image_url;
    }

    const { data, error } = await supabase
      .from("dropdown_options")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return {
      id: data.id,
      category: category,
      value: data[column],
      image_url: data.image_url || null
    };
  } catch (error) {
    console.log("Error updating custom dropdown:", error);
    throw error;
  }
};

export const deleteUserByIdApi = async (id) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (error) {
      console.log("Error deleting user:", error);
      throw error;
    }

    console.log("User deleted successfully:", data);
    return data;
  } catch (error) {
    console.log("Error from Supabase:", error);
    throw error;
  }
};



// In your settingApi.js file, add these functions:

// Fetch only unique shops
export const fetchShopsOnlyApi = async () => {
  try {
    const { data, error } = await supabase
      .from('shop')
      .select('name')
      .order('name', { ascending: true });

    if (error) throw error;
    return data.map(d => ({ shop: d.name }));
  } catch (error) {
    console.log("error fetching shops", error);
    return [];
  }
};

// Fetch only given_by data
export const fetchGivenByDataApi = async () => {
  try {
    const { data, error } = await supabase
      .from('assign_from')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) throw error;
    return data.map(d => {
      let name = d.name;
      if (typeof name === 'string' && name.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(name);
          name = parsed.given_by || parsed.name || name;
        } catch (e) { }
      }
      return { id: d.id, given_by: name };
    });
  } catch (error) {
    console.log("error fetching assign_from data", error);
    return [];
  }
};

export const createAssignFromApi = async (input) => {
  try {
    // Handle both string and object input { given_by: 'name' }
    const name = typeof input === 'string' ? input : (input?.given_by || input?.name);

    if (!name) throw new Error("Name is required");

    const { data, error } = await supabase
      .from("assign_from")
      .insert([{ name }])
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (error) {
    console.log("error creating assign_from", error);
    throw error;
  }
};

export const updateAssignFromApi = async ({ id, given_by }) => {
  try {
    const { data, error } = await supabase
      .from("assign_from")
      .update({ name: given_by })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (error) {
    console.log("error updating assign_from", error);
    throw error;
  }
};

export const fetchCustomDropdownsApi = async () => {
  try {
    const { data, error } = await supabase
      .from('dropdown_options')
      .select('*');

    if (error) throw error;

    const formatted = [];
    data.forEach(item => {
      Object.keys(CATEGORY_TO_COLUMN).forEach(category => {
        const column = CATEGORY_TO_COLUMN[category];
        if (item[column] !== null && item[column] !== undefined && item[column] !== "") {
          formatted.push({
            id: item.id,
            category: category,
            value: item[column],
            image_url: item.image_url || null,
            // Include machine_name for Part Name entries to enable cascading
            ...(category === "Part Name" && item.machine_name && { parent: item.machine_name })
          });
        }
      });
    });

    return formatted;
  } catch (error) {
    console.error("❌ Error fetching custom dropdowns:", error);
    return [];
  }
};

export const createCustomDropdownApi = async (item) => {
  try {
    const column = CATEGORY_TO_COLUMN[item.category];
    if (!column) throw new Error(`Invalid category: ${item.category}`);

    const { data, error } = await supabase
      .from('dropdown_options')
      .insert([{
        [column]: item.value
      }])
      .select()
      .maybeSingle();

    if (error) throw error;
    return {
      id: data.id,
      category: item.category,
      value: data[column]
    };
  } catch (error) {
    console.log("error creating custom dropdown", error);
    throw error;
  }
};

export const uploadProfileImageApi = async (file, userId) => {
  try {
    // Sanitize userId to remove any special characters or spaces
    const cleanUserId = userId.toString().replace(/[^a-zA-Z0-9]/g, '_');
    const fileExt = file.name.split('.').pop();
    const fileName = `${cleanUserId}_${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`; // Upload directly to bucket root for simplicity

    console.log("🚀 Uploading to Supabase Storage:", filePath);

    const { error: uploadError } = await supabase.storage
      .from('profiles')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      console.error("❌ Supabase Storage Upload Error:", uploadError);
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('profiles')
      .getPublicUrl(filePath);

    console.log("✅ Profile Image Public URL:", publicUrl);
    return publicUrl;
  } catch (error) {
    console.error("❌ Error uploading profile image:", error);
    throw error;
  }
};

export const uploadPartImageApi = async (file) => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `part_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('parts')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('parts')
      .getPublicUrl(fileName);

    console.log('✅ Part image uploaded:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('❌ Error uploading part image:', error);
    throw error;
  }
};

// End of file

export const deleteCustomDropdownApi = async (id) => {
  try {
    const { error } = await supabase.from('dropdown_options').delete().eq('id', id);
    if (error) throw error;
    return id;
  } catch (error) {
    console.log("error deleting custom dropdown", error);
    throw error;
  }
};

export const createMachineEntriesApi = async (entries) => {
  try {
    const { data, error } = await supabase
      .from('dropdown_options')
      .insert(entries)
      .select();

    if (error) throw error;

    const formatted = [];
    data.forEach(item => {
      Object.keys(CATEGORY_TO_COLUMN).forEach(category => {
        const column = CATEGORY_TO_COLUMN[category];
        if (item[column] !== null && item[column] !== undefined && item[column] !== "") {
          formatted.push({
            id: item.id,
            category: category,
            value: item[column],
            image_url: item.image_url || null
          });
        }
      });
    });

    return formatted;
  } catch (error) {
    console.error("Error creating machine entries:", error);
    throw error;
  }
};

// Master Task Management
export const fetchMasterTasksAllApi = async () => {
  const { data, error } = await supabase.from('master_tasks').select('*');
  if (error) throw error;
  return data;
};

export const createMasterTaskApi = async (task) => {
  const { data, error } = await supabase.from('master_tasks').insert(task).select().single();
  if (error) throw error;
  return data;
};

export const updateMasterTaskApi = async ({ id, updates }) => {
  const { data, error } = await supabase.from('master_tasks').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteMasterTaskApi = async (id) => {
  const { error } = await supabase.from('master_tasks').delete().eq('id', id);
  if (error) throw error;
  return id;
};

// Levels Management
export const fetchLevelsAllApi = async () => {
  const { data, error } = await supabase.from('levels').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data;
};

export const createLevelApi = async (level) => {
  const { data, error } = await supabase.from('levels').insert(level).select().single();
  if (error) throw error;
  return data;
};

export const updateLevelApi = async ({ id, updates }) => {
  const { data, error } = await supabase.from('levels').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteLevelApi = async (id) => {
  const { error } = await supabase.from('levels').delete().eq('id', id);
  if (error) throw error;
  return id;
};
