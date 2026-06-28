-- Nhật ký thao tác và yêu cầu xóa chờ admin duyệt

CREATE TABLE IF NOT EXISTS audit_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  actor_id INT NOT NULL,
  action ENUM('create', 'update', 'delete', 'delete_request', 'approve', 'reject') NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id INT NULL,
  resource_label VARCHAR(255) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_audit_actor (actor_id),
  INDEX idx_audit_resource (resource_type, resource_id),
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_action (action)
);

CREATE TABLE IF NOT EXISTS deletion_requests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  requested_by INT NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id INT NOT NULL,
  resource_label VARCHAR(255) NULL,
  reason TEXT,
  metadata JSON NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  reviewed_by INT NULL,
  reviewed_at TIMESTAMP NULL,
  review_note TEXT NULL,
  executed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_deletion_status (status),
  INDEX idx_deletion_requester (requested_by),
  INDEX idx_deletion_resource (resource_type, resource_id)
);
