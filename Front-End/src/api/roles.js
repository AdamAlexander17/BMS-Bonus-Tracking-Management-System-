import axiosInstance from './axiosInstance';

export const getRoles              = ()          => axiosInstance.get('roles/');
export const getRole               = (id)        => axiosInstance.get(`roles/${id}/`);
export const createRole            = (data)      => axiosInstance.post('roles/create/', data);
export const updateRole            = (id, data)  => axiosInstance.put(`roles/${id}/update/`, data);
export const deleteRole            = (id)        => axiosInstance.delete(`roles/${id}/delete/`);
export const setRolePermissions    = (id, data)  => axiosInstance.put(`roles/${id}/permissions/set/`, data);
export const assignRolePermissions = (id, data)  => axiosInstance.post(`roles/${id}/permissions/assign/`, data);
export const removeRolePermissions = (id, data)  => axiosInstance.delete(`roles/${id}/permissions/remove/`, { data });
