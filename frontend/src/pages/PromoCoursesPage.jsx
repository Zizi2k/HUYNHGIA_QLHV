import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Button, ButtonGroup, Carousel, Col, Form, Modal, Row, Spinner,
} from 'react-bootstrap';
import { promoService } from '../services';
import { useAuth } from '../context/AuthContext';
import { getUserScope, isScopedAdmin, isSuperAdmin, scopeLabel } from '../utils/adminScope';
import { getAvatarUrl } from '../utils/avatar';
import LoadingOverlay from '../components/common/LoadingOverlay';

const emptyBanner = {
  title: '',
  subtitle: '',
  cta_label: 'Tìm ngay',
  link_url: '',
  branch_scope: 'all',
  sort_order: 0,
  is_active: true,
};

const emptyCourse = {
  title: '',
  description: '',
  highlight: '',
  branch_scope: 'HG',
  sort_order: 0,
  is_active: true,
};

function mediaUrl(url) {
  return getAvatarUrl(url);
}

function branchBadge(scope) {
  if (scope === 'HG') return <Badge bg="primary">HG</Badge>;
  if (scope === 'EG') return <Badge bg="success">EG</Badge>;
  return <Badge bg="secondary">Tất cả</Badge>;
}

export default function PromoCoursesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isSuper = isSuperAdmin(user);
  const lockedScope = getUserScope(user);
  const scopedAdmin = isScopedAdmin(user);

  const [filterScope, setFilterScope] = useState('all');
  const [banners, setBanners] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showBannerModal, setShowBannerModal] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null);
  const [bannerForm, setBannerForm] = useState(emptyBanner);
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [bannerImage, setBannerImage] = useState(null);
  const [courseImage, setCourseImage] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);
  const [coursePreview, setCoursePreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const listParams = useMemo(() => {
    const params = {};
    if (isSuper && filterScope !== 'all') params.scope = filterScope;
    if (isAdmin) params.include_inactive = '1';
    return params;
  }, [isSuper, filterScope, isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [bRes, cRes] = await Promise.all([
        promoService.getBanners(listParams),
        promoService.getCourses(listParams),
      ]);
      setBanners(bRes.data || []);
      setCourses(cRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải nội dung quảng bá');
    } finally {
      setLoading(false);
    }
  }, [listParams]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (scopedAdmin && lockedScope) {
      setCourseForm((prev) => ({ ...prev, branch_scope: lockedScope }));
      setBannerForm((prev) => ({ ...prev, branch_scope: lockedScope }));
    }
  }, [scopedAdmin, lockedScope]);

  const openCreateBanner = () => {
    setEditingBanner(null);
    setBannerForm({
      ...emptyBanner,
      branch_scope: lockedScope || 'all',
    });
    setBannerImage(null);
    setBannerPreview(null);
    setFormError('');
    setShowBannerModal(true);
  };

  const openEditBanner = (item) => {
    setEditingBanner(item);
    setBannerForm({
      title: item.title || '',
      subtitle: item.subtitle || '',
      cta_label: item.cta_label || '',
      link_url: item.link_url || '',
      branch_scope: item.branch_scope || 'all',
      sort_order: item.sort_order || 0,
      is_active: Boolean(item.is_active),
    });
    setBannerImage(null);
    setBannerPreview(mediaUrl(item.image_url));
    setFormError('');
    setShowBannerModal(true);
  };

  const openCreateCourse = () => {
    setEditingCourse(null);
    setCourseForm({
      ...emptyCourse,
      branch_scope: lockedScope || 'HG',
    });
    setCourseImage(null);
    setCoursePreview(null);
    setFormError('');
    setShowCourseModal(true);
  };

  const openEditCourse = (item) => {
    setEditingCourse(item);
    setCourseForm({
      title: item.title || '',
      description: item.description || '',
      highlight: item.highlight || '',
      branch_scope: item.branch_scope || lockedScope || 'HG',
      sort_order: item.sort_order || 0,
      is_active: Boolean(item.is_active),
    });
    setCourseImage(null);
    setCoursePreview(mediaUrl(item.image_url));
    setFormError('');
    setShowCourseModal(true);
  };

  const buildFormData = (fields, file) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (key === 'is_active') {
        fd.append(key, value ? '1' : '0');
      } else {
        fd.append(key, value ?? '');
      }
    });
    if (file) fd.append('image', file);
    return fd;
  };

  const saveBanner = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const fd = buildFormData(bannerForm, bannerImage);
      if (editingBanner) {
        await promoService.updateBanner(editingBanner.id, fd);
      } else {
        await promoService.createBanner(fd);
      }
      setShowBannerModal(false);
      await load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Không thể lưu banner');
    } finally {
      setSaving(false);
    }
  };

  const saveCourse = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const fd = buildFormData(courseForm, courseImage);
      if (editingCourse) {
        await promoService.updateCourse(editingCourse.id, fd);
      } else {
        await promoService.createCourse(fd);
      }
      setShowCourseModal(false);
      await load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Không thể lưu khóa học');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBanner = async (item) => {
    if (!window.confirm(`Xóa banner "${item.title}"?`)) return;
    try {
      await promoService.deleteBanner(item.id);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa banner');
    }
  };

  const handleDeleteCourse = async (item) => {
    if (!window.confirm(`Xóa khóa học "${item.title}"?`)) return;
    try {
      await promoService.deleteCourse(item.id);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa khóa học');
    }
  };

  const activeBanners = useMemo(
    () => (isAdmin ? banners.filter((b) => b.is_active) : banners),
    [banners, isAdmin],
  );
  const activeCourses = useMemo(
    () => (isAdmin ? courses.filter((c) => c.is_active) : courses),
    [courses, isAdmin],
  );

  const branchHint = lockedScope
    ? `Nội dung nhánh ${scopeLabel(lockedScope)}`
    : isSuper
      ? 'Admin tối cao — lọc HG / EG / Tất cả'
      : 'Khóa học theo nhánh của bạn';

  return (
    <LoadingOverlay loading={loading && banners.length === 0 && courses.length === 0} minHeight={360}>
      <div className="promo-page">
        {error && <Alert variant="danger">{error}</Alert>}

        <section className="promo-hero">
          <div className="promo-hero-inner">
            <div className="promo-hero-copy">
              <p className="promo-hero-eyebrow">LHG Education</p>
              <h1 className="promo-hero-title">Chinh phục hàng ngàn khóa học</h1>
              <p className="promo-hero-sub">Trên nền tảng giáo dục LHG — học tập hiện đại, đồng hành cùng bạn.</p>
              <a href="#promo-courses" className="promo-hero-cta">
                Tìm ngay
                <i className="bi bi-arrow-right" />
              </a>
            </div>
            <div className="promo-hero-visual" aria-hidden="true">
              <div className="promo-hero-orb promo-hero-orb--a" />
              <div className="promo-hero-orb promo-hero-orb--b" />
              <div className="promo-hero-phone">
                <span>LHG</span>
                <small>Học mọi lúc</small>
              </div>
            </div>
          </div>
        </section>

        <div className="promo-toolbar">
          <p className="promo-toolbar-hint mb-0">{branchHint}</p>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            {isSuper && (
              <ButtonGroup size="sm">
                {[
                  { value: 'all', label: 'Tất cả' },
                  { value: 'HG', label: 'HG' },
                  { value: 'EG', label: 'EG' },
                ].map((opt) => (
                  <Button
                    key={opt.value}
                    variant={filterScope === opt.value ? 'primary' : 'outline-primary'}
                    onClick={() => setFilterScope(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </ButtonGroup>
            )}
            {isAdmin && (
              <>
                <Button size="sm" variant="outline-secondary" onClick={openCreateBanner}>
                  <i className="bi bi-image me-1" />
                  Thêm banner
                </Button>
                <Button size="sm" variant="primary" onClick={openCreateCourse}>
                  <i className="bi bi-plus-lg me-1" />
                  Thêm khóa học
                </Button>
              </>
            )}
          </div>
        </div>

        <section className="promo-section">
          <div className="promo-section-head">
            <span className="promo-section-rule" />
            <h2>Chương trình ưu đãi hấp dẫn</h2>
          </div>

          {activeBanners.length === 0 ? (
            <div className="promo-empty">
              <i className="bi bi-megaphone" />
              <p>Chưa có banner ưu đãi{isAdmin ? ' — bấm “Thêm banner” để đăng.' : '.'}</p>
            </div>
          ) : (
            <Carousel
              className="promo-banner-carousel"
              indicators={activeBanners.length > 1}
              controls={activeBanners.length > 1}
              interval={6000}
            >
              {activeBanners.map((b) => (
                <Carousel.Item key={b.id}>
                  <div className="promo-banner-slide">
                    <div className="promo-banner-copy">
                      <div className="d-flex gap-2 align-items-center mb-2">
                        {branchBadge(b.branch_scope)}
                        {isAdmin && !b.is_active && <Badge bg="warning" text="dark">Ẩn</Badge>}
                      </div>
                      <h3>{b.title}</h3>
                      {b.subtitle && <p>{b.subtitle}</p>}
                      {b.cta_label && (
                        b.link_url ? (
                          <a href={b.link_url} className="promo-banner-cta" target="_blank" rel="noreferrer">
                            {b.cta_label}
                          </a>
                        ) : (
                          <span className="promo-banner-cta">{b.cta_label}</span>
                        )
                      )}
                      {isAdmin && (
                        <div className="promo-admin-actions mt-3">
                          <Button size="sm" variant="light" onClick={() => openEditBanner(b)}>Sửa</Button>
                          <Button size="sm" variant="outline-danger" onClick={() => handleDeleteBanner(b)}>Xóa</Button>
                        </div>
                      )}
                    </div>
                    <div
                      className="promo-banner-media"
                      style={b.image_url ? { backgroundImage: `url(${mediaUrl(b.image_url)})` } : undefined}
                    />
                  </div>
                </Carousel.Item>
              ))}
            </Carousel>
          )}

          {isAdmin && banners.some((b) => !b.is_active) && (
            <div className="promo-admin-inactive mt-3">
              <h6 className="text-muted small text-uppercase">Banner đang ẩn</h6>
              <ul className="list-unstyled mb-0">
                {banners.filter((b) => !b.is_active).map((b) => (
                  <li key={b.id} className="d-flex justify-content-between align-items-center py-1">
                    <span>{b.title} {branchBadge(b.branch_scope)}</span>
                    <Button size="sm" variant="link" onClick={() => openEditBanner(b)}>Sửa</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="promo-section" id="promo-courses">
          <div className="promo-section-head">
            <span className="promo-section-rule" />
            <h2>Khóa học chất lượng</h2>
          </div>

          {activeCourses.length === 0 ? (
            <div className="promo-empty">
              <i className="bi bi-journal-richtext" />
              <p>Chưa có khóa học quảng bá{isAdmin ? ' — bấm “Thêm khóa học” và chọn HG/EG.' : '.'}</p>
            </div>
          ) : (
            <Row className="g-3">
              {activeCourses.map((c) => (
                <Col key={c.id} md={6} lg={4}>
                  <article className="promo-course-card">
                    <div
                      className="promo-course-thumb"
                      style={c.image_url ? { backgroundImage: `url(${mediaUrl(c.image_url)})` } : undefined}
                    >
                      {!c.image_url && <i className="bi bi-book" />}
                      <span className="promo-course-badge">{branchBadge(c.branch_scope)}</span>
                    </div>
                    <div className="promo-course-body">
                      <h3>{c.title}</h3>
                      {c.highlight && <p className="promo-course-highlight">{c.highlight}</p>}
                      {c.description && <p className="promo-course-desc">{c.description}</p>}
                    </div>
                    <div className="promo-course-foot">
                      <span><i className="bi bi-star-fill" /> Ưu đãi học tập</span>
                      {isAdmin && (
                        <div className="promo-admin-actions">
                          <Button size="sm" variant="outline-light" onClick={() => openEditCourse(c)}>Sửa</Button>
                          <Button size="sm" variant="outline-danger" onClick={() => handleDeleteCourse(c)}>Xóa</Button>
                        </div>
                      )}
                    </div>
                  </article>
                </Col>
              ))}
            </Row>
          )}

          {isAdmin && courses.some((c) => !c.is_active) && (
            <div className="promo-admin-inactive mt-3">
              <h6 className="text-muted small text-uppercase">Khóa học đang ẩn</h6>
              <ul className="list-unstyled mb-0">
                {courses.filter((c) => !c.is_active).map((c) => (
                  <li key={c.id} className="d-flex justify-content-between align-items-center py-1">
                    <span>{c.title} {branchBadge(c.branch_scope)}</span>
                    <Button size="sm" variant="link" onClick={() => openEditCourse(c)}>Sửa</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Banner modal */}
        <Modal show={showBannerModal} onHide={() => setShowBannerModal(false)} size="lg" centered>
          <Modal.Header closeButton>
            <Modal.Title>{editingBanner ? 'Sửa banner' : 'Thêm banner ưu đãi'}</Modal.Title>
          </Modal.Header>
          <Form onSubmit={saveBanner}>
            <Modal.Body>
              {formError && <Alert variant="danger" className="py-2">{formError}</Alert>}
              <Row className="g-3">
                <Col md={8}>
                  <Form.Group>
                    <Form.Label>Tiêu đề *</Form.Label>
                    <Form.Control
                      value={bannerForm.title}
                      onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Thứ tự</Form.Label>
                    <Form.Control
                      type="number"
                      value={bannerForm.sort_order}
                      onChange={(e) => setBannerForm({ ...bannerForm, sort_order: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <Form.Group>
                    <Form.Label>Mô tả ngắn</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      value={bannerForm.subtitle}
                      onChange={(e) => setBannerForm({ ...bannerForm, subtitle: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Nhãn nút CTA</Form.Label>
                    <Form.Control
                      value={bannerForm.cta_label}
                      onChange={(e) => setBannerForm({ ...bannerForm, cta_label: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Link (tuỳ chọn)</Form.Label>
                    <Form.Control
                      value={bannerForm.link_url}
                      onChange={(e) => setBannerForm({ ...bannerForm, link_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Hiển thị cho nhánh</Form.Label>
                    <Form.Select
                      value={bannerForm.branch_scope}
                      disabled={Boolean(lockedScope)}
                      onChange={(e) => setBannerForm({ ...bannerForm, branch_scope: e.target.value })}
                    >
                      {!lockedScope && <option value="all">Tất cả (HG + EG)</option>}
                      <option value="HG">HG</option>
                      <option value="EG">EG</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Trạng thái</Form.Label>
                    <Form.Check
                      type="switch"
                      id="banner-active"
                      label={bannerForm.is_active ? 'Đang hiện' : 'Đang ẩn'}
                      checked={bannerForm.is_active}
                      onChange={(e) => setBannerForm({ ...bannerForm, is_active: e.target.checked })}
                    />
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <Form.Group>
                    <Form.Label>Ảnh banner</Form.Label>
                    <Form.Control
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        setBannerImage(file || null);
                        setBannerPreview(file ? URL.createObjectURL(file) : bannerPreview);
                      }}
                    />
                    {bannerPreview && (
                      <img src={bannerPreview} alt="Preview" className="promo-form-preview mt-2" />
                    )}
                  </Form.Group>
                </Col>
              </Row>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowBannerModal(false)}>Hủy</Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? <Spinner size="sm" /> : 'Lưu'}
              </Button>
            </Modal.Footer>
          </Form>
        </Modal>

        {/* Course modal */}
        <Modal show={showCourseModal} onHide={() => setShowCourseModal(false)} size="lg" centered>
          <Modal.Header closeButton>
            <Modal.Title>{editingCourse ? 'Sửa khóa học' : 'Thêm khóa học quảng bá'}</Modal.Title>
          </Modal.Header>
          <Form onSubmit={saveCourse}>
            <Modal.Body>
              {formError && <Alert variant="danger" className="py-2">{formError}</Alert>}
              <Row className="g-3">
                <Col md={8}>
                  <Form.Group>
                    <Form.Label>Tên khóa học *</Form.Label>
                    <Form.Control
                      value={courseForm.title}
                      onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Nhánh *</Form.Label>
                    <Form.Select
                      value={courseForm.branch_scope}
                      disabled={Boolean(lockedScope)}
                      onChange={(e) => setCourseForm({ ...courseForm, branch_scope: e.target.value })}
                      required
                    >
                      <option value="HG">HG</option>
                      <option value="EG">EG</option>
                    </Form.Select>
                    {lockedScope && (
                      <Form.Text className="text-muted">Khóa theo nhánh {lockedScope} của bạn</Form.Text>
                    )}
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <Form.Group>
                    <Form.Label>Mô tả</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={courseForm.description}
                      onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Dòng phụ (địa điểm / tag)</Form.Label>
                    <Form.Control
                      value={courseForm.highlight}
                      onChange={(e) => setCourseForm({ ...courseForm, highlight: e.target.value })}
                      placeholder="VD: Cơ sở LHG · Online"
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>Thứ tự</Form.Label>
                    <Form.Control
                      type="number"
                      value={courseForm.sort_order}
                      onChange={(e) => setCourseForm({ ...courseForm, sort_order: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>Trạng thái</Form.Label>
                    <Form.Check
                      type="switch"
                      id="course-active"
                      label={courseForm.is_active ? 'Hiện' : 'Ẩn'}
                      checked={courseForm.is_active}
                      onChange={(e) => setCourseForm({ ...courseForm, is_active: e.target.checked })}
                    />
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <Form.Group>
                    <Form.Label>Ảnh khóa học</Form.Label>
                    <Form.Control
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        setCourseImage(file || null);
                        setCoursePreview(file ? URL.createObjectURL(file) : coursePreview);
                      }}
                    />
                    {coursePreview && (
                      <img src={coursePreview} alt="Preview" className="promo-form-preview mt-2" />
                    )}
                  </Form.Group>
                </Col>
              </Row>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowCourseModal(false)}>Hủy</Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? <Spinner size="sm" /> : 'Lưu'}
              </Button>
            </Modal.Footer>
          </Form>
        </Modal>
      </div>
    </LoadingOverlay>
  );
}
