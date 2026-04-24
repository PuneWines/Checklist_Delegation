// loginSlice.js
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { fetchUniqueShopDataApi, fetchUniqueDoerNameDataApi, fetchUniqueGivenByDataApi, pushAssignTaskApi, fetchMasterTasksApi, fetchLevelsApi } from '../api/assignTaskApi';

export const uniqueShopData = createAsyncThunk('fetch/shop', async () => {
  const shop = await fetchUniqueShopDataApi();
  return shop;
});
export const uniqueGivenByData = createAsyncThunk('fetch/given_by', async () => {
  const givenBy = await fetchUniqueGivenByDataApi();

  return givenBy;
}
);
export const uniqueDoerNameData = createAsyncThunk('fetch/doerName', async (shop) => {
  const doerName = await fetchUniqueDoerNameDataApi(shop);

  return doerName;
}
);

export const assignTaskInTable = createAsyncThunk('post/delegation', async ({ tasks, table }, { rejectWithValue }) => {
  try {
    const assignTask = await pushAssignTaskApi(tasks, table);
    return assignTask;
  } catch (error) {
    return rejectWithValue(error.message);
  }
});


export const fetchMasterTasks = createAsyncThunk('fetch/masterTasks', async ({ shop, level }) => {
  const tasks = await fetchMasterTasksApi(shop, level);
  return tasks;
});

export const fetchLevels = createAsyncThunk('fetch/levels', async () => {
  const levels = await fetchLevelsApi();
  return levels;
});

const assignTaskSlice = createSlice({
  name: 'assignTask',
  initialState: {
    shops: [],
    givenBy: [],
    doerName: [],
    assignTask: [],
    automatedTasks: [],
    levels: [],
    error: null,
    loading: false,

  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(uniqueShopData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(uniqueShopData.fulfilled, (state, action) => {
        state.loading = false;
        state.shops = action.payload;
      })
      .addCase(uniqueShopData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(uniqueGivenByData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(uniqueGivenByData.fulfilled, (state, action) => {
        state.loading = false;
        state.givenBy = action.payload;
      })
      .addCase(uniqueGivenByData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(uniqueDoerNameData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(uniqueDoerNameData.fulfilled, (state, action) => {
        state.loading = false;
        state.doerName = action.payload;
      })
      .addCase(uniqueDoerNameData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(assignTaskInTable.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(assignTaskInTable.fulfilled, (state, action) => {
        state.loading = false;
        state.assignTask.push(action.payload);
      })
      .addCase(assignTaskInTable.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchMasterTasks.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchMasterTasks.fulfilled, (state, action) => {
        state.loading = false;
        state.automatedTasks = action.payload;
      })
      .addCase(fetchMasterTasks.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchLevels.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchLevels.fulfilled, (state, action) => {
        state.loading = false;
        state.levels = action.payload;
      })
      .addCase(fetchLevels.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export default assignTaskSlice.reducer;
