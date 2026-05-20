import axiosInstance from './axiosInstance';

export const getAuditLogs = (params = {}) => axiosInstance.get('audit-logs/', { params });
