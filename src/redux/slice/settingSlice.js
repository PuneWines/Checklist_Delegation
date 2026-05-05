import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  createShopApi,
  createUserApi,
  deleteUserByIdApi,
  fetchShopDataApi,
  fetchUserDetailsApi,
  updateShopDataApi,
  updateUserDataApi,
  fetchShopsOnlyApi,
  fetchGivenByDataApi,
  fetchCustomDropdownsApi,
  createCustomDropdownApi,
  deleteCustomDropdownApi,
  createAssignFromApi,
  deleteShopApi,
  deleteAssignFromApi,
  updateCustomDropdownApi,
  updateAssignFromApi,
  createMachineEntriesApi,
  uploadProfileImageApi,
  fetchMasterTasksAllApi,
  createMasterTaskApi,
  updateMasterTaskApi,
  deleteMasterTaskApi,
  fetchLevelsAllApi,
  createLevelApi,
  updateLevelApi,
  deleteLevelApi
} from '../api/settingApi';


export const userDetails = createAsyncThunk(
  'fetch/user',
  async () => {
    const user = await fetchUserDetailsApi();
    return user;
  }
);

export const shopOnlyDetails = createAsyncThunk(
  'fetch/shops-only',
  async () => {
    const shops = await fetchShopsOnlyApi();
    return shops;
  }
);

export const givenByDetails = createAsyncThunk(
  'fetch/given-by',
  async () => {
    const givenBy = await fetchGivenByDataApi();
    return givenBy;
  }
);

export const shopDetails = createAsyncThunk(
  'fetch/shop',
  async () => {
    const shop = await fetchShopDataApi();
    return shop;
  }
);

export const createUser = createAsyncThunk(
  'post/users',
  async (newUser) => {
    const user = await createUserApi(newUser);
    return user;
  }
);

export const updateUser = createAsyncThunk('update/users', async ({ id, updatedUser }) => {
  const user = await updateUserDataApi({ id, updatedUser });
  return user;
});

export const createShop = createAsyncThunk(
  'post/shop',
  async (newShop) => {
    const shop = await createShopApi(newShop);
    return shop;
  }
);

export const updateShop = createAsyncThunk('update/shop', async ({ id, updatedShop }) => {
  const shop = await updateShopDataApi({ id, updatedShop });
  return shop;
});

export const deleteUser = createAsyncThunk(
  'delete/user',
  async (id) => {
    const deletedId = await deleteUserByIdApi(id);
    return deletedId;
  }
);

export const customDropdownDetails = createAsyncThunk(
  'fetch/custom-dropdowns',
  async () => {
    const dropdowns = await fetchCustomDropdownsApi();
    return dropdowns;
  }
);

export const createCustomDropdown = createAsyncThunk(
  'post/custom-dropdown',
  async (item) => {
    const dropdown = await createCustomDropdownApi(item);
    return dropdown;
  }
);

export const deleteCustomDropdown = createAsyncThunk(
  'delete/custom-dropdown',
  async (id) => {
    const deletedId = await deleteCustomDropdownApi(id);
    return deletedId;
  }
);

export const createAssignFrom = createAsyncThunk(
  'post/assign-from',
  async (name) => {
    const data = await createAssignFromApi(name);
    return data;
  }
);

export const deleteShop = createAsyncThunk(
  'delete/shop',
  async (id) => {
    const deletedId = await deleteShopApi(id);
    return deletedId;
  }
);

export const updateAssignFrom = createAsyncThunk(
  'update/assign-from',
  async ({ id, given_by }) => {
    const data = await updateAssignFromApi({ id, given_by });
    return data;
  }
);

export const deleteAssignFrom = createAsyncThunk(
  'delete/assign-from',
  async (id) => {
    const deletedId = await deleteAssignFromApi(id);
    return deletedId;
  }
);

export const updateCustomDropdown = createAsyncThunk(
  'update/custom-dropdown',
  async ({ id, category, value, image_url }) => {
    const data = await updateCustomDropdownApi({ id, category, value, image_url });
    return data;
  }
);

export const createMachineEntries = createAsyncThunk(
  'post/machine-entries',
  async (entries) => {
    const data = await createMachineEntriesApi(entries);
    return data;
  }
);

export const uploadProfileImage = createAsyncThunk(
  'upload/profile-image',
  async ({ file, userId }) => {
    const publicUrl = await uploadProfileImageApi(file, userId);
    return publicUrl;
  }
);

export const fetchMasterTasksAll = createAsyncThunk('fetch/master-tasks-all', async () => {
  return await fetchMasterTasksAllApi();
});

export const createMasterTask = createAsyncThunk('post/master-task', async (task) => {
  return await createMasterTaskApi(task);
});

export const updateMasterTask = createAsyncThunk('update/master-task', async ({ id, updates }) => {
  return await updateMasterTaskApi({ id, updates });
});

export const deleteMasterTask = createAsyncThunk('delete/master-task', async (id) => {
  return await deleteMasterTaskApi(id);
});

export const fetchLevelsAll = createAsyncThunk('fetch/levels-all', async () => {
  return await fetchLevelsAllApi();
});

export const createLevel = createAsyncThunk('post/level', async (level) => {
  return await createLevelApi(level);
});

export const updateLevel = createAsyncThunk('update/level', async ({ id, updates }) => {
  return await updateLevelApi({ id, updates });
});

