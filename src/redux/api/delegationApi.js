// delegationApiSlice.js
import { createAsyncThunk } from '@reduxjs/toolkit';
import supabase from '../../SupabaseClient';

export const insertDelegationDoneAndUpdate = createAsyncThunk(
  'delegation/insertDelegationDoneAndUpdate',
  async ({ selectedDataArray, uploadedImages }, { rejectWithValue }) => {
    try {
      console.log('Processing submission:', { selectedDataArray, uploadedImages });

      const results = [];

      for (const taskData of selectedDataArray) {
        try {
          // Step 1: Insert into delegation_done table
          const delegationDoneData = {
            task_id: taskData.id || taskData.task_id,
            status: taskData.status, // Should be 'done' or 'extend'
            next_extend_date: taskData.next_extend_date || null,
            reason: taskData.reason || '',
            name: taskData.name,
            task_description: taskData.task_description,
            given_by: taskData.given_by,
            image_url: taskData.image_url, // Will be updated after image upload
          };

          console.log('Inserting into delegation_done:', delegationDoneData);

          const { data: doneDataList, error: doneError } = await supabase
            .from('delegation_done')
            .insert([delegationDoneData])
            .select();

          if (doneError) {
            console.error('Error inserting delegation_done:', {
              message: doneError.message,
              details: doneError.details,
              hint: doneError.hint,
              code: doneError.code
            });
            throw doneError;
          }

          const doneData = doneDataList && doneDataList.length > 0 ? doneDataList[0] : null;
          console.log('Successfully inserted delegation_done:', doneData);

          // Step 2: Handle image upload if exists
          let imageUrl = taskData.image_url;
          const taskImage = uploadedImages[taskData.id];

          if (taskImage) {
            try {
              console.log('Uploading image for task:', taskData.id);

              // Create a unique filename
              const timestamp = Date.now();
              const fileName = `delegation_${taskData.id}_${timestamp}_${taskImage.name}`;

              // Upload to Supabase storage
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('delegation') // Make sure this bucket exists
                .upload(fileName, taskImage);

              if (uploadError) {
                console.error('Image upload error:', uploadError);
                // Continue without image if upload fails
              } else {
                // Get public URL
                const { data: { publicUrl } } = supabase.storage
                  .from('delegation')
                  .getPublicUrl(fileName);

                imageUrl = publicUrl;

                if (doneData) {
                  // Update delegation_done with image URL
                  const { error: updateImageError } = await supabase
                    .from('delegation_done')
                    .update({ image_url: imageUrl })
                    .eq('id', doneData.id);

                  if (updateImageError) {
                    console.error('Error updating image URL:', updateImageError);
                  }
                }

                console.log('Image uploaded successfully:', imageUrl);
              }
            } catch (imageError) {
              console.error('Image processing error:', imageError);
              // Continue without failing the entire submission
            }
          }

          // Step 3: Update delegation table based on status
          let delegationUpdate = {
            updated_at: new Date().toISOString(),
            submission_date: new Date().toISOString(),
            image: imageUrl,
            remarks: taskData.reason
          };

          if (taskData.status === 'done') {
            // Mark as completed
            delegationUpdate.status = 'done';
          } else if (taskData.status === 'extend') {
            // Update planned_date for extension
            if (taskData.next_extend_date) {
              delegationUpdate.planned_date = new Date(taskData.next_extend_date).toISOString();
              delegationUpdate.status = 'extend';
            }
          }

          console.log('Updating delegation table:', delegationUpdate);

          const { data: updateData, error: updateError } = await supabase
            .from('delegation')
            .update(delegationUpdate)
            .eq('task_id', taskData.id || taskData.task_id)
            .select()
            .single();

          if (updateError) {
            console.error('Error updating delegation:', updateError);
            throw updateError;
          }

          console.log('Successfully updated delegation:', updateData);

          results.push({
            id: taskData.id,
            status: 'success',
            delegation_done: doneData,
            delegation_updated: updateData,
            image_url: imageUrl
          });

        } catch (taskError) {
          console.error(`Error processing task ${taskData.id}:`, taskError);
          results.push({
            id: taskData.id,
            status: 'error',
            error: taskError.message
          });
        }
      }

      console.log('All submissions processed:', results);

      // Check if any submissions failed
      const failedTasks = results.filter(r => r.status === 'error');
      if (failedTasks.length > 0) {
        console.warn('Some tasks failed:', JSON.stringify(failedTasks, null, 2));
      }

      return results;

    } catch (error) {
      console.error('Batch submission error:', error);
      return rejectWithValue(error.message);
    }
  }
);

// export const fetchDelegationDataSortByDate = async () => {

//   const role = localStorage.getItem("role");
//   const username = localStorage.getItem("user-name");
//   try {
//     let query = supabase
//       .from('delegation')
//       .select('*')
//       .order('task_start_date', { ascending: true })
//       .or('status.is.null,status.eq.extend');

//     // Apply role-based filter
//     if (role === 'user' && username) {
//       query = query.eq('name', username);
//     }

//     const { data, error } = await query;

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

// export const fetchDelegation_DoneDataSortByDate = async () => {
//   const role = localStorage.getItem("role");
//   const username = localStorage.getItem("user-name");
//   try {
//     let query = supabase
//       .from('delegation_done')
//       .select('*')
//       .order('created_at', { ascending: false });

//     // Filter by user if role is 'user'
//     if (role === 'user' && username) {
//       query = query.eq('name', username);
//     }

//     const { data, error } = await query;

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



export const fetchDelegationDataSortByDate = async () => {
  const role = localStorage.getItem("role");
  const username = localStorage.getItem("user-name");
  const userAccess = localStorage.getItem("user_access"); // Add this line

  try {
    let query = supabase
      .from('delegation')
      .select('*')
      .order('task_start_date', { ascending: true })
      .or('status.is.null,status.eq.extend');

    // Apply role-based filter
    if (role === 'user' && username) {
      query = query.eq('name', username);
    } else if (role === 'admin' && userAccess && userAccess !== 'all') {
      // Filter by departments in user_access for admin
      const allowedDepartments = userAccess.split(',').map(dept => dept.trim()).filter(d => d && d !== 'all');
      if (allowedDepartments.length > 0) {
        query = query.in('department', allowedDepartments);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.log("Error when fetching data", error);
      return [];
    }

    console.log("Fetched successfully", data);
    return (data || []).map(row => ({ ...row, id: row.task_id }));

  } catch (error) {
    console.log("Error from Supabase", error);
    return [];
  }
};

export const fetchDelegation_DoneDataSortByDate = async () => {
  const role = localStorage.getItem("role");
  const username = localStorage.getItem("user-name");
  const userAccess = localStorage.getItem("user_access"); // Add this line

  try {
    let query = supabase
      .from('delegation_done')
      .select('*')
      .order('created_at', { ascending: false });

    // Filter by user if role is 'user'
    if (role === 'user' && username) {
      query = query.eq('name', username);
    } else if (role === 'admin' && userAccess && userAccess !== 'all') {
      // Filter by departments in user_access for admin
      const allowedDepartments = userAccess.split(',').map(dept => dept.trim()).filter(d => d && d !== 'all');
      if (allowedDepartments.length > 0) {
        query = query.in('department', allowedDepartments);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.log("Error when fetching data", error);
      return [];
    }

    console.log("Fetched successfully", data);
    return (data || []).map(row => ({ ...row, id: row.task_id }));

  } catch (error) {
    console.log("Error from Supabase", error);
    return [];
  }
};