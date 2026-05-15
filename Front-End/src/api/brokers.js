import axiosInstance from './axiosInstance';

export const getBrokers   = ()         => axiosInstance.get('brokers/');
export const getBroker    = (id)       => axiosInstance.get(`brokers/${id}/`);
export const createBroker = (data)     => axiosInstance.post('brokers/create/', data);
export const updateBroker = (id, data) => axiosInstance.put(`brokers/${id}/update/`, data);
export const deleteBroker = (id)       => axiosInstance.delete(`brokers/${id}/delete/`);
