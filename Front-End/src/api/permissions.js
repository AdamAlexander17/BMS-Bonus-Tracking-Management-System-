import axiosInstance from './axiosInstance';

export const getPermissions = () => axiosInstance.get('permissions/');
