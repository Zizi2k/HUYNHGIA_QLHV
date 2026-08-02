import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Button, ButtonGroup, Carousel, Col, Form, Modal, Row, Spinner, Table,
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
  original_price: '',
  discount_type: 'none',
  discount_value: '',
  registration_enabled: true,
};

const emptyRegister = {
  student_user_id: '',
  fullname: '',
  phone: '',
  zalo: '',
  note: '',
};

const STATUS_META = {
  pending: { label: 'Chờ xử lý', bg: 'warning', text: 'dark' },
  contacted: { label: 'Đã liên hệ', bg: 'info' },
  approved: { label: 'Đã duyệt', bg: 'success' },
  rejected: { label: 'Từ chối', bg: 'danger' },
  cancelled: { label: 'Đã hủy', bg: 'secondary' },
};

function mediaUrl(url) {
  return getAvatarUrl(url);
}

function branchBadge(scope) {
  if (scope === 'HG') return <Badge bg="primary">HG</Badge>;
  if (scope === 'EG') return <Badge bg="success">EG</Badge>;
  return <Badge bg="secondary">Tất cả</Badge>;
}

/** Format số thành tiền Việt Nam, ví dụ 1.500.000đ */
function formatVnd(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `${Math.round(n).toLocaleString('vi-VN')}đ`;
}

/** Tính giá bán — percent / fixed, giống backend */
function computeSalePrice(original, discountType, discountValue) {
  const orig = Number(original) || 0;
  if (!orig) return null;
  if (
    !discountType
    || discountType === 'none'
    || discountValue === null
    || discountValue === undefined
    || discountValue === ''
  ) {
    return orig;
  }
  const value = Number(discountValue) || 0;
  if (discountType === 'percent') {
    const pct = Math.min(Math.max(value, 0), 100);
    return Math.max(0, Math.round(orig - (orig * pct) / 100));
  }
  if (discountType === 'fixed') {
    return Math.max(0, Math.round(orig - value));
  }
  return orig;
}

function getDiscountLabel(course) {
  const type = course.discount_type;
  if (!type || type === 'none') return null;
  const original = Number(course.original_price);
  const sale = course.sale_price != null
    ? Number(course.sale_price)
    : computeSalePrice(course.original_price, type, course.discount_value);
  if (!original || sale == null || sale >= original) return null;
  if (type === 'percent') {
    const pct = Number(course.discount_value) || 0;
    return `-${pct}%`;
  }
  if (type === 'fixed') {
    const amount = Number(course.discount_value) || (original - sale);
    return `-${formatVnd(amount)}`;
  }
  return null;
}

function isRegistrationOpen(course) {
  if (course.registration_enabled === undefined || course.registration_enabled === null) return true;
  return Boolean(Number(course.registration_enabled));
}

function statusBadge(status) {
  const meta = STATUS_META[status] || { label: status, bg: 'secondary' };
  return (
    <Badge bg={meta.bg} text={meta.text}>
      {meta.label}
    </Badge>
  );
}

function CoursePriceBlock({ course }) {
  const original = course.original_price != null && course.original_price !== ''
    ? Number(course.original_price)
    : null;
  if (original == null || !Number.isFinite(original) || original <= 0) return null;

  const sale = course.sale_price != null
    ? Number(course.sale_price)
    : computeSalePrice(course.original_price, course.discount_type, course.discount_value);
  const discounted = sale != null && sale < original;
  const label = getDiscountLabel(course);

  return (
    <div className="promo-price-block">
      {discounted && (
        <span className="promo-price-original">{formatVnd(original)}</span>
      )}
      <span className="promo-price-sale">{formatVnd(discounted ? sale : original)}</span>
      {label && <span className="promo-price-discount">{label}</span>}
    </div>
  );
}

