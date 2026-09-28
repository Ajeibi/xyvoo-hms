import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  AUTH_LOCKED,
  AUTH_PREVIEW_COOKIE,
  AUTH_PREVIEW_PARAM,
  COMING_SOON_PATH,
  LOCKED_API_PREFIXES,
  LOCKED_PAGE_PREFIXES,
  matchesPrefix,
  previewToken,
} from "@/lib/auth-lock";

const PROTECTED_PREFIXES = ["/admin", "/tenants", "/onboard", "/hms"];

async function applyAuthLock(request: NextRequest): Promise<NextResponse | null> {
  if (!AUTH_LOCKED) return null;

  const { pathname, searchParams } = request.nextUrl;
  const secret = process.env.AUTH_PREVIEW_SECRET;
  const expected = secret ? await previewToken(secret) : null;

  // ?preview=<secret> on any matched page grants the team a bypass cookie.
  const supplied = searchParams.get(AUTH_PREVIEW_PARAM);
  if (supplied !== null) {
    const url = request.nextUrl.clone();
    url.searchParams.delete(AUTH_PREVIEW_PARAM);
    const response = NextResponse.redirect(url);
    if (expected && (await previewToken(supplied)) === expected) {
      response.cookies.set(AUTH_PREVIEW_COOKIE, expected, {
        httpOnly: true,
        secure: request.nextUrl.protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  }

  if (expected && request.cookies.get(AUTH_PREVIEW_COOKIE)?.value === expected) return null;

  if (matchesPrefix(pathname, LOCKED_API_PREFIXES)) {
    return NextResponse.json({ error: "Sign-in and registration are not open yet." }, { status: 403 });
  }

  if (matchesPrefix(pathname, LOCKED_PAGE_PREFIXES) || matchesPrefix(pathname, PROTECTED_PREFIXES)) {
    return NextResponse.redirect(new URL(COMING_SOON_PATH, request.url));
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const locked = await applyAuthLock(request);
  if (locked) return locked;

  if (!matchesPrefix(request.nextUrl.pathname, PROTECTED_PREFIXES)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Pages matched so ?preview=<secret> works from the homepage too.
    "/((?!_next/static|_next/image|favicon.ico|icon.png|images/|.*\\.(?:png|jpg|jpeg|svg|webp|mp4|ico|txt|xml)$).*)",
  ],
};
