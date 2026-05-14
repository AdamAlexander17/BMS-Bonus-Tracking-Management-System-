import axiosInstance from './axiosInstance';

export const getBrands   = ()          => axiosInstance.get('brands/');
export const getBrand    = (id)        => axiosInstance.get(`brands/${id}/`);
export const createBrand = (data)      => axiosInstance.post('brands/create/', data);
export const updateBrand = (id, data)  => axiosInstance.put(`brands/${id}/update/`, data);
export const deleteBrand = (id)        => axiosInstance.delete(`brands/${id}/delete/`);
