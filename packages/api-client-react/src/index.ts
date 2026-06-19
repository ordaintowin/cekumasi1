import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

let authTokenGetter: () => string | null = () =>
  typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;

export function setAuthTokenGetter(getter: () => string | null) {
  authTokenGetter = getter;
}

async function apiFetch(path: string, options?: RequestInit) {
  const token = authTokenGetter();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `Request failed: ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function buildParams(obj: Record<string, any>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  return p.toString();
}

export type AuthUser = {
  id: number;
  username: string;
  roleLevel: number;
  roleSubtype?: string | null;
  memberId?: number | null;
  leadsCellId?: number | null;
  leadsCellName?: string | null;
};

export function getGetMeQueryKey() {
  return ["/api/auth/me"];
}
export function useGetMe(options?: { query?: { enabled?: boolean } }) {
  return useQuery<AuthUser>({
    queryKey: getGetMeQueryKey(),
    queryFn: () => apiFetch("/auth/me"),
    retry: false,
    ...options?.query,
  });
}

export function useLogin(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: { username: string; password: string } }) =>
      apiFetch("/auth/login", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function getGetDashboardSummaryQueryKey() {
  return ["/api/dashboard/summary"];
}
export function useGetDashboardSummary(options?: { query?: { enabled?: boolean; queryKey?: any[] } }) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getGetDashboardSummaryQueryKey(),
    queryFn: () => apiFetch("/dashboard/summary"),
    ...options?.query,
  });
}

export function getGetUpcomingBirthdaysQueryKey() {
  return ["/api/dashboard/birthdays"];
}
export function useGetUpcomingBirthdays(options?: { query?: { enabled?: boolean; queryKey?: any[] } }) {
  return useQuery<{ birthdays: any[]; anniversaries: any[] }>({
    queryKey: options?.query?.queryKey ?? getGetUpcomingBirthdaysQueryKey(),
    queryFn: () => apiFetch("/dashboard/birthdays"),
    ...options?.query,
  });
}

export function getGetRecentActivityQueryKey() {
  return ["/api/dashboard/recent-activity"];
}
export function useGetRecentActivity(options?: { query?: { enabled?: boolean; queryKey?: any[] } }) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getGetRecentActivityQueryKey(),
    queryFn: () => apiFetch("/dashboard/recent-activity"),
    ...options?.query,
  });
}

export function getGetActiveServiceQueryKey() {
  return ["/api/services/active"];
}
export function useGetActiveService(options?: { query?: { enabled?: boolean; queryKey?: any[] } }) {
  return useQuery<{ service: any | null }>({
    queryKey: options?.query?.queryKey ?? getGetActiveServiceQueryKey(),
    queryFn: () => apiFetch("/services/active"),
    ...options?.query,
  });
}

export function getListMembersQueryKey(params?: any) {
  return ["/api/members", params ?? {}];
}
export function useListMembers(
  params: { search?: string; type?: string; cellId?: number; page?: number; limit?: number } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListMembersQueryKey(params),
    queryFn: () => apiFetch(`/members?${buildParams(params)}`),
    ...options?.query,
  });
}

export function getGetMemberQueryKey(id: number) {
  return ["/api/members", id];
}
export function useGetMember(id: number, options?: { query?: { enabled?: boolean } }) {
  return useQuery({
    queryKey: getGetMemberQueryKey(id),
    queryFn: () => apiFetch(`/members/${id}`),
    enabled: !!id,
    ...options?.query,
  });
}

export function useCreateMember(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: any }) =>
      apiFetch("/members", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useUpdateMember(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/members/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useDeleteMember(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { reason: string } }) =>
      apiFetch(`/members/${id}`, { method: "DELETE", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useConvertVisitorToMember(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { cellId: number } }) =>
      apiFetch(`/members/${id}/convert`, { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function getGetFellowshipHierarchyQueryKey() {
  return ["/api/fellowships/hierarchy"];
}
export function useGetFellowshipHierarchy(options?: { query?: { enabled?: boolean; queryKey?: any[] } }) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getGetFellowshipHierarchyQueryKey(),
    queryFn: () => apiFetch("/fellowships/hierarchy"),
    ...options?.query,
  });
}

export function getListCellsQueryKey(params?: any) {
  return ["/api/cells", params ?? {}];
}
export function useListCells(
  params: { search?: string; seniorCellId?: number; standalone?: boolean } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListCellsQueryKey(params),
    queryFn: () => apiFetch(`/cells?${buildParams(params)}`),
    ...options?.query,
  });
}

export function getGetCellQueryKey(id: number) {
  return ["/api/cells", id];
}
export function useGetCell(id: number, options?: { query?: { enabled?: boolean } }) {
  return useQuery({
    queryKey: getGetCellQueryKey(id),
    queryFn: () => apiFetch(`/cells/${id}`),
    enabled: !!id,
    ...options?.query,
  });
}

export function useCreateCell(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: any }) =>
      apiFetch("/cells", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useUpdateCell(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/cells/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useDeleteCell(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { reason: string } }) =>
      apiFetch(`/cells/${id}`, { method: "DELETE", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function getListSeniorCellsQueryKey(params?: any) {
  return ["/api/senior-cells", params ?? {}];
}
export function useListSeniorCells(
  params: { search?: string; pcfId?: number; standalone?: boolean } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListSeniorCellsQueryKey(params),
    queryFn: () => apiFetch(`/senior-cells?${buildParams(params)}`),
    ...options?.query,
  });
}

export function useCreateSeniorCell(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: any }) =>
      apiFetch("/senior-cells", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useUpdateSeniorCell(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/senior-cells/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useDeleteSeniorCell(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { reason: string } }) =>
      apiFetch(`/senior-cells/${id}`, { method: "DELETE", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useCreatePcf(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: any }) =>
      apiFetch("/pcfs", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useUpdatePcf(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/pcfs/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useDeletePcf(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { reason: string } }) =>
      apiFetch(`/pcfs/${id}`, { method: "DELETE", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function getListServicesQueryKey(params?: any) {
  return ["/api/services", params ?? {}];
}
export function useListServices(
  params: { page?: number; limit?: number } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListServicesQueryKey(params),
    queryFn: () => apiFetch(`/services?${buildParams(params)}`),
    ...options?.query,
  });
}

export function useCreateService(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: any }) =>
      apiFetch("/services", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useCloseService(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch(`/services/${id}/close`, { method: "POST" }),
    ...options?.mutation,
  });
}

export function useCheckInMember(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { membershipId?: string; memberId?: number; method?: string } }) =>
      apiFetch(`/services/${id}/checkin`, { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function getGetServiceAttendanceQueryKey(serviceId: number) {
  return ["/api/services", serviceId, "attendance"];
}
export function useGetServiceAttendance(serviceId: number, options?: { query?: { enabled?: boolean } }) {
  return useQuery({
    queryKey: getGetServiceAttendanceQueryKey(serviceId),
    queryFn: () => apiFetch(`/services/${serviceId}/attendance`),
    enabled: !!serviceId,
    ...options?.query,
  });
}

export function getListFirstTimersQueryKey(params?: any) {
  return ["/api/first-timers", params ?? {}];
}
export function useListFirstTimers(
  params: { search?: string; serviceId?: number; page?: number; limit?: number } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListFirstTimersQueryKey(params),
    queryFn: () => apiFetch(`/first-timers?${buildParams(params)}`),
    ...options?.query,
  });
}

export function useCreateFirstTimer(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: any }) =>
      apiFetch("/first-timers", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useDeleteFirstTimer(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { reason: string } }) =>
      apiFetch(`/first-timers/${id}`, { method: "DELETE", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useConvertFirstTimerToMember(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { cellId: number } }) =>
      apiFetch(`/first-timers/${id}/convert`, { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useRegisterReturningFirstTimer(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { serviceId: number } }) =>
      apiFetch(`/first-timers/${id}/returning`, { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function getListArchivedMembersQueryKey(params?: any) {
  return ["/api/archives/members", params ?? {}];
}
export function useListArchivedMembers(
  params: { search?: string; page?: number; limit?: number } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListArchivedMembersQueryKey(params),
    queryFn: () => apiFetch(`/archives/members?${buildParams(params)}`),
    ...options?.query,
  });
}

export function useRestoreArchivedMember(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { reason: string } }) =>
      apiFetch(`/archives/members/${id}/restore`, { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function usePermanentDeleteMember(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch(`/archives/members/${id}`, { method: "DELETE" }),
    ...options?.mutation,
  });
}

export function getListChildrenQueryKey(params?: any) {
  return ["/api/children", params ?? {}];
}
export function useListChildren(
  params: { search?: string; class?: string; page?: number; limit?: number } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListChildrenQueryKey(params),
    queryFn: () => apiFetch(`/children?${buildParams(params)}`),
    ...options?.query,
  });
}

export function useCreateChild(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: any }) =>
      apiFetch("/children", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useUpdateChild(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/children/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useDeleteChild(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { reason: string } }) =>
      apiFetch(`/children/${id}`, { method: "DELETE", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function getListTeensQueryKey(params?: any) {
  return ["/api/teens", params ?? {}];
}
export function useListTeens(
  params: { search?: string; page?: number; limit?: number } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListTeensQueryKey(params),
    queryFn: () => apiFetch(`/teens?${buildParams(params)}`),
    ...options?.query,
  });
}

export function useCreateTeen(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: any }) =>
      apiFetch("/teens", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useDeleteTeen(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { reason: string } }) =>
      apiFetch(`/teens/${id}`, { method: "DELETE", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function getListDepartmentsQueryKey(params?: any) {
  return ["/api/departments", params ?? {}];
}
export function useListDepartments(
  params: {} = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListDepartmentsQueryKey(params),
    queryFn: () => apiFetch("/departments"),
    ...options?.query,
  });
}

export function getGetDepartmentQueryKey(id: number) {
  return ["/api/departments", id];
}
export function useGetDepartment(id: number, options?: { query?: { enabled?: boolean } }) {
  return useQuery({
    queryKey: getGetDepartmentQueryKey(id),
    queryFn: () => apiFetch(`/departments/${id}`),
    enabled: !!id,
    ...options?.query,
  });
}

export function useCreateDepartment(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: any }) =>
      apiFetch("/departments", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useAddDepartmentMember(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { memberId: number; subUnit?: string; isHead?: boolean } }) =>
      apiFetch(`/departments/${id}/members`, { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useRemoveDepartmentMember(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, memberId }: { id: number; memberId: number }) =>
      apiFetch(`/departments/${id}/members/${memberId}`, { method: "DELETE" }),
    ...options?.mutation,
  });
}

export function useUpdateDepartment(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; description?: string; headId?: number | null } }) =>
      apiFetch(`/departments/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useDeleteDepartment(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { reason: string } }) =>
      apiFetch(`/departments/${id}`, { method: "DELETE", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useUpdateDepartmentMember(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, memberId, data }: { id: number; memberId: number; data: { subUnit?: string; isHead?: boolean } }) =>
      apiFetch(`/departments/${id}/members/${memberId}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function usePromoteTeenToMember(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { gender: string } }) =>
      apiFetch(`/teens/${id}/promote`, { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function getListFamiliesQueryKey(params?: any) {
  return ["/api/families", params ?? {}];
}
export function useListFamilies(
  params: { search?: string; memberId?: number } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListFamiliesQueryKey(params),
    queryFn: () => apiFetch(`/families?${buildParams(params)}`),
    ...options?.query,
  });
}

export function getGetFamilyQueryKey(id: number) {
  return ["/api/families", id];
}
export function useGetFamily(id: number, options?: { query?: { enabled?: boolean } }) {
  return useQuery({
    queryKey: getGetFamilyQueryKey(id),
    queryFn: () => apiFetch(`/families/${id}`),
    enabled: !!id,
    ...options?.query,
  });
}

export function useCreateFamilyConnection(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: { fatherId: number; motherId: number; childIds?: number[]; teenIds?: number[]; memberChildIds?: number[] } }) =>
      apiFetch("/families", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useUpdateFamilyConnection(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/families/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useDeleteFamilyConnection(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch(`/families/${id}`, { method: "DELETE" }),
    ...options?.mutation,
  });
}

export function useUpdateTeen(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/teens/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function getListGivingTypesQueryKey(params?: any) {
  return ["/api/giving-types", params ?? {}];
}
export function useListGivingTypes(
  params: {} = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListGivingTypesQueryKey(params),
    queryFn: () => apiFetch("/giving-types"),
    ...options?.query,
  });
}

export function useCreateGivingType(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: { name: string; description?: string } }) =>
      apiFetch("/giving-types", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function getListMinistryYearsQueryKey(params?: any) {
  return ["/api/ministry-years", params ?? {}];
}
export function useListMinistryYears(
  params: {} = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListMinistryYearsQueryKey(params),
    queryFn: () => apiFetch("/ministry-years"),
    ...options?.query,
  });
}

export function useCreateMinistryYear(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: { name: string; startDate: string; endDate: string } }) =>
      apiFetch("/ministry-years", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function getGetMemberAttendanceHistoryQueryKey(memberId: number, params?: any) {
  return ["/api/members", memberId, "attendance", params ?? {}];
}
export function useGetMemberAttendanceHistory(
  memberId: number,
  params: { ministryYearId?: number; page?: number; limit?: number } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getGetMemberAttendanceHistoryQueryKey(memberId, params),
    queryFn: () => apiFetch(`/members/${memberId}/attendance?${buildParams(params)}`),
    enabled: !!memberId,
    ...options?.query,
  });
}

export function getGetMemberGivingsHistoryQueryKey(memberId: number, params?: any) {
  return ["/api/members", memberId, "givings", params ?? {}];
}
export function useGetMemberGivingsHistory(
  memberId: number,
  params: { ministryYearId?: number; page?: number; limit?: number } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getGetMemberGivingsHistoryQueryKey(memberId, params),
    queryFn: () => apiFetch(`/members/${memberId}/givings?${buildParams(params)}`),
    enabled: !!memberId,
    ...options?.query,
  });
}

export function getListGivingsQueryKey(params?: any) {
  return ["/api/givings", params ?? {}];
}
export function useListGivings(
  params: { memberId?: number; ministryYearId?: number; givingTypeId?: number; page?: number; limit?: number } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListGivingsQueryKey(params),
    queryFn: () => apiFetch(`/givings?${buildParams(params)}`),
    ...options?.query,
  });
}

export function useCreateGiving(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: any }) =>
      apiFetch("/givings", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function getGetFinanceReportQueryKey(params?: any) {
  return ["/api/reports/finance", params ?? {}];
}
export function useGetFinanceReport(
  params: { reportType?: string; ministryYearId?: number; memberId?: number; cellId?: number; year?: number; month?: number } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getGetFinanceReportQueryKey(params),
    queryFn: () => apiFetch(`/reports/finance?${buildParams(params)}`),
    enabled: !!params.reportType,
    ...options?.query,
  });
}

export function getGetOverallAttendanceReportQueryKey(params?: any) {
  return ["/api/reports/overall", params ?? {}];
}
export function useGetOverallAttendanceReport(
  params: { startDate?: string; endDate?: string } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getGetOverallAttendanceReportQueryKey(params),
    queryFn: () => apiFetch(`/reports/overall?${buildParams(params)}`),
    enabled: !!(params.startDate && params.endDate),
    ...options?.query,
  });
}

export function getListVideosQueryKey(params?: any) {
  return ["/api/videos", params ?? {}];
}
export function useListVideos(
  params: {} = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListVideosQueryKey(params),
    queryFn: () => apiFetch("/videos"),
    ...options?.query,
  });
}

export function useCreateVideo(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: any }) =>
      apiFetch("/videos", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useDeleteVideo(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch(`/videos/${id}`, { method: "DELETE" }),
    ...options?.mutation,
  });
}

export function getListOnlineMeetingsQueryKey(params?: any) {
  return ["/api/online-meetings", params ?? {}];
}
export function useListOnlineMeetings(
  params: {} = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListOnlineMeetingsQueryKey(params),
    queryFn: () => apiFetch("/online-meetings"),
    ...options?.query,
  });
}

export function useCreateOnlineMeeting(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: any }) =>
      apiFetch("/online-meetings", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useUpdateOnlineMeeting(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/online-meetings/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useDeleteOnlineMeeting(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch(`/online-meetings/${id}`, { method: "DELETE" }),
    ...options?.mutation,
  });
}

export function getGetActiveMeetingQueryKey() {
  return ["/api/online-meetings/active"];
}
export function useGetActiveMeeting(options?: { query?: { enabled?: boolean; queryKey?: any[] } }) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getGetActiveMeetingQueryKey(),
    queryFn: () => apiFetch("/online-meetings/active"),
    ...options?.query,
  });
}

export function getListAdminUsersQueryKey(params?: any) {
  return ["/api/admin/users", params ?? {}];
}
export function useListAdminUsers(
  params: {} = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListAdminUsersQueryKey(params),
    queryFn: () => apiFetch("/admin/users"),
    ...options?.query,
  });
}

export function useCreateAdminUser(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ data }: { data: any }) =>
      apiFetch("/admin/users", { method: "POST", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useUpdateAdminUser(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useDeleteAdminUser(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch(`/admin/users/${id}`, { method: "DELETE" }),
    ...options?.mutation,
  });
}

export function useDeleteMinistryYear(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch(`/ministry-years/${id}`, { method: "DELETE" }),
    ...options?.mutation,
  });
}

export function useUpdateMinistryYear(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; startDate?: string; endDate?: string; isActive?: boolean; isClosed?: boolean } }) =>
      apiFetch(`/ministry-years/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useUpdateGivingType(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; description?: string } }) =>
      apiFetch(`/giving-types/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useUpdateGiving(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/givings/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useDeleteGiving(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch(`/givings/${id}`, { method: "DELETE" }),
    ...options?.mutation,
  });
}

export function useGivingSearch(
  params: { q: string; type?: string },
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery<any[]>({
    queryKey: ["/api/giving-search", params.q, params.type ?? ""],
    queryFn: () => apiFetch(`/giving-search?${buildParams(params)}`),
    enabled: params.q.length >= 2,
    ...options?.query,
  });
}

export function getGetMemberCredentialsQueryKey(id: number) {
  return ["/api/members", id, "credentials"];
}
export function useGetMemberCredentials(id: number, options?: { query?: { enabled?: boolean } }) {
  return useQuery<any>({
    queryKey: getGetMemberCredentialsQueryKey(id),
    queryFn: () => apiFetch(`/members/${id}/credentials`),
    enabled: !!id,
    ...options?.query,
  });
}

export function useResetMemberPassword(options?: { mutation?: { onSuccess?: (data: any) => void; onError?: (err: any) => void } }) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data?: { newPin?: string; newPassword?: string } }) =>
      apiFetch(`/members/${id}/reset-password`, { method: "POST", body: JSON.stringify(data ?? {}) }),
    ...options?.mutation,
  });
}

export function getGetMemberGivingsQueryKey(id: number, params?: any) {
  return ["/api/members", id, "givings", params ?? {}];
}
export function useGetMemberGivings(
  id: number,
  params: { ministryYearId?: number; page?: number; limit?: number } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery<any>({
    queryKey: options?.query?.queryKey ?? getGetMemberGivingsQueryKey(id, params),
    queryFn: () => apiFetch(`/members/${id}/givings?${buildParams(params)}`),
    enabled: !!id,
    ...options?.query,
  });
}

export function getGetMemberAttendanceQueryKey(id: number, params?: any) {
  return ["/api/members", id, "attendance", params ?? {}];
}
export function useGetMemberAttendance(
  id: number,
  params: { ministryYearId?: number; page?: number; limit?: number } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery<any>({
    queryKey: options?.query?.queryKey ?? getGetMemberAttendanceQueryKey(id, params),
    queryFn: () => apiFetch(`/members/${id}/attendance?${buildParams(params)}`),
    enabled: !!id,
    ...options?.query,
  });
}

export function getGetMembersAttendanceReportQueryKey(params?: any) {
  return ["/api/reports/members-attendance", params ?? {}];
}
export function useGetMembersAttendanceReport(
  params: { month?: string; serviceId?: number; cellId?: number; search?: string; page?: number; limit?: number } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery<any>({
    queryKey: options?.query?.queryKey ?? getGetMembersAttendanceReportQueryKey(params),
    queryFn: () => apiFetch(`/reports/members-attendance?${buildParams(params)}`),
    ...options?.query,
  });
}

export function getGetFellowshipAttendanceReportQueryKey(params?: any) {
  return ["/api/reports/fellowship-attendance", params ?? {}];
}
export function useGetFellowshipAttendanceReport(
  params: { month?: string } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery<any>({
    queryKey: options?.query?.queryKey ?? getGetFellowshipAttendanceReportQueryKey(params),
    queryFn: () => apiFetch(`/reports/fellowship-attendance?${buildParams(params)}`),
    enabled: !!params.month,
    ...options?.query,
  });
}

export function getGetAttendanceTrendQueryKey(params?: any) {
  return ["/api/reports/attendance-trend", params ?? {}];
}
export function useGetAttendanceTrend(
  params: { view?: string; month?: string; year?: string; pcfId?: number; seniorCellId?: number; cellId?: number } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery<any>({
    queryKey: options?.query?.queryKey ?? getGetAttendanceTrendQueryKey(params),
    queryFn: () => apiFetch(`/reports/attendance-trend?${buildParams(params)}`),
    ...options?.query,
  });
}

export function getGetFirstTimersStatusReportQueryKey(params?: any) {
  return ["/api/reports/first-timers-status", params ?? {}];
}
export function useGetFirstTimersStatusReport(
  params: { search?: string; page?: number; limit?: number; startDate?: string; endDate?: string } = {},
  options?: { query?: { enabled?: boolean; queryKey?: any[] } }
) {
  return useQuery<any>({
    queryKey: options?.query?.queryKey ?? getGetFirstTimersStatusReportQueryKey(params),
    queryFn: () => apiFetch(`/reports/first-timers-status?${buildParams(params)}`),
    ...options?.query,
  });
}
