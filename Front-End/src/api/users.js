import axiosInstance from './axiosInstance';

export const getUsers    = ()          => axiosInstance.get('users/');
export const getUser     = (id)        => axiosInstance.get(`users/${id}/`);
export const createUser  = (data)      => axiosInstance.post('users/create/', data);
export const updateUser  = (id, data)  => axiosInstance.put(`users/${id}/update/`, data);
export const deleteUser  = (id)        => axiosInstance.delete(`users/${id}/delete/`);