export const deleteLevel = createAsyncThunk('delete/level', async (id) => {
  return await deleteLevelApi(id);
});

const settingsSlice = createSlice({
  name: 'settings',
  initialState: {
    userData: [],
    shops: [],
    shopsOnly: [],
    givenBy: [],
    customDropdowns: [],
    masterTasks: [],
    levels: [],
    error: null,
    loading: false,
    isLoggedIn: false,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(userDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(userDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.userData = action.payload || [];
      })
      .addCase(userDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(shopDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(shopDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.shops = action.payload;
      })
      .addCase(shopDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(createUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createUser.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          state.userData.push(action.payload);
        }
      })
      .addCase(shopOnlyDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(shopOnlyDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.shopsOnly = action.payload;
      })
      .addCase(shopOnlyDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(givenByDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(givenByDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.givenBy = action.payload;
      })
      .addCase(givenByDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateAssignFrom.fulfilled, (state, action) => {
        state.loading = false;
        state.givenBy = state.givenBy.map((item) =>
          item.id === action.payload.id ? { id: action.payload.id, given_by: action.payload.name } : item
        );
      })
      .addCase(deleteAssignFrom.fulfilled, (state, action) => {
        state.loading = false;
        state.givenBy = state.givenBy.filter((item) => item.id !== action.payload);
      })
      .addCase(createUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload && action.payload.id) {
          state.userData = state.userData.map((user) =>
            user && user.id === action.payload.id ? action.payload : user
          );
        }
      })
      .addCase(updateUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(createShop.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createShop.fulfilled, (state, action) => {
        state.loading = false;
        state.shops.push({
          id: action.payload.id,
          shop: action.payload.shop_name,
          given_by: action.payload.given_by || ""
        });
      })
      .addCase(createShop.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateShop.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateShop.fulfilled, (state, action) => {
        state.loading = false;
        state.shops = state.shops.map((shop) =>
          shop.id === action.payload.id ? {
            id: action.payload.id,
            shop: action.payload.shop_name,
            given_by: action.payload.given_by || ""
          } : shop
        );
      })
      .addCase(updateShop.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(deleteUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteUser.fulfilled, (state, action) => {
        state.loading = false;
        state.userData = state.userData.filter((user) => user.id !== action.payload);
      })
      .addCase(deleteUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(customDropdownDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(customDropdownDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.customDropdowns = action.payload;
      })
      .addCase(customDropdownDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(createCustomDropdown.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createCustomDropdown.fulfilled, (state, action) => {
        state.loading = false;
        state.customDropdowns.push(action.payload);
      })
      .addCase(createCustomDropdown.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(deleteCustomDropdown.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteCustomDropdown.fulfilled, (state, action) => {
        state.loading = false;
        state.customDropdowns = state.customDropdowns.filter((item) => item.id !== action.payload);
      })
      .addCase(deleteCustomDropdown.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(createAssignFrom.pending, (state) => {
        state.loading = true;
      })
      .addCase(createAssignFrom.fulfilled, (state, action) => {
        state.loading = false;
        state.givenBy.push({ id: action.payload.id, given_by: action.payload.name });
      })
      .addCase(createAssignFrom.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(deleteShop.pending, (state) => {
        state.loading = true;
      })
      .addCase(deleteShop.fulfilled, (state, action) => {
        state.loading = false;
        state.shops = state.shops.filter((shop) => shop.id !== action.payload);
      })
      .addCase(deleteShop.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateCustomDropdown.pending, (state) => {
        state.loading = true;
      })
      .addCase(updateCustomDropdown.fulfilled, (state, action) => {
        state.loading = false;
        state.customDropdowns = state.customDropdowns.map((item) =>
          item.id === action.payload.id ? action.payload : item
        );
      })
      .addCase(updateCustomDropdown.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(createMachineEntries.pending, (state) => {
        state.loading = true;
      })
      .addCase(createMachineEntries.fulfilled, (state, action) => {
        state.loading = false;
        state.customDropdowns.push(...action.payload);
      })
      .addCase(createMachineEntries.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Master Tasks
      .addCase(fetchMasterTasksAll.fulfilled, (state, action) => {
        state.masterTasks = action.payload;
      })
      .addCase(createMasterTask.fulfilled, (state, action) => {
        state.masterTasks.push(action.payload);
      })
      .addCase(updateMasterTask.fulfilled, (state, action) => {
        state.masterTasks = state.masterTasks.map(t => t.id === action.payload.id ? action.payload : t);
      })
      .addCase(deleteMasterTask.fulfilled, (state, action) => {
        state.masterTasks = state.masterTasks.filter(t => t.id !== action.payload);
      })
      // Levels
      .addCase(fetchLevelsAll.fulfilled, (state, action) => {
        state.levels = action.payload;
      })
      .addCase(createLevel.fulfilled, (state, action) => {
        state.levels.push(action.payload);
      })
      .addCase(updateLevel.fulfilled, (state, action) => {
        state.levels = state.levels.map(l => l.id === action.payload.id ? action.payload : l);
      })
      .addCase(deleteLevel.fulfilled, (state, action) => {
        state.levels = state.levels.filter(l => l.id !== action.payload);
      });

  },
});

export default settingsSlice.reducer;
