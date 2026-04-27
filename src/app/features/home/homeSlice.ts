import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { KEYCLOAK_URL } from "../../config";

export interface Table {
  seatingCapacity: number;
  tableId: number;
  tableNumber: number;
}

export interface Wing {
  wingId: number;
  wingName: string;
  dTables: Table[];
}

export interface Layout {
  layoutId: number;
  layoutName: string;
  wings: Wing[];
}

export interface Org {
  orgAddress: string;
  orgId: number;
  orgName: string;
}

export interface Branch {
  branchAddress: string;
  branchName: string;
  id: number;
}

export interface HomeResponse {
  org: Org | null;
  branch: Branch | null;
  layouts: Layout[] | null;
}

interface HomeState {
  org: Org | null;
  branch: Branch | null;
  layouts: Layout[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const initialState: HomeState = {
  org: null,
  branch: null,
  layouts: [],
  status: "idle",
  error: null,
};

export const fetchHomeData = createAsyncThunk<HomeResponse>(
  "home/fetchHomeData",
  async () => {
    const response = await fetch(`${KEYCLOAK_URL}/api/v1/order-management/home/org/1`);

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return (await response.json()) as HomeResponse;
  },
);

const homeSlice = createSlice({
  name: "home",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchHomeData.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchHomeData.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.org = action.payload.org;
        state.branch = action.payload.branch;
        state.layouts = action.payload.layouts ?? [];
      })
      .addCase(fetchHomeData.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load data";
      });
  },
});

export default homeSlice.reducer;
