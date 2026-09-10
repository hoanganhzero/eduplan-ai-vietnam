"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ELearningModule } from "./elearning";
import { ClassroomPresentationStudio } from "./classroom-presentation";
import { AssignmentComposer, type AssignmentAttachment } from "./assignment-composer";
import { AssessmentStudio } from "./assessment-studio";
import { LessonAiStudio } from "./lesson-studio";

type Role = "admin" | "teacher" | "student" | "parent";
type SessionAccount = {
  accountKey: string;
  email?: string | null;
  username?: string | null;
  name: string;
  role: Role;
  status: string;
  avatarUrl?: string | null;
  phone?: string | null;
  bio?: string | null;
  hasPassword?: boolean;
};
type ManagedAccount = {
  accountKey: string;
  email?: string | null;
  username?: string | null;
  name: string;
  role: Role;
  status: "active" | "pending" | "locked";
  avatarUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
  hasPassword?: boolean;
  passwordResetRequestedAt?: string | null;
  passwordChangedAt?: string | null;
};
type Modal =
  | "assignment"
  | "class"
  | "submit"
  | "register"
  | "process"
  | null;
type ClassMember = { key: string; name: string; joinedAt?: string };
type WorkspaceMessage = {
  id: string;
  fromKey: string;
  fromName: string;
  fromRole: string;
  toKey: string;
  toName: string;
  body: string;
  time: string;
  readBy?: string[];
};
type AttendanceSession = {
  id: string;
  classId: number;
  className: string;
  date: string;
  absentKeys: string[];
  total: number;
  takenBy?: string;
};
type ParentLink = { studentKey: string; studentName: string; parentName?: string };
type AssessmentResult = {
  id: string;
  assessmentId: string;
  studentKey: string;
  studentName: string;
  score: number;
  total: number;
  essayPending?: boolean;
  submittedAt?: string;
  answers?: Record<string, unknown>;
};
type User = {
  id: number;
  name: string;
  role: string;
  detail: string;
  status: "Đang hoạt động" | "Chờ duyệt" | "Đã khóa";
};
type Assignment = {
  id: number;
  title: string;
  subject: string;
  className: string;
  due: string;
  progress: string;
  status: string;
  contentHtml?: string;
  attachments?: AssignmentAttachment[];
  maxScore?: string;
};
type Workspace = {
  users: User[];
  assignments: Assignment[];
  classes: {
    id: number;
    name: string;
    subject: string;
    students: number;
    code: string;
    progress: number;
    ownerKey?: string;
    ownerName?: string;
    members?: ClassMember[];
  }[];
  notifications: {
    id: number;
    title: string;
    body: string;
    audience: string;
    time: string;
    read: boolean;
    senderName?: string;
    readBy?: string[];
  }[];
  settings: {
    openai: boolean;
    zalo: boolean;
    autoNotify: boolean;
    maintenance: boolean;
  };
  assessments: Array<Record<string, unknown>>;
  assessmentResults: AssessmentResult[];
  submissionRecords: {
    id: string;
    assignmentId: string;
    contentHtml?: string;
    attachments?: AssignmentAttachment[];
    studentKey?: string;
    studentName?: string;
    status?: string;
    submittedAt?: string;
    score?: string;
    feedback?: string;
  }[];
  messages: WorkspaceMessage[];
  attendanceSessions: AttendanceSession[];
  parentLinks: Record<string, ParentLink>;
  lessonPlans: Array<Record<string, unknown>>;
  examMatrices: Array<Record<string, unknown>>;
  submissions: number;
  attendance: number;
};

const initialWorkspace: Workspace = {
  users: [],
  classes: [],
  assignments: [],
  notifications: [],
  assessments: [],
  assessmentResults: [],
  settings: {
    openai: false,
    zalo: false,
    autoNotify: false,
    maintenance: false,
  },
  submissionRecords: [],
  messages: [],
  attendanceSessions: [],
  parentLinks: {},
  lessonPlans: [],
  examMatrices: [],
  submissions: 0,
  attendance: 0,
};

function normalizeWorkspace(value: unknown): Workspace {
  if (!value || typeof value !== "object") return initialWorkspace;
  const source = value as Partial<Workspace>;
  const demoCodes = new Set(["VAN10A1", "HDTN11A2", "GDDP12A3"]);
  const demoTitles = new Set(["Phân tích nhân vật Đăm Săn", "Phiếu học tập: Sử thi", "Dự án nghề nghiệp tương lai"]);
  const records = Array.isArray(source.submissionRecords) ? source.submissionRecords : [];
  return {
    users: (source.users || []).filter((item) => !["Tổ Ngữ văn", "Lớp 10A1", "PH em Lê Gia Huy"].includes(item.detail)),
    classes: (source.classes || []).filter((item) => !demoCodes.has(item.code)),
    assignments: (source.assignments || []).filter((item) => !demoTitles.has(item.title)),
    notifications: (source.notifications || []).filter((item) => !["Nhắc hạn nộp bài", "Kết quả học tập tuần 1", "Lịch họp chuyên môn"].includes(item.title)),
    settings: { ...initialWorkspace.settings, ...(source.settings || {}) },
    assessments: Array.isArray(source.assessments) ? source.assessments : [],
    assessmentResults: Array.isArray(source.assessmentResults) ? source.assessmentResults : [],
    submissionRecords: records,
    messages: Array.isArray(source.messages) ? source.messages : [],
    attendanceSessions: Array.isArray(source.attendanceSessions) ? source.attendanceSessions : [],
    parentLinks: source.parentLinks && typeof source.parentLinks === "object" ? source.parentLinks : {},
    lessonPlans: Array.isArray(source.lessonPlans) ? source.lessonPlans : [],
    examMatrices: Array.isArray(source.examMatrices) ? source.examMatrices : [],
    submissions: records.length,
    attendance: Number(source.attendance || 0),
  };
}

const roleMeta: Record<
  Role,
  {
    label: string;
    welcome: string;
    subtitle: string;
    color: string;
    menu: string[];
  }
> = {
  admin: {
    label: "Quản trị",
    welcome: "Trung tâm điều hành",
    subtitle: "Giám sát người dùng, lớp học, nội dung và tích hợp hệ thống.",
    color: "#155eef",
    menu: ["Tổng quan", "Người dùng", "Lớp học", "Nội dung", "Thông báo", "Trao đổi", "Cấu hình"],
  },
  teacher: {
    label: "Giáo viên",
    welcome: "Chào thầy Hoàng Anh",
    subtitle: "Quản lý lớp, soạn giảng bằng AI, giao bài và đánh giá học sinh.",
    color: "#0891b2",
    menu: ["Tổng quan", "Lớp của tôi", "eLearning tại nhà", "Trình chiếu trên lớp", "Luyện tập & kiểm tra", "AI soạn giảng", "Bài tập", "Chấm bài", "Thông báo", "Trao đổi"],
  },
  student: {
    label: "Học sinh",
    welcome: "Chào Gia Huy",
    subtitle: "Học tập, nộp bài, xem phản hồi và theo dõi tiến độ cá nhân.",
    color: "#2563eb",
    menu: ["Tổng quan", "Học trực tuyến", "Luyện tập & kiểm tra", "Lớp học", "Bài tập", "Học liệu", "Kết quả", "Thông báo"],
  },
  parent: {
    label: "Phụ huynh",
    welcome: "Chào cô Lan",
    subtitle:
      "Đồng hành cùng con qua kết quả, chuyên cần và thông báo từ nhà trường.",
    color: "#6d5dfb",
    menu: [
      "Tổng quan",
      "Kết quả của con",
      "Chuyên cần",
      "Thông báo",
      "Trao đổi",
    ],
  },
};

