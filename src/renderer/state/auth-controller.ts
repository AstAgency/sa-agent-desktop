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

import { getProfile } from "../lib/api";
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
 *        → GET /v1/profile
 *        api.ts автоматически:
 *          - прикрепляет Bearer token
 *          - пытается refresh при 401
 *          - повторяет запрос после refresh
 *   4. Если profile успешно получен:
 *        → authenticated
 *   5. Если всё провалилось:
 *        → session invalid
 *        → localStorage очищается
 *        → unauthenticated
 */
export async function initializeAuth(): Promise<boolean> {
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

  try {
    /**
     * Проверяем что access token ещё валиден.
     *
     * Если access token expired:
     * api.ts сам попробует refresh flow.
     */
    await getProfile();
    /**
     * Session валидна.
     *
     * App.tsx увидит authStatus === authenticated
     * и отдельно запустит bootstrap().
     */
    setAuthAuthenticated( stored );

    return true;
  } catch ( error ) {
    /**
     * Любая ошибка здесь означает:
     * - refresh flow тоже не помог;
     * - session больше использовать нельзя.
     */

    if ( getState().auth.status !== "unauthenticated" ) {
      clearAuthSession();
      setAuthUnauthenticated(
        error instanceof Error
          ? error.message
          : "session_invalid",
      );
    }

    return false;
  }
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
    projectSessions: {},
    messagesBySession: {},
    summariesBySession: {},
    selection: {
      kind: "none",
    },
    runtimeTrace: [],
    streamingFinalText: "",
  }) );
}
