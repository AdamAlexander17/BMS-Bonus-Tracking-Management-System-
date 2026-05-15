import axiosInstance from './axiosInstance';

export const getClientsByBroker = (brokerId)       => axiosInstance.get(`brokers/${brokerId}/clients/`);
export const createClient       = (brokerId, data) => axiosInstance.post(`brokers/${brokerId}/clients/create/`, data);
export const getClient          = (id)             => axiosInstance.get(`clients/${id}/`);
export const updateClient       = (id, data)       => axiosInstance.put(`clients/${id}/update/`, data);
export const deleteClient       = (id)             => axiosInstance.delete(`clients/${id}/delete/`);