export default function Home() {
  const [role, setRole] = useState<Role>("teacher");
  const [view, setView] = useState("Tổng quan");
  const [data, setData] = useState<Workspace>(initialWorkspace);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [session, setSession] = useState<{
    authenticated: boolean;
    account: SessionAccount | null;
    authSource?: string;
    passwordResetVerified?: boolean;
  } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ManagedAccount | null>(
    null,
  );
  const [attendanceClass, setAttendanceClass] = useState<Workspace["classes"][number] | null>(null);
  const [qrClass, setQrClass] = useState<Workspace["classes"][number] | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [services, setServices] = useState<Record<string, boolean>>({});
  const notify = useCallback((message: string, tone?: "success" | "error") => {
    const resolved =
      tone ??
      (/^(Không thể|Chưa thể|Vui lòng|Hãy |Lỗi|Máy chủ|Mật khẩu|Ảnh đại diện)/.test(message)
        ? "error"
        : "success");
    setToast({ message, tone: resolved });
    window.setTimeout(() => setToast(null), resolved === "error" ? 3400 : 2600);
  }, []);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const demo = params.get("demo") as Role | null;
      if (
        window.location.hostname === "terminal.local" &&
        demo &&
        roleMeta[demo]
      ) {
        setRole(demo);
        setSession({
          authenticated: true,
          account: {
            accountKey: `${demo}@demo.local`,
            email: `${demo}@demo.local`,
            username: demo,
            name: demo === "admin" ? "Hoàng Anh" : roleMeta[demo].label,
            role: demo,
            status: "active",
            phone: "",
            bio: "",
            hasPassword: true,
          },
        });
        setAuthLoading(false);
        return;
      }
      try {
        let result = await fetch("/api/session").then((r) => r.json());
        const requestedRole = params.get("register");
        if (
          result.authenticated &&
          !result.account &&
          requestedRole &&
          ["teacher", "student", "parent"].includes(requestedRole)
        ) {
          result = await fetch("/api/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ role: requestedRole }),
          }).then((r) => r.json());
          window.history.replaceState({}, "", "/");
        }
        if (result.account && roleMeta[result.account.role as Role])
          setRole(result.account.role as Role);
        setSession(result);
      } catch {
        setSession({ authenticated: false, account: null });
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);
  useEffect(() => {
    if (!authLoading && session?.account?.status === "active")
      Promise.all([
        fetch("/api/workspace").then(async (r) => { const result = await r.json(); if (!r.ok) throw new Error(result.error || "Không thể tải dữ liệu"); return result; }),
        fetch("/api/integrations").then((r) => r.ok ? r.json() : { services: {} }),
      ])
        .then(([result, integrationResult]) => {
          setData(normalizeWorkspace(result.data));
          setServices(integrationResult.services || {});
        })
        .catch((error) => notify(error instanceof Error ? error.message : "Không thể tải dữ liệu"))
        .finally(() => setLoading(false));
    else if (!authLoading) queueMicrotask(() => setLoading(false));
  }, [authLoading, session]);
  useEffect(() => {
    if (
      session?.account?.role !== "admin" ||
      session.account.status !== "active"
    )
      return;
    const adminAccount = session.account;
    const demo = window.location.hostname === "terminal.local";
    if (demo) {
      queueMicrotask(() => setAccounts([
        {
          accountKey: adminAccount.accountKey,
          email: adminAccount.email,
          username: adminAccount.username,
          name: adminAccount.name,
          role: "admin",
          status: "active",
        },
        {
          accountKey: "minhchau@eduplan.vn",
          email: "minhchau@eduplan.vn",
          username: "minhchau",
          name: "Nguyễn Minh Châu",
          role: "teacher",
          status: "active",
        },
        {
          accountKey: "giahuy@eduplan.vn",
          email: "giahuy@eduplan.vn",
          username: "giahuy",
          name: "Lê Gia Huy",
          role: "student",
          status: "active",
        },
        {
          accountKey: "phthilan@eduplan.vn",
          email: "phthilan@eduplan.vn",
          username: "phthilan",
          name: "Phạm Thị Lan",
          role: "parent",
          status: "active",
        },
      ]));
      return;
    }
    queueMicrotask(() => setAccountsLoading(true));
    fetch("/api/accounts")
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        setAccounts(result.accounts || []);
      })
      .catch((e) => notify(e.message || "Không thể tải tài khoản"))
      .finally(() => setAccountsLoading(false));
  }, [notify, session]);
  const persist = async (next: Workspace, message: string) => {
    setSaving(true);
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: next }),
      });
      const result = await response.json();
      if (!response.ok || !result.saved) throw new Error(result.error || "Máy chủ chưa xác nhận lưu dữ liệu");
      setData(normalizeWorkspace(result.data || next));
      notify(message);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể lưu dữ liệu");
      return false;
    } finally {
      setSaving(false);
    }
  };
  const filteredAccounts = accounts.filter((u) =>
    (u.name + (u.email || "") + (u.username || "") + roleMeta[u.role].label)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const me = session?.account?.accountKey || "";
  const query = search.trim().toLowerCase();
  const myClasses =
    role === "student"
      ? data.classes.filter((c) => c.members?.some((m) => m.key === me))
      : data.classes;
  const childLink = role === "parent" ? data.parentLinks[me] : undefined;
  const childKey = childLink?.studentKey || "";
  const childClasses = childKey
    ? data.classes.filter((c) => c.members?.some((m) => m.key === childKey))
    : [];
  const scopeClassNames = new Set(myClasses.map((c) => c.name));
  const scopedAssignments =
    role === "student"
      ? data.assignments.filter((a) => scopeClassNames.has(a.className) || a.className === "Chưa gán lớp")
      : data.assignments;
  const visibleClasses = query
    ? myClasses.filter((c) => `${c.name} ${c.subject} ${c.code}`.toLowerCase().includes(query))
    : myClasses;
  const visibleAssignments = query
    ? scopedAssignments.filter((a) => `${a.title} ${a.subject} ${a.className}`.toLowerCase().includes(query))
    : scopedAssignments;
  const mySubmissions = new Set(
    data.submissionRecords
      .filter((record) => record.studentKey === me)
      .map((record) => record.assignmentId),
  );
  const visibleNotifications = data.notifications.filter((n) =>
    role === "admin" || role === "teacher"
      ? true
      : role === "student"
        ? !n.audience || n.audience === "Toàn trung tâm" || scopeClassNames.has(n.audience)
        : !n.audience || n.audience === "Toàn trung tâm" || childClasses.some((c) => c.name === n.audience),
  );
  const unreadNotifications = visibleNotifications.filter(
    (n) => !n.read && !(n.readBy || []).includes(me),
  ).length;
  const childRecords = data.submissionRecords.filter((record) => record.studentKey === childKey);
  const childGraded = childRecords.filter((record) => record.score !== undefined && record.score !== "");
  const childExamResults = data.assessmentResults.filter((result) => result.studentKey === childKey);
  const childSessions = data.attendanceSessions.filter((s) => childClasses.some((c) => c.id === s.classId));
  const childAbsent = childSessions.filter((s) => s.absentKeys.includes(childKey)).length;
  const attendancePercent = childSessions.length
    ? Math.round(((childSessions.length - childAbsent) / childSessions.length) * 100)
    : null;
  const childAverage = (() => {
    const scores = [
      ...childGraded.map((record) => Number(String(record.score).replace(",", "."))).filter(Number.isFinite),
      ...childExamResults.map((result) => (result.total ? (result.score / result.total) * 10 : NaN)).filter(Number.isFinite),
    ];
    return scores.length ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10 : null;
  })();
  const metrics: (string | number)[][] =
    role === "admin"
      ? [
          ["Người dùng", accounts.length, `${accounts.filter((a) => a.status === "active").length} đang hoạt động`],
          ["Lớp đang hoạt động", data.classes.length, `${data.classes.reduce((sum, item) => sum + item.students, 0)} học sinh`],
          ["Bài tập", data.assignments.length, "Đã lưu trên Supabase"],
          ["Bài nộp", data.submissionRecords.length, "Dữ liệu thực"],
        ]
      : role === "teacher"
        ? [
            ["Lớp phụ trách", data.classes.length, `${data.classes.reduce((sum, item) => sum + item.students, 0)} học sinh`],
            ["Bài cần chấm", data.submissionRecords.filter((item) => item.status === "Đã nộp").length, "Theo bài nộp thật"],
            ["Bài tập đã giao", data.assignments.length, "Đồng bộ Supabase"],
            ["Thông báo mới", unreadNotifications, "Chưa đọc"],
          ]
        : role === "student"
          ? [
              ["Bài cần làm", scopedAssignments.filter((item) => !mySubmissions.has(String(item.id))).length, "Chưa nộp bài"],
              ["Bài đã nộp", mySubmissions.size, "Đã lưu"],
              ["Lớp đã tham gia", myClasses.length, myClasses.length ? "Theo mã lớp" : "Nhập mã để tham gia"],
              ["Thông báo", unreadNotifications, "Chưa đọc"],
            ]
          : [
              ["Điểm TB của con", childAverage ?? "—", childLink ? `${childGraded.length + childExamResults.length} bài đã chấm` : "Chưa liên kết học sinh"],
              ["Chuyên cần", attendancePercent !== null ? `${attendancePercent}%` : "—", childSessions.length ? `${childSessions.length} buổi điểm danh` : "Chưa có dữ liệu"],
              ["Bài đã nộp", childKey ? childRecords.length : "—", childLink ? `Của ${childLink.studentName}` : "Chưa liên kết"],
              ["Thông báo", unreadNotifications, "Chưa đọc"],
            ];

  const saveAccount = async (account: ManagedAccount) => {
    if (window.location.hostname === "terminal.local") {
      setAccounts((list) =>
        list.map((a) => (a.accountKey === account.accountKey ? account : a)),
      );
      setEditingAccount(null);
      notify("Đã cập nhật tài khoản");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(account),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAccounts((list) =>
        list.map((a) =>
          a.accountKey === account.accountKey ? result.account : a,
        ),
      );
      setEditingAccount(null);
      notify("Đã cập nhật tài khoản");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Không thể cập nhật tài khoản");
    } finally {
      setSaving(false);
    }
  };
  const resetAccountPassword = async (accountKey: string, newPassword: string) => {
    if (newPassword.length < 8) {
      notify("Mật khẩu mới cần ít nhất 8 ký tự");
      return false;
    }
    if (window.location.hostname === "terminal.local") {
      setAccounts((list) => list.map((account) =>
        account.accountKey === accountKey
          ? { ...account, hasPassword: true, passwordResetRequestedAt: null }
          : account,
      ));
      notify("Đã đặt mật khẩu mới cho tài khoản");
      return true;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/accounts/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountKey, newPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAccounts((list) => list.map((account) =>
        account.accountKey === accountKey ? result.account : account,
      ));
      setEditingAccount(result.account);
      notify("Đã đặt mật khẩu mới; các phiên đăng nhập cũ đã được thu hồi");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể đặt lại mật khẩu");
      return false;
    } finally {
      setSaving(false);
    }
  };
  const deleteAccount = async (accountKey: string) => {
    if (window.location.hostname === "terminal.local") {
      setAccounts((list) => list.filter((a) => a.accountKey !== accountKey));
      setEditingAccount(null);
      notify("Đã xóa tài khoản");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        `/api/accounts?accountKey=${encodeURIComponent(accountKey)}`,
        { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAccounts((list) => list.filter((a) => a.accountKey !== accountKey));
      setEditingAccount(null);
      notify("Đã xóa tài khoản");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Không thể xóa tài khoản");
    } finally {
      setSaving(false);
    }
  };
  const createAccount = async (payload: Record<string, string>) => {
    const account = {
      accountKey: (payload.email || `${payload.username}@noemail.eduplan.local`)
        .trim()
        .toLowerCase(),
      email: (payload.email || "").trim().toLowerCase() || null,
      username: (payload.username || "").trim().toLowerCase(),
      password: payload.password || "",
      name: (payload.name || "").trim(),
      role: (payload.role as Role) || "student",
      status: "active" as const,
    };
    if (!account.username || !account.name || account.password.length < 8) {
      notify("Vui lòng nhập họ tên, tên tài khoản và mật khẩu từ 8 ký tự");
      return false;
    }
    if (window.location.hostname === "terminal.local") {
      setAccounts((list) => [...list, account]);
      notify("Đã tạo tài khoản");
      return true;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(account),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAccounts((list) => [...list, result.account]);
      notify("Đã tạo tài khoản");
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Không thể tạo tài khoản");
      return false;
    } finally {
      setSaving(false);
    }
  };
  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/signout-with-chatgpt?return_to=/";
    }
  };
  const toggleSetting = (key: keyof Workspace["settings"]) =>
    persist(
      { ...data, settings: { ...data.settings, [key]: !data.settings[key] } },
      "Đã lưu cấu hình hệ thống",
    );
  const workspaceAction = async (payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.saved) throw new Error(result.error || "Máy chủ chưa xác nhận thao tác");
      setData(normalizeWorkspace(result.data));
      return result;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể thực hiện thao tác", "error");
      return null;
    } finally {
      setSaving(false);
    }
  };
  const joinClass = async (code: string) => {
    // Chuẩn hóa mã: bỏ dấu tiếng Việt, ký tự thừa và tiền tố "LỚP" nếu có.
    const cleaned = code
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .replace(/^LOP/, "");
    if (!cleaned) {
      notify("Vui lòng nhập mã lớp", "error");
      return false;
    }
    const result = await workspaceAction({ action: "join_class", code: cleaned });
    if (result) notify(result.alreadyJoined ? `Em đã ở trong lớp ${result.className}` : `Đã tham gia lớp ${result.className}`);
    return Boolean(result);
  };
  const sendMessage = async (toKey: string, body: string) => {
    const result = await workspaceAction({ action: "send_message", toKey, body });
    if (result) notify("Đã gửi tin nhắn");
    return Boolean(result);
  };
  const sendNotification = async (payload: { title: string; body: string; audience: string; zaloIds: string[] }) => {
    const notification = {
      id: Date.now(),
      title: payload.title,
      body: payload.body,
      audience: payload.audience,
      time: new Date().toLocaleString("vi-VN"),
      read: false,
      senderName: session?.account?.name,
      readBy: [me],
    };
    const ok = await persist(
      { ...data, notifications: [notification, ...data.notifications] },
      "Đã gửi thông báo trong hệ thống",
    );
    if (ok && payload.zaloIds.length) {
      try {
        const response = await fetch("/api/zalo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: payload.title, message: payload.body, userIds: payload.zaloIds }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        notify(`Đã gửi Zalo OA tới ${result.sent} người nhận`);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Không thể gửi Zalo", "error");
      }
    }
    return ok;
  };
  const linkParent = async (parent: ManagedAccount, studentKey: string) => {
    const nextLinks = { ...data.parentLinks };
    if (!studentKey) delete nextLinks[parent.accountKey];
    else {
      const student = accounts.find((a) => a.accountKey === studentKey);
      nextLinks[parent.accountKey] = {
        studentKey,
        studentName: student?.name || "Học sinh",
        parentName: parent.name,
      };
    }
    await persist(
      { ...data, parentLinks: nextLinks },
      studentKey ? "Đã liên kết phụ huynh với học sinh" : "Đã hủy liên kết phụ huynh",
    );
  };
  const contacts = (() => {
    const map = new Map<string, { key: string; name: string; note: string }>();
    if (role === "parent")
      childClasses.forEach((c) => {
        if (c.ownerKey && c.ownerKey !== me)
          map.set(c.ownerKey, { key: c.ownerKey, name: c.ownerName || "Giáo viên", note: `GV lớp ${c.name}` });
      });
    if (role === "teacher" || role === "admin")
      Object.entries(data.parentLinks).forEach(([parentKey, link]) => {
        const related = data.classes.some(
          (c) => (role === "admin" || c.ownerKey === me) && c.members?.some((m) => m.key === link.studentKey),
        );
        if (related && parentKey !== me)
          map.set(parentKey, { key: parentKey, name: link.parentName || "Phụ huynh", note: `PH em ${link.studentName}` });
      });
    data.messages.forEach((m) => {
      if (m.toKey === me && !map.has(m.fromKey))
        map.set(m.fromKey, { key: m.fromKey, name: m.fromName, note: roleMeta[m.fromRole as Role]?.label || "" });
      if (m.fromKey === me && !map.has(m.toKey)) map.set(m.toKey, { key: m.toKey, name: m.toName, note: "" });
    });
    return [...map.values()];
  })();
  // Học sinh quét mã QR (đường dẫn /?join=MÃ) sẽ được tham gia lớp ngay sau
  // khi đăng nhập thành công.
  useEffect(() => {
    if (authLoading || !session?.account || session.account.status !== "active") return;
    const params = new URLSearchParams(window.location.search);
    const join = params.get("join");
    if (!join) return;
    window.history.replaceState({}, "", "/");
    const role = session.account.role;
    queueMicrotask(() => {
      if (role === "student") {
        setView("Lớp học");
        void joinClass(join);
      } else {
        notify("Liên kết tham gia lớp chỉ dành cho tài khoản học sinh", "error");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session]);
  useEffect(() => {
    if (view !== "Thông báo" || unreadNotifications === 0) return;
    if (window.location.hostname === "terminal.local") return;
    fetch("/api/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read_notifications" }),
    })
      .then((r) => r.json())
      .then((result) => {
        if (result.saved) setData(normalizeWorkspace(result.data));
      })
      .catch(() => undefined);
  }, [view, unreadNotifications]);

  if (authLoading)
    return (
      <div className="auth-loading">
        <i />
        <p>Đang xác thực tài khoản...</p>
      </div>
    );
  if (!session?.authenticated || !session.account)
    return <PublicHome registered={Boolean(session?.authenticated)} />;
  if (session.account.status !== "active")
    return <AuthPending name={session.account.name} />;

  return (
    <main
      className={`portal ${menuOpen ? "menu-open" : ""}`}
      style={{ "--role-color": roleMeta[role].color } as React.CSSProperties}
    >
      <aside className="sidebar">
        <button
          className="mobile-sidebar-close"
          onClick={() => setMenuOpen(false)}
          aria-label="Đóng menu"
        >
          ×
        </button>
        <div className="portal-brand">
          <span>TN</span>
          <div>
            <b>Trung tâm GDNN-GDTX</b>
            <small>khu vực Tân Ninh</small>
          </div>
        </div>
        <div className="role-box">
          <small>ĐANG XEM VỚI VAI TRÒ</small>
          <b>{roleMeta[role].label}</b>
        </div>
        <nav>
          {roleMeta[role].menu.map((item) => (
            <button
              key={item}
              className={view === item ? "active" : ""}
              onClick={() => {
                setView(item);
                setMenuOpen(false);
              }}
            >
              <span>{menuIcon(item)}</span>
              {item}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <button onClick={() => setModal("process")}>
            <span>?</span>Quy trình sử dụng
          </button>
          <button onClick={() => notify("Đã mở trung tâm hỗ trợ")}>
            <span>◌</span>Trợ giúp
          </button>
          <button className="side-logout" onClick={logout}>
            <span>↗</span>Đăng xuất
          </button>
        </div>
      </aside>
      {menuOpen && (
        <button
          className="mobile-menu-backdrop"
          onClick={() => setMenuOpen(false)}
          aria-label="Đóng menu điều hướng"
        />
      )}

      <section className="portal-body">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setMenuOpen(true)}
            aria-label="Mở menu"
            aria-expanded={menuOpen}
          >
            ☰
          </button>
          <div className="top-search">
            <span>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm kiếm trong không gian làm việc"
              placeholder="Tìm lớp học, người dùng, bài tập..."
            />
          </div>
          <div className="role-identity">
            <span>Đăng nhập với vai trò</span>
            <b>{roleMeta[role].label}</b>
          </div>
          <button
            className="bell"
            onClick={() => setView("Thông báo")}
            aria-label={unreadNotifications ? `Thông báo: ${unreadNotifications} chưa đọc` : "Thông báo"}
            title={unreadNotifications ? `${unreadNotifications} thông báo chưa đọc` : "Thông báo"}
          >
            ♢{unreadNotifications > 0 && <i />}
          </button>
          <button
            className="profile"
            onClick={() => setProfileOpen(true)}
            aria-label="Mở hồ sơ cá nhân"
          >
            {session.account.avatarUrl ? (
              <img src={session.account.avatarUrl} alt="Ảnh đại diện" />
            ) : (
              <span>{initials(session.account.name)}</span>
            )}
            <div>
              <b>{session.account.name}</b>
              <small>
                @{session.account.username || "thiết-lập-tài-khoản"} ·{" "}
                {roleMeta[role].label}
              </small>
            </div>
            <em>⌄</em>
          </button>
          <button
            className="logout-button"
            onClick={logout}
            aria-label="Đăng xuất khỏi EduPlan AI"
          >
            <span>↗</span>Đăng xuất
          </button>
        </header>

        <div className="content">
          <div className={`page-head ${view === "Tổng quan" ? "overview-head" : ""}`}>
            <div>
              <span>EDUPLAN AI · {roleMeta[role].label.toUpperCase()}</span>
              <h1>{view === "Tổng quan" ? `${greeting()}, ${session.account.name}` : view}</h1>
              <p>
                {view === "Tổng quan"
                  ? roleMeta[role].subtitle
                  : descriptionFor(view)}
              </p>
            </div>
            <div className="head-actions">
              <button className="soft" onClick={() => setModal("process")}>
                Xem quy trình
              </button>
              {role === "teacher" && ["Tổng quan", "Lớp của tôi", "Bài tập", "Chấm bài"].includes(view) && (
                <button
                  className="primary"
                  onClick={() =>
                    view === "Lớp của tôi" ? setModal("class") : setModal("assignment")
                  }
                >
                  ＋ Tạo mới
                </button>
              )}
              {role === "admin" && view === "Người dùng" && (
                <button
                  className="primary"
                  onClick={() => setModal("register")}
                >
                  ＋ Thêm tài khoản
                </button>
              )}
            </div>
          </div>
          {role === "admin" && !session.account.hasPassword && (
            <div className="admin-password-banner">
              <span>🔐</span>
              <div><b>Hoàn tất đăng nhập bằng Gmail</b><small>Tài khoản này đã có quyền Admin cao nhất. Hãy tạo mật khẩu một lần để có thể đăng nhập bằng Gmail hoặc tên tài khoản.</small></div>
              <button onClick={() => setProfileOpen(true)}>Tạo mật khẩu</button>
            </div>
          )}
          {loading ? (
            <div className="loading">
              <i />
              Đang tải không gian làm việc...
            </div>
          ) : (
            <>
              {view === "Tổng quan" && (
                <Dashboard
                  role={role}
                  data={data}
                  metrics={metrics}
                  onAction={(action) =>
                    action === "lesson"
                      ? setView("AI soạn giảng")
                      : action === "assignment"
                        ? setModal("assignment")
                        : action === "submit"
                          ? setModal("submit")
                          : setView(action)
                  }
                />
              )}
              {role === "admin" && view === "Người dùng" && (
                <AccountsTable
                  accounts={filteredAccounts}
                  currentKey={session.account.accountKey}
                  loading={accountsLoading}
                  onEdit={setEditingAccount}
                />
              )}
              {role === "admin" && view === "Lớp học" && (
                <ClassesGrid
                  classes={visibleClasses}
                  admin
                />
              )}
              {role === "admin" && view === "Nội dung" && (
                <ContentModeration data={data} />
              )}
              {(role === "admin" || role === "teacher") && view === "Thông báo" && (
                <NotificationCenter
                  items={visibleNotifications}
                  me={me}
                  classes={data.classes}
                  zaloConnected={Boolean(services.zalo)}
                  onSend={sendNotification}
                />
              )}
              {(role === "admin" || role === "teacher" || role === "parent") && view === "Trao đổi" && (
                <MessagesPanel
                  me={me}
                  messages={data.messages}
                  contacts={contacts}
                  onSend={sendMessage}
                  emptyNote={
                    role === "parent"
                      ? childLink
                        ? "Chọn giáo viên phụ trách lớp của con để bắt đầu trao đổi."
                        : "Kênh trao đổi sẽ mở sau khi Admin liên kết tài khoản với học sinh."
                      : "Phụ huynh nhắn tin cho bạn sẽ xuất hiện tại đây; bạn cũng có thể chủ động nhắn cho phụ huynh đã liên kết."
                  }
                />
              )}
              {role === "student" && view === "Thông báo" && (
                <NotificationList items={visibleNotifications} me={me} />
              )}
              {role === "admin" && view === "Cấu hình" && (
                <Settings
                  data={data}
                  services={services}
                  onToggle={toggleSetting}
                />
              )}
              {role === "teacher" && view === "Lớp của tôi" && (
                <ClassesGrid
                  classes={visibleClasses}
                  onAttendance={setAttendanceClass}
                  onQr={setQrClass}
                />
              )}
              {(role === "teacher" || role === "student") && view === "Luyện tập & kiểm tra" && (
                <AssessmentStudio role={role} notify={notify} accountKey={me} />
              )}
              {role === "teacher" && view === "eLearning tại nhà" && (
                <ELearningModule role="teacher" notify={notify} />
              )}
              {role === "teacher" && view === "Trình chiếu trên lớp" && (
                <ClassroomPresentationStudio notify={notify} />
              )}
              {role === "teacher" && view === "AI soạn giảng" && (
                <LessonAiStudio
                  notify={notify}
                  plans={data.lessonPlans}
                  onSavePlan={(plan) =>
                    persist({ ...data, lessonPlans: [plan, ...data.lessonPlans] }, "Đã lưu bài dạy vào kho học liệu")
                  }
                  onDeletePlan={(id) =>
                    persist(
                      { ...data, lessonPlans: data.lessonPlans.filter((plan) => String(plan.id) !== id) },
                      "Đã xóa bài dạy khỏi kho",
                    )
                  }
                />
              )}
              {role === "teacher" && view === "Bài tập" && (
                <Assignments
                  data={visibleAssignments}
                  teacher
                  onCreate={() => setModal("assignment")}
                  onOpenSubmissions={() => setView("Chấm bài")}
                />
              )}
              {role === "teacher" && view === "Chấm bài" && (
                <Grading
                  records={data.submissionRecords}
                  assignments={data.assignments}
                  onGrade={(id, score, feedback) => persist({ ...data, submissionRecords: data.submissionRecords.map((item) => item.id === id ? { ...item, score, feedback, status: "Đã chấm" } : item) }, "Đã lưu điểm và phản hồi trên Supabase")}
                />
              )}
              {role === "student" && view === "Lớp học" && (
                <>
                  <JoinClassPanel onJoin={joinClass} busy={saving} />
                  <ClassesGrid
                    classes={visibleClasses}
                    joinNote
                  />
                </>
              )}
              {role === "student" && view === "Học trực tuyến" && (
                <ELearningModule
                  role="student"
                  notify={notify}
                  myClassNames={myClasses.map((c) => c.name)}
                  allClassNames={data.classes.map((c) => c.name)}
                />
              )}
              {role === "student" && view === "Bài tập" && (
                <Assignments
                  data={visibleAssignments}
                  submittedIds={mySubmissions}
                  onCreate={() => setModal("submit")}
                />
              )}
              {role === "student" && view === "Học liệu" && (
                <LearningResources assignments={scopedAssignments} />
              )}
              {role === "student" && view === "Kết quả" && (
                <StudentResults
                  records={data.submissionRecords.filter((item) => item.studentKey === me)}
                  assignments={data.assignments}
                  examResults={data.assessmentResults.filter((result) => result.studentKey === me)}
                  assessments={data.assessments}
                />
              )}
              {role === "parent" && view === "Kết quả của con" && (
                childLink ? (
                  <StudentResults
                    records={childRecords}
                    assignments={data.assignments}
                    examResults={childExamResults}
                    assessments={data.assessments}
                    studentName={childLink.studentName}
                  />
                ) : (
                  <EmptyData title="Chưa liên kết học sinh" note="Kết quả chỉ xuất hiện sau khi Admin liên kết tài khoản phụ huynh với học sinh." />
                )
              )}
              {role === "parent" && view === "Chuyên cần" && (
                childLink ? (
                  <AttendanceOverview
                    sessions={childSessions}
                    childKey={childKey}
                    childName={childLink.studentName}
                    classes={childClasses}
                  />
                ) : (
                  <EmptyData title="Chưa liên kết học sinh" note="Chuyên cần chỉ xuất hiện sau khi Admin liên kết tài khoản phụ huynh với học sinh." />
                )
              )}
              {role === "parent" && view === "Thông báo" && (
                <NotificationList
                  items={visibleNotifications}
                  me={me}
                />
              )}
            </>
          )}
        </div>
      </section>
      {modal && (
        <ActionModal
          modal={modal}
          role={role}
          data={role === "student" ? { ...data, assignments: scopedAssignments } : data}
          close={() => setModal(null)}
          submit={(kind, payload) => {
            if (kind === "class") {
              const next = {
                ...data,
                classes: [
                  ...data.classes,
                  {
                    id: Date.now(),
                    name: payload.name || "Lớp mới",
                    subject: payload.subject || "Môn học",
                    students: 0,
                    code:
                      (payload.name || "LOP").replace(/\s/g, "").toUpperCase() +
                      "26",
                    progress: 0,
                    ownerKey: me,
                    ownerName: session?.account?.name || "",
                    members: [],
                  },
                ],
              };
              persist(next, "Đã tạo lớp và mã tham gia").then((ok) => { if (ok) setModal(null); });
              return;
            } else if (kind === "assignment") {
              let attachments: AssignmentAttachment[] = [];
              try { attachments = JSON.parse(payload.attachments || "[]") as AssignmentAttachment[]; } catch {}
              const next = {
                ...data,
                assignments: [
                  {
                    id: Date.now(),
                    title: payload.name || "Bài tập mới",
                    subject: payload.subject || "Chưa xác định",
                    className: payload.className || "Chưa gán lớp",
                    due: payload.due || "Không giới hạn",
                    progress: "0 bài nộp",
                    status: "Đang nhận bài",
                    contentHtml: payload.contentHtml || "",
                    attachments,
                    maxScore: payload.maxScore || "10",
                  },
                  ...data.assignments,
                ],
              };
              persist(next, "Đã giao bài và lưu trên Supabase").then((ok) => { if (ok) setModal(null); });
              return;
            } else if (kind === "register") {
              createAccount(payload).then((ok) => {
                if (ok) setModal(null);
              });
              return;
            } else if (kind === "submit") {
              let attachments: AssignmentAttachment[] = [];
              try { attachments = JSON.parse(payload.attachments || "[]") as AssignmentAttachment[]; } catch {}
              setSaving(true);
              fetch("/api/workspace", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "submit", submission: { id: String(Date.now()), assignmentId: payload.assignmentId, contentHtml: payload.contentHtml || "", attachments } }),
              }).then(async (response) => {
                const result = await response.json();
                if (!response.ok || !result.saved) throw new Error(result.error || "Máy chủ chưa xác nhận bài nộp");
                setData(normalizeWorkspace(result.data));
                setModal(null);
                notify("Đã nộp bài và lưu trên Supabase");
              }).catch((error) => notify(error instanceof Error ? error.message : "Không thể nộp bài")).finally(() => setSaving(false));
              return;
            }
            setModal(null);
          }}
        />
      )}
      {qrClass && <ClassQrModal classInfo={qrClass} close={() => setQrClass(null)} notify={notify} />}
      {attendanceClass && (
        <AttendanceModal
          classInfo={attendanceClass}
          close={() => setAttendanceClass(null)}
          save={(sessionRecord) =>
            persist(
              { ...data, attendanceSessions: [...data.attendanceSessions, sessionRecord] },
              `Đã lưu điểm danh lớp ${attendanceClass.name}`,
            ).then((ok) => {
              if (ok) setAttendanceClass(null);
            })
          }
        />
      )}
      {editingAccount && (
        <AccountEditModal
          account={editingAccount}
          currentKey={session.account.accountKey}
          students={accounts
            .filter((a) => a.role === "student")
            .map((a) => ({ key: a.accountKey, name: a.name }))}
          linkedStudentKey={data.parentLinks[editingAccount.accountKey]?.studentKey || ""}
          onLink={(studentKey) => linkParent(editingAccount, studentKey)}
          close={() => setEditingAccount(null)}
          save={saveAccount}
          resetPassword={resetAccountPassword}
          remove={deleteAccount}
        />
      )}
      {profileOpen && (
        <ProfileModal
          account={session.account}
          passwordResetVerified={Boolean(session.passwordResetVerified)}
          close={() => setProfileOpen(false)}
          onUpdated={(account) => {
            setSession((current) => ({ ...current!, authenticated: true, account }));
            notify("Đã cập nhật hồ sơ");
          }}
          notify={notify}
        />
      )}
      {toast && (
        <div className={`toast ${toast.tone === "error" ? "error" : ""}`} role="status">
          <span>{toast.tone === "error" ? "!" : "✓"}</span>
          {toast.message}
          {saving && <i />}
        </div>
      )}
    </main>
  );
}

