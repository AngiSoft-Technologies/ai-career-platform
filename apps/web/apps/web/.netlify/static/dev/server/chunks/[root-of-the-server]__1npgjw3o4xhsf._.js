module.exports = [
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

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
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[externals]/path [external] (path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("path", () => require("path"));

module.exports = mod;
}),
"[project]/apps/web/src/app/api/auth/[...path]/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "POST",
    ()=>POST,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
;
const UPSTREAM = process.env.NEON_AUTH_URL ?? ("TURBOPACK compile-time value", "https://ep-mute-glitter-b5uefleh.neonauth.c-7.us-east-2.aws.neon.tech/neondb/auth") ?? "https://ep-mute-glitter-b5uefleh.neonauth.c-7.us-east-2.aws.neon.tech/neondb/auth";
const dynamic = "force-dynamic";
/**
 * Cookies the upstream marks with the `__Secure-` prefix are only accepted by
 * browsers when they also carry `Secure`, which rules them out over plain
 * http. The proxy therefore renames them for insecure contexts and maps them
 * back when talking to the upstream.
 */ const SECURE_PREFIXED_COOKIES = new Map([
    [
        "__Secure-neon-auth.session_token",
        "neon-auth.session_token"
    ]
]);
function browserCookieName(upstreamName, secureContext) {
    if (secureContext) return upstreamName;
    return SECURE_PREFIXED_COOKIES.get(upstreamName) ?? upstreamName;
}
function upstreamCookieName(browserName, secureContext) {
    if (secureContext) return browserName;
    for (const [upstream, browser] of SECURE_PREFIXED_COOKIES){
        if (browser === browserName) return upstream;
    }
    return browserName;
}
function toUpstreamCookieHeader(cookieHeader, secureContext) {
    return cookieHeader.split(";").map((part)=>part.trim()).filter(Boolean).map((part)=>{
        const separator = part.indexOf("=");
        if (separator < 0) return part;
        const name = part.slice(0, separator).trim();
        const value = part.slice(separator + 1);
        return `${upstreamCookieName(name, secureContext)}=${value}`;
    }).join("; ");
}
function normalizeSetCookie(value, secureContext) {
    const parts = value.split(";");
    const rawNameValue = parts[0] ?? "";
    const separator = rawNameValue.indexOf("=");
    const upstreamName = separator < 0 ? rawNameValue.trim() : rawNameValue.slice(0, separator).trim();
    const cookieValue = separator < 0 ? "" : rawNameValue.slice(separator + 1).trim();
    const attributes = parts.slice(1).map((part)=>part.trim()).filter((part)=>{
        const lower = part.toLowerCase();
        if (lower.startsWith("partitioned")) return false;
        if (lower.startsWith("samesite=")) return false;
        if (lower.startsWith("secure") && !secureContext) return false;
        return true;
    });
    attributes.push(secureContext ? "SameSite=None; Secure" : "SameSite=Lax");
    return `${browserCookieName(upstreamName, secureContext)}=${cookieValue}; ${attributes.join("; ")}`;
}
async function proxy(request, context) {
    const { path } = await context.params;
    const upstreamUrl = new URL(`${UPSTREAM}/${path.join("/")}`);
    request.nextUrl.searchParams.forEach((value, key)=>{
        upstreamUrl.searchParams.append(key, value);
    });
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const secureContext = forwardedProto === "https" || request.nextUrl.protocol === "https:";
    const headers = new Headers();
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", toUpstreamCookieHeader(cookie, secureContext));
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const origin = request.headers.get("origin");
    if (origin) headers.set("origin", origin);
    headers.set("accept", request.headers.get("accept") ?? "application/json");
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const body = hasBody ? await request.text() : undefined;
    let upstream;
    try {
        upstream = await fetch(upstreamUrl, {
            method: request.method,
            headers,
            body,
            redirect: "manual",
            cache: "no-store"
        });
    } catch  {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            message: "Auth service unreachable",
            code: "AUTH_UPSTREAM_UNREACHABLE"
        }, {
            status: 502
        });
    }
    const responseHeaders = new Headers();
    const setCookies = upstream.headers.getSetCookie?.() ?? upstream.headers.get("set-cookie") ?? [];
    for (const value of Array.isArray(setCookies) ? setCookies : [
        setCookies
    ]){
        if (value) {
            responseHeaders.append("set-cookie", normalizeSetCookie(value, secureContext));
        }
    }
    const upstreamType = upstream.headers.get("content-type");
    if (upstreamType) responseHeaders.set("content-type", upstreamType);
    responseHeaders.set("cache-control", "no-store");
    return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders
    });
}
async function GET(request, context) {
    return proxy(request, context);
}
async function POST(request, context) {
    return proxy(request, context);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1npgjw3o4xhsf._.js.map