"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ELearningModule } from "./elearning";
import { ClassroomPresentationStudio } from "./classroom-presentation";
import { AssignmentComposer, type AssignmentAttachment } from "./assignment-composer";
import { AssessmentStudio } from "./assessment-studio";

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
};
type Modal =
  | "lesson"
  | "assignment"
  | "class"
  | "submit"
  | "message"
  | "register"
  | "process"
  | null;
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
  }[];
  notifications: {
    id: number;
    title: string;
    body: string;
    audience: string;
    time: string;
    read: boolean;
  }[];
  settings: {
    openai: boolean;
    zalo: boolean;
    autoNotify: boolean;
    maintenance: boolean;
  };
  assessments: Array<Record<string, unknown>>;
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
  submissions: number;
  attendance: number;
};

const initialWorkspace: Workspace = {
  users: [],
  classes: [],
  assignments: [],
  notifications: [],
  assessments: [],
  settings: {
    openai: false,
    zalo: false,
    autoNotify: false,
    maintenance: false,
  },
  submissionRecords: [],
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
    submissionRecords: records,
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
    menu: ["Tổng quan", "Người dùng", "Lớp học", "Nội dung", "Cấu hình"],
  },
  teacher: {
    label: "Giáo viên",
    welcome: "Chào thầy Hoàng Anh",
    subtitle: "Quản lý lớp, soạn giảng bằng AI, giao bài và đánh giá học sinh.",
    color: "#0891b2",
    menu: ["Tổng quan", "Lớp của tôi", "eLearning tại nhà", "Trình chiếu trên lớp", "Luyện tập & kiểm tra", "AI soạn giảng", "Bài tập", "Chấm bài"],
  },
  student: {
    label: "Học sinh",
    welcome: "Chào Gia Huy",
    subtitle: "Học tập, nộp bài, xem phản hồi và theo dõi tiến độ cá nhân.",
    color: "#2563eb",
    menu: ["Tổng quan", "Học trực tuyến", "Luyện tập & kiểm tra", "Lớp học", "Bài tập", "Học liệu", "Kết quả"],
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
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [session, setSession] = useState<{
    authenticated: boolean;
    account: SessionAccount | null;
  } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ManagedAccount | null>(
    null,
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [services, setServices] = useState<Record<string, boolean>>({});
  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
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
    const demo = window.location.hostname === "terminal.local";
    if (demo) {
      queueMicrotask(() => setAccounts([
        {
          accountKey: session.account.accountKey,
          email: session.account.email,
          username: session.account.username,
          name: session.account.name,
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
  const metrics = useMemo(
    () =>
      role === "admin"
        ? [
            [
              "Người dùng",
              accounts.length,
              `${accounts.filter((a) => a.status === "active").length} đang hoạt động`,
            ],
            ["Lớp đang hoạt động", data.classes.length, `${data.classes.reduce((sum, item) => sum + item.students, 0)} học sinh`],
            ["Bài tập", data.assignments.length, "Đã lưu trên Supabase"],
            ["Bài nộp", data.submissionRecords.length, "Dữ liệu thực"],
          ]
        : role === "teacher"
          ? [
              ["Lớp phụ trách", data.classes.length, `${data.classes.reduce((sum, item) => sum + item.students, 0)} học sinh`],
              ["Bài cần chấm", data.submissionRecords.filter((item) => item.status === "Đã nộp").length, "Theo bài nộp thật"],
              ["Bài tập đã giao", data.assignments.length, "Đồng bộ Supabase"],
              ["Thông báo mới", data.notifications.filter((item) => !item.read).length, "Chưa đọc"],
            ]
          : role === "student"
            ? [
                ["Bài cần làm", data.assignments.length, "Được giáo viên giao"],
                ["Bài đã nộp", data.submissionRecords.filter((item) => item.studentKey === session?.account?.accountKey).length, "Đã lưu"],
                ["Lớp học", data.classes.length, "Đang hiển thị"],
                ["Thông báo", data.notifications.filter((item) => !item.read).length, "Chưa đọc"],
              ]
            : [
                ["Kết quả", "—", "Chưa liên kết học sinh"],
                ["Chuyên cần", data.attendance ? `${data.attendance}%` : "—", data.attendance ? "Đã cập nhật" : "Chưa có dữ liệu"],
                ["Bài đã nộp", data.submissionRecords.length, "Dữ liệu đã lưu"],
                ["Thông báo", data.notifications.filter((item) => !item.read).length, "Chưa đọc"],
              ],
    [role, data, accounts],
  );
  const filteredAccounts = accounts.filter((u) =>
    (u.name + (u.email || "") + (u.username || "") + roleMeta[u.role].label)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

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
              placeholder="Tìm lớp học, người dùng, bài tập..."
            />
          </div>
          <div className="role-identity">
            <span>Đăng nhập với vai trò</span>
            <b>{roleMeta[role].label}</b>
          </div>
          <button
            className="bell"
            onClick={() =>
              setView(role === "parent" ? "Thông báo" : "Tổng quan")
            }
            aria-label="Thông báo"
          >
            ♢<i />
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
              <h1>{view === "Tổng quan" ? `Chào buổi sáng, ${session.account.name}` : view}</h1>
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
              {role === "teacher" && view !== "eLearning tại nhà" && view !== "Trình chiếu trên lớp" && view !== "Luyện tập & kiểm tra" && (
                <button
                  className="primary"
                  onClick={() =>
                    setModal(
                      view === "Lớp của tôi"
                        ? "class"
                        : view === "Bài tập"
                          ? "assignment"
                          : "lesson",
                    )
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
                      ? setModal("lesson")
                      : action === "assignment"
                        ? setModal("assignment")
                        : action === "submit"
                          ? setModal("submit")
                          : action === "message"
                            ? setModal("message")
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
                  classes={data.classes}
                  admin
                />
              )}
              {role === "admin" && view === "Nội dung" && (
                <ContentModeration data={data} />
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
                  classes={data.classes}
                />
              )}
              {(role === "teacher" || role === "student") && view === "Luyện tập & kiểm tra" && <AssessmentStudio role={role} notify={notify} />}
              {role === "teacher" && view === "eLearning tại nhà" && (
                <ELearningModule role="teacher" notify={notify} />
              )}
              {role === "teacher" && view === "Trình chiếu trên lớp" && (
                <ClassroomPresentationStudio notify={notify} />
              )}
              {role === "teacher" && view === "AI soạn giảng" && (
                <AiStudio
                  onCreate={() => setModal("lesson")}
                  onAction={notify}
                />
              )}
              {role === "teacher" && view === "Bài tập" && (
                <Assignments
                  data={data.assignments}
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
                <ClassesGrid
                  classes={data.classes.slice(0, 2)}
                />
              )}
              {role === "student" && view === "Học trực tuyến" && (
                <ELearningModule role="student" notify={notify} />
              )}
              {role === "student" && view === "Bài tập" && (
                <Assignments
                  data={data.assignments}
                  onCreate={() => setModal("submit")}
                />
              )}
              {role === "student" && view === "Học liệu" && (
                <LearningResources assignments={data.assignments} />
              )}
              {role === "student" && view === "Kết quả" && <StudentResults records={data.submissionRecords.filter((item) => item.studentKey === session.account.accountKey)} assignments={data.assignments} />}
              {role === "parent" && view === "Kết quả của con" && (
                <EmptyData title="Chưa liên kết học sinh" note="Kết quả chỉ xuất hiện sau khi Admin liên kết tài khoản phụ huynh với học sinh." />
              )}
              {role === "parent" && view === "Chuyên cần" && <EmptyData title="Chưa có dữ liệu chuyên cần" note="Nhà trường chưa cập nhật dữ liệu điểm danh cho tài khoản này." />}
              {role === "parent" && view === "Thông báo" && (
                <NotificationList
                  items={data.notifications}
                />
              )}
              {role === "parent" && view === "Trao đổi" && (
                <EmptyData title="Chưa có cuộc trao đổi" note="Kênh trao đổi sẽ mở sau khi tài khoản được liên kết với học sinh và giáo viên phụ trách." />
              )}
            </>
          )}
        </div>
      </section>
      {modal && (
        <ActionModal
          modal={modal}
          role={role}
          data={data}
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
            } else if (kind === "lesson") {
              setView("Trình chiếu trên lớp");
              notify("Hãy tải slide hoặc tài liệu để Kira AI tạo bài trình chiếu thật");
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
            } else {
              notify("Chức năng trao đổi chưa được cấu hình người nhận");
              return;
            }
            setModal(null);
          }}
        />
      )}
      {editingAccount && (
        <AccountEditModal
          account={editingAccount}
          currentKey={session.account.accountKey}
          close={() => setEditingAccount(null)}
          save={saveAccount}
          remove={deleteAccount}
        />
      )}
      {profileOpen && (
        <ProfileModal
          account={session.account}
          close={() => setProfileOpen(false)}
          onUpdated={(account) => {
            setSession({ authenticated: true, account });
            notify("Đã cập nhật hồ sơ");
          }}
          notify={notify}
        />
      )}
      {toast && (
        <div className="toast">
          <span>✓</span>
          {toast}
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
  const [mode, setMode] = useState<"login" | "register">(
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
              className={mode === "login" ? "active" : ""}
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
                <button onClick={() => setMode("register")}>
                  Tạo tài khoản bằng tên đăng nhập
                </button>
                <span>·</span>
                <button>Liên hệ quản trị</button>
              </div>
            </div>
          ) : (
            <div className="auth-view register-view">
              <small className="auth-kicker">TẠO TÀI KHOẢN MỚI</small>
              <h2>Tham gia EduPlan AI</h2>
              <p>
                Chỉ cần tên tài khoản và mật khẩu; email có thể để trống. Tài
                đăng ký xong có thể sử dụng ngay, không cần chờ phê duyệt.
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
  close,
  onUpdated,
  notify,
}: {
  account: SessionAccount;
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
    if (draft.newPassword !== draft.confirmPassword) {
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
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
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
              <b>Mật khẩu được bảo vệ</b>
              <small>
                Mật khẩu được mã hóa một chiều và không hiển thị cho bất kỳ ai.
              </small>
            </div>
          </div>
          {account.hasPassword && (
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
  close,
  save,
  remove,
}: {
  account: ManagedAccount;
  currentKey: string;
  close: () => void;
  save: (account: ManagedAccount) => void;
  remove: (accountKey: string) => void;
}) {
  const [draft, setDraft] = useState(account);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const protectedAccount = account.accountKey === currentKey;
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
            <option value="locked">Đã khóa</option>
          </select>
        </Field>
      </div>
      {protectedAccount && (
        <p className="protected-note">
          Tài khoản Admin đang đăng nhập được bảo vệ: không thể hạ quyền, khóa
          hoặc xóa.
        </p>
      )}
      <div className="account-modal-actions">
        <button className="soft" onClick={close}>
          Hủy
        </button>
        <button className="primary" onClick={() => save(draft)}>
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
}: {
  classes: Workspace["classes"];
  admin?: boolean;
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
              {c.students} học sinh · Mã {c.code}
            </p>
            <div className="progress">
              <i style={{ width: `${c.progress}%` }} />
            </div>
            <div>
              <button onClick={() => navigator.clipboard?.writeText(c.code)}>
                Sao chép mã
              </button>
            </div>
          </div>
        </article>
      ))}
      {classes.length === 0 && <EmptyData title="Chưa có lớp học" note={admin ? "Lớp do giáo viên tạo sẽ được đồng bộ tại đây." : "Bấm Tạo mới để tạo lớp đầu tiên và nhận mã tham gia."} />}
    </div>
  );
}
function Assignments({
  data,
  teacher,
  onCreate,
  onOpenSubmissions,
}: {
  data: Assignment[];
  teacher?: boolean;
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
        {data.map((a) => (
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
            <em className="status wait">{a.status}</em>
            <button
              onClick={() => teacher ? onOpenSubmissions?.() : onCreate()}
            >
              {teacher ? "Xem bài" : "Làm bài"}
            </button>
          </article>
        ))}
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
function AiStudio({
  onCreate,
  onAction,
}: {
  onCreate: () => void;
  onAction: (m: string) => void;
}) {
  return (
    <div className="ai-layout">
      <section className="ai-hero">
        <span>✦ TRỢ LÝ AI SOẠN GIẢNG</span>
        <h2>Một chủ đề, trọn bộ học liệu.</h2>
        <p>
          AI xây dựng nội dung theo CTGDPT 2018 và cấu trúc hoạt động của Công
          văn 5512.
        </p>
        <button onClick={onCreate}>✦ Bắt đầu tạo bài dạy →</button>
      </section>
      <div className="ai-tools">
        {[
          ["KHBD 5512", "Mục tiêu, thiết bị, tiến trình 4 hoạt động"],
          ["Slide bài giảng", "Bố cục trình chiếu và ghi chú giáo viên"],
          ["Phiếu học tập", "Câu hỏi, nhiệm vụ và tiêu chí đánh giá"],
          ["Ngân hàng câu hỏi", "Trắc nghiệm, tự luận kèm đáp án"],
        ].map((t, i) => (
          <article key={t[0]}>
            <span>{["✦", "▰", "▤", "✓"][i]}</span>
            <div>
              <b>{t[0]}</b>
              <small>{t[1]}</small>
            </div>
            <button
              onClick={() =>
                i === 0 ? onCreate() : onAction(`Đã mở công cụ ${t[0]}`)
              }
            >
              Mở →
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
function LearningResources({ assignments }: { assignments: Assignment[] }) {
  const files = assignments.flatMap((assignment) => (assignment.attachments || []).map((file) => ({ ...file, assignment: assignment.title })));
  if (!files.length) return <EmptyData title="Chưa có học liệu" note="Tệp giáo viên đính kèm trong bài tập sẽ xuất hiện tại đây." />;
  return <div className="resource-grid">{files.map((file) => <article key={file.id}><span>▤</span><small>TỆP HỌC LIỆU</small><h3>{file.name}</h3><p>{file.assignment}</p><a href={file.url} target="_blank" rel="noreferrer">Mở học liệu →</a></article>)}</div>;
}

function StudentResults({ records, assignments }: { records: Workspace["submissionRecords"]; assignments: Assignment[] }) {
  const graded = records.filter((record) => record.score !== undefined && record.score !== "");
  if (!graded.length) return <EmptyData title="Chưa có kết quả" note="Điểm và phản hồi sẽ xuất hiện sau khi giáo viên chấm bài." />;
  return <section className="panel table-panel"><div className="toolbar"><div><b>Kết quả học tập</b><small>Dữ liệu chấm bài đã lưu trên Supabase</small></div></div><div className="assignment-list">{graded.map((record) => { const assignment = assignments.find((item) => String(item.id) === record.assignmentId); return <article key={record.id}><span>✓</span><div><b>{assignment?.title || "Bài tập"}</b><p>{record.feedback || "Chưa có nhận xét"}</p></div><strong>{record.score}</strong><em className="status ok">Đã chấm</em></article>; })}</div></section>;
}

function EmptyData({ title, note }: { title: string; note: string }) {
  return <div className="learning-empty"><span>◇</span><b>{title}</b><p>{note}</p></div>;
}
function NotificationList({
  items,
}: {
  items: Workspace["notifications"];
}) {
  return (
    <section className="panel notification-list">
      {items.map((n) => (
        <article className={n.read ? "" : "unread"} key={n.id}>
          <span>♢</span>
          <div>
            <b>{n.title}</b>
            <p>{n.body}</p>
            <small>
              {n.audience} · {n.time}
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
  return <article><span>{initials(record.studentName || "HS")}</span><div><b>{record.studentName || "Học sinh"}</b><small>{assignment?.title || "Bài tập"} · {record.submittedAt ? new Date(record.submittedAt).toLocaleString("vi-VN") : "Đã nộp"}</small>{record.contentHtml && <p className="assignment-excerpt">{record.contentHtml.replace(/<[^>]*>/g, " ").trim().slice(0, 160)}</p>}</div><input aria-label="Điểm" value={score} onChange={(event) => setScore(event.target.value)} placeholder="Điểm" /><input aria-label="Nhận xét" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Nhận xét" /><button disabled={!score.trim()} onClick={() => onSave(record.id, score.trim(), feedback.trim())}>Lưu điểm</button></article>;
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
  const [step, setStep] = useState(0);
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
    lesson: "Tạo bộ bài dạy bằng AI",
    assignment: "Giao bài tập mới",
    class: "Tạo lớp học",
    submit: "Nộp bài tập",
    message: "Nhắn tin cho giáo viên",
    register: "Tạo tài khoản mới",
  };
  return (
    <ModalShell title={titles[modal]} close={close}>
      {modal === "lesson" ? (
        <>
          {step === 0 ? (
            <div className="form-grid">
              <Field label="Môn học">
                <select onChange={(e) => set("subject", e.target.value)}>
                  <option>Ngữ văn</option>
                  <option>Toán</option>
                  <option>Tiếng Anh</option>
                  <option>Vật lí</option>
                </select>
              </Field>
              <Field label="Khối lớp">
                <select>
                  <option>10</option>
                  <option>11</option>
                  <option>12</option>
                </select>
              </Field>
              <Field wide label="Chủ đề">
                <input
                  onChange={(e) => set("name", e.target.value)}
                  defaultValue="Thần thoại và sử thi"
                />
              </Field>
              <Field wide label="Yêu cầu cần đạt">
                <textarea defaultValue="Nhận biết đặc trưng thể loại; phân tích nhân vật; vận dụng sáng tạo." />
              </Field>
              <button className="primary full wide" onClick={() => setStep(1)}>
                ✦ Tạo với AI →
              </button>
            </div>
          ) : (
            <div className="generation-result">
              <span>✓</span>
              <h3>Đã tạo trọn bộ học liệu</h3>
              <p>KHBD 5512 · 18 slide · 02 phiếu học tập · 20 câu hỏi</p>
              <div>
                {[
                  "Mục tiêu và yêu cầu cần đạt",
                  "Tiến trình 4 hoạt động",
                  "Đánh giá theo năng lực",
                  "Học liệu kèm đáp án",
                ].map((x) => (
                  <b key={x}>✓ {x}</b>
                ))}
              </div>
              <button
                className="primary full"
                onClick={() => submit("lesson", payload)}
              >
                Lưu vào kho học liệu
              </button>
            </div>
          )}
        </>
      ) : modal === "assignment" ? (
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
      ) : modal === "submit" ? (
        <AssignmentComposer mode="submit" classes={data.classes} assignments={data.assignments} onSubmit={(submission) => submit("submit", submission)} />
      ) : (
        <div>
          <Field label="Giáo viên">
            <select>
              <option>Cô Nguyễn Minh Châu</option>
              <option>Thầy Trần Anh Tuấn</option>
            </select>
          </Field>
          <Field label="Nội dung">
            <textarea
              onChange={(e) => set("body", e.target.value)}
              placeholder="Nhập nội dung cần trao đổi..."
            />
          </Field>
          <button
            className="primary full"
            onClick={() => submit("message", payload)}
          >
            Gửi tin nhắn
          </button>
        </div>
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
              note: "Cần liên kết học sinh",
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
              action: "message",
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
            : item.includes("Thông")
              ? "♢"
              : item.includes("Kết")
                ? "↗"
                : item.includes("Cấu")
                  ? "⚙"
                  : "◫";
}
function initials(name: string) {
  return name
    .split(" ")
    .slice(-2)
    .map((x) => x[0])
    .join("");
}
