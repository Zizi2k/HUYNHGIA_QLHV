import { useEffect, useState } from 'react';
import {
  Tab, Row, Col, Form, Button, Spinner, Badge, Modal, Alert,
} from 'react-bootstrap';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/layout/PageHeader';
import ModuleTabs from '../components/layout/ModuleTabs';
import FilterPanel from '../components/layout/FilterPanel';
import DataTable, { DataTableEmpty } from '../components/common/DataTable';
import { auditService } from '../services';
import { isSuperAdmin } from '../utils/adminScope';
import {
  ACTION_OPTIONS,
  RESOURCE_OPTIONS,
  REQUEST_STATUS,
  formatDateTime,
  roleLabel,
} from '../components/audit/auditConstants';

function actionBadge(action) {
  const map = {
    create: 'success',
    update: 'primary',
    delete: 'danger',
    delete_request: 'warning',
    approve: 'info',
    reject: 'secondary',
  };
  return map[action] || 'light';
}

export default function AuditPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('logs');

  const [logs, setLogs] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);

  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [actorRoleFilter, setActorRoleFilter] = useState('teacher');
  const [search, setSearch] = useState('');
  const [requestStatus, setRequestStatus] = useState('pending');

  const [reviewItem, setReviewItem] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [logsError, setLogsError] = useState('');
  const [requestsError, setRequestsError] = useState('');

  const refreshPendingCount = () => {
    auditService.getPendingCount()
      .then((res) => setPendingCount(res.data.count || 0))
      .catch(() => {});
  };

  useEffect(() => {
    refreshPendingCount();
  }, []);

  const loadLogs = () => {
    setLoadingLogs(true);
    setLogsError('');
    const params = {};
    if (actionFilter) params.action = actionFilter;
    if (resourceFilter) params.resource_type = resourceFilter;
    if (actorRoleFilter) params.actor_role = actorRoleFilter;
    if (search.trim()) params.search = search.trim();
    auditService.getLogs(params)
      .then((res) => setLogs(res.data))
      .catch((err) => {
        setLogs([]);
        setLogsError(err.response?.data?.message || 'Không tải được nhật ký. Kiểm tra kết nối API backend.');
      })
      .finally(() => setLoadingLogs(false));
  };

  const loadRequests = () => {
    setLoadingRequests(true);
    setRequestsError('');
    auditService.getDeletionRequests({ status: requestStatus })
      .then((res) => setRequests(res.data))
      .catch((err) => {
        setRequests([]);
        setRequestsError(err.response?.data?.message || 'Không tải được yêu cầu xóa. Kiểm tra kết nối API backend.');
      })
      .finally(() => setLoadingRequests(false));
  };

  useEffect(() => {
    loadLogs();
  }, [actionFilter, resourceFilter, actorRoleFilter]);

  useEffect(() => {
    const timer = setTimeout(loadLogs, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (activeTab === 'requests') loadRequests();
  }, [activeTab, requestStatus]);

  const handleApprove = async () => {
    setReviewing(true);
    try {
      await auditService.approveDeletion(reviewItem.id, { review_note: reviewNote });
      setReviewItem(null);
      setReviewNote('');
      loadRequests();
      loadLogs();
      refreshPendingCount();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể duyệt yêu cầu');
    } finally {
      setReviewing(false);
    }
  };

  const handleReject = async () => {
    setReviewing(true);
    try {
      await auditService.rejectDeletion(reviewItem.id, { review_note: reviewNote });
      setReviewItem(null);
      setReviewNote('');
      loadRequests();
      loadLogs();
      refreshPendingCount();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể từ chối yêu cầu');
    } finally {
      setReviewing(false);
    }
  };

  if (!isSuperAdmin(user)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-container module-page">
      <PageHeader
        icon="bi-journal-text"
        title="Nhật ký & duyệt xóa"
        subtitle="Theo dõi thao tác của giáo viên và duyệt yêu cầu xóa trước khi thực hiện."
      />

      <ModuleTabs
        activeKey={activeTab}
        onSelect={(k) => setActiveTab(k || 'logs')}
        tabs={[
          { key: 'logs', label: 'Lịch sử thao tác', icon: 'bi-clock-history' },
          { key: 'requests', label: 'Yêu cầu xóa', icon: 'bi-trash', badge: pendingCount > 0 ? pendingCount : null },
        ]}
      >
        <Tab.Pane eventKey="logs">
          {logsError && <Alert variant="danger">{logsError}</Alert>}
          <FilterPanel>
            <Row className="g-2">
              <Col md={2}>
                <Form.Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                  {ACTION_OPTIONS.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={2}>
                <Form.Select value={resourceFilter} onChange={(e) => setResourceFilter(e.target.value)}>
                  {RESOURCE_OPTIONS.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={2}>
                <Form.Select value={actorRoleFilter} onChange={(e) => setActorRoleFilter(e.target.value)}>
                  <option value="">Tất cả vai trò</option>
                  <option value="teacher">Giáo viên</option>
                  <option value="student">Học viên</option>
                  <option value="admin">Admin</option>
                </Form.Select>
              </Col>
              <Col md={4}>
                <Form.Control
                  type="search"
                  placeholder="Tìm người thao tác, nội dung..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </Col>
              <Col md={2} className="text-md-end">
                <Button variant="outline-secondary" size="sm" onClick={loadLogs}>
                  <i className="bi bi-arrow-clockwise me-1" />Làm mới
                </Button>
              </Col>
            </Row>
          </FilterPanel>

          <DataTable
            title="Nhật ký thao tác"
            icon="bi-list-ul"
            count={logs.length}
            loading={loadingLogs}
          >
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Người thao tác</th>
                <th>Thao tác</th>
                <th>Loại</th>
                <th>Nội dung</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <DataTableEmpty message="Chưa có nhật ký" />
              ) : logs.map((log) => (
                <tr key={log.id}>
                  <td className="text-nowrap small">{formatDateTime(log.created_at)}</td>
                  <td>
                    <div className="fw-semibold">{log.actor_name}</div>
                    <small className="text-muted">{roleLabel(log.actor_role)}</small>
                  </td>
                  <td>
                    <Badge bg={actionBadge(log.action)}>{log.action_label}</Badge>
                  </td>
                  <td>{log.resource_type_label}</td>
                  <td>{log.resource_label || `#${log.resource_id || '—'}`}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Tab.Pane>

        <Tab.Pane eventKey="requests">
          {requestsError && <Alert variant="danger">{requestsError}</Alert>}
          <FilterPanel title="Bộ lọc yêu cầu">
            <Row className="g-2 align-items-center">
              <Col md={3}>
                <Form.Select value={requestStatus} onChange={(e) => setRequestStatus(e.target.value)}>
                  <option value="pending">Chờ duyệt</option>
                  <option value="approved">Đã duyệt</option>
                  <option value="rejected">Đã từ chối</option>
                  <option value="all">Tất cả</option>
                </Form.Select>
              </Col>
              <Col className="text-md-end">
                <Button variant="outline-secondary" size="sm" onClick={loadRequests}>
                  <i className="bi bi-arrow-clockwise me-1" />Làm mới
                </Button>
              </Col>
            </Row>
          </FilterPanel>

          <DataTable
            title="Yêu cầu xóa"
            icon="bi-trash"
            count={requests.length}
            loading={loadingRequests}
          >
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Người yêu cầu</th>
                <th>Loại</th>
                <th>Nội dung xóa</th>
                <th>Trạng thái</th>
                <th className="text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <DataTableEmpty
                  message={requestStatus === 'pending' ? 'Không có yêu cầu chờ duyệt' : 'Không có dữ liệu'}
                />
              ) : requests.map((req) => {
                const st = REQUEST_STATUS[req.status] || REQUEST_STATUS.pending;
                return (
                  <tr key={req.id}>
                    <td className="text-nowrap small">{formatDateTime(req.created_at)}</td>
                    <td>
                      <div className="fw-semibold">{req.requester_name}</div>
                      <small className="text-muted">{roleLabel(req.requester_role)}</small>
                    </td>
                    <td>{req.resource_type_label}</td>
                    <td>{req.resource_label || `#${req.resource_id}`}</td>
                    <td><Badge bg={st.bg}>{st.label}</Badge></td>
                    <td className="text-end">
                      {req.status === 'pending' ? (
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={() => { setReviewItem(req); setReviewNote(''); }}
                        >
                          Xem & duyệt
                        </Button>
                      ) : (
                        <small className="text-muted">
                          {req.reviewer_name ? `${req.reviewer_name}` : '—'}
                        </small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </Tab.Pane>
      </ModuleTabs>

      <Modal show={!!reviewItem} onHide={() => setReviewItem(null)}>
        <Modal.Header closeButton>
          <Modal.Title>Duyệt yêu cầu xóa</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {reviewItem && (
            <>
              <Alert variant="light" className="border">
                <div><strong>Người yêu cầu:</strong> {reviewItem.requester_name}</div>
                <div><strong>Loại:</strong> {reviewItem.resource_type_label}</div>
                <div><strong>Nội dung:</strong> {reviewItem.resource_label}</div>
                <div className="text-muted small mt-1">
                  Gửi lúc {formatDateTime(reviewItem.created_at)}
                </div>
              </Alert>
              <Form.Group>
                <Form.Label>Ghi chú duyệt (tùy chọn)</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Lý do duyệt hoặc từ chối..."
                />
              </Form.Group>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setReviewItem(null)}>Đóng</Button>
          <Button variant="outline-danger" onClick={handleReject} disabled={reviewing}>
            Từ chối
          </Button>
          <Button variant="success" onClick={handleApprove} disabled={reviewing}>
            {reviewing ? 'Đang xử lý...' : 'Duyệt & xóa'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
