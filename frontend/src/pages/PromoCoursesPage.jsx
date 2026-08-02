import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Button, Carousel, Col, Form, Modal, Row, Spinner, Table,
} from 'react-bootstrap';
import { promoService } from '../services';
import { useAuth } from '../context/AuthContext';
import { getUserScope, isScopedAdmin, isSuperAdmin, scopeLabel } from '../utils/adminScope';
import { getAvatarUrl } from '../utils/avatar';
import LoadingOverlay from '../components/common/LoadingOverlay';

export const CATEGORY_OPTIONS = [
  { value: 'Tiếng Anh', label: 'Tiếng Anh', icon: 'bi-translate' },
  { value: 'Tiếng Trung', label: 'Tiếng Trung', icon: 'bi-chat-square-text' },
  { value: 'Tin học văn phòng', label: 'Tin học văn phòng', icon: 'bi-file-earmark-spreadsheet' },
  { value: 'Lập trình', label: 'Lập trình', icon: 'bi-code-slash' },
  { value: 'Kỹ năng mềm', label: 'Kỹ năng mềm', icon: 'bi-people' },
  { value: 'Luyện thi', label: 'Luyện thi', icon: 'bi-mortarboard' },
  { value: 'Khóa học thiếu nhi', label: 'Khóa học thiếu nhi', icon: 'bi-stars' },
];