function PublicHome({ registered }: { registered: boolean }) {
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(
    registered ? "register" : null,
  );
  const openAuth = (mode: "login" | "register") => setAuthMode(mode);

  return (
    <main className="public-site simple-home">
      <header className="simple-nav">
        <a className="simple-brand" href="#top" aria-label="EduPlan AI - Trang chủ">
          <span>EP</span>
          <div><b>EduPlan AI</b><small>Nền tảng dạy và học số</small></div>
        </a>
        <nav aria-label="Điều hướng chính">
          <a href="#tinh-nang">Dành cho ai?</a>
          <a href="#bat-dau">Cách sử dụng</a>
        </nav>
        <div className="simple-nav-actions">
          <button className="simple-login" onClick={() => openAuth("login")}>Đăng nhập</button>
          <button className="simple-primary" onClick={() => openAuth("register")}>Đăng ký</button>
        </div>
      </header>

      <section className="simple-hero" id="top">
        <div className="simple-hero-copy">
          <span className="simple-eyebrow">TRUNG TÂM GDNN-GDTX KHU VỰC TÂN NINH</span>
          <h1>Dạy học số <em>đơn giản, hiệu quả</em> và dễ sử dụng.</h1>
          <p>EduPlan AI giúp giáo viên tạo bài giảng, học sinh học và làm bài trực tuyến, nhà trường theo dõi mọi hoạt động trong một nơi duy nhất.</p>
          <div className="simple-hero-actions">
            <button className="simple-primary" onClick={() => openAuth("register")}>Đăng ký sử dụng <span>→</span></button>
            <button className="simple-login" onClick={() => openAuth("login")}>Tôi đã có tài khoản</button>
          </div>
          <div className="simple-trust" aria-label="Ưu điểm nổi bật">
            <span>✓ Giao diện theo vai trò</span>
            <span>✓ Lưu tiến độ học tập</span>
            <span>✓ AI hỗ trợ soạn giảng</span>
          </div>
        </div>

        <div className="simple-dashboard" aria-label="Minh họa bảng điều khiển EduPlan AI">
          <div className="simple-dashboard-top"><span>EP</span><b>Bảng điều khiển giáo viên</b><i>●</i></div>
          <div className="simple-welcome"><div><small>CHÀO BUỔI SÁNG</small><strong>Sẵn sàng cho tiết học hôm nay?</strong></div><span>＋ Tạo nội dung</span></div>
          <div className="simple-quick-grid">
            <article><span>▶</span><div><b>Bài học eLearning</b><small>Video và câu hỏi tương tác</small></div></article>
            <article><span>▣</span><div><b>Trình chiếu trên lớp</b><small>Nội dung giảng dạy trực quan</small></div></article>
            <article><span>✓</span><div><b>Luyện tập & kiểm tra</b><small>Tạo đề và chấm điểm</small></div></article>
          </div>
          <div className="simple-progress"><div><b>Tiến độ học tập</b><small>Chỉ hiển thị dữ liệu hoạt động đã lưu</small></div><strong>Trực tiếp</strong><i><span style={{ width: "100%" }} /></i></div>
        </div>
      </section>

      <section className="simple-audience" id="tinh-nang">
        <div className="simple-section-head"><span>RÕ RÀNG · ĐÚNG NHU CẦU</span><h2>Mỗi người thấy đúng công việc của mình</h2><p>Đăng nhập một lần, hệ thống tự mở giao diện phù hợp với vai trò.</p></div>
        <div className="simple-audience-grid">
          <article><span className="simple-icon blue">GV</span><h3>Dành cho giáo viên</h3><p>Soạn bài, tạo eLearning, trình chiếu, giao bài và tạo đề kiểm tra.</p><small>Soạn giảng và quản lý lớp học</small></article>
          <article><span className="simple-icon violet">HS</span><h3>Dành cho học sinh</h3><p>Học video tương tác, làm bài, nộp bài và xem kết quả học tập.</p><small>Học tập chủ động ở mọi nơi</small></article>
          <article><span className="simple-icon orange">QL</span><h3>Nhà trường & phụ huynh</h3><p>Quản lý tài khoản, theo dõi tiến độ và đồng hành cùng học sinh.</p><small>Thông tin tập trung, dễ theo dõi</small></article>
        </div>
      </section>

      <section className="simple-how" id="bat-dau">
        <div className="simple-how-copy"><span>BẮT ĐẦU NHANH</span><h2>Chỉ 3 bước để sử dụng</h2><p>Không cần chờ phê duyệt. Giáo viên, học sinh và phụ huynh có thể đăng ký rồi bắt đầu ngay.</p></div>
        <div className="simple-steps">
          <article><b>01</b><div><h3>Tạo tài khoản</h3><p>Đăng ký bằng tên tài khoản; email không bắt buộc.</p></div></article>
          <article><b>02</b><div><h3>Chọn vai trò</h3><p>Hệ thống hiển thị đúng chức năng dành cho bạn.</p></div></article>
          <article><b>03</b><div><h3>Dạy và học</h3><p>Tạo nội dung, tham gia lớp và lưu kết quả tự động.</p></div></article>
        </div>
      </section>

      <section className="simple-final">
        <div><span>BẮT ĐẦU NGAY HÔM NAY</span><h2>Một nơi đơn giản cho mọi hoạt động dạy và học.</h2></div>
        <div><button className="simple-primary" onClick={() => openAuth("register")}>Đăng ký sử dụng →</button><button className="simple-login" onClick={() => openAuth("login")}>Đăng nhập</button></div>
      </section>

      <footer className="simple-footer">
        <div className="simple-brand"><span>EP</span><div><b>EduPlan AI</b><small>Nền tảng dạy và học số</small></div></div>
        <div className="simple-footer-copy">
          <p>© 2026 EduPlan AI · Nền tảng hỗ trợ giáo dục Việt Nam</p>
          <strong>Phát triển bởi Thầy: TRẦN QUỐC HOÀNG ANH - TRUNG TÂM GDNN-GDTX KHU VỰC TÂN NINH - ZALO: 0965653750</strong>
        </div>
      </footer>

      {authMode && <div className="public-auth-modal" role="dialog" aria-modal="true" aria-label={authMode === "login" ? "Đăng nhập" : "Đăng ký"}><AuthScreen key={authMode} registered={authMode === "register"} onClose={() => setAuthMode(null)} /></div>}
    </main>
  );
}

