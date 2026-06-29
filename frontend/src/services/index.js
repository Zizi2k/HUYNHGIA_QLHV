import api from './api';

export const authService = {
  login: (username, code) => api.post('/auth/login', { username, code }),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  updateProfile: (formData) => api.put('/auth/profile', formData),
};

export const userService = {
  getAll: (classId) => api.get('/users', { params: classId ? { class_id: classId } : {} }),
  listAdmins: () => api.get('/users/admins'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

export const classService = {
  getAll: (params) => api.get('/classes', { params: params || {} }),
  getById: (id) => api.get(`/classes/${id}`),
  create: (data) => api.post('/classes', data),
  update: (id, data) => api.put(`/classes/${id}`, data),
  delete: (id) => api.delete(`/classes/${id}`),
  addMember: (classId, userId) => api.post(`/classes/${classId}/members`, { user_id: userId }),
  createStudent: (classId, data) => api.post(`/classes/${classId}/students`, data),
  updateStudent: (classId, userId, data) => api.put(`/classes/${classId}/members/${userId}`, data),
  syncUsernames: (classId) => api.post(`/classes/${classId}/sync-usernames`),
  removeMember: (classId, userId) => api.delete(`/classes/${classId}/members/${userId}`),
  getAvailableStudents: (classId) => api.get(`/classes/${classId}/available-students`),
  getAvailableTeachers: (classId) => api.get(`/classes/${classId}/available-teachers`),
  addTeacher: (classId, userId) => api.post(`/classes/${classId}/teachers`, { user_id: userId }),
  removeTeacher: (classId, userId) => api.delete(`/classes/${classId}/teachers/${userId}`),
  importStudents: (classId, formData) => api.post(`/classes/${classId}/import-students`, formData),
  downloadImportTemplate: (classId) => api.get(`/classes/${classId}/import-template`, { responseType: 'blob' }),
  getNextStudentCode: (classId) => api.get(`/classes/${classId}/next-student-code`),
};

export const lessonService = {
  getByClass: (classId) => api.get(`/lessons/${classId}`),
  create: (classId, data) => api.post(`/lessons/${classId}`, data),
  delete: (id) => api.delete(`/lessons/${id}`),
};

export const assignmentService = {
  getAll: (classId) => api.get('/assignments', { params: { class_id: classId } }),
  create: (data) => api.post('/assignments', data),
  update: (id, data) => api.put(`/assignments/${id}`, data),
  delete: (id) => api.delete(`/assignments/${id}`),
  upload: (formData) => api.post('/assignments/upload', formData),
  getSubmissions: (assignmentId) => api.get(`/assignments/${assignmentId}/submissions`),
  grade: (id, data) => api.put(`/assignments/submissions/${id}/grade`, data),
};

export const quizService = {
  getAll: (classId) => api.get('/quizzes', { params: { class_id: classId } }),
  getById: (id) => api.get(`/quizzes/${id}`),
  create: (data) => api.post('/quizzes', data),
  update: (id, data) => api.put(`/quizzes/${id}`, data),
  delete: (id) => api.delete(`/quizzes/${id}`),
  getSubmissions: (quizId) => api.get(`/quizzes/${quizId}/submissions`),
  submit: (data) => api.post('/quizzes/submit', data),
  parseDocx: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/quizzes/parse-docx', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  downloadImportTemplate: () => api.get('/quizzes/import-template', { responseType: 'blob' }),
};

export const discussionService = {
  getByClass: (classId) => api.get(`/discussions/class/${classId}`),
  create: (data) => api.post('/discussions', data),
  getComments: (discussionId) => api.get(`/discussions/${discussionId}/comments`),
  addComment: (discussionId, data) => api.post(`/discussions/${discussionId}/comments`, data),
  toggleLike: (discussionId) => api.post(`/discussions/${discussionId}/like`),
};

export const dashboardService = {
  getStats: () => api.get('/dashboard'),
  getHonorBoard: (classId) => api.get('/dashboard/honor', { params: { class_id: classId } }),
};

export const attendanceService = {
  getByClass: (classId) => api.get(`/attendance/class/${classId}`),
  getAll: (params) => api.get('/attendance', { params }),
  getDetail: (sessionId) => api.get(`/attendance/${sessionId}`),
  getByDate: (classId, date) => api.get('/attendance/by-date', { params: { class_id: classId, date } }),
  submit: (data) => api.post('/attendance', data),
  exportMonthlyPdf: (classId, month) => api.get('/attendance/monthly-report/pdf', {
    params: { class_id: classId, month },
    responseType: 'blob',
  }),
};

export const onlineSessionService = {
  getByClass: (classId) => api.get('/online-sessions', { params: { class_id: classId } }),
  create: (data) => api.post('/online-sessions', data),
  end: (id) => api.post(`/online-sessions/${id}/end`),
  delete: (id) => api.delete(`/online-sessions/${id}`),
};

export const tuitionService = {
  getDiscounts: () => api.get('/tuition/discounts'),
  createDiscount: (data) => api.post('/tuition/discounts', data),
  updateDiscount: (id, data) => api.put(`/tuition/discounts/${id}`, data),
  deleteDiscount: (id) => api.delete(`/tuition/discounts/${id}`),

  getProfiles: (params) => api.get('/tuition/profiles', { params }),
  getProfile: (id) => api.get(`/tuition/profiles/${id}`),
  createProfile: (data) => api.post('/tuition/profiles', data),
  updateProfile: (id, data) => api.put(`/tuition/profiles/${id}`, data),
  deleteProfile: (id) => api.delete(`/tuition/profiles/${id}`),
  importProfiles: (formData) => api.post('/tuition/profiles/import', formData),
  downloadImportTemplate: () => api.get('/tuition/profiles/import-template', { responseType: 'blob' }),

  createPayment: (data) => api.post('/tuition/payments', data),
  deletePayment: (id) => api.delete(`/tuition/payments/${id}`),

  getPeriods: (params) => api.get('/tuition/periods', { params }),
  createPeriod: (data) => api.post('/tuition/periods', data),

  getMonthlyReport: (subject, month, classIds) => api.get('/tuition/report/monthly', {
    params: {
      subject,
      month,
      class_ids: classIds?.length ? classIds.join(',') : undefined,
    },
  }),
  exportMonthlyPdf: (subject, month, classIds) => api.get('/tuition/report/monthly/pdf', {
    params: {
      subject,
      month,
      class_ids: classIds?.length ? classIds.join(',') : undefined,
    },
    responseType: 'blob',
  }),
};

export const studentService = {
  getCourses: (params) => api.get('/students/courses', { params }),
  createCourse: (data) => api.post('/students/courses', data),
  updateCourse: (id, data) => api.put(`/students/courses/${id}`, data),
  deleteCourse: (id) => api.delete(`/students/courses/${id}`),

  getOverview: (params) => api.get('/students/overview', { params }),
  getNextCode: (subject, prefix) => api.get('/students/next-code', { params: { subject, prefix: prefix || undefined } }),
  createEnrollment: (data) => api.post('/students/enroll', data),
  updateEnrollment: (id, data) => api.put(`/students/enroll/${id}`, data),
  transferClass: (id, data) => api.post(`/students/enroll/${id}/transfer`, data),
};

export const auditService = {
  getLogs: (params) => api.get('/audit/logs', { params }),
  getDeletionRequests: (params) => api.get('/audit/deletion-requests', { params }),
  getPendingCount: () => api.get('/audit/deletion-requests/pending-count'),
  approveDeletion: (id, data) => api.post(`/audit/deletion-requests/${id}/approve`, data),
  rejectDeletion: (id, data) => api.post(`/audit/deletion-requests/${id}/reject`, data),
};
