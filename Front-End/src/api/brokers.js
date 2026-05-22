import axiosInstance from './axiosInstance';

export const getBrokers           = ()         => axiosInstance.get('brokers/');
export const getBroker            = (id)       => axiosInstance.get(`brokers/${id}/`);
export const getBrokersByRmUser   = (userId)   => axiosInstance.get(`users/${userId}/brokers/`);
export const getBrokerPayouts     = (id)       => axiosInstance.get(`brokers/${id}/payouts/`);
export const createBroker         = (data)     => axiosInstance.post('brokers/create/', data);
export const updateBroker         = (id, data) => axiosInstance.put(`brokers/${id}/update/`, data);
export const createBrokerPayout   = (id, data) => axiosInstance.post(`brokers/${id}/payouts/create/`, data);
export const deleteBroker         = (id)       => axiosInstance.delete(`brokers/${id}/delete/`);