function AuthScreen({ registered, onClose }: { registered: boolean; onClose?: () => void }) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">(
    registered ? "register" : "login",
  );
  const [role, setRole] = useState<Exclude<Role, "admin">>("teacher");
  const [accepted, setAccepted] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [authMessage, setAuthMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const field = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submitLogin = async () => {
    setSubmitting(true);
    setAuthMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identifier: form.identifier,
          password: form.password,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.reload();
    } catch (error) {
      setAuthMessage(
        error instanceof Error ? error.message : "Không thể đăng nhập",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const submitRegister = async () => {
    if (form.password !== form.confirmPassword) {
      setAuthMessage("Mật khẩu xác nhận chưa khớp");
      return;
    }
    setSubmitting(true);
    setAuthMessage("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.authenticated) window.location.reload();
      else {
        setAuthMessage(result.message);
        setMode("login");
        setForm({ identifier: form.username || form.email });
      }
    } catch (error) {
      setAuthMessage(
        error instanceof Error ? error.message : "Không thể đăng ký",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const submitForgotPassword = async () => {
    if (!String(form.identifier || "").trim()) {
      setAuthMessage("Vui lòng nhập tên tài khoản hoặc email");
      return;
    }
    setSubmitting(true);
    setAuthMessage("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: form.identifier }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAuthMessage(`${result.message} Nếu tài khoản có Gmail, hãy đăng nhập bằng Google để tự tạo mật khẩu mới; nếu không, Admin sẽ hỗ trợ đặt lại.`);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Không thể gửi yêu cầu đặt lại mật khẩu");
    } finally {
      setSubmitting(false);
    }
  };
  const platformSignIn = () => {
    window.location.href = `/signin-with-chatgpt?return_to=${encodeURIComponent(`/?register=${role}`)}`;
  };
  return (
    <main className="auth-page">
      <section className="auth-showcase">
        <div className="auth-brand">
          <span>E</span>
          <div>
            <b>EduPlan AI</b>
            <small>Hệ sinh thái giáo dục thông minh</small>
          </div>
        </div>
        <div className="auth-copy">
          <span>KHÔNG GIAN HỌC TẬP SỐ</span>
          <h1>
            Dạy học nhẹ nhàng.
            <br />
            <em>Kết nối trọn vẹn.</em>
          </h1>
          <p>
            Một nền tảng thống nhất cho quản trị, giáo viên, học sinh và phụ
            huynh — đúng vai trò, đúng công việc.
          </p>
          <div className="auth-benefits">
            <div>
              <b>✦</b>
              <span>
                <strong>AI hỗ trợ giáo viên</strong>
                <small>KHBD 5512, slide, câu hỏi và phiếu học tập</small>
              </span>
            </div>
            <div>
              <b>▦</b>
              <span>
                <strong>Lớp học kết nối</strong>
                <small>Giao bài, nộp bài, chấm điểm và phản hồi</small>
              </span>
            </div>
            <div>
              <b>◇</b>
              <span>
                <strong>Phân quyền an toàn</strong>
                <small>Mỗi tài khoản chỉ truy cập đúng chức năng</small>
              </span>
            </div>
          </div>
        </div>
        <div className="auth-quote">
          <p>
            “Công nghệ dành lại thời gian để thầy cô tập trung vào học sinh.”
          </p>
          <small>EduPlan AI · CTGDPT 2018</small>
        </div>
        <div className="auth-orb one" />
        <div className="auth-orb two" />
      </section>
      <section className="auth-form-side">
        <div className="auth-card">
          {onClose && <button className="auth-modal-close" onClick={onClose} aria-label="Đóng">×</button>}
          <div className="auth-mobile-brand">
            <span>E</span>
            <b>EduPlan AI</b>
          </div>
          <div className="auth-tabs">
            <button
              className={mode === "login" || mode === "forgot" ? "active" : ""}
              onClick={() => setMode("login")}
            >
              Đăng nhập
            </button>
            <button
              className={mode === "register" ? "active" : ""}
              onClick={() => setMode("register")}
            >
              Đăng ký
            </button>
          </div>
          {mode === "login" ? (
            <div className="auth-view">
              <small className="auth-kicker">CHÀO MỪNG TRỞ LẠI</small>
              <h2>Đăng nhập EduPlan AI</h2>
              <p>
                Dùng tên tài khoản hoặc email. Hệ thống tự động mở đúng giao
                diện vai trò đã được cấp.
              </p>
              <label className="auth-field">
                Tên tài khoản hoặc email
                <input
                  autoComplete="username"
                  value={form.identifier || ""}
                  onChange={(e) => field("identifier", e.target.value)}
                  placeholder="Ví dụ: hoanganh hoặc email@..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitLogin();
                  }}
                />
              </label>
              <label className="auth-field">
                Mật khẩu
                <input
                  type="password"
                  autoComplete="current-password"
                  value={form.password || ""}
                  onChange={(e) => field("password", e.target.value)}
                  placeholder="Nhập mật khẩu"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitLogin();
                  }}
                />
              </label>
              {authMessage && <p className="auth-message">{authMessage}</p>}
              <button
                className="auth-primary"
                disabled={submitting}
                onClick={submitLogin}
              >
                {submitting ? "Đang xác thực..." : "Đăng nhập →"}
              </button>
              <div className="auth-divider">
                <span />
                hoặc đăng nhập nhanh
                <span />
              </div>
              <div className="google-login-box">
                <label>
                  Vai trò ở lần đăng nhập đầu
                  <select
                    value={role}
                    onChange={(e) =>
                      setRole(e.target.value as Exclude<Role, "admin">)
                    }
                  >
                    <option value="teacher">Giáo viên</option>
                    <option value="student">Học sinh</option>
                    <option value="parent">Phụ huynh</option>
                  </select>
                </label>
                <button
                  className="auth-secondary google-button"
                  onClick={platformSignIn}
                >
                  <span>G</span> Tiếp tục bằng Google
                </button>
                <small>Không cần đăng ký và không cần tạo mật khẩu.</small>
              </div>
              <div className="auth-help">
                <button onClick={() => { setMode("forgot"); setAuthMessage(""); }}>
                  Quên mật khẩu?
                </button>
                <span>·</span>
                <button onClick={() => setMode("register")}>
                  Tạo tài khoản
                </button>
                <span>·</span>
                <a href="https://zalo.me/0965653750" target="_blank" rel="noreferrer">
                  Liên hệ quản trị
                </a>
              </div>
            </div>
          ) : mode === "forgot" ? (
            <div className="auth-view forgot-view">
              <small className="auth-kicker">KHÔI PHỤC TÀI KHOẢN</small>
              <h2>Quên mật khẩu?</h2>
              <p>Nhập tên tài khoản hoặc email đã đăng ký. Yêu cầu sẽ được lưu an toàn để Admin hỗ trợ, không làm lộ tài khoản có tồn tại hay không.</p>
              <label className="auth-field">
                Tên tài khoản hoặc email
                <input autoComplete="username" value={form.identifier || ""}
                  onChange={(e) => field("identifier", e.target.value)}
                  placeholder="Ví dụ: hoanganh hoặc email@..."
                  onKeyDown={(e) => { if (e.key === "Enter") submitForgotPassword(); }} />
              </label>
              {authMessage && <p className="auth-message forgot-message">{authMessage}</p>}
              <button className="auth-primary" disabled={submitting} onClick={submitForgotPassword}>
                {submitting ? "Đang gửi yêu cầu..." : "Gửi yêu cầu đặt lại →"}
              </button>
              <button className="auth-secondary google-button" onClick={platformSignIn}>
                <span>G</span> Đăng nhập bằng Google
              </button>
              <button className="auth-back" onClick={() => { setMode("login"); setAuthMessage(""); }}>
                ← Quay lại đăng nhập
              </button>
            </div>
          ) : (
            <div className="auth-view register-view">
              <small className="auth-kicker">TẠO TÀI KHOẢN MỚI</small>
              <h2>Tham gia EduPlan AI</h2>
              <p>
                Chỉ cần tên tài khoản và mật khẩu; email có thể để trống. Tài
                khoản đăng ký xong có thể sử dụng ngay, không cần chờ phê duyệt.
              </p>
              <div className="auth-form-grid">
                <label className="auth-field">
                  Họ và tên
                  <input
                    value={form.name || ""}
                    onChange={(e) => field("name", e.target.value)}
                    placeholder="Nguyễn Văn A"
                  />
                </label>
                <label className="auth-field">
                  Tên tài khoản
                  <input
                    autoComplete="username"
                    value={form.username || ""}
                    onChange={(e) =>
                      field("username", e.target.value.toLowerCase())
                    }
                    placeholder="nguyenvana"
                  />
                </label>
                <label className="auth-field wide">
                  Email <small>(không bắt buộc)</small>
                  <input
                    type="email"
                    value={form.email || ""}
                    onChange={(e) => field("email", e.target.value)}
                    placeholder="Có thể để trống"
                  />
                </label>
                <label className="auth-field">
                  Mật khẩu
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={form.password || ""}
                    onChange={(e) => field("password", e.target.value)}
                    placeholder="Tối thiểu 8 ký tự"
                  />
                </label>
                <label className="auth-field">
                  Xác nhận mật khẩu
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={form.confirmPassword || ""}
                    onChange={(e) => field("confirmPassword", e.target.value)}
                    placeholder="Nhập lại mật khẩu"
                  />
                </label>
              </div>
              <div className="signup-roles compact">
                {(["teacher", "student", "parent"] as const).map((r) => (
                  <button
                    key={r}
                    className={role === r ? "active" : ""}
                    onClick={() => setRole(r)}
                  >
                    <span>
                      {r === "teacher" ? "✦" : r === "student" ? "▤" : "♡"}
                    </span>
                    <div>
                      <b>{roleMeta[r].label}</b>
                    </div>
                    <i>{role === r ? "✓" : ""}</i>
                  </button>
                ))}
              </div>
              <label className="terms">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span>
                  Tôi xác nhận thông tin đăng ký chính xác và đồng ý tuân thủ
                  quy định sử dụng.
                </span>
              </label>
              {authMessage && <p className="auth-message">{authMessage}</p>}
              <button
                className="auth-primary"
                disabled={!accepted || submitting}
                onClick={submitRegister}
              >
                {submitting ? "Đang tạo tài khoản..." : "Đăng ký tài khoản →"}
              </button>
            </div>
          )}
        </div>
        <footer className="auth-footer">
          © 2026 EduPlan AI <span>·</span> Bảo mật <span>·</span> Trợ giúp
        </footer>
      </section>
    </main>
  );
}