const emptyBanner = {
  title: '',
  subtitle: '',
  cta_label: 'Khám phá khóa học',
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
  category: 'Tiếng Anh',
  instructor_name: '',
  duration_label: '20 buổi',
  level_label: 'Cơ bản',
  rating: '5.0',
  student_count: '0',
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

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu */
function normalizeSearch(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function instructorInitials(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'LH';
  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase() || 'LH';
}

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function PromoCardPrice({ course }) {
  const original = course.original_price != null && course.original_price !== ''
    ? Number(course.original_price)
    : null;
  if (original == null || !Number.isFinite(original) || original <= 0) {
    return (
      <div className="promo-mkt-card-price">
        <span className="promo-mkt-card-price-sale">Liên hệ tư vấn</span>
      </div>
    );
  }
  const sale = course.sale_price != null
    ? Number(course.sale_price)
    : computeSalePrice(course.original_price, course.discount_type, course.discount_value);
  const discounted = sale != null && sale < original;
  const label = getDiscountLabel(course);

  return (
    <div className="promo-mkt-card-price">
      <span className="promo-mkt-card-price-sale">{formatVnd(discounted ? sale : original)}</span>
      {discounted && <span className="promo-mkt-card-price-original">{formatVnd(original)}</span>}
      {label && <span className="promo-mkt-card-price-off">{label}</span>}
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
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
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
      category: item.category || 'Tiếng Anh',
      instructor_name: item.instructor_name || '',
      duration_label: item.duration_label || '20 buổi',
      level_label: item.level_label || 'Cơ bản',
      rating: item.rating != null ? String(item.rating) : '5.0',
      student_count: item.student_count != null ? String(item.student_count) : '0',
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
    if (!canRegister || !isRegistrationOpen(course)) return;
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

  const categoryCounts = useMemo(() => {
    const map = {};
    CATEGORY_OPTIONS.forEach((opt) => { map[opt.value] = 0; });
    activeCourses.forEach((c) => {
      if (c.category && map[c.category] !== undefined) map[c.category] += 1;
    });
    return map;
  }, [activeCourses]);

  const filteredCourses = useMemo(() => {
    let list = activeCourses;
    if (categoryFilter !== 'all') {
      list = list.filter((c) => (c.category || '') === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = normalizeSearch(searchQuery);
      list = list.filter((c) => normalizeSearch(c.title).includes(q));
    }
    return list;
  }, [activeCourses, categoryFilter, searchQuery]);

  const branchHint = lockedScope
    ? `Nội dung nhánh ${scopeLabel(lockedScope)}`
    : isSuper
      ? 'Admin tối cao — lọc HG / EG / Tất cả'
      : 'Khóa học theo nhánh của bạn';

  const heroSlides = activeBanners.length > 0
    ? activeBanners.map((b) => ({
      key: `banner-${b.id}`,
      banner: b,
      tag: 'LHG EDUCATION',
      title: b.title,
      subtitle: b.subtitle,
      ctaLabel: b.cta_label || 'Khám phá khóa học',
      ctaLink: b.link_url || '#promo-courses',
      image: b.image_url ? mediaUrl(b.image_url) : null,
    }))
    : [{
      key: 'default',
      banner: null,
      tag: 'NỀN TẢNG HỌC TẬP LHG',
      title: 'Học đúng kỹ năng\nVững bước tương lai',
      subtitle: 'Nền tảng học tập LHG Education đồng hành cùng bạn trên con đường chinh phục tri thức — học mọi lúc, mọi nơi, cùng đội ngũ giảng viên giàu kinh nghiệm.',
      ctaLabel: 'Khám phá khóa học',
      ctaLink: '#promo-courses',
      image: null,
    }];

  return (
    <LoadingOverlay loading={loading && banners.length === 0 && courses.length === 0} minHeight={360}>
      <div className="promo-page">
        {(error || successMsg) && (
          <div className="promo-mkt-alerts">
            {error && <Alert variant="danger">{error}</Alert>}
            {successMsg && (
              <Alert variant="success" dismissible onClose={() => setSuccessMsg('')}>
                {successMsg}
              </Alert>
            )}
          </div>
        )}

        {/* A. Local top bar */}
        <div className="promo-mkt-topbar">
          <div className="promo-mkt-topbar-inner">
            <div className="promo-mkt-brand">
              <span className="promo-mkt-brand-icon"><i className="bi bi-mortarboard-fill" /></span>
              <span className="promo-mkt-brand-text">LHG Education</span>
            </div>
            <nav className="promo-mkt-nav">
              <a href="#promo-courses">Khóa học</a>
              <a href="#promo-values">Lộ trình</a>
              <a href="#promo-categories">Giảng viên</a>
              <a href="#promo-values">Về chúng tôi</a>
            </nav>
            <div className="promo-mkt-search">
              <i className="bi bi-search" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm khóa học..."
              />
            </div>
            <div className="promo-mkt-topbar-actions">
              {isSuper && (
                <div className="promo-mkt-scope-tabs" role="group" aria-label="Lọc theo nhánh">
                  {[
                    { value: 'all', label: 'Tất cả' },
                    { value: 'HG', label: 'HG' },
                    { value: 'EG', label: 'EG' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`promo-mkt-scope-tab${filterScope === opt.value ? ' is-active' : ''}`}
                      onClick={() => setFilterScope(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
              {isAdmin && (
                <button
                  type="button"
                  className="promo-mkt-admin-btn"
                  onClick={() => scrollToId('promo-admin-panel')}
                >
                  <i className="bi bi-gear-fill" />
                  Quản trị
                </button>
              )}
            </div>
          </div>
        </div>

        {/* B. Hero slider */}
        <section className="promo-mkt-hero" id="promo-hero">
          <div className="promo-mkt-hero-pattern" aria-hidden="true" />
          <Carousel
            className="promo-mkt-hero-carousel"
            indicators={heroSlides.length > 1}
            controls={heroSlides.length > 1}
            interval={7000}
          >
            {heroSlides.map((slide) => (
              <Carousel.Item key={slide.key}>
                <div className="promo-mkt-hero-inner">
                  <div className="promo-mkt-hero-copy">
                    <span className="promo-mkt-hero-tag">{slide.tag}</span>
                    <h1 className="promo-mkt-hero-title">
                      {slide.title.split('\n').map((line, i) => (
                        <span className="promo-mkt-hero-title-line" key={`${slide.key}-line-${i}`}>{line}</span>
                      ))}
                    </h1>
                    {slide.subtitle && <p className="promo-mkt-hero-sub">{slide.subtitle}</p>}
                    <div className="promo-mkt-hero-actions">
                      <a
                        href={slide.ctaLink}
                        className="promo-mkt-btn promo-mkt-btn-yellow"
                        target={slide.ctaLink.startsWith('http') ? '_blank' : undefined}
                        rel={slide.ctaLink.startsWith('http') ? 'noreferrer' : undefined}
                        onClick={slide.ctaLink === '#promo-courses'
                          ? (e) => { e.preventDefault(); scrollToId('promo-courses'); }
                          : undefined}
                      >
                        {slide.ctaLabel}
                        <i className="bi bi-arrow-right" />
                      </a>
                      <a
                        href="#promo-values"
                        className="promo-mkt-btn promo-mkt-btn-outline"
                        onClick={(e) => { e.preventDefault(); scrollToId('promo-values'); }}
                      >
                        Xem lộ trình học
                      </a>
                    </div>
                    {isAdmin && slide.banner && (
                      <div className="promo-mkt-hero-admin">
                        {branchBadge(slide.banner.branch_scope)}
                        <Button size="sm" variant="light" onClick={() => openEditBanner(slide.banner)}>
                          <i className="bi bi-pencil" /> Sửa
                        </Button>
                        <Button size="sm" variant="outline-danger" onClick={() => handleDeleteBanner(slide.banner)}>
                          <i className="bi bi-trash" /> Xóa
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="promo-mkt-hero-visual" aria-hidden="true">
                    <div
                      className="promo-mkt-hero-phone"
                      style={slide.image ? { backgroundImage: `url(${slide.image})` } : undefined}
                    >
                      {!slide.image && (
                        <>
                          <i className="bi bi-mortarboard-fill" />
                          <span>LHG</span>
                        </>
                      )}
                    </div>
                    <div className="promo-mkt-stat-card promo-mkt-stat-card--a">
                      <i className="bi bi-journal-bookmark-fill" />
                      <div>
                        <strong>50+</strong>
                        <span>Khóa học</span>
                      </div>
                    </div>
                    <div className="promo-mkt-stat-card promo-mkt-stat-card--b">
                      <i className="bi bi-people-fill" />
                      <div>
                        <strong>1.200+</strong>
                        <span>Học viên</span>
                      </div>
                    </div>
                    <div className="promo-mkt-stat-card promo-mkt-stat-card--c">
                      <i className="bi bi-patch-check-fill" />
                      <div>
                        <strong>100%</strong>
                        <span>Chứng nhận</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Carousel.Item>
            ))}
          </Carousel>
        </section>

        <p className="promo-mkt-branch-hint">{branchHint}</p>

        {/* C. Categories */}
        <section className="promo-mkt-categories" id="promo-categories">
          <div className="promo-mkt-section-head">
            <span className="promo-mkt-eyebrow">Danh mục học tập</span>
            <h2>Khám phá theo danh mục</h2>
            <p>Chọn lĩnh vực phù hợp với mục tiêu của bạn</p>
          </div>
          <div className="promo-mkt-category-grid">
            <button
              type="button"
              className={`promo-mkt-category-card${categoryFilter === 'all' ? ' is-active' : ''}`}
              onClick={() => { setCategoryFilter('all'); scrollToId('promo-courses'); }}
            >
              <span className="promo-mkt-category-icon"><i className="bi bi-grid-fill" /></span>
              <span className="promo-mkt-category-label">Tất cả</span>
              <span className="promo-mkt-category-count">{activeCourses.length} khóa học</span>
            </button>
            {CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`promo-mkt-category-card${categoryFilter === opt.value ? ' is-active' : ''}`}
                onClick={() => { setCategoryFilter(opt.value); scrollToId('promo-courses'); }}
              >
                <span className="promo-mkt-category-icon"><i className={`bi ${opt.icon}`} /></span>
                <span className="promo-mkt-category-label">{opt.label}</span>
                <span className="promo-mkt-category-count">{categoryCounts[opt.value] || 0} khóa học</span>
              </button>
            ))}
          </div>
        </section>

        {/* D. Slim promo strip */}
        <section className="promo-mkt-strip">
          <div className="promo-mkt-strip-inner">
            <span className="promo-mkt-strip-text">
              <i className="bi bi-gift-fill" />
              Giảm đến 40% học phí cho khóa học mới trong tháng
            </span>
            <button
              type="button"
              className="promo-mkt-strip-btn"
              onClick={() => scrollToId('promo-courses')}
            >
              Đăng ký ngay
            </button>
          </div>
        </section>

        {/* E. Popular courses */}
        <section className="promo-mkt-courses" id="promo-courses">
          <div className="promo-mkt-section-head">
            <span className="promo-mkt-eyebrow">Chương trình học</span>
            <h2>Khóa học phổ biến</h2>
            <p>Được đông đảo học viên LHG Education lựa chọn</p>
          </div>

          {isAdmin && (
            <div className="promo-mkt-admin-toolbar">
              <Button size="sm" variant="outline-primary" onClick={openCreateBanner}>
                <i className="bi bi-image me-1" />
                Thêm banner
              </Button>
              <Button size="sm" variant="primary" onClick={openCreateCourse}>
                <i className="bi bi-plus-lg me-1" />
                Thêm khóa học
              </Button>
            </div>
          )}

          {filteredCourses.length === 0 ? (
            <div className="promo-mkt-empty">
              <i className="bi bi-journal-richtext" />
              <p>
                {searchQuery || categoryFilter !== 'all'
                  ? 'Không tìm thấy khóa học phù hợp.'
                  : `Chưa có khóa học quảng bá${isAdmin ? ' — bấm "Thêm khóa học" để đăng.' : '.'}`}
              </p>
            </div>
          ) : (
            <div className="promo-mkt-course-grid">
              {filteredCourses.map((c) => (
                <article className="promo-mkt-course-card" key={c.id}>
                  <div
                    className="promo-mkt-card-thumb"
                    style={c.image_url ? { backgroundImage: `url(${mediaUrl(c.image_url)})` } : undefined}
                  >
                    {!c.image_url && <i className="bi bi-mortarboard" />}
                    <span className="promo-mkt-card-chip">{c.category || 'LHG'}</span>
                    <span className="promo-mkt-card-heart" aria-hidden="true">
                      <i className="bi bi-heart" />
                    </span>
                    {isAdmin && (
                      <div className="promo-mkt-card-admin">
                        <button type="button" title="Sửa" onClick={() => openEditCourse(c)}>
                          <i className="bi bi-pencil-fill" />
                        </button>
                        <button type="button" title="Xóa" onClick={() => handleDeleteCourse(c)}>
                          <i className="bi bi-trash-fill" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="promo-mkt-card-body">
                    <h3 className="promo-mkt-card-title">{c.title}</h3>
                    <div className="promo-mkt-card-instructor">
                      <span className="promo-mkt-card-avatar">{instructorInitials(c.instructor_name)}</span>
                      <span className="promo-mkt-card-instructor-name">
                        {c.instructor_name || 'Giảng viên LHG'}
                      </span>
                    </div>
                    <div className="promo-mkt-card-stats">
                      <span><i className="bi bi-star-fill" /> {Number(c.rating ?? 5).toFixed(1)}</span>
                      <span><i className="bi bi-people-fill" /> {Number(c.student_count ?? 0).toLocaleString('vi-VN')}</span>
                    </div>
                    <div className="promo-mkt-card-meta">
                      <span><i className="bi bi-clock-fill" /> {c.duration_label || '—'}</span>
                      <span className="promo-mkt-card-level">{c.level_label || 'Cơ bản'}</span>
                    </div>
                    <PromoCardPrice course={c} />
                  </div>
                  <div className="promo-mkt-card-foot">
                    <button
                      type="button"
                      className="promo-mkt-card-cta"
                      disabled={!canRegister || !isRegistrationOpen(c)}
                      onClick={() => openRegister(c)}
                    >
                      <i className="bi bi-cart-plus-fill" />
                      {isRegistrationOpen(c) ? 'Đăng ký khóa học' : 'Tạm dừng đăng ký'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {isAdmin && courses.some((c) => !c.is_active) && (
            <div className="promo-mkt-inactive mt-3">
              <h6>Khóa học đang ẩn</h6>
              <ul className="list-unstyled mb-0">
                {courses.filter((c) => !c.is_active).map((c) => (
                  <li key={c.id}>
                    <span>{c.title} {branchBadge(c.branch_scope)}</span>
                    <Button size="sm" variant="link" onClick={() => openEditCourse(c)}>Sửa</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* F. Values */}
        <section className="promo-mkt-values" id="promo-values">
          <div className="promo-mkt-section-head">
            <span className="promo-mkt-eyebrow">Vì sao chọn LHG</span>
            <h2>Giá trị chúng tôi mang lại</h2>
          </div>
          <div className="promo-mkt-values-grid">
            <div className="promo-mkt-value-card">
              <span className="promo-mkt-value-icon"><i className="bi bi-person-video3" /></span>
              <h3>Giảng viên chất lượng</h3>
              <p>Đội ngũ giảng viên giàu kinh nghiệm, tận tâm đồng hành cùng học viên.</p>
            </div>
            <div className="promo-mkt-value-card">
              <span className="promo-mkt-value-icon"><i className="bi bi-patch-check" /></span>
              <h3>Chứng nhận uy tín</h3>
              <p>Chứng nhận hoàn thành khóa học được công nhận rộng rãi.</p>
            </div>
            <div className="promo-mkt-value-card">
              <span className="promo-mkt-value-icon"><i className="bi bi-laptop" /></span>
              <h3>Học mọi lúc mọi nơi</h3>
              <p>Linh hoạt thời gian học tập trên mọi thiết bị, mọi địa điểm.</p>
            </div>
            <div className="promo-mkt-value-card">
              <span className="promo-mkt-value-icon"><i className="bi bi-headset" /></span>
              <h3>Hỗ trợ tận tâm</h3>
              <p>Đội ngũ hỗ trợ luôn sẵn sàng giải đáp thắc mắc của bạn.</p>
            </div>
          </div>
        </section>

        {/* G. Admin panel: banner CRUD, course CRUD, registrations */}
        {isAdmin && (
          <section className="promo-mkt-admin-panel" id="promo-admin-panel">
            <div className="promo-mkt-section-head">
              <span className="promo-mkt-eyebrow">Khu vực quản trị</span>
              <h2>Quản lý nội dung quảng bá</h2>
            </div>

            <div className="promo-mkt-panel-card">
              <div className="promo-mkt-panel-card-head">
                <h6>Banner ưu đãi</h6>
                <Button size="sm" variant="outline-primary" onClick={openCreateBanner}>
                  <i className="bi bi-image me-1" />
                  Thêm banner
                </Button>
              </div>
              {banners.length === 0 ? (
                <p className="text-muted small mb-0">Chưa có banner nào.</p>
              ) : (
                <ul className="list-unstyled mb-0 promo-mkt-panel-list">
                  {banners.map((b) => (
                    <li key={b.id}>
                      <span>
                        {b.title} {branchBadge(b.branch_scope)}
                        {!b.is_active && <Badge bg="warning" text="dark" className="ms-1">Ẩn</Badge>}
                      </span>
                      <div className="d-flex gap-2">
                        <Button size="sm" variant="link" onClick={() => openEditBanner(b)}>Sửa</Button>
                        <Button size="sm" variant="link" className="text-danger" onClick={() => handleDeleteBanner(b)}>Xóa</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="promo-mkt-panel-card">
              <div className="promo-mkt-panel-card-head">
                <h6>Đăng ký khóa học</h6>
              </div>
              {registrations.length === 0 ? (
                <p className="text-muted small mb-0">Chưa có yêu cầu đăng ký nào.</p>
              ) : (
                <div className="table-responsive">
                  <Table hover size="sm" className="align-middle mb-0 promo-mkt-regs-table">
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
                            <div className="promo-mkt-card-price promo-mkt-card-price--table">
                              {r.original_price != null && r.sale_price != null
                                && Number(r.sale_price) < Number(r.original_price) && (
                                <span className="promo-mkt-card-price-original">{formatVnd(r.original_price)}</span>
                              )}
                              <span className="promo-mkt-card-price-sale">
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
            </div>
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
                      <img src={bannerPreview} alt="Preview" className="promo-mkt-form-preview mt-2" />
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
                    <Form.Label>Danh mục</Form.Label>
                    <Form.Select
                      value={courseForm.category}
                      onChange={(e) => setCourseForm({ ...courseForm, category: e.target.value })}
                    >
                      {CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Giảng viên</Form.Label>
                    <Form.Control
                      value={courseForm.instructor_name}
                      onChange={(e) => setCourseForm({ ...courseForm, instructor_name: e.target.value })}
                      placeholder="VD: Nguyễn Văn A"
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Thời lượng</Form.Label>
                    <Form.Control
                      value={courseForm.duration_label}
                      onChange={(e) => setCourseForm({ ...courseForm, duration_label: e.target.value })}
                      placeholder="VD: 20 buổi"
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Cấp độ</Form.Label>
                    <Form.Control
                      value={courseForm.level_label}
                      onChange={(e) => setCourseForm({ ...courseForm, level_label: e.target.value })}
                      placeholder="VD: Cơ bản"
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Đánh giá (0-5)</Form.Label>
                    <Form.Control
                      type="number"
                      min={0}
                      max={5}
                      step={0.1}
                      value={courseForm.rating}
                      onChange={(e) => setCourseForm({ ...courseForm, rating: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Số học viên</Form.Label>
                    <Form.Control
                      type="number"
                      min={0}
                      value={courseForm.student_count}
                      onChange={(e) => setCourseForm({ ...courseForm, student_count: e.target.value })}
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
                  <div className="promo-mkt-form-preview-price">
                    <div className="small text-muted mb-1">Xem trước giá</div>
                    {courseForm.original_price ? (
                      <>
                        {previewSaved > 0 && (
                          <span className="promo-mkt-card-price-original me-2">
                            {formatVnd(courseForm.original_price)}
                          </span>
                        )}
                        <span className="promo-mkt-card-price-sale me-2">
                          {formatVnd(previewSalePrice)}
                        </span>
                        {previewSaved > 0 && (
                          <span className="promo-mkt-card-price-off">
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
                      <img src={coursePreview} alt="Preview" className="promo-mkt-form-preview mt-2" />
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