export default function PromoCoursesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isTeacher = user?.role === 'teacher';
  const isStudent = user?.role === 'student';
  const canRegister = isStudent || isTeacher || isAdmin;
  const isSuper = isSuperAdmin(user);
  const lockedScope = getUserScope(user);
  const scopedAdmin = isScopedAdmin(user);

  const [filterScope, setFilterScope] = useState('all');
  const [banners, setBanners] = useState([]);
  const [courses, setCourses] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [showBannerModal, setShowBannerModal] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerCourseItem, setRegisterCourseItem] = useState(null);
  const [editingBanner, setEditingBanner] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null);
  const [bannerForm, setBannerForm] = useState(emptyBanner);
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [registerForm, setRegisterForm] = useState(emptyRegister);
  const [bannerImage, setBannerImage] = useState(null);
  const [courseImage, setCourseImage] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);
  const [coursePreview, setCoursePreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [updatingRegId, setUpdatingRegId] = useState(null);

  const listParams = useMemo(() => {
    const params = {};
    if (isSuper && filterScope !== 'all') params.scope = filterScope;
    if (isAdmin) params.include_inactive = '1';
    return params;
  }, [isSuper, filterScope, isAdmin]);

  const loadRegistrations = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await promoService.getRegistrations();
      setRegistrations(res.data || []);
    } catch {
      /* panel optional — không chặn trang */
    }
  }, [isAdmin]);

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
      if (isAdmin) await loadRegistrations();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải nội dung quảng bá');
    } finally {
      setLoading(false);
    }
  }, [listParams, isAdmin, loadRegistrations]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (scopedAdmin && lockedScope) {
      setCourseForm((prev) => ({ ...prev, branch_scope: lockedScope }));
      setBannerForm((prev) => ({ ...prev, branch_scope: lockedScope }));
    }
  }, [scopedAdmin, lockedScope]);

  const previewSalePrice = useMemo(
    () => computeSalePrice(
      courseForm.original_price,
      courseForm.discount_type,
      courseForm.discount_value,
    ),
    [courseForm.original_price, courseForm.discount_type, courseForm.discount_value],
  );

  const previewSaved = useMemo(() => {
    const original = Number(courseForm.original_price) || 0;
    if (!original || previewSalePrice == null) return 0;
    return Math.max(0, original - previewSalePrice);
  }, [courseForm.original_price, previewSalePrice]);

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
      original_price: item.original_price != null ? String(item.original_price) : '',
      discount_type: item.discount_type || 'none',
      discount_value: item.discount_value != null ? String(item.discount_value) : '',
      registration_enabled: item.registration_enabled === undefined
        ? true
        : Boolean(Number(item.registration_enabled)),
    });
    setCourseImage(null);
    setCoursePreview(mediaUrl(item.image_url));
    setFormError('');
    setShowCourseModal(true);
  };

  const openRegister = async (course) => {
    setRegisterCourseItem(course);
    setFormError('');
    setRegisterForm({
      ...emptyRegister,
      phone: user?.phone || '',
      zalo: user?.zalo || '',
      fullname: user?.fullname || '',
    });
    if (isTeacher || isAdmin) {
      try {
        const res = await promoService.getStudents();
        setStudents(res.data || []);
      } catch {
        setStudents([]);
      }
    }
    setShowRegisterModal(true);
  };

  const onSelectStudent = (studentId) => {
    const student = students.find((s) => String(s.id) === String(studentId));
    setRegisterForm((prev) => ({
      ...prev,
      student_user_id: studentId,
      fullname: student?.fullname || prev.fullname,
      phone: student?.phone || prev.phone,
      zalo: student?.zalo || prev.zalo,
    }));
  };

  const buildFormData = (fields, file) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (key === 'is_active' || key === 'registration_enabled') {
        fd.append(key, value ? '1' : '0');
      } else if (key === 'discount_type' && (value === 'none' || value === '')) {
        fd.append(key, 'none');
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

  const submitRegister = async (e) => {
    e.preventDefault();
    if (!registerCourseItem) return;
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        phone: registerForm.phone?.trim() || undefined,
        zalo: registerForm.zalo?.trim() || undefined,
        note: registerForm.note?.trim() || undefined,
      };
      if (isTeacher) {
        if (!registerForm.student_user_id) {
          setFormError('Vui lòng chọn học viên cần đăng ký');
          setSaving(false);
          return;
        }
        payload.student_user_id = Number(registerForm.student_user_id);
      }
      if (isAdmin) {
        if (registerForm.student_user_id) {
          payload.student_user_id = Number(registerForm.student_user_id);
        }
        if (registerForm.fullname?.trim()) {
          payload.fullname = registerForm.fullname.trim();
        }
      }
      const res = await promoService.registerCourse(registerCourseItem.id, payload);
      setShowRegisterModal(false);
      setSuccessMsg(res.data?.message || 'Đã gửi yêu cầu đăng ký khóa học');
      if (isAdmin) await loadRegistrations();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Không thể đăng ký khóa học');
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

  const handleUpdateRegistration = async (id, status) => {
    setUpdatingRegId(id);
    try {
      await promoService.updateRegistration(id, { status });
      setRegistrations((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể cập nhật trạng thái');
    } finally {
      setUpdatingRegId(null);
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
        {successMsg && (
          <Alert variant="success" dismissible onClose={() => setSuccessMsg('')}>
            {successMsg}
          </Alert>
        )}

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
                      <CoursePriceBlock course={c} />
                    </div>
                    <div className="promo-course-foot">
                      <span><i className="bi bi-star-fill" /> Ưu đãi học tập</span>
                      <div className="d-flex flex-wrap gap-2 align-items-center">
                        {canRegister && isRegistrationOpen(c) && (
                          <button
                            type="button"
                            className="promo-register-btn"
                            onClick={() => openRegister(c)}
                          >
                            Đăng ký khóa học
                          </button>
                        )}
                        {isAdmin && (
                          <div className="promo-admin-actions">
                            <Button size="sm" variant="outline-light" onClick={() => openEditCourse(c)}>Sửa</Button>
                            <Button size="sm" variant="outline-danger" onClick={() => handleDeleteCourse(c)}>Xóa</Button>
                          </div>
                        )}
                      </div>
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

        {isAdmin && (
          <section className="promo-section">
            <div className="promo-section-head">
              <span className="promo-section-rule" />
              <h2>Đăng ký khóa học</h2>
            </div>
            {registrations.length === 0 ? (
              <div className="promo-empty">
                <i className="bi bi-clipboard-check" />
                <p>Chưa có yêu cầu đăng ký nào.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <Table hover size="sm" className="align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Khóa học</th>
                      <th>Học viên</th>
                      <th>Người đăng ký</th>
                      <th>SĐT</th>
                      <th>Giá</th>
                      <th>Trạng thái</th>
                      <th>Ngày</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div className="fw-semibold">{r.course_title || '—'}</div>
                          {r.course_branch && (
                            <small className="text-muted">{r.course_branch}</small>
                          )}
                        </td>
                        <td>
                          {r.student_name || r.fullname || '—'}
                          {r.student_code && (
                            <div><small className="text-muted">{r.student_code}</small></div>
                          )}
                        </td>
                        <td>
                          {r.registrant_name || '—'}
                          {r.registrant_role && (
                            <div>
                              <small className="text-muted">
                                {r.registrant_role === 'admin' && 'Admin'}
                                {r.registrant_role === 'teacher' && 'Giáo viên'}
                                {r.registrant_role === 'student' && 'Học viên'}
                              </small>
                            </div>
                          )}
                        </td>
                        <td>
                          <div>{r.phone || '—'}</div>
                          {r.zalo && <small className="text-muted">Zalo: {r.zalo}</small>}
                        </td>
                        <td>
                          <div className="promo-price-block">
                            {r.original_price != null && r.sale_price != null
                              && Number(r.sale_price) < Number(r.original_price) && (
                              <span className="promo-price-original">{formatVnd(r.original_price)}</span>
                            )}
                            <span className="promo-price-sale">
                              {formatVnd(r.sale_price ?? r.original_price) || '—'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="d-flex flex-column gap-1">
                            {statusBadge(r.status)}
                            <Form.Select
                              size="sm"
                              value={r.status}
                              disabled={updatingRegId === r.id}
                              onChange={(e) => handleUpdateRegistration(r.id, e.target.value)}
                              style={{ maxWidth: 150 }}
                            >
                              {Object.entries(STATUS_META).map(([value, meta]) => (
                                <option key={value} value={value}>{meta.label}</option>
                              ))}
                            </Form.Select>
                          </div>
                        </td>
                        <td>
                          {r.created_at
                            ? new Date(r.created_at).toLocaleString('vi-VN')
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </section>
        )}

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

                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Giá gốc (VNĐ)</Form.Label>
                    <Form.Control
                      type="number"
                      min={0}
                      step={1000}
                      value={courseForm.original_price}
                      onChange={(e) => setCourseForm({ ...courseForm, original_price: e.target.value })}
                      placeholder="1500000"
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Loại giảm giá</Form.Label>
                    <Form.Select
                      value={courseForm.discount_type}
                      onChange={(e) => setCourseForm({
                        ...courseForm,
                        discount_type: e.target.value,
                        discount_value: e.target.value === 'none' ? '' : courseForm.discount_value,
                      })}
                    >
                      <option value="none">Không giảm</option>
                      <option value="percent">Phần trăm (%)</option>
                      <option value="fixed">Số tiền cố định</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>
                      {courseForm.discount_type === 'percent' ? 'Giá trị giảm (%)' : 'Giá trị giảm (VNĐ)'}
                    </Form.Label>
                    <Form.Control
                      type="number"
                      min={0}
                      step={courseForm.discount_type === 'percent' ? 1 : 1000}
                      disabled={courseForm.discount_type === 'none'}
                      value={courseForm.discount_value}
                      onChange={(e) => setCourseForm({ ...courseForm, discount_value: e.target.value })}
                      placeholder={courseForm.discount_type === 'percent' ? '20' : '500000'}
                    />
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <div className="promo-price-block border rounded p-3 bg-light">
                    <div className="small text-muted mb-1">Xem trước giá</div>
                    {courseForm.original_price ? (
                      <>
                        {previewSaved > 0 && (
                          <span className="promo-price-original me-2">
                            {formatVnd(courseForm.original_price)}
                          </span>
                        )}
                        <span className="promo-price-sale me-2">
                          {formatVnd(previewSalePrice)}
                        </span>
                        {previewSaved > 0 && (
                          <span className="promo-price-discount">
                            Tiết kiệm {formatVnd(previewSaved)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted">Nhập giá gốc để xem giá bán</span>
                    )}
                  </div>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Cho phép đăng ký</Form.Label>
                    <Form.Check
                      type="switch"
                      id="course-registration"
                      label={courseForm.registration_enabled ? 'Đang mở đăng ký' : 'Tạm dừng đăng ký'}
                      checked={courseForm.registration_enabled}
                      onChange={(e) => setCourseForm({
                        ...courseForm,
                        registration_enabled: e.target.checked,
                      })}
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

        {/* Register modal */}
        <Modal show={showRegisterModal} onHide={() => setShowRegisterModal(false)} centered>
          <Modal.Header closeButton>
            <Modal.Title>Đăng ký khóa học</Modal.Title>
          </Modal.Header>
          <Form onSubmit={submitRegister}>
            <Modal.Body>
              {registerCourseItem && (
                <p className="mb-3">
                  <strong>{registerCourseItem.title}</strong>
                  {registerCourseItem.sale_price != null || registerCourseItem.original_price != null ? (
                    <span className="ms-2 text-muted">
                      {formatVnd(registerCourseItem.sale_price ?? registerCourseItem.original_price)}
                    </span>
                  ) : null}
                </p>
              )}
              {formError && <Alert variant="danger" className="py-2">{formError}</Alert>}
              <Row className="g-3">
                {(isTeacher || isAdmin) && (
                  <Col xs={12}>
                    <Form.Group>
                      <Form.Label>
                        Chọn học viên{isTeacher ? ' *' : ' (tuỳ chọn)'}
                      </Form.Label>
                      <Form.Select
                        value={registerForm.student_user_id}
                        required={isTeacher}
                        onChange={(e) => onSelectStudent(e.target.value)}
                      >
                        <option value="">
                          {isAdmin ? '— Không chọn / đăng ký thủ công —' : '— Chọn học viên —'}
                        </option>
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.fullname}{s.code ? ` (${s.code})` : ''}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                )}
                {isAdmin && !registerForm.student_user_id && (
                  <Col xs={12}>
                    <Form.Group>
                      <Form.Label>Họ tên học viên</Form.Label>
                      <Form.Control
                        value={registerForm.fullname}
                        onChange={(e) => setRegisterForm({ ...registerForm, fullname: e.target.value })}
                        placeholder="Nhập họ tên nếu không chọn trong danh sách"
                      />
                    </Form.Group>
                  </Col>
                )}
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Số điện thoại</Form.Label>
                    <Form.Control
                      value={registerForm.phone}
                      onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                      placeholder="09xxxxxxx"
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Zalo</Form.Label>
                    <Form.Control
                      value={registerForm.zalo}
                      onChange={(e) => setRegisterForm({ ...registerForm, zalo: e.target.value })}
                      placeholder="Số Zalo"
                    />
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <Form.Group>
                    <Form.Label>Ghi chú</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      value={registerForm.note}
                      onChange={(e) => setRegisterForm({ ...registerForm, note: e.target.value })}
                      placeholder="Thời gian liên hệ, nhu cầu học..."
                    />
                  </Form.Group>
                </Col>
              </Row>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowRegisterModal(false)}>Hủy</Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? <Spinner size="sm" /> : 'Gửi đăng ký'}
              </Button>
            </Modal.Footer>
          </Form>
        </Modal>
      </div>
    </LoadingOverlay>
  );
}
