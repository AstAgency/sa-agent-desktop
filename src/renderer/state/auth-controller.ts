/**
 * Auth controller.
 *
 * Отвечает только за:
 * - восстановление auth session;
 * - login/logout;
 * - синхронизацию auth state со store;
 * - обработку refresh/session invalidation.
 *
 * ВАЖНО:
 * Полный startup flow выглядит так:
 *   App.initialize()
 *     → startPythonRuntime()
 *     → initializeAuth()
 *     → setAuthAuthenticated()
 *     → React useEffect(authStatus)
 *     → controller.bootstrap()
 */

import {
  buildDevSession,
  requestEmailCode as apiRequestCode,
  verifyEmailCode as apiVerifyCode,
  AuthApiError,
  type AuthSession,
} from "../lib/auth-api";

import { setAuthInvalidationHandler } from "../lib/api";

import {
  clearAuthSession,
  getAuthSession,
  setAuthSession,
} from "../lib/token-store";

import {
  getState,
  setAuthAuthenticated,
  setAuthLoading,
  setAuthUnauthenticated,
  setState,
} from "./store";

/**
 * Глобальный callback вызывается из api.ts,
 * если refresh token flow окончательно провалился.
 *
 * Обычно сценарий такой:
 *   request → 401
 *   → api.ts пытается refresh
 *   → refresh failed
 *   → вызывается invalidation handler
 *
 * После этого:
 * - localStorage очищается;
 * - auth state сбрасывается;
 * - UI переходит в unauthenticated режим.
 */
setAuthInvalidationHandler( () => {
  clearAuthSession();
  setAuthUnauthenticated( "session_expired" );
} );

/**
 * Восстановление auth session при старте приложения.
 *
 * Flow:
 *   1. Загружаем session из localStorage.
 *   2. Если session нет:
 *        → unauthenticated
 *   3. Если session есть:
 *        → authenticated
 *        → App.tsx отдельно запускает bootstrap()
 *          и уже он делает единственный GET /v1/profile
 */
let inflightInitializeAuth: Promise<boolean> | null = null;

export async function initializeAuth(): Promise<boolean> {
  if ( inflightInitializeAuth ) return inflightInitializeAuth;

  inflightInitializeAuth = (async () => {
    setAuthLoading();
    /**
     * Пытаемся восстановить session из localStorage.
     */
    const stored = getAuthSession();
    /**
     * Нет session → сразу unauthenticated.
     */
    if ( !stored ) {
      setAuthUnauthenticated( null );
      return false;
    }

    /**
     * Сетевую валидацию не делаем здесь, чтобы не дублировать GET /v1/profile.
     * Единственный authoritative profile fetch идёт внутри bootstrap().
     */
    setAuthAuthenticated( stored );
    return true;
  })().finally( () => {
    inflightInitializeAuth = null;
  } );

  return inflightInitializeAuth;
}

/**
 * Отправка email verification code.
 *
 * Только API request.
 * State приложения здесь не меняется.
 */
export async function requestEmailCode(
  email: string,
): Promise<void> {
  await apiRequestCode( email );
}

/**
 * Проверка verification code.
 *
 * После успешного verify:
 * - session сохраняется в localStorage;
 * - auth state становится authenticated;
 * - App.tsx автоматически запускает bootstrap().
 */
export async function verifyEmailCode( input: {
  email: string;
  code: string;
  name: string;
} ): Promise<AuthSession> {
  const session = await apiVerifyCode( input );

  /**
   * Persist session locally.
   */
  setAuthSession( session );
  /**
   * Обновляем глобальный auth state.
   *
   * Bootstrap здесь НЕ вызывается.
   * Его запускает App.tsx через effect.
   */
  setAuthAuthenticated( session );

  return session;
}

/**
 * Development-only fallback login.
 *
 * Используется когда auth backend недоступен.
 *
 * Создаёт demo JWT/session,
 * понятную backend dev environment.
 */
export function signInWithDevFallback( input: {
  email: string;
  name: string;
} ): AuthSession {
  const session = buildDevSession( input );

  setAuthSession( session );

  /**
   * После authenticated:
   * App.tsx отдельно запустит bootstrap().
   */
  setAuthAuthenticated( session );

  return session;
}

/**
 * Полный logout flow.
 *
 * Очищает:
 * - auth session;
 * - bootstrap state;
 * - profile;
 * - projects;
 * - sessions;
 * - runtime traces;
 * - streaming state.
 *
 * После logout приложение возвращается
 * в полностью "cold" состояние.
 */
export function signOut(): void {
  /**
   * Удаляем persisted session.
   */
  clearAuthSession();
  /**
   * Переводим UI в unauthenticated режим.
   */
  setAuthUnauthenticated( null );

  /**
   * Полный reset application state.
   *
   * bootstrap.status → idle
   * нужен чтобы после следующего login
   * bootstrap можно было запустить повторно.
   */
  setState( ( state ) => ({
    ...state,

    bootstrap: {
      status: "idle",
      error: null,

      /**
       * Python runtime не пересоздаём.
       * Сохраняем текущее состояние runtime.
       */
      pythonReady: state.bootstrap.pythonReady,
      pythonError: state.bootstrap.pythonError,
    },
    profile: null,
    projects: [],
    globalSessions: [],
    globalSessionsPage: { page: 0, total: 0, hasMore: false, loading: false, loaded: false },
    projectSessions: {},
    projectSessionsPage: {},
    messagesBySession: {},
    summariesBySession: {},
    selection: {
      kind: "none",
    },
    runtimeTrace: [],
    streamingFinalText: "",
  }) );
}
