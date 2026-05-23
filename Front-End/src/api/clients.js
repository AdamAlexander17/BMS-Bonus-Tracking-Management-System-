import axiosInstance from './axiosInstance';

export const getClientsByBroker = (brokerId)       => axiosInstance.get(`brokers/${brokerId}/clients/`);
export const createClient       = (brokerId, data) => axiosInstance.post(`brokers/${brokerId}/clients/create/`, data);
export const getClient          = (id)             => axiosInstance.get(`clients/${id}/`);
export const getClientTransactions = (id)          => axiosInstance.get(`clients/${id}/transactions/`);
export const createClientTransaction = (id, data)  => axiosInstance.post(`clients/${id}/transactions/create/`, data);
export const updateClientTransaction = (clientId, transactionId, data) => axiosInstance.put(`clients/${clientId}/transactions/${transactionId}/update/`, data);
export const deleteClientTransaction = (clientId, transactionId) => axiosInstance.delete(`clients/${clientId}/transactions/${transactionId}/delete/`);
export const updateClient       = (id, data)       => axiosInstance.put(`clients/${id}/update/`, data);
export const deleteClient       = (id)             => axiosInstance.delete(`clients/${id}/delete/`);