function AuthPending({ name }: { name: string }) {
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/signout-with-chatgpt?return_to=/";
  };
  return (
    <main className="pending-page">
      <div className="auth-mobile-brand">
        <span>E</span>
        <b>EduPlan AI</b>
      </div>
      <div className="pending-card">
        <span>◷</span>
        <small>TÀI KHOẢN ĐANG CHỜ DUYỆT</small>
        <h1>Xin chào, {name}</h1>
        <p>
          Yêu cầu đăng ký đã được ghi nhận. Quản trị viên sẽ kiểm tra thông tin
          và cấp quyền truy cập phù hợp.
        </p>
        <button onClick={logout}>Đăng xuất và quay lại →</button>
      </div>
    </main>
  );
}

function Dashboard({
  role,
  data,
  metrics,
  onAction,
}: {
  role: Role;
  data: Workspace;
  metrics: (string | number)[][];
  onAction: (a: string) => void;
}) {
  return (
    <>
      <section className={`dashboard-hero dashboard-hero-${role}`}>
        <div className="dashboard-hero-copy">
          <small>TRUNG TÂM GDNN-GDTX KHU VỰC TÂN NINH</small>
          <h2>{role === "teacher" ? <>Dạy tốt hơn.<br />Học chủ động hơn.</> : role === "student" ? <>Học chủ động.<br />Tiến bộ mỗi ngày.</> : role === "parent" ? <>Đồng hành cùng con.<br />Kết nối cùng nhà trường.</> : <>Điều hành tập trung.<br />Vận hành hiệu quả.</>}</h2>
          <p>{role === "teacher" ? "Mọi công cụ soạn giảng, lớp học và đánh giá trong một không gian liền mạch." : role === "student" ? "Bài học, bài tập và học liệu luôn sẵn sàng trong một không gian dễ sử dụng." : role === "parent" ? "Theo dõi kết quả, chuyên cần và thông báo mới nhất của con." : "Quản lý người dùng, lớp học, nội dung và cấu hình trên một hệ thống thống nhất."}</p>
          <div>
            <button onClick={() => onAction(role === "teacher" ? "Lớp của tôi" : role === "student" ? "Học trực tuyến" : role === "parent" ? "Kết quả của con" : "Người dùng")}>＋ {role === "teacher" ? "Tạo lớp học" : role === "student" ? "Vào học ngay" : role === "parent" ? "Xem kết quả" : "Quản lý người dùng"}</button>
            <button className="hero-secondary" onClick={() => onAction(role === "teacher" ? "Trình chiếu trên lớp" : role === "student" ? "Lớp học" : role === "parent" ? "Thông báo" : "Lớp học")}>▦ {role === "teacher" ? "Soạn bài dạy trên lớp" : role === "student" ? "Tham gia bằng mã" : role === "parent" ? "Xem thông báo" : "Quản lý lớp học"}</button>
            {(role === "teacher" || role === "student") && (
              <button className="hero-assessment" onClick={() => onAction("Luyện tập & kiểm tra")}>✓ {role === "teacher" ? "Tạo bài kiểm tra" : "Làm bài kiểm tra"}</button>
            )}
          </div>
        </div>
        <div className="dashboard-hero-art" aria-hidden="true">
          <div className="art-window"><i /><i /><i /><span className="art-pie" /><span className="art-lines" /></div>
          <div className="art-quiz"><b>A</b><i /><b>B</b><i /><b>C</b><i /></div>
          <div className="art-books"><i /><i /><i /></div>
          <span className="art-check">✓</span>
          <span className="art-chat">═</span>
        </div>
      </section>
      <div className="metrics">
        {metrics.map((m, i) => (
          <article key={String(m[0])}>
            <div className={`metric-icon c${i}`}>
              {["◇", "▦", "↗", "♢"][i]}
            </div>
            <small>{m[0]}</small>
            <b>{m[1]}</b>
            <em>{m[2]}</em>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel wide">
          <div className="panel-head">
            <div>
              <b>
                {role === "admin"
                  ? "Hoạt động hệ thống"
                  : role === "teacher"
                    ? "Công việc cần xử lý"
                    : role === "student"
                      ? "Lịch học hôm nay"
                      : "Tình hình học tập của con"}
              </b>
              <small>Cập nhật gần nhất hôm nay</small>
            </div>
            <button
              onClick={() =>
                onAction(
                  role === "teacher"
                    ? "Bài tập"
                    : role === "parent"
                      ? "Kết quả của con"
                      : "Lớp học",
                )
              }
            >
              Xem tất cả →
            </button>
          </div>
          {role === "admin" ? (
            <ActivityRows data={data} />
          ) : role === "teacher" ? (
            <TeacherTasks data={data} onAction={onAction} />
          ) : role === "student" ? (
            <StudentSchedule assignments={data.assignments} onSubmit={() => onAction("submit")} />
          ) : (
            <EmptyData title="Chưa liên kết học sinh" note="Admin cần liên kết tài khoản phụ huynh trước khi hiển thị kết quả." />
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <b>Thao tác nhanh</b>
              <small>Các công việc thường dùng</small>
            </div>
          </div>
          <div className="quick-actions">
            {quickActions(role).map((a) => (
              <button key={a.label} onClick={() => onAction(a.action)}>
                <span>{a.icon}</span>
                <div>
                  <b>{a.label}</b>
                  <small>{a.note}</small>
                </div>
                <em>→</em>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function ProfileModal({
  account,
  passwordResetVerified,
  close,
  onUpdated,
  notify,
}: {
  account: SessionAccount;
  passwordResetVerified: boolean;
  close: () => void;
  onUpdated: (account: SessionAccount) => void;
  notify: (message: string) => void;
}) {
  const [tab, setTab] = useState<"profile" | "security">("profile");
  const [draft, setDraft] = useState({
    name: account.name,
    username: account.username || "",
    phone: account.phone || "",
    bio: account.bio || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const update = (key: string, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (tab === "security" && !draft.newPassword) {
      notify("Vui lòng nhập mật khẩu mới");
      return;
    }
    if (tab === "security" && draft.newPassword !== draft.confirmPassword) {
      notify("Mật khẩu mới và xác nhận chưa khớp");
      return;
    }
    if (window.location.hostname === "terminal.local") {
      onUpdated({
        ...account,
        name: draft.name,
        username: draft.username,
        phone: draft.phone,
        bio: draft.bio,
        hasPassword: Boolean(draft.newPassword) || account.hasPassword,
      });
      close();
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(tab === "security" ? "/api/profile/password" : "/api/profile", {
        method: tab === "security" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tab === "security"
          ? { currentPassword: draft.currentPassword, newPassword: draft.newPassword }
          : { name: draft.name, username: draft.username, phone: draft.phone, bio: draft.bio }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onUpdated(result.account);
      close();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Không thể cập nhật hồ sơ",
      );
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      notify("Ảnh đại diện tối đa 2 MB");
      return;
    }
    if (window.location.hostname === "terminal.local") {
      const reader = new FileReader();
      reader.onload = () =>
        onUpdated({ ...account, avatarUrl: String(reader.result) });
      reader.readAsDataURL(file);
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const response = await fetch("/api/avatar", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onUpdated(result.account);
      notify("Đã đổi ảnh đại diện");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Không thể tải ảnh đại diện",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell title="Hồ sơ cá nhân" close={close}>
      <div className="profile-editor-head">
        <label className="avatar-editor">
          {account.avatarUrl ? (
            <img src={account.avatarUrl} alt="Ảnh đại diện hiện tại" />
          ) : (
            <span>{initials(account.name)}</span>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <em>Đổi ảnh</em>
        </label>
        <div>
          <b>{account.name}</b>
          <small>{account.email || "Tài khoản không sử dụng email"}</small>
          <i>{roleMeta[account.role].label}</i>
        </div>
      </div>
      <div className="profile-tabs">
        <button
          className={tab === "profile" ? "active" : ""}
          onClick={() => setTab("profile")}
        >
          Thông tin cá nhân
        </button>
        <button
          className={tab === "security" ? "active" : ""}
          onClick={() => setTab("security")}
        >
          Mật khẩu & bảo mật
        </button>
      </div>
      {tab === "profile" ? (
        <div className="form-grid profile-form">
          <Field wide label="Họ và tên">
            <input
              value={draft.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </Field>
          <Field label="Tên tài khoản">
            <input
              value={draft.username}
              onChange={(e) => update("username", e.target.value.toLowerCase())}
              placeholder="4–30 ký tự"
            />
          </Field>
          <Field label="Số điện thoại">
            <input
              value={draft.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="Số điện thoại liên hệ"
            />
          </Field>
          <Field wide label="Email đăng nhập">
            <input
              value={account.email || ""}
              placeholder="Không bắt buộc"
              disabled
            />
          </Field>
          <Field wide label="Giới thiệu ngắn">
            <textarea
              value={draft.bio}
              onChange={(e) => update("bio", e.target.value)}
              maxLength={300}
              placeholder="Thông tin giúp đồng nghiệp và giáo viên nhận biết bạn..."
            />
          </Field>
        </div>
      ) : (
        <div className="security-form">
          <div className="security-note">
            <span>⌘</span>
            <div>
              <b>{passwordResetVerified ? "Đã xác minh bằng Google" : "Mật khẩu được bảo vệ"}</b>
              <small>
                {passwordResetVerified
                  ? "Bạn có thể đặt mật khẩu mới mà không cần nhập mật khẩu cũ."
                  : "Mật khẩu được mã hóa một chiều và không hiển thị cho bất kỳ ai."}
              </small>
            </div>
          </div>
          {account.hasPassword && !passwordResetVerified && (
            <Field label="Mật khẩu hiện tại">
              <input
                type="password"
                autoComplete="current-password"
                value={draft.currentPassword}
                onChange={(e) => update("currentPassword", e.target.value)}
              />
            </Field>
          )}
          <Field
            label={
              account.hasPassword ? "Mật khẩu mới" : "Tạo mật khẩu đăng nhập"
            }
          >
            <input
              type="password"
              autoComplete="new-password"
              value={draft.newPassword}
              onChange={(e) => update("newPassword", e.target.value)}
              placeholder="Tối thiểu 8 ký tự"
            />
          </Field>
          <Field label="Xác nhận mật khẩu mới">
            <input
              type="password"
              autoComplete="new-password"
              value={draft.confirmPassword}
              onChange={(e) => update("confirmPassword", e.target.value)}
            />
          </Field>
        </div>
      )}
      <div className="account-modal-actions">
        <button className="soft" onClick={close}>
          Hủy
        </button>
        <button className="primary" disabled={busy} onClick={save}>
          {busy ? "Đang lưu..." : "Lưu thay đổi"}
        </button>
      </div>
    </ModalShell>
  );
}

function AccountsTable({
  accounts,
  currentKey,
  loading,
  onEdit,
}: {
  accounts: ManagedAccount[];
  currentKey: string;
  loading: boolean;
  onEdit: (account: ManagedAccount) => void;
}) {
  const statusLabel = (status: ManagedAccount["status"]) =>
    status === "active"
      ? "Đang hoạt động"
      : status === "pending"
        ? "Chờ duyệt"
        : "Đã khóa";
  return (
    <section className="panel table-panel">
      <div className="toolbar">
        <div>
          <b>Danh sách tài khoản</b>
          <small>
            {loading
              ? "Đang tải dữ liệu..."
              : `${accounts.length} tài khoản phù hợp`}
          </small>
        </div>
        <span className="account-security">✓ Chỉ Admin được chỉnh sửa</span>
      </div>
      <div className="data-table">
        <div className="tr th">
          <span>Người dùng</span>
          <span>Vai trò</span>
          <span>Trạng thái</span>
          <span>Thao tác</span>
        </div>
        {accounts.map((account) => (
          <div className="tr" key={account.accountKey}>
            <span className="user-cell">
              <i>{initials(account.name)}</i>
              <span>
                <b>{account.name}</b>
                <small>
                  @{account.username || "chưa-thiết-lập"}
                  {account.email
                    ? ` · ${account.email}`
                    : " · Không dùng email"}
                </small>
                {account.passwordResetRequestedAt && (
                  <em className="password-request-badge">Yêu cầu đặt lại mật khẩu</em>
                )}
              </span>
            </span>
            <span>{roleMeta[account.role].label}</span>
            <span>
              <em
                className={`status ${account.status === "active" ? "ok" : account.status === "pending" ? "wait" : "off"}`}
              >
                {statusLabel(account.status)}
              </em>
            </span>
            <span>
              {account.accountKey === currentKey ? (
                <em className="self-account">Tài khoản hiện tại</em>
              ) : (
                <button
                  className="table-action edit-account"
                  onClick={() => onEdit(account)}
                >
                  ✎ Chỉnh sửa
                </button>
              )}
            </span>
          </div>
        ))}
        {!loading && accounts.length === 0 && (
          <div className="empty-accounts">
            Không tìm thấy tài khoản phù hợp.
          </div>
        )}
      </div>
    </section>
  );
}

function AccountEditModal({
  account,
  currentKey,
  students,
  linkedStudentKey,
  onLink,
  close,
  save,
  resetPassword,
  remove,
}: {
  account: ManagedAccount;
  currentKey: string;
  students: { key: string; name: string }[];
  linkedStudentKey: string;
  onLink: (studentKey: string) => void;
  close: () => void;
  save: (account: ManagedAccount) => void;
  resetPassword: (accountKey: string, newPassword: string) => Promise<boolean>;
  remove: (accountKey: string) => void;
}) {
  const [draft, setDraft] = useState(account);
  const [linked, setLinked] = useState(linkedStudentKey);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const protectedAccount = account.accountKey === currentKey;
  const submitPassword = async () => {
    if (newPassword.length < 8 || newPassword !== confirmPassword) return;
    setPasswordBusy(true);
    const updated = await resetPassword(account.accountKey, newPassword);
    if (updated) { setNewPassword(""); setConfirmPassword(""); }
    setPasswordBusy(false);
  };
  return (
    <ModalShell title="Chỉnh sửa tài khoản" close={close}>
      <div className="account-edit-head">
        <span>{initials(account.name)}</span>
        <div>
          <b>{account.name}</b>
          <small>{account.email || "Tài khoản không sử dụng email"}</small>
        </div>
      </div>
      <div className="form-grid">
        <Field wide label="Họ và tên">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field wide label="Tên tài khoản">
          <input
            value={draft.username || ""}
            onChange={(e) =>
              setDraft({ ...draft, username: e.target.value.toLowerCase() })
            }
            placeholder="4–30 ký tự"
          />
        </Field>
        <Field label="Vai trò">
          <select
            value={draft.role}
            disabled={protectedAccount}
            onChange={(e) =>
              setDraft({ ...draft, role: e.target.value as Role })
            }
          >
            <option value="teacher">Giáo viên</option>
            <option value="student">Học sinh</option>
            <option value="parent">Phụ huynh</option>
            <option value="admin">Quản trị</option>
          </select>
        </Field>
        <Field label="Trạng thái">
          <select
            value={draft.status}
            disabled={protectedAccount}
            onChange={(e) =>
              setDraft({
                ...draft,
                status: e.target.value as ManagedAccount["status"],
              })
            }
          >
            <option value="active">Đang hoạt động</option>
            <option value="pending">Chờ duyệt</option>
            <option value="locked">Đã khóa</option>
          </select>
        </Field>
        {draft.role === "parent" && (
          <Field wide label="Liên kết với học sinh">
            <select value={linked} onChange={(e) => setLinked(e.target.value)}>
              <option value="">Chưa liên kết</option>
              {students.map((student) => (
                <option key={student.key} value={student.key}>
                  {student.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {draft.role === "parent" && (
        <p className="protected-note">
          Sau khi liên kết, phụ huynh sẽ thấy kết quả học tập, chuyên cần và có
          thể trao đổi với giáo viên phụ trách lớp của học sinh.
        </p>
      )}
      {protectedAccount && (
        <p className="protected-note">
          Tài khoản Admin đang đăng nhập được bảo vệ: không thể hạ quyền, khóa
          hoặc xóa.
        </p>
      )}
      {!protectedAccount && (
        <section className="admin-password-reset">
          <div>
            <b>Đặt lại mật khẩu</b>
            <small>{account.passwordResetRequestedAt
              ? `Người dùng đã yêu cầu hỗ trợ lúc ${new Date(account.passwordResetRequestedAt).toLocaleString("vi-VN")}.`
              : "Admin có thể tạo mật khẩu mới; các phiên đăng nhập cũ của tài khoản sẽ bị thu hồi."}</small>
          </div>
          <div className="form-grid">
            <Field label="Mật khẩu mới">
              <input type="password" autoComplete="new-password" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} placeholder="Tối thiểu 8 ký tự" />
            </Field>
            <Field label="Xác nhận mật khẩu">
              <input type="password" autoComplete="new-password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} />
            </Field>
          </div>
          {confirmPassword && newPassword !== confirmPassword && <p className="field-error">Mật khẩu xác nhận chưa khớp.</p>}
          <button className="soft password-reset-button"
            disabled={passwordBusy || newPassword.length < 8 || newPassword !== confirmPassword}
            onClick={submitPassword}>
            {passwordBusy ? "Đang đặt lại..." : "Đặt mật khẩu mới"}
          </button>
        </section>
      )}
      <div className="account-modal-actions">
        <button className="soft" onClick={close}>
          Hủy
        </button>
        <button
          className="primary"
          onClick={() => {
            if (draft.role === "parent" && linked !== linkedStudentKey) onLink(linked);
            save(draft);
          }}
        >
          Lưu thay đổi
        </button>
      </div>
      {!protectedAccount && (
        <div className="danger-zone">
          <div>
            <b>Xóa tài khoản</b>
            <small>
              Hành động này xóa quyền truy cập của người dùng khỏi hệ thống.
            </small>
          </div>
          {confirmDelete ? (
            <div className="delete-confirm">
              <button onClick={() => setConfirmDelete(false)}>Hủy</button>
              <button onClick={() => remove(account.accountKey)}>
                Xác nhận xóa
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}>
              Xóa tài khoản
            </button>
          )}
        </div>
      )}
    </ModalShell>
  );
}
function ClassesGrid({
  classes,
  admin,
  joinNote,
  onAttendance,
  onQr,
}: {
  classes: Workspace["classes"];
  admin?: boolean;
  joinNote?: boolean;
  onAttendance?: (c: Workspace["classes"][number]) => void;
  onQr?: (c: Workspace["classes"][number]) => void;
}) {
  return (
    <div className="class-grid">
      {classes.map((c) => (
        <article className="class-card" key={c.id}>
          <div className="class-cover">
            <span>{c.subject.slice(0, 2).toUpperCase()}</span>
            <em>{c.progress}% tiến độ</em>
          </div>
          <div className="class-info">
            <small>{c.subject}</small>
            <h3>Lớp {c.name}</h3>
            <p>
              {c.members?.length ?? c.students} học sinh · Mã {c.code}
              {c.ownerName ? ` · GV ${c.ownerName}` : ""}
            </p>
            <div className="progress">
              <i style={{ width: `${c.progress}%` }} />
            </div>
            <div>
              <CopyCodeButton code={c.code} />
              {onQr && <button onClick={() => onQr(c)}>Mã QR</button>}
              {onAttendance && (
                <button onClick={() => onAttendance(c)}>Điểm danh</button>
              )}
            </div>
          </div>
        </article>
      ))}
      {classes.length === 0 && (
        <EmptyData
          title={joinNote ? "Em chưa tham gia lớp nào" : "Chưa có lớp học"}
          note={
            joinNote
              ? "Nhập mã lớp do giáo viên cung cấp ở ô phía trên để tham gia."
              : admin
                ? "Lớp do giáo viên tạo sẽ được đồng bộ tại đây."
                : "Bấm Tạo mới để tạo lớp đầu tiên và nhận mã tham gia."
          }
        />
      )}
    </div>
  );
}
function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {}
      }}
    >
      {copied ? "✓ Đã sao chép" : "Sao chép mã"}
    </button>
  );
}
function Assignments({
  data,
  teacher,
  submittedIds,
  onCreate,
  onOpenSubmissions,
}: {
  data: Assignment[];
  teacher?: boolean;
  submittedIds?: Set<string>;
  onCreate: () => void;
  onOpenSubmissions?: () => void;
}) {
  return (
    <section className="panel table-panel">
      <div className="toolbar">
        <div>
          <b>{teacher ? "Bài tập đã giao" : "Bài tập của em"}</b>
          <small>Theo dõi hạn nộp và tiến độ</small>
        </div>
        <button className="primary small" onClick={onCreate}>
          {teacher ? "＋ Giao bài" : "Nộp bài"}
        </button>
      </div>
      <div className="assignment-list">
        {data.map((a) => {
          const done = submittedIds?.has(String(a.id));
          return (
          <article key={a.id}>
            <span>▤</span>
            <div>
              <small>
                {a.subject} · {a.className}
              </small>
              <b>{a.title}</b>
              <p>Hạn nộp: {a.due}</p>
              {a.contentHtml && <p className="assignment-excerpt">{a.contentHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 150)}</p>}
              {Boolean(a.attachments?.length) && <div className="student-attachment-list">{a.attachments?.map((file) => <a key={file.id} href={file.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>⇩ {file.name}</a>)}</div>}
            </div>
            <div className="assignment-progress">
              <b>{a.progress}</b>
              <small>{teacher ? "đã nộp" : "tiến độ lớp"}</small>
            </div>
            <em className={`status ${done ? "ok" : "wait"}`}>{done ? "Đã nộp" : a.status}</em>
            <button
              onClick={() => teacher ? onOpenSubmissions?.() : onCreate()}
            >
              {teacher ? "Xem bài" : done ? "Nộp lại" : "Làm bài"}
            </button>
          </article>
          );
        })}
        {data.length === 0 && <EmptyData title={teacher ? "Chưa giao bài tập" : "Chưa có bài tập"} note={teacher ? "Tạo bài tập đầu tiên; hệ thống chỉ hiển thị dữ liệu đã lưu thật." : "Bài tập sẽ xuất hiện khi giáo viên giao trên hệ thống."} />}
      </div>
    </section>
  );
}
function Settings({
  data,
  services,
  onToggle,
}: {
  data: Workspace;
  services: Record<string, boolean>;
  onToggle: (k: keyof Workspace["settings"]) => void;
}) {
  const integrations = [
    ["supabase", "Supabase", "Tài khoản, lớp, bài tập, bài học và tiến độ"],
    ["kira", "Kira AI", "Tạo nội dung, kịch bản và giọng đọc"],
    ["storage", "Kho tệp", "Word, Excel, PowerPoint, PDF, MP3 và hình ảnh"],
    ["gamma", "Gamma", "Xuất bài trình chiếu qua Gamma"],
    ["zalo", "Zalo OA", "Gửi thông báo cho học sinh và phụ huynh"],
  ];
  return (
    <div className="settings-layout">
      <section className="panel">
        <div className="panel-head">
          <div>
            <b>Tích hợp và vận hành</b>
            <small>Khóa bí mật luôn được lưu phía máy chủ</small>
          </div>
        </div>
        {integrations.map(([key, title, desc]) => (
          <div className="setting-row" key={key}>
            <div>
              <b>{title}</b>
              <small>{desc}</small>
            </div>
            <em className={services[key] ? "connected" : ""}>
              {services[key] ? "Đã kết nối" : "Chưa cấu hình"}
            </em>
          </div>
        ))}
        <div className="setting-row"><div><b>Thông báo trong hệ thống</b><small>Tự tạo thông báo khi có dữ liệu mới</small></div><em className={data.settings.autoNotify ? "connected" : ""}>{data.settings.autoNotify ? "Đã bật" : "Đã tắt"}</em><button className={`switch ${data.settings.autoNotify ? "on" : ""}`} onClick={() => onToggle("autoNotify")}><i /></button></div>
        <div className="setting-row"><div><b>Chế độ bảo trì</b><small>Lưu trạng thái vận hành của website</small></div><em className={data.settings.maintenance ? "connected" : ""}>{data.settings.maintenance ? "Đang bật" : "Đã tắt"}</em><button className={`switch ${data.settings.maintenance ? "on" : ""}`} onClick={() => onToggle("maintenance")}><i /></button></div>
      </section>
      <section className="panel"><div className="panel-head"><div><b>Nguyên tắc dữ liệu</b><small>Không dùng số liệu hoặc tài khoản minh họa</small></div></div><div className="service-check"><span>✓</span><div><b>Chỉ hiển thị dữ liệu đã lưu</b><small>Thao tác thất bại sẽ báo lỗi, không báo thành công giả.</small></div></div><div className="service-check"><span>🔒</span><div><b>Khóa bí mật ở máy chủ</b><small>Trình duyệt không nhận khóa Supabase hoặc Kira AI.</small></div></div></section>
    </div>
  );
}
function LearningResources({ assignments }: { assignments: Assignment[] }) {
  const files = assignments.flatMap((assignment) => (assignment.attachments || []).map((file) => ({ ...file, assignment: assignment.title })));
  if (!files.length) return <EmptyData title="Chưa có học liệu" note="Tệp giáo viên đính kèm trong bài tập sẽ xuất hiện tại đây." />;
  return <div className="resource-grid">{files.map((file) => <article key={file.id}><span>▤</span><small>TỆP HỌC LIỆU</small><h3>{file.name}</h3><p>{file.assignment}</p><a href={file.url} target="_blank" rel="noreferrer">Mở học liệu →</a></article>)}</div>;
}

function StudentResults({ records, assignments, examResults = [], assessments = [], studentName }: { records: Workspace["submissionRecords"]; assignments: Assignment[]; examResults?: AssessmentResult[]; assessments?: Array<Record<string, unknown>>; studentName?: string }) {
  const graded = records.filter((record) => record.score !== undefined && record.score !== "");
  if (!graded.length && !examResults.length) return <EmptyData title="Chưa có kết quả" note="Điểm và phản hồi sẽ xuất hiện sau khi giáo viên chấm bài hoặc học sinh hoàn thành bài kiểm tra." />;
  return <section className="panel table-panel"><div className="toolbar"><div><b>{studentName ? `Kết quả học tập của ${studentName}` : "Kết quả học tập"}</b><small>Dữ liệu chấm bài và kiểm tra đã lưu trên Supabase</small></div></div><div className="assignment-list">
    {graded.map((record) => { const assignment = assignments.find((item) => String(item.id) === record.assignmentId); return <article key={record.id}><span>✓</span><div><small>BÀI TẬP</small><b>{assignment?.title || "Bài tập"}</b><p>{record.feedback || "Chưa có nhận xét"}</p></div><strong>{record.score}</strong><em className="status ok">Đã chấm</em></article>; })}
    {examResults.map((result) => { const assessment = assessments.find((item) => String(item.id) === result.assessmentId); return <article key={`exam-${result.id}`}><span>▤</span><div><small>KIỂM TRA</small><b>{String(assessment?.title || "Bài kiểm tra")}</b><p>{result.essayPending ? "Phần tự luận chờ giáo viên chấm" : "Đã chấm tự động"}{result.submittedAt ? ` · ${new Date(result.submittedAt).toLocaleString("vi-VN")}` : ""}</p></div><strong>{result.total ? `${Math.round((result.score / result.total) * 100) / 10}/10` : result.score}</strong><em className={`status ${result.essayPending ? "wait" : "ok"}`}>{result.essayPending ? "Chờ chấm tự luận" : "Hoàn thành"}</em></article>; })}
  </div></section>;
}

function EmptyData({ title, note }: { title: string; note: string }) {
  return <div className="learning-empty"><span>◇</span><b>{title}</b><p>{note}</p></div>;
}
function NotificationList({
  items,
  me = "",
}: {
  items: Workspace["notifications"];
  me?: string;
}) {
  return (
    <section className="panel notification-list">
      {items.map((n) => (
        <article
          className={n.read || (n.readBy || []).includes(me) ? "" : "unread"}
          key={n.id}
        >
          <span>♢</span>
          <div>
            <b>{n.title}</b>
            <p>{n.body}</p>
            <small>
              {n.audience}
              {n.senderName ? ` · ${n.senderName}` : ""} · {n.time}
            </small>
          </div>
        </article>
      ))}
      {items.length === 0 && <EmptyData title="Chưa có thông báo" note="Thông báo thật từ nhà trường và giáo viên sẽ xuất hiện tại đây." />}
    </section>
  );
}
function Grading({ records, assignments, onGrade }: { records: Workspace["submissionRecords"]; assignments: Assignment[]; onGrade: (id: string, score: string, feedback: string) => void }) {
  if (!records.length) return <EmptyData title="Chưa có bài nộp" note="Bài làm của học sinh sẽ xuất hiện ngay sau khi máy chủ xác nhận nộp thành công." />;
  return <section className="panel grading"><div className="panel-head"><div><b>Hàng đợi chấm bài</b><small>{records.filter((record) => record.status !== "Đã chấm").length} bài chưa chấm</small></div></div>{records.map((record) => <GradeRow key={record.id} record={record} assignment={assignments.find((item) => String(item.id) === record.assignmentId)} onSave={onGrade} />)}</section>;
}

function GradeRow({ record, assignment, onSave }: { record: Workspace["submissionRecords"][number]; assignment?: Assignment; onSave: (id: string, score: string, feedback: string) => void }) {
  const [score, setScore] = useState(record.score || "");
  const [feedback, setFeedback] = useState(record.feedback || "");
  const maxScore = Number(assignment?.maxScore);
  const scoreValue = Number(score.trim().replace(",", "."));
  const invalidScore = score.trim() !== "" && Number.isFinite(maxScore) && maxScore > 0 && (!Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > maxScore);
  return <article><span>{initials(record.studentName || "HS")}</span><div><b>{record.studentName || "Học sinh"}</b><small>{assignment?.title || "Bài tập"} · {record.submittedAt ? new Date(record.submittedAt).toLocaleString("vi-VN") : "Đã nộp"}</small>{record.contentHtml && <p className="assignment-excerpt">{record.contentHtml.replace(/<[^>]*>/g, " ").trim().slice(0, 160)}</p>}</div><input aria-label="Điểm" aria-invalid={invalidScore} value={score} onChange={(event) => setScore(event.target.value)} placeholder={Number.isFinite(maxScore) && maxScore > 0 ? `Điểm /${maxScore}` : "Điểm"} title={invalidScore ? `Điểm phải là số từ 0 đến ${maxScore}` : undefined} /><input aria-label="Nhận xét" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Nhận xét" /><button disabled={!score.trim() || invalidScore} onClick={() => onSave(record.id, score.trim(), feedback.trim())}>Lưu điểm</button></article>;
}

function ContentModeration({ data }: { data: Workspace }) {
  return <div className="moderation-grid">{[[String(data.classes.length), "Lớp học", "Đang lưu trên Supabase"], [String(data.assignments.length), "Bài tập", "Không có dữ liệu mẫu"], [String(data.submissionRecords.length), "Bài nộp", "Đã đồng bộ"]].map((item) => <article className="panel" key={item[1]}><b>{item[0]}</b><h3>{item[1]}</h3><p>{item[2]}</p></article>)}</div>;
}

function ActivityRows({ data }: { data: Workspace }) {
  const rows = [
    ["Lớp học", `${data.classes.length} lớp đang lưu`, "Supabase"],
    ["Bài tập", `${data.assignments.length} bài đã giao`, "Supabase"],
    ["Bài nộp", `${data.submissionRecords.length} bài đã nhận`, "Supabase"],
  ];
  return <div className="activity-rows">{rows.map((row, index) => <div key={row[0]}><span>{["▦", "▤", "✓"][index]}</span><p><b>{row[0]}</b><small>{row[1]}</small></p><em>{row[2]}</em></div>)}</div>;
}
function TeacherTasks({
  data,
  onAction,
}: {
  data: Workspace;
  onAction: (a: string) => void;
}) {
  return (
    <div className="task-rows">
      {data.assignments.slice(0, 3).map((a, i) => (
        <div key={a.id}>
          <span>{i + 1}</span>
          <p>
            <b>{a.title}</b>
            <small>
              {a.className} · Hạn {a.due}
            </small>
          </p>
          <em>{a.progress}</em>
          <button onClick={() => onAction("Chấm bài")}>Xử lý →</button>
        </div>
      ))}
    </div>
  );
}
function StudentSchedule({ assignments, onSubmit }: { assignments: Assignment[]; onSubmit: () => void }) {
  if (!assignments.length) return <EmptyData title="Chưa có bài cần làm" note="Bài tập mới sẽ xuất hiện khi giáo viên giao." />;
  return <div className="schedule">{assignments.slice(0, 3).map((assignment, index) => <div key={assignment.id}><b>{assignment.due || "—"}</b><span className={`c${index}`} /><p><b>{assignment.title}</b><small>{assignment.subject} · {assignment.className}</small></p><button onClick={onSubmit}>Nộp bài</button></div>)}</div>;
}

function ActionModal({
  modal,
  data,
  close,
  submit,
}: {
  modal: Exclude<Modal, null>;
  role: Role;
  data: Workspace;
  close: () => void;
  submit: (kind: string, payload: Record<string, string>) => void;
}) {
  const [payload, setPayload] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setPayload((p) => ({ ...p, [k]: v }));
  if (modal === "process")
    return (
      <ModalShell title="Quy trình vận hành theo vai trò" close={close}>
        <div className="process-flow">
          {Object.entries(roleMeta).map(([key, m], i) => (
            <article key={key}>
              <span>{i + 1}</span>
              <div>
                <b>{m.label}</b>
                <p>{processFor(key as Role)}</p>
              </div>
            </article>
          ))}
        </div>
        <button className="primary full" onClick={close}>
          Đã hiểu quy trình
        </button>
      </ModalShell>
    );
  const titles: Record<string, string> = {
    assignment: "Giao bài tập mới",
    class: "Tạo lớp học",
    submit: "Nộp bài tập",
    register: "Tạo tài khoản mới",
  };
  return (
    <ModalShell title={titles[modal]} close={close}>
      {modal === "assignment" ? (
        <AssignmentComposer classes={data.classes} onSubmit={(assignment) => submit("assignment", assignment)} />
      ) : modal === "class" ? (
        <div className="form-grid">
          <Field label="Tên lớp">
            <input
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ví dụ: 10A4"
            />
          </Field>
          <Field label="Môn học">
            <input
              onChange={(e) => set("subject", e.target.value)}
              placeholder="Ngữ văn"
            />
          </Field>
          <Field wide label="Mô tả lớp">
            <textarea placeholder="Mục tiêu và ghi chú..." />
          </Field>
          <button
            className="primary full wide"
            onClick={() => submit("class", payload)}
          >
            Tạo lớp và mã tham gia
          </button>
        </div>
      ) : modal === "register" ? (
        <div className="form-grid">
          <Field wide label="Họ và tên">
            <input
              onChange={(e) => set("name", e.target.value)}
              placeholder="Nhập họ tên người dùng"
            />
          </Field>
          <Field label="Tên tài khoản">
            <input
              onChange={(e) => set("username", e.target.value.toLowerCase())}
              placeholder="Ví dụ: nguyenvana"
            />
          </Field>
          <Field label="Vai trò">
            <select
              defaultValue="student"
              onChange={(e) => set("role", e.target.value)}
            >
              <option value="teacher">Giáo viên</option>
              <option value="student">Học sinh</option>
              <option value="parent">Phụ huynh</option>
              <option value="admin">Quản trị</option>
            </select>
          </Field>
          <Field wide label="Email đăng nhập (không bắt buộc)">
            <input
              type="email"
              onChange={(e) => set("email", e.target.value)}
              placeholder="Có thể để trống"
            />
          </Field>
          <Field wide label="Mật khẩu ban đầu">
            <input
              type="password"
              onChange={(e) => set("password", e.target.value)}
              placeholder="Tối thiểu 8 ký tự"
            />
          </Field>
          <button
            className="primary full wide"
            onClick={() => submit("register", { role: "student", ...payload })}
          >
            Tạo tài khoản và cấp quyền
          </button>
        </div>
      ) : (
        <AssignmentComposer mode="submit" classes={data.classes} assignments={data.assignments} onSubmit={(submission) => submit("submit", submission)} />
      )}
    </ModalShell>
  );
}
function ModalShell({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section
        className="modal-card portal-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={close}>
          ×
        </button>
        <small className="modal-kicker">EDUPLAN AI</small>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}
function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "wide" : ""}>
      {label}
      {children}
    </label>
  );
}
function JoinClassPanel({ onJoin, busy }: { onJoin: (code: string) => Promise<boolean>; busy: boolean }) {
  const [code, setCode] = useState("");
  return (
    <section className="join-class-panel">
      <div>
        <b>Tham gia lớp học bằng mã hoặc quét QR</b>
        <small>Nhập mã do giáo viên cung cấp (ví dụ: 10A426), hoặc dùng điện thoại quét mã QR của lớp — hệ thống sẽ tự đưa em vào lớp.</small>
      </div>
      <div className="join-class-form">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Nhập mã lớp"
          aria-label="Mã lớp"
          onKeyDown={(e) => {
            if (e.key === "Enter" && code.trim()) void onJoin(code.trim()).then((ok) => ok && setCode(""));
          }}
        />
        <button
          className="primary"
          disabled={busy || !code.trim()}
          onClick={() => void onJoin(code.trim()).then((ok) => ok && setCode(""))}
        >
          {busy ? "Đang xử lý..." : "Tham gia lớp"}
        </button>
      </div>
    </section>
  );
}

function NotificationCenter({
  items,
  me,
  classes,
  zaloConnected,
  onSend,
}: {
  items: Workspace["notifications"];
  me: string;
  classes: Workspace["classes"];
  zaloConnected: boolean;
  onSend: (payload: { title: string; body: string; audience: string; zaloIds: string[] }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("Toàn trung tâm");
  const [zaloIds, setZaloIds] = useState("");
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    const ok = await onSend({
      title: title.trim(),
      body: body.trim(),
      audience,
      zaloIds: zaloIds.split(/[,\s]+/).map((id) => id.trim()).filter(Boolean),
    });
    if (ok) {
      setTitle("");
      setBody("");
      setZaloIds("");
    }
    setSending(false);
  };
  return (
    <div className="notification-center">
      <section className="panel notification-composer">
        <div className="panel-head">
          <div>
            <b>Gửi thông báo mới</b>
            <small>Thông báo lưu trong hệ thống; học sinh và phụ huynh thấy theo phạm vi lớp</small>
          </div>
        </div>
        <div className="composer-fields">
          <label>
            Tiêu đề
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Lịch kiểm tra giữa kỳ" />
          </label>
          <label>
            Phạm vi nhận
            <select value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option>Toàn trung tâm</option>
              {classes.map((c) => (
                <option key={c.id} value={c.name}>Lớp {c.name}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            Nội dung
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Nội dung thông báo gửi tới học sinh và phụ huynh..." />
          </label>
          <label className="wide">
            Gửi kèm Zalo OA <small>{zaloConnected ? "(tùy chọn · nhập user_id người quan tâm OA, cách nhau bằng dấu phẩy)" : "(Zalo OA chưa được cấu hình — chỉ gửi trong hệ thống)"}</small>
            <input
              value={zaloIds}
              onChange={(e) => setZaloIds(e.target.value)}
              placeholder={zaloConnected ? "Ví dụ: 8412345,8467890" : "Không khả dụng"}
              disabled={!zaloConnected}
            />
          </label>
        </div>
        <button className="primary full" disabled={sending || !title.trim() || !body.trim()} onClick={() => void send()}>
          {sending ? "Đang gửi..." : "Gửi thông báo"}
        </button>
      </section>
      <NotificationList items={items} me={me} />
    </div>
  );
}

function MessagesPanel({
  me,
  messages,
  contacts,
  onSend,
  emptyNote,
}: {
  me: string;
  messages: WorkspaceMessage[];
  contacts: { key: string; name: string; note: string }[];
  onSend: (toKey: string, body: string) => Promise<boolean>;
  emptyNote: string;
}) {
  const [selected, setSelected] = useState(contacts[0]?.key || "");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const active = contacts.find((contact) => contact.key === selected) || contacts[0];
  const thread = active
    ? messages.filter(
        (m) => (m.fromKey === me && m.toKey === active.key) || (m.fromKey === active.key && m.toKey === me),
      )
    : [];
  if (!contacts.length)
    return <EmptyData title="Chưa có cuộc trao đổi" note={emptyNote} />;
  const send = async () => {
    if (!active || !body.trim()) return;
    setSending(true);
    const ok = await onSend(active.key, body.trim());
    if (ok) setBody("");
    setSending(false);
  };
  return (
    <div className="message-layout">
      <section className="panel conversations">
        {contacts.map((contact) => {
          const last = messages.filter((m) => (m.fromKey === me && m.toKey === contact.key) || (m.fromKey === contact.key && m.toKey === me)).at(-1);
          return (
            <article
              key={contact.key}
              className={active?.key === contact.key ? "selected" : ""}
              onClick={() => setSelected(contact.key)}
            >
              <span>{initials(contact.name)}</span>
              <div>
                <b>{contact.name}</b>
                <p>{last ? last.body.slice(0, 60) : contact.note || "Bắt đầu trao đổi"}</p>
              </div>
              <small>{last ? new Date(last.time).toLocaleDateString("vi-VN") : ""}</small>
            </article>
          );
        })}
      </section>
      <section className="panel chat-preview">
        <div>
          <span>{initials(active?.name || "?")}</span>
          <b>{active?.name}</b>
          <small>{active?.note || "Trao đổi trực tiếp trong EduPlan AI"}</small>
        </div>
        <div className="bubbles">
          {thread.map((m) => (
            <p key={m.id} className={m.fromKey === me ? "mine" : ""} title={new Date(m.time).toLocaleString("vi-VN")}>
              {m.body}
            </p>
          ))}
          {!thread.length && <small className="chat-empty">Chưa có tin nhắn nào trong cuộc trao đổi này.</small>}
        </div>
        <div className="chat-compose">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Nhập nội dung trao đổi..."
            rows={2}
          />
          <button className="primary" disabled={sending || !body.trim()} onClick={() => void send()}>
            {sending ? "Đang gửi..." : "Gửi"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ClassQrModal({
  classInfo,
  close,
  notify,
}: {
  classInfo: Workspace["classes"][number];
  close: () => void;
  notify: (message: string, tone?: "success" | "error") => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const joinUrl = `${window.location.origin}/?join=${encodeURIComponent(classInfo.code)}`;
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, joinUrl, { width: 260, margin: 1, color: { dark: "#0b1f44", light: "#ffffff" } }).catch(() =>
      notify("Không thể tạo mã QR trên trình duyệt này", "error"),
    );
  }, [joinUrl, notify]);
  return (
    <ModalShell title={`Mời vào lớp ${classInfo.name}`} close={close}>
      <div className="class-qr">
        <canvas ref={canvasRef} aria-label={`Mã QR tham gia lớp ${classInfo.name}`} />
        <p>
          Học sinh có 2 cách tham gia lớp: <b>quét mã QR</b> bằng điện thoại
          (tự mở trang và vào lớp sau khi đăng nhập), hoặc <b>nhập mã lớp</b>{" "}
          trong mục Lớp học.
        </p>
        <div className="class-qr-code">
          <small>MÃ LỚP</small>
          <b>{classInfo.code}</b>
        </div>
        <div className="class-qr-actions">
          <CopyCodeButton code={classInfo.code} />
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(joinUrl);
                notify("Đã sao chép liên kết tham gia lớp");
              } catch {
                notify("Không thể sao chép liên kết", "error");
              }
            }}
          >
            Sao chép liên kết
          </button>
          <button
            onClick={() => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              const link = document.createElement("a");
              link.href = canvas.toDataURL("image/png");
              link.download = `QR-lop-${classInfo.code}.png`;
              link.click();
            }}
          >
            ⇩ Tải ảnh QR
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function AttendanceModal({
  classInfo,
  close,
  save,
}: {
  classInfo: Workspace["classes"][number];
  close: () => void;
  save: (session: AttendanceSession) => void;
}) {
  const [date, setDate] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
  );
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const members = classInfo.members || [];
  const toggle = (key: string) =>
    setAbsent((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <ModalShell title={`Điểm danh lớp ${classInfo.name}`} close={close}>
      <label className="attendance-date">
        Ngày điểm danh
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {members.length === 0 ? (
        <EmptyData title="Lớp chưa có học sinh" note="Học sinh tham gia bằng mã lớp sẽ xuất hiện trong danh sách điểm danh." />
      ) : (
        <div className="attendance-list">
          <small>Bỏ chọn học sinh vắng mặt ({members.length - absent.size}/{members.length} có mặt)</small>
          {members.map((member) => (
            <label key={member.key} className={absent.has(member.key) ? "absent" : ""}>
              <input
                type="checkbox"
                checked={!absent.has(member.key)}
                onChange={() => toggle(member.key)}
              />
              <b>{member.name}</b>
              <em>{absent.has(member.key) ? "Vắng" : "Có mặt"}</em>
            </label>
          ))}
        </div>
      )}
      <div className="account-modal-actions">
        <button className="soft" onClick={close}>
          Hủy
        </button>
        <button
          className="primary"
          disabled={!members.length || !date}
          onClick={() =>
            save({
              id: `att-${Date.now()}`,
              classId: classInfo.id,
              className: classInfo.name,
              date,
              absentKeys: [...absent],
              total: members.length,
            })
          }
        >
          Lưu điểm danh
        </button>
      </div>
    </ModalShell>
  );
}

function AttendanceOverview({
  sessions,
  childKey,
  childName,
  classes,
}: {
  sessions: AttendanceSession[];
  childKey: string;
  childName: string;
  classes: Workspace["classes"];
}) {
  if (!sessions.length)
    return <EmptyData title="Chưa có dữ liệu chuyên cần" note={`Giáo viên chưa điểm danh các lớp của ${childName}.`} />;
  const absent = sessions.filter((s) => s.absentKeys.includes(childKey));
  const percent = Math.round(((sessions.length - absent.length) / sessions.length) * 100);
  const ordered = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="attendance-grid">
      <section className="panel attendance-score">
        <div className="ring">
          <b>{percent}%</b>
          <small>chuyên cần</small>
        </div>
        <div>
          <h3>{childName}</h3>
          <p>
            Có mặt {sessions.length - absent.length}/{sessions.length} buổi ·{" "}
            {classes.map((c) => c.name).join(", ") || "Chưa vào lớp"}
          </p>
        </div>
      </section>
      <section className="panel attendance-log">
        <div className="panel-head">
          <div>
            <b>Nhật ký điểm danh</b>
            <small>Theo từng buổi giáo viên đã lưu</small>
          </div>
        </div>
        {ordered.slice(0, 20).map((s) => (
          <div className="attendance-row" key={s.id}>
            <b>{new Date(`${s.date}T00:00:00`).toLocaleDateString("vi-VN")}</b>
            <span>Lớp {s.className}</span>
            <em className={`status ${s.absentKeys.includes(childKey) ? "off" : "ok"}`}>
              {s.absentKeys.includes(childKey) ? "Vắng mặt" : "Có mặt"}
            </em>
          </div>
        ))}
      </section>
    </div>
  );
}

function quickActions(role: Role) {
  return role === "admin"
    ? [
        {
          icon: "♙",
          label: "Duyệt tài khoản",
          note: "Dữ liệu tài khoản thật",
          action: "Người dùng",
        },
        {
          icon: "▦",
          label: "Quản lý lớp",
          note: "Lớp đã đồng bộ",
          action: "Lớp học",
        },
        {
          icon: "⚙",
          label: "Cấu hình hệ thống",
          note: "AI và Zalo",
          action: "Cấu hình",
        },
      ]
    : role === "teacher"
      ? [
          {
            icon: "✦",
            label: "Tạo bài dạy AI",
            note: "KHBD và học liệu",
            action: "lesson",
          },
          {
            icon: "▶",
            label: "Tạo bài eLearning",
            note: "Tương tác và tự chấm",
            action: "eLearning tại nhà",
          },
          {
            icon: "▣",
            label: "Tạo trình chiếu trên lớp",
            note: "Nội dung · sơ đồ · tương tác",
            action: "Trình chiếu trên lớp",
          },
          {
            icon: "✓",
            label: "Tạo luyện tập & kiểm tra",
            note: "Thường xuyên · giữa kỳ · học kỳ",
            action: "Luyện tập & kiểm tra",
          },
          {
            icon: "▤",
            label: "Giao bài tập",
            note: "Đến một hoặc nhiều lớp",
            action: "assignment",
          },
          {
            icon: "✓",
            label: "Chấm bài",
            note: "Theo bài nộp thật",
            action: "Chấm bài",
          },
        ]
      : role === "student"
        ? [
            {
              icon: "▶",
              label: "Học trực tuyến",
              note: "Bài học eLearning",
              action: "Học trực tuyến",
            },
            {
              icon: "⇧",
              label: "Nộp bài",
              note: "Chọn bài được giao",
              action: "submit",
            },
            {
              icon: "✓",
              label: "Luyện tập & kiểm tra",
              note: "Làm bài và xem điểm",
              action: "Luyện tập & kiểm tra",
            },
            {
              icon: "▦",
              label: "Vào lớp học",
              note: "Theo lớp đã tham gia",
              action: "Lớp học",
            },
            {
              icon: "↗",
              label: "Xem kết quả",
              note: "Điểm giáo viên đã chấm",
              action: "Kết quả",
            },
          ]
        : [
            {
              icon: "↗",
              label: "Kết quả của con",
              note: "Theo học sinh đã liên kết",
              action: "Kết quả của con",
            },
            {
              icon: "♢",
              label: "Xem thông báo",
              note: "Thông báo đã lưu",
              action: "Thông báo",
            },
            {
              icon: "✉",
              label: "Nhắn giáo viên",
              note: "Trao đổi trực tiếp",
              action: "Trao đổi",
            },
          ];
}
function descriptionFor(view: string) {
  const map: Record<string, string> = {
    "Người dùng": "Tạo, duyệt, phân quyền, chỉnh sửa, khóa hoặc xóa tài khoản.",
    "Lớp học": "Theo dõi quy mô, mã tham gia và tình trạng hoạt động.",
    "Nội dung": "Rà soát KHBD, học liệu chia sẻ và báo cáo vi phạm.",
    "Cấu hình": "Quản lý tích hợp AI, Zalo và thiết lập vận hành.",
    "Lớp của tôi": "Tạo lớp, mời học sinh và quản lý sổ lớp.",
    "eLearning tại nhà": "Tạo video tự học, khóa tua và chèn câu hỏi bắt buộc theo mốc thời gian.",
    "Trình chiếu trên lớp": "Tạo bài trình chiếu web có nội dung, từ khóa, sơ đồ tư duy và hoạt động tương tác.",
    "Học trực tuyến": "Học từng hoạt động, làm bài tương tác và lưu tiến độ tự động.",
    "AI soạn giảng": "Tạo KHBD, slide, phiếu học tập và câu hỏi.",
    "Bài tập": "Giao, nhận và theo dõi tiến độ nộp bài.",
    "Chấm bài": "Chấm điểm, viết phản hồi và trả kết quả.",
    "Học liệu": "Tài liệu, bài trình chiếu và video học tập.",
    "Kết quả": "Điểm số, tiến độ và nhận xét của giáo viên.",
    "Kết quả của con": "Theo dõi điểm số và nhận xét mới nhất.",
    "Chuyên cần": "Theo dõi ngày có mặt, nghỉ phép và đi trễ.",
    "Thông báo": "Thông tin từ giáo viên và nhà trường.",
    "Trao đổi": "Kênh liên lạc trực tiếp với giáo viên.",
  };
  return map[view] || "Không gian làm việc được phân quyền an toàn.";
}
function processFor(role: Role) {
  return role === "admin"
    ? "Khởi tạo năm học → duyệt tài khoản → phân quyền → giám sát lớp, nội dung và tích hợp → xem nhật ký."
    : role === "teacher"
      ? "Tạo lớp → mời học sinh → tạo KHBD/học liệu bằng AI → giao bài → nhận và chấm → gửi kết quả, thông báo."
      : role === "student"
        ? "Tham gia lớp → xem lịch và học liệu → làm/nộp bài → nhận điểm, phản hồi → theo dõi tiến độ."
        : "Liên kết với học sinh → nhận thông báo → theo dõi điểm/chuyên cần → trao đổi với giáo viên.";
}
function menuIcon(item: string) {
  return item.includes("Tổng")
    ? "⌂"
    : item.includes("Người")
      ? "♙"
      : item.includes("Lớp")
        ? "▦"
      : item.includes("AI")
          ? "✦"
          : item.includes("eLearning") || item.includes("trực tuyến")
            ? "▶"
            : item.includes("Trình chiếu")
              ? "▣"
          : item.includes("Bài") || item.includes("Chấm")
            ? "▤"
            : item.includes("Trao")
              ? "✉"
            : item.includes("Thông")
              ? "♢"
              : item.includes("Kết")
                ? "↗"
                : item.includes("Cấu")
                  ? "⚙"
                  : "◫";
}
function greeting() {
  const hour = new Date().getHours();
  return hour < 11
    ? "Chào buổi sáng"
    : hour < 13
      ? "Chào buổi trưa"
      : hour < 18
        ? "Chào buổi chiều"
        : "Chào buổi tối";
}
function initials(name: string) {
  return name
    .split(" ")
    .slice(-2)
    .map((x) => x[0])
    .join("");
}
