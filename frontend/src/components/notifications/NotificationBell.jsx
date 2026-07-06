import { useState, useEffect, useCallback } from 'react';
import { Dropdown, Badge, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { notificationService } from '../../services';

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const loadCount = useCallback(() => {
    notificationService.getUnreadCount()
      .then((res) => setCount(res.data.count || 0))
      .catch(() => {});
  }, []);

  const loadItems = useCallback(() => {
    setLoading(true);
    notificationService.getUnread()
      .then((res) => setItems(res.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCount();
    const timer = setInterval(loadCount, 60000);
    return () => clearInterval(timer);
  }, [loadCount]);

  useEffect(() => {
    if (open) loadItems();
  }, [open, loadItems]);

  const handleMarkRead = async (id) => {
    try {
      await notificationService.markRead(id);
      setItems((prev) => prev.filter((n) => n.id !== id));
      setCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const handleMarkAll = async () => {
    try {
      await notificationService.markAllRead();
      setItems([]);
      setCount(0);
    } catch {
      // ignore
    }
  };

  return (
    <Dropdown align="end" show={open} onToggle={(v) => setOpen(v)}>
      <Dropdown.Toggle as="button" className="app-topbar-btn position-relative" title="Thông báo">
        <i className="bi bi-bell" />
        {count > 0 && (
          <Badge
            bg="danger"
            pill
            className="position-absolute top-0 start-100 translate-middle"
            style={{ fontSize: '0.65rem' }}
          >
            {count > 99 ? '99+' : count}
          </Badge>
        )}
      </Dropdown.Toggle>
      <Dropdown.Menu className="app-notification-menu shadow">
        <div className="app-notification-header">
          <span className="fw-semibold">Thông báo</span>
          {count > 0 && (
            <button type="button" className="btn btn-link btn-sm p-0" onClick={handleMarkAll}>
              Đọc tất cả
            </button>
          )}
        </div>
        <div className="app-notification-list">
          {loading ? (
            <div className="text-center py-3"><Spinner size="sm" /></div>
          ) : items.length === 0 ? (
            <div className="text-muted text-center py-3 small">Không có thông báo mới</div>
          ) : (
            items.map((n) => (
              <div key={n.id} className="app-notification-item">
                <div className="app-notification-item-title">{n.title}</div>
                <div className="app-notification-item-body">{n.body}</div>
                <div className="app-notification-item-meta">
                  <span>{formatTime(n.created_at)}</span>
                  {n.class_name && <span className="ms-2 text-primary">{n.class_name}</span>}
                </div>
                <div className="app-notification-item-actions">
                  {n.link_path && (
                    <Link
                      to={n.link_path}
                      className="btn btn-outline-primary btn-sm"
                      onClick={() => handleMarkRead(n.id)}
                    >
                      Xem lớp
                    </Link>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => handleMarkRead(n.id)}
                  >
                    Đã đọc
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
