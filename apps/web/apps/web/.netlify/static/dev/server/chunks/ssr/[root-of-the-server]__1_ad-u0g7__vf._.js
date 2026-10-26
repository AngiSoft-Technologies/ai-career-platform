module.exports = [
(()=>{"use strict";return[
"[project]/apps/web/src/components/service-worker.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ServiceWorkerRegistrar",
    ()=>ServiceWorkerRegistrar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
function ServiceWorkerRegistrar() {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if ("TURBOPACK compile-time truthy", 1) return;
        //TURBOPACK unreachable
        ;
        const register = undefined;
    }, []);
    return null;
}
}),
"[project]/apps/web/src/components/session.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SessionProvider",
    ()=>SessionProvider,
    "useSession",
    ()=>useSession
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/auth.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/api.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$components$2f$theme$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/components/theme.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
const SessionContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createContext"])({
    session: null,
    loading: true,
    roles: [
        "job_seeker"
    ],
    permissions: [],
    primaryRole: "job_seeker",
    has: ()=>false,
    refresh: async ()=>undefined,
    signIn: async ()=>false,
    signUp: async ()=>false,
    signOut: async ()=>undefined,
    switchRole: ()=>undefined
});
const ROLE_ORDER = [
    "super_admin",
    "admin",
    "source_curator",
    "moderator",
    "support_agent",
    "automation",
    "analyst",
    "job_seeker"
];
function SessionProvider({ children }) {
    const [session, setSession] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(true);
    const [serverRoles, setServerRoles] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [serverPermissions, setServerPermissions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const { role, setRole } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$components$2f$theme$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTheme"])();
    const refresh = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        try {
            const next = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetchSession"])();
            setSession(next);
            if (!next) {
                const cached = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cachedSession"])();
                if (cached) setSession(cached);
            }
        } catch  {
            const cached = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cachedSession"])();
            if (cached) setSession(cached);
        } finally{
            setLoading(false);
        }
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        void refresh();
    }, [
        refresh
    ]);
    const loadIdentity = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (userId)=>{
        try {
            const identity = await __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["api"].get("/me");
            setServerRoles((identity.roles ?? []).filter((name)=>ROLE_ORDER.includes(name)));
            setServerPermissions(identity.permissions ?? []);
        } catch  {
            return;
        }
    }, []);
    const userId = session?.user.id ?? null;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!userId) return;
        void loadIdentity(userId);
    }, [
        userId,
        loadIdentity
    ]);
    const roles = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (serverRoles.length > 0) return serverRoles;
        return [
            role
        ];
    }, [
        serverRoles,
        role
    ]);
    const permissions = serverPermissions;
    const primaryRole = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        for (const candidate of ROLE_ORDER){
            if (roles.includes(candidate)) return candidate;
        }
        return "job_seeker";
    }, [
        roles
    ]);
    const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>({
            session,
            loading,
            roles,
            permissions,
            primaryRole,
            has: (permission)=>permissions.includes(permission),
            refresh,
            signIn: async (email, password)=>{
                const ok = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["signIn"])(email, password);
                if (ok) await refresh();
                return ok;
            },
            signUp: async (email, password, name)=>{
                const ok = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["signUp"])(email, password, name);
                if (ok) await refresh();
                return ok;
            },
            signOut: async ()=>{
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["signOut"])();
                setSession(null);
                setServerRoles([]);
                setServerPermissions([]);
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clearSession"])();
            },
            switchRole: (next)=>setRole(next)
        }), [
        session,
        loading,
        roles,
        permissions,
        primaryRole,
        refresh,
        setRole
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(SessionContext.Provider, {
        value: value,
        children: children
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/session.tsx",
        lineNumber: 162,
        columnNumber: 5
    }, this);
}
function useSession() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useContext"])(SessionContext);
}
}),
"[project]/apps/web/src/components/theme.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ROLE_HOME",
    ()=>ROLE_HOME,
    "ROLE_LABELS",
    ()=>ROLE_LABELS,
    "THEMES",
    ()=>THEMES,
    "ThemePicker",
    ()=>ThemePicker,
    "ThemeProvider",
    ()=>ThemeProvider,
    "themeForRole",
    ()=>themeForRole,
    "useTheme",
    ()=>useTheme
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
const THEMES = [
    {
        key: "aurora",
        label: "Aurora",
        tagline: "Bento glass",
        description: "Soft gradients, floating glass panels and an asymmetric bento grid for candidates who want signal without noise.",
        defaultRole: "job_seeker",
        swatch: [
            "#6d8bff",
            "#c084fc",
            "#0b1020"
        ]
    },
    {
        key: "editorial",
        label: "Editorial",
        tagline: "Print journal",
        description: "Serif typography, hairline rules and column rhythm built for reading queues, long descriptions and editorial judgement.",
        defaultRole: "moderator",
        swatch: [
            "#b3200f",
            "#1f4e79",
            "#f6f1e7"
        ]
    },
    {
        key: "terminal",
        label: "Terminal",
        tagline: "Dense console",
        description: "Monospaced, scanline console for analysts and operators who want maximum information density per pixel.",
        defaultRole: "analyst",
        swatch: [
            "#5cff9d",
            "#54d7ff",
            "#050806"
        ]
    },
    {
        key: "kinetic",
        label: "Kinetic",
        tagline: "Bold blocks",
        description: "Oversized type and hard-edged colour blocks that make live automations and throughput impossible to ignore.",
        defaultRole: "automation",
        swatch: [
            "#ff4d19",
            "#2b4cff",
            "#f4f1ea"
        ]
    },
    {
        key: "atlas",
        label: "Atlas",
        tagline: "Operations map",
        description: "Cartographic deep navy for curators and admins who reason about sources, geography and coverage at scale.",
        defaultRole: "source_curator",
        swatch: [
            "#35c3d6",
            "#f2a65a",
            "#071018"
        ]
    }
];
const ROLE_LABELS = {
    job_seeker: "Job seeker",
    analyst: "Analyst",
    moderator: "Moderator",
    support_agent: "Support agent",
    source_curator: "Source curator",
    automation: "Automation",
    admin: "Administrator",
    super_admin: "Super administrator"
};
const ROLE_HOME = {
    job_seeker: "/dashboard",
    analyst: "/dashboard",
    moderator: "/moderation",
    support_agent: "/support",
    source_curator: "/sources",
    automation: "/automation",
    admin: "/admin",
    super_admin: "/admin"
};
const ThemeContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createContext"])({
    theme: "aurora",
    setTheme: ()=>undefined,
    role: "job_seeker",
    setRole: ()=>undefined,
    hydrated: false
});
const THEME_KEY = "jr.theme";
const ROLE_KEY = "jr.role";
function ThemeProvider({ children }) {
    const [theme, setThemeState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("aurora");
    const [role, setRoleState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("job_seeker");
    const [hydrated, setHydrated] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const storedTheme = window.localStorage.getItem(THEME_KEY);
        const storedRole = window.localStorage.getItem(ROLE_KEY);
        if (storedTheme && THEMES.some((entry)=>entry.key === storedTheme)) {
            setThemeState(storedTheme);
        }
        if (storedRole) setRoleState(storedRole);
        setHydrated(true);
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!hydrated) return;
        document.documentElement.setAttribute("data-theme", theme);
        document.documentElement.style.setProperty("--font-sans-brand", "var(--font-sans)");
    }, [
        theme,
        hydrated
    ]);
    const setTheme = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((next)=>{
        setThemeState(next);
        window.localStorage.setItem(THEME_KEY, next);
    }, []);
    const setRole = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((next)=>{
        setRoleState(next);
        window.localStorage.setItem(ROLE_KEY, next);
    }, []);
    const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>({
            theme,
            setTheme,
            role,
            setRole,
            hydrated
        }), [
        theme,
        setTheme,
        role,
        setRole,
        hydrated
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ThemeContext.Provider, {
        value: value,
        children: children
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/theme.tsx",
        lineNumber: 150,
        columnNumber: 10
    }, this);
}
function useTheme() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useContext"])(ThemeContext);
}
function themeForRole(role) {
    const definition = THEMES.find((entry)=>entry.defaultRole === role);
    return definition?.key ?? "aurora";
}
function ThemePicker({ compact = false }) {
    const { theme, setTheme } = useTheme();
    if (compact) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
            className: "select",
            value: theme,
            onChange: (event)=>setTheme(event.target.value),
            "aria-label": "Theme",
            style: {
                minWidth: 130
            },
            children: THEMES.map((entry)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                    value: entry.key,
                    children: entry.label
                }, entry.key, false, {
                    fileName: "[project]/apps/web/src/components/theme.tsx",
                    lineNumber: 175,
                    columnNumber: 11
                }, this))
        }, void 0, false, {
            fileName: "[project]/apps/web/src/components/theme.tsx",
            lineNumber: 167,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "grid-2",
        style: {
            gap: "0.7rem"
        },
        children: THEMES.map((entry)=>{
            const active = entry.key === theme;
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: ()=>setTheme(entry.key),
                style: {
                    textAlign: "left",
                    cursor: "pointer",
                    padding: "0.85rem",
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    background: active ? "var(--accent-soft)" : "var(--surface)",
                    color: "inherit"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "row",
                        style: {
                            gap: "0.45rem",
                            marginBottom: 8
                        },
                        children: [
                            entry.swatch.map((color)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    style: {
                                        width: 14,
                                        height: 14,
                                        borderRadius: 4,
                                        background: color,
                                        display: "inline-block"
                                    }
                                }, color, false, {
                                    fileName: "[project]/apps/web/src/components/theme.tsx",
                                    lineNumber: 203,
                                    columnNumber: 17
                                }, this)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                style: {
                                    fontWeight: 700,
                                    fontSize: "0.9rem"
                                },
                                children: entry.label
                            }, void 0, false, {
                                fileName: "[project]/apps/web/src/components/theme.tsx",
                                lineNumber: 214,
                                columnNumber: 15
                            }, this),
                            active ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(BadgeActive, {}, void 0, false, {
                                fileName: "[project]/apps/web/src/components/theme.tsx",
                                lineNumber: 215,
                                columnNumber: 25
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/src/components/theme.tsx",
                        lineNumber: 201,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "eyebrow",
                        style: {
                            marginBottom: 4
                        },
                        children: entry.tagline
                    }, void 0, false, {
                        fileName: "[project]/apps/web/src/components/theme.tsx",
                        lineNumber: 217,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        style: {
                            fontSize: "0.78rem",
                            color: "var(--text-muted)",
                            lineHeight: 1.5
                        },
                        children: entry.description
                    }, void 0, false, {
                        fileName: "[project]/apps/web/src/components/theme.tsx",
                        lineNumber: 220,
                        columnNumber: 13
                    }, this)
                ]
            }, entry.key, true, {
                fileName: "[project]/apps/web/src/components/theme.tsx",
                lineNumber: 188,
                columnNumber: 11
            }, this);
        })
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/theme.tsx",
        lineNumber: 184,
        columnNumber: 5
    }, this);
}
function BadgeActive() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: "badge badge-accent",
        style: {
            marginLeft: "auto"
        },
        children: "Active"
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/theme.tsx",
        lineNumber: 232,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/web/src/components/ui.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Avatar",
    ()=>Avatar,
    "Badge",
    ()=>Badge,
    "BarList",
    ()=>BarList,
    "Button",
    ()=>Button,
    "Card",
    ()=>Card,
    "Chip",
    ()=>Chip,
    "EmptyState",
    ()=>EmptyState,
    "Field",
    ()=>Field,
    "IconButton",
    ()=>IconButton,
    "Input",
    ()=>Input,
    "MatchRing",
    ()=>MatchRing,
    "Meter",
    ()=>Meter,
    "Modal",
    ()=>Modal,
    "SectionTitle",
    ()=>SectionTitle,
    "Select",
    ()=>Select,
    "Skeleton",
    ()=>Skeleton,
    "Sparkline",
    ()=>Sparkline,
    "Spinner",
    ()=>Spinner,
    "StatTile",
    ()=>StatTile,
    "Switch",
    ()=>Switch,
    "TableShell",
    ()=>TableShell,
    "Tabs",
    ()=>Tabs,
    "Textarea",
    ()=>Textarea,
    "ToastProvider",
    ()=>ToastProvider,
    "cx",
    ()=>cx,
    "useToast",
    ()=>useToast
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$dom$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-dom.js [app-ssr] (ecmascript)");
"use client";
;
;
;
function cx(...values) {
    return values.filter(Boolean).join(" ");
}
function Button({ variant = "primary", size = "md", loading = false, icon, className, children, disabled, ...rest }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        className: cx("btn", variant === "primary" && "btn-primary", variant === "accent" && "btn-accent", variant === "outline" && "btn-outline", variant === "ghost" && "btn-ghost", variant === "danger" && "btn-danger", size === "sm" && "btn-sm", size === "lg" && "btn-lg", className),
        disabled: disabled || loading,
        ...rest,
        children: [
            loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Spinner, {
                size: 14
            }, void 0, false, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 58,
                columnNumber: 18
            }, this) : icon,
            children
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 43,
        columnNumber: 5
    }, this);
}
function IconButton({ className, children, ...rest }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        className: cx("btn btn-ghost btn-icon", className),
        "aria-label": rest["aria-label"],
        ...rest,
        children: children
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 70,
        columnNumber: 5
    }, this);
}
function Spinner({ size = 16 }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        "aria-hidden": true,
        style: {
            width: size,
            height: size,
            borderRadius: "50%",
            border: "2px solid currentColor",
            borderTopColor: "transparent",
            display: "inline-block",
            animation: "spin 700ms linear infinite"
        }
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 82,
        columnNumber: 5
    }, this);
}
function Card({ className, children, hover = false, as: Tag = "div", style }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tag, {
        className: cx("surface", hover && "surface-hover", className),
        style: style,
        children: children
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 111,
        columnNumber: 5
    }, this);
}
function SectionTitle({ eyebrow, title, description, action }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "row row-wrap",
        style: {
            justifyContent: "space-between",
            alignItems: "flex-end"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    minWidth: 0
                },
                children: [
                    eyebrow ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "eyebrow",
                        children: eyebrow
                    }, void 0, false, {
                        fileName: "[project]/apps/web/src/components/ui.tsx",
                        lineNumber: 131,
                        columnNumber: 20
                    }, this) : null,
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        style: {
                            fontSize: "clamp(1.1rem, 2.4vw, 1.5rem)",
                            marginTop: eyebrow ? 4 : 0
                        },
                        children: title
                    }, void 0, false, {
                        fileName: "[project]/apps/web/src/components/ui.tsx",
                        lineNumber: 132,
                        columnNumber: 9
                    }, this),
                    description ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        style: {
                            color: "var(--text-muted)",
                            fontSize: "0.88rem",
                            marginTop: 6
                        },
                        children: description
                    }, void 0, false, {
                        fileName: "[project]/apps/web/src/components/ui.tsx",
                        lineNumber: 136,
                        columnNumber: 11
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 130,
                columnNumber: 7
            }, this),
            action
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 129,
        columnNumber: 5
    }, this);
}
function Badge({ tone = "neutral", children, className }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: cx("badge", `badge-${tone}`, className),
        children: children
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 155,
        columnNumber: 10
    }, this);
}
function Chip({ active = false, onClick, children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        type: "button",
        className: "chip",
        "data-active": active,
        onClick: onClick,
        children: children
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 168,
        columnNumber: 5
    }, this);
}
function Field({ label, hint, children, className }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
        className: cx("field", className),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "label",
                children: label
            }, void 0, false, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 187,
                columnNumber: 7
            }, this),
            children,
            hint ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                style: {
                    fontSize: "0.72rem",
                    color: "var(--text-muted)"
                },
                children: hint
            }, void 0, false, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 190,
                columnNumber: 9
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 186,
        columnNumber: 5
    }, this);
}
function Input({ className, ...rest }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
        className: cx("input", className),
        ...rest
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 200,
        columnNumber: 10
    }, this);
}
function Textarea({ className, ...rest }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
        className: cx("textarea", className),
        ...rest
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 207,
        columnNumber: 10
    }, this);
}
function Select({ className, children, ...rest }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
        className: cx("select", className),
        ...rest,
        children: children
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 216,
        columnNumber: 5
    }, this);
}
function Switch({ checked, onChange, label }) {
    const id = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useId"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "row",
        style: {
            gap: "0.6rem"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                id: id,
                type: "button",
                role: "switch",
                "aria-checked": checked,
                "aria-label": label,
                className: "switch",
                "data-on": checked,
                onClick: ()=>onChange(!checked)
            }, void 0, false, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 234,
                columnNumber: 7
            }, this),
            label ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                htmlFor: id,
                style: {
                    fontSize: "0.86rem",
                    cursor: "pointer"
                },
                children: label
            }, void 0, false, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 245,
                columnNumber: 9
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 233,
        columnNumber: 5
    }, this);
}
function StatTile({ label, value, delta, tone = "neutral", hint, icon }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "surface",
        style: {
            padding: "1rem 1.1rem"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "row",
                style: {
                    justifyContent: "space-between",
                    gap: "0.5rem"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "eyebrow",
                        children: label
                    }, void 0, false, {
                        fileName: "[project]/apps/web/src/components/ui.tsx",
                        lineNumber: 271,
                        columnNumber: 9
                    }, this),
                    icon ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            color: "var(--text-muted)"
                        },
                        children: icon
                    }, void 0, false, {
                        fileName: "[project]/apps/web/src/components/ui.tsx",
                        lineNumber: 272,
                        columnNumber: 17
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 270,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "tabular",
                style: {
                    fontSize: "clamp(1.4rem, 3vw, 1.9rem)",
                    fontWeight: 800,
                    marginTop: 6,
                    letterSpacing: "-0.03em"
                },
                children: value
            }, void 0, false, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 274,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "row",
                style: {
                    gap: "0.5rem",
                    marginTop: 6
                },
                children: [
                    delta ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                        tone: tone,
                        children: delta
                    }, void 0, false, {
                        fileName: "[project]/apps/web/src/components/ui.tsx",
                        lineNumber: 286,
                        columnNumber: 18
                    }, this) : null,
                    hint ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            fontSize: "0.74rem",
                            color: "var(--text-muted)"
                        },
                        children: hint
                    }, void 0, false, {
                        fileName: "[project]/apps/web/src/components/ui.tsx",
                        lineNumber: 288,
                        columnNumber: 11
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 285,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 269,
        columnNumber: 5
    }, this);
}
function Meter({ value, max = 100 }) {
    const percent = Math.max(0, Math.min(100, value / (max || 1) * 100));
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "meter",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
            style: {
                width: `${percent}%`
            }
        }, void 0, false, {
            fileName: "[project]/apps/web/src/components/ui.tsx",
            lineNumber: 299,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 298,
        columnNumber: 5
    }, this);
}
function MatchRing({ score, size = 64 }) {
    const radius = (size - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - Math.max(0, Math.min(100, score)) / 100 * circumference;
    const tone = score >= 80 ? "var(--success)" : score >= 60 ? "var(--accent)" : score >= 40 ? "var(--warning)" : "var(--danger)";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        width: size,
        height: size,
        viewBox: `0 0 ${size} ${size}`,
        role: "img",
        "aria-label": `Match ${score}%`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                cx: size / 2,
                cy: size / 2,
                r: radius,
                fill: "none",
                stroke: "var(--surface-2)",
                strokeWidth: 6
            }, void 0, false, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 319,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                cx: size / 2,
                cy: size / 2,
                r: radius,
                fill: "none",
                stroke: tone,
                strokeWidth: 6,
                strokeLinecap: "round",
                strokeDasharray: circumference,
                strokeDashoffset: offset,
                transform: `rotate(-90 ${size / 2} ${size / 2})`,
                style: {
                    transition: "stroke-dashoffset 600ms var(--ease)"
                }
            }, void 0, false, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 327,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                x: "50%",
                y: "50%",
                textAnchor: "middle",
                dominantBaseline: "central",
                style: {
                    fontSize: size * 0.28,
                    fontWeight: 800,
                    fill: "var(--text)"
                },
                children: Math.round(score)
            }, void 0, false, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 340,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 318,
        columnNumber: 5
    }, this);
}
function Sparkline({ values, height = 40, tone = "var(--accent)" }) {
    if (values.length < 2) return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            height
        }
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 362,
        columnNumber: 33
    }, this);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const points = values.map((value, index)=>{
        const x = index / (values.length - 1) * 100;
        const y = height - (value - min) / range * (height - 4) - 2;
        return `${x},${y}`;
    }).join(" ");
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        viewBox: `0 0 100 ${height}`,
        preserveAspectRatio: "none",
        style: {
            width: "100%",
            height
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("polyline", {
            points: points,
            fill: "none",
            stroke: tone,
            strokeWidth: 2,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            vectorEffect: "non-scaling-stroke"
        }, void 0, false, {
            fileName: "[project]/apps/web/src/components/ui.tsx",
            lineNumber: 376,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 375,
        columnNumber: 5
    }, this);
}
function BarList({ items }) {
    const max = Math.max(...items.map((item)=>item.value), 1);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "stack",
        style: {
            gap: "0.6rem"
        },
        children: items.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "row",
                        style: {
                            justifyContent: "space-between",
                            marginBottom: 4
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                style: {
                                    fontSize: "0.82rem"
                                },
                                children: item.label
                            }, void 0, false, {
                                fileName: "[project]/apps/web/src/components/ui.tsx",
                                lineNumber: 400,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "mono",
                                style: {
                                    fontSize: "0.78rem",
                                    color: "var(--text-muted)"
                                },
                                children: item.hint ?? item.value
                            }, void 0, false, {
                                fileName: "[project]/apps/web/src/components/ui.tsx",
                                lineNumber: 401,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/src/components/ui.tsx",
                        lineNumber: 399,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Meter, {
                        value: item.value,
                        max: max
                    }, void 0, false, {
                        fileName: "[project]/apps/web/src/components/ui.tsx",
                        lineNumber: 405,
                        columnNumber: 11
                    }, this)
                ]
            }, item.label, true, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 398,
                columnNumber: 9
            }, this))
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 396,
        columnNumber: 5
    }, this);
}
function EmptyState({ title, description, action, icon }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "surface",
        style: {
            padding: "2.4rem 1.5rem",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.6rem"
        },
        children: [
            icon ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    color: "var(--text-muted)"
                },
                children: icon
            }, void 0, false, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 435,
                columnNumber: 15
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                style: {
                    fontSize: "1rem"
                },
                children: title
            }, void 0, false, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 436,
                columnNumber: 7
            }, this),
            description ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                style: {
                    color: "var(--text-muted)",
                    fontSize: "0.86rem",
                    maxWidth: 460
                },
                children: description
            }, void 0, false, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 438,
                columnNumber: 9
            }, this) : null,
            action
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 424,
        columnNumber: 5
    }, this);
}
function Skeleton({ height = 16, width = "100%" }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "skeleton",
        style: {
            height,
            width
        }
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 448,
        columnNumber: 10
    }, this);
}
function TableShell({ children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "surface",
        style: {
            overflow: "hidden"
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "table-scroll",
            children: children
        }, void 0, false, {
            fileName: "[project]/apps/web/src/components/ui.tsx",
            lineNumber: 454,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 453,
        columnNumber: 5
    }, this);
}
function Tabs({ tabs, active, onChange }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "row row-wrap scroll-x",
        role: "tablist",
        style: {
            gap: "0.35rem",
            borderBottom: "1px solid var(--border)",
            paddingBottom: 2
        },
        children: tabs.map((tab)=>{
            const selected = tab.key === active;
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                role: "tab",
                "aria-selected": selected,
                onClick: ()=>onChange(tab.key),
                style: {
                    background: selected ? "var(--accent-soft)" : "transparent",
                    color: selected ? "var(--accent)" : "var(--text-muted)",
                    border: "none",
                    borderBottom: `2px solid ${selected ? "var(--accent)" : "transparent"}`,
                    padding: "0.55rem 0.8rem",
                    fontSize: "0.84rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap"
                },
                children: [
                    tab.label,
                    typeof tab.count === "number" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            opacity: 0.65,
                            marginLeft: 6
                        },
                        children: tab.count
                    }, void 0, false, {
                        fileName: "[project]/apps/web/src/components/ui.tsx",
                        lineNumber: 496,
                        columnNumber: 15
                    }, this) : null
                ]
            }, tab.key, true, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 477,
                columnNumber: 11
            }, this);
        })
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 469,
        columnNumber: 5
    }, this);
}
function Modal({ open, onClose, title, children, footer, width = 560 }) {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!open) return;
        const handler = (event)=>{
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return ()=>{
            document.removeEventListener("keydown", handler);
            document.body.style.overflow = previous;
        };
    }, [
        open,
        onClose
    ]);
    if (!open || typeof document === "undefined") return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$dom$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createPortal"])(/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        onClick: onClose,
        style: {
            position: "fixed",
            inset: 0,
            background: "rgba(3, 6, 14, 0.72)",
            backdropFilter: "blur(6px)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem"
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "surface-solid animate-in",
            onClick: (event)=>event.stopPropagation(),
            style: {
                width: "100%",
                maxWidth: width,
                maxHeight: "88dvh",
                overflowY: "auto",
                boxShadow: "var(--shadow-lg)",
                borderRadius: "var(--radius-lg)"
            },
            role: "dialog",
            "aria-modal": "true",
            "aria-label": title,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "row",
                    style: {
                        justifyContent: "space-between",
                        padding: "0.9rem 1.1rem",
                        borderBottom: "1px solid var(--border)"
                    },
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                            style: {
                                fontSize: "1rem"
                            },
                            children: title
                        }, void 0, false, {
                            fileName: "[project]/apps/web/src/components/ui.tsx",
                            lineNumber: 574,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(IconButton, {
                            onClick: onClose,
                            "aria-label": "Close",
                            children: "×"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/src/components/ui.tsx",
                            lineNumber: 575,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/src/components/ui.tsx",
                    lineNumber: 566,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    style: {
                        padding: "1.1rem"
                    },
                    children: children
                }, void 0, false, {
                    fileName: "[project]/apps/web/src/components/ui.tsx",
                    lineNumber: 579,
                    columnNumber: 9
                }, this),
                footer ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "row",
                    style: {
                        justifyContent: "flex-end",
                        gap: "0.5rem",
                        padding: "0.9rem 1.1rem",
                        borderTop: "1px solid var(--border)"
                    },
                    children: footer
                }, void 0, false, {
                    fileName: "[project]/apps/web/src/components/ui.tsx",
                    lineNumber: 581,
                    columnNumber: 11
                }, this) : null
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/src/components/ui.tsx",
            lineNumber: 551,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 537,
        columnNumber: 5
    }, this), document.body);
}
const ToastContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createContext"])({
    push: ()=>undefined
});
function ToastProvider({ children }) {
    const [items, setItems] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [mounted, setMounted] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        setMounted(true);
    }, []);
    const push = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((message, tone = "neutral")=>{
        const id = crypto.randomUUID();
        setItems((current)=>[
                ...current,
                {
                    id,
                    message,
                    tone
                }
            ]);
        window.setTimeout(()=>{
            setItems((current)=>current.filter((item)=>item.id !== id));
        }, 4_500);
    }, []);
    const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>({
            push
        }), [
        push
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ToastContext.Provider, {
        value: value,
        children: [
            children,
            mounted ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$dom$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createPortal"])(/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    position: "fixed",
                    bottom: "1rem",
                    right: "1rem",
                    zIndex: 300,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    maxWidth: "min(360px, calc(100vw - 2rem))"
                },
                children: items.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "surface-solid animate-in",
                        style: {
                            padding: "0.7rem 0.9rem",
                            fontSize: "0.86rem",
                            borderLeft: `3px solid var(--${item.tone === "neutral" ? "accent" : item.tone})`
                        },
                        children: item.message
                    }, item.id, false, {
                        fileName: "[project]/apps/web/src/components/ui.tsx",
                        lineNumber: 645,
                        columnNumber: 17
                    }, this))
            }, void 0, false, {
                fileName: "[project]/apps/web/src/components/ui.tsx",
                lineNumber: 632,
                columnNumber: 13
            }, this), document.body) : null
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 628,
        columnNumber: 5
    }, this);
}
function useToast() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useContext"])(ToastContext);
}
function Avatar({ name, size = 36 }) {
    const label = (name ?? "?").trim().slice(0, 2).toUpperCase();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            width: size,
            height: size,
            borderRadius: "50%",
            background: "var(--accent-soft)",
            color: "var(--accent)",
            display: "grid",
            placeItems: "center",
            fontSize: size * 0.38,
            fontWeight: 800,
            border: "1px solid var(--border)",
            flexShrink: 0
        },
        "aria-hidden": true,
        children: label
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui.tsx",
        lineNumber: 680,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/web/src/lib/api.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ApiRequestError",
    ()=>ApiRequestError,
    "api",
    ()=>api,
    "clearOutbox",
    ()=>clearOutbox,
    "isOffline",
    ()=>isOffline,
    "outboxItems",
    ()=>outboxItems,
    "outboxSize",
    ()=>outboxSize,
    "readCache",
    ()=>readCache,
    "replayOutbox",
    ()=>replayOutbox,
    "request",
    ()=>request,
    "writeCache",
    ()=>writeCache
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/auth.ts [app-ssr] (ecmascript)");
"use client";
;
class ApiRequestError extends Error {
    error;
    status;
    code;
    details;
    constructor(payload){
        super(payload.error || "Request failed");
        this.name = "ApiRequestError";
        this.error = payload.error || "Request failed";
        this.status = payload.status;
        this.code = payload.code;
        this.details = payload.details;
    }
}
const CACHE_PREFIX = "jr.cache:";
const OUTBOX_KEY = "jr.outbox";
function readOutbox() {
    if ("TURBOPACK compile-time truthy", 1) return [];
    //TURBOPACK unreachable
    ;
}
function writeOutbox(items) {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
function outboxSize() {
    return readOutbox().length;
}
function outboxItems() {
    return readOutbox();
}
function clearOutbox() {
    writeOutbox([]);
}
function cacheKey(path) {
    return `${CACHE_PREFIX}${path}`;
}
function readCache(path) {
    if ("TURBOPACK compile-time truthy", 1) return null;
    //TURBOPACK unreachable
    ;
}
function writeCache(path, data) {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
function isOffline() {
    if (typeof navigator === "undefined") return false;
    return navigator.onLine === false;
}
function buildUrl(path, query) {
    const base = path.startsWith("http") ? path : `${__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["API_URL"]}${path.startsWith("/") ? path : `/${path}`}`;
    if (!query) return base;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)){
        if (value === undefined || value === null || value === "") continue;
        params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
}
async function authHeaders() {
    const token = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getToken"])();
    const headers = {
        accept: "application/json"
    };
    if (token) headers.authorization = `Bearer ${token}`;
    return headers;
}
async function request(path, options = {}) {
    const method = options.method ?? "GET";
    const url = buildUrl(path, options.query);
    if (isOffline() && method !== "GET" && options.queueWhenOffline !== false) {
        const items = readOutbox();
        items.push({
            id: crypto.randomUUID(),
            method,
            path: url.startsWith(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["API_URL"]) ? url.slice(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["API_URL"].length) : url,
            body: options.body,
            createdAt: new Date().toISOString(),
            attempts: 0
        });
        writeOutbox(items);
        throw new ApiRequestError({
            error: "You are offline. This change is queued and will sync when you reconnect.",
            code: "OFFLINE_QUEUED",
            status: 0
        });
    }
    const headers = await authHeaders();
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    let response;
    try {
        response = await fetch(url, {
            method,
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            signal: options.signal
        });
    } catch (error) {
        if (method === "GET" && options.cache !== false) {
            const cached = readCache(path);
            if (cached) return cached.data;
        }
        throw new ApiRequestError({
            error: error instanceof Error ? error.message : "Network request failed",
            code: "NETWORK_ERROR",
            status: 0
        });
    }
    if (response.status === 401 && options.retryOnUnauthorized !== false) {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clearToken"])();
        const fresh = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getToken"])();
        if (fresh) {
            const retryHeaders = {
                accept: "application/json"
            };
            retryHeaders.authorization = `Bearer ${fresh}`;
            if (options.body !== undefined) retryHeaders["Content-Type"] = "application/json";
            try {
                const retried = await fetch(url, {
                    method,
                    headers: retryHeaders,
                    body: options.body === undefined ? undefined : JSON.stringify(options.body),
                    signal: options.signal
                });
                if (retried.ok) {
                    const contentType = retried.headers.get("content-type") ?? "";
                    if (!contentType.includes("application/json")) return undefined;
                    const data = await retried.json();
                    if (method === "GET" && options.cache !== false) writeCache(path, data);
                    return data;
                }
                response = retried;
            } catch  {
            // fall through to the original error handling
            }
        }
    }
    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    if (!response.ok) {
        let payload = {
            error: response.statusText
        };
        if (isJson) {
            payload = await response.json();
        }
        throw new ApiRequestError({
            error: payload.error ?? `Request failed with ${response.status}`,
            code: payload.code,
            status: response.status
        });
    }
    if (!isJson) {
        return undefined;
    }
    const data = await response.json();
    if (method === "GET" && options.cache !== false) writeCache(path, data);
    return data;
}
async function replayOutbox() {
    const items = readOutbox();
    if (items.length === 0) return {
        replayed: 0,
        failed: 0
    };
    let replayed = 0;
    let failed = 0;
    const remaining = [];
    for (const item of items){
        try {
            const headers = await authHeaders();
            if (item.body !== undefined) headers["Content-Type"] = "application/json";
            const response = await fetch(`${__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["API_URL"]}${item.path}`, {
                method: item.method,
                headers,
                body: item.body === undefined ? undefined : JSON.stringify(item.body)
            });
            if (response.ok) {
                replayed += 1;
                continue;
            }
            if (response.status >= 400 && response.status < 500) {
                failed += 1;
                continue;
            }
            remaining.push({
                ...item,
                attempts: item.attempts + 1,
                lastError: `HTTP ${response.status}`
            });
        } catch  {
            remaining.push({
                ...item,
                attempts: item.attempts + 1,
                lastError: "network"
            });
        }
    }
    writeOutbox(remaining);
    return {
        replayed,
        failed
    };
}
const api = {
    get: (path, query, signal)=>request(path, {
            method: "GET",
            query,
            signal
        }),
    post: (path, body, query)=>request(path, {
            method: "POST",
            body,
            query
        }),
    put: (path, body)=>request(path, {
            method: "PUT",
            body
        }),
    patch: (path, body)=>request(path, {
            method: "PATCH",
            body
        }),
    delete: (path)=>request(path, {
            method: "DELETE"
        })
};
}),
"[project]/apps/web/src/lib/auth.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "API_URL",
    ()=>API_URL,
    "NEON_AUTH_UPSTREAM_URL",
    ()=>NEON_AUTH_UPSTREAM_URL,
    "NEON_AUTH_URL",
    ()=>NEON_AUTH_URL,
    "WS_URL",
    ()=>WS_URL,
    "cachedSession",
    ()=>cachedSession,
    "cachedToken",
    ()=>cachedToken,
    "clearSession",
    ()=>clearSession,
    "clearToken",
    ()=>clearToken,
    "fetchSession",
    ()=>fetchSession,
    "getToken",
    ()=>getToken,
    "signIn",
    ()=>signIn,
    "signOut",
    ()=>signOut,
    "signUp",
    ()=>signUp,
    "storeSession",
    ()=>storeSession
]);
"use client";
const API_URL = (("TURBOPACK compile-time value", "http://localhost:8088/v1") ?? "https://job-radar-api-angisoft.fly.dev/v1").replace(/\/$/, "");
const NEON_AUTH_URL = "/api/auth";
const NEON_AUTH_UPSTREAM_URL = (("TURBOPACK compile-time value", "https://ep-mute-glitter-b5uefleh.neonauth.c-7.us-east-2.aws.neon.tech/neondb/auth") ?? "https://ep-mute-glitter-b5uefleh.neonauth.c-7.us-east-2.aws.neon.tech/neondb/auth").replace(/\/$/, "");
const WS_URL = API_URL.replace(/\/v1$/, "") + "/v1/ws";
const TOKEN_KEY = "jr.auth.token";
const SESSION_KEY = "jr.auth.session";
const TOKEN_TTL_KEY = "jr.auth.token.exp";
function readJson(key) {
    if ("TURBOPACK compile-time truthy", 1) return null;
    //TURBOPACK unreachable
    ;
}
function writeJson(key, value) {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
function cachedToken() {
    if ("TURBOPACK compile-time truthy", 1) return null;
    //TURBOPACK unreachable
    ;
    const token = undefined;
    const expiry = undefined;
}
function clearToken() {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
function tokenExpiry(token) {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    if (!payload) return null;
    try {
        const normalised = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalised.padEnd(normalised.length + (4 - normalised.length % 4) % 4, "=");
        const json = atob(padded);
        const claims = JSON.parse(json);
        if (typeof claims.exp !== "number") return null;
        return claims.exp * 1000;
    } catch  {
        return null;
    }
}
function cachedSession() {
    return readJson(SESSION_KEY);
}
function storeSession(session) {
    writeJson(SESSION_KEY, session);
}
function clearSession() {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
let tokenRequest = null;
async function requestToken() {
    const response = await fetch(`${NEON_AUTH_URL}/token`, {
        method: "GET",
        credentials: "include",
        headers: {
            accept: "application/json"
        }
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(()=>null);
    if (!payload?.token) return null;
    window.localStorage.setItem(TOKEN_KEY, payload.token);
    const claimExpiry = tokenExpiry(payload.token);
    const expiry = typeof payload.expiresAt === "number" ? payload.expiresAt * 1000 : typeof payload.expiresAt === "string" ? new Date(payload.expiresAt).getTime() : claimExpiry;
    if (expiry) {
        window.localStorage.setItem(TOKEN_TTL_KEY, String(expiry));
    }
    return payload.token;
}
async function getToken() {
    const cached = cachedToken();
    if (cached) return cached;
    if (tokenRequest) return tokenRequest;
    tokenRequest = requestToken().catch(()=>null).finally(()=>{
        tokenRequest = null;
    });
    return tokenRequest;
}
async function fetchSession() {
    const response = await fetch(`${NEON_AUTH_URL}/get-session`, {
        credentials: "include",
        headers: {
            accept: "application/json"
        }
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(()=>null);
    if (!payload?.user) return null;
    const token = await getToken();
    const session = {
        user: {
            id: payload.user.id,
            email: payload.user.email,
            name: payload.user.name ?? null,
            image: payload.user.image ?? null
        },
        roles: [],
        permissions: [],
        expiresAt: typeof payload.session?.expiresAt === "number" ? new Date(payload.session.expiresAt * 1000).toISOString() : payload.session?.expiresAt ?? null
    };
    storeSession(session);
    if (!token) return null;
    return session;
}
async function signIn(email, password) {
    const response = await fetch(`${NEON_AUTH_URL}/sign-in/email`, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            email,
            password,
            callbackURL: window.location.origin
        })
    });
    if (!response.ok) return false;
    await fetchSession();
    return true;
}
async function signUp(email, password, name) {
    const response = await fetch(`${NEON_AUTH_URL}/sign-up/email`, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            email,
            password,
            name,
            callbackURL: window.location.origin
        })
    });
    if (!response.ok) return false;
    await fetchSession();
    return true;
}
async function signOut() {
    try {
        await fetch(`${NEON_AUTH_URL}/sign-out`, {
            method: "POST",
            credentials: "include"
        });
    } catch  {
        return;
    } finally{
        clearSession();
    }
}
}),
]})(),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/dynamic-access-async-storage.external.js [external] (next/dist/server/app-render/dynamic-access-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/dynamic-access-async-storage.external.js", () => require("next/dist/server/app-render/dynamic-access-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/runtime-reacts.external.js [external] (next/dist/server/runtime-reacts.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/runtime-reacts.external.js", () => require("next/dist/server/runtime-reacts.external.js"));

module.exports = mod;
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1_ad-u0g7__vf._.js.map