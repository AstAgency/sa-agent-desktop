import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { URL } from "node:url";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CHARS = 8_000;
const MAX_RAW_BODY_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export type FetchUrlMode = "readable" | "raw";

export type FetchUrlOptions = {
  timeoutMs?: number;
  maxChars?: number;
  mode?: FetchUrlMode;
  userAgent?: string;
};

type FetchedPayload = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  url: URL;
};

type ExtractedContent = {
  title: string;
  bodyText: string;
  truncated: boolean;
};

type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export function assertAllowedFetchUrl(value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL must be http(s)");
  }

  if (!url.hostname) {
    throw new Error("URL must include hostname");
  }

  return url;
}

export function isPrivateIpAddress(value: string): boolean {
  const normalized = normalizeIpAddress(value);

  if (!normalized) {
    return false;
  }

  if (normalized === "::1") return true;
  if (normalized === "0.0.0.0") return true;

  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  const ipv4 = parseIpv4(normalized);
  if (!ipv4) return false;

  if (ipv4[0] === 0) return true;
  if (ipv4[0] === 10) return true;
  if (ipv4[0] === 127) return true;
  if (ipv4[0] === 169 && ipv4[1] === 254) return true;
  if (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) return true;
  if (ipv4[0] === 192 && ipv4[1] === 168) return true;

  return false;
}

export function truncateForLlm(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}… (truncated)`;
}

export function formatFetchedTextResult(input: {
  url: string;
  title: string;
  status: number;
  contentType: string;
  contentLength: number;
  bodyText: string;
  truncated: boolean;
}): string {
  const contentLengthLine = input.truncated
    ? `Content-Length: ${input.contentLength} (truncated to ${input.bodyText.length} chars)`
    : `Content-Length: ${input.contentLength}`;

  return [
    `URL: ${input.url}`,
    `Title: ${input.title}`,
    `Status: ${input.status} (${input.contentType})`,
    contentLengthLine,
    "",
    input.bodyText,
  ].join("\n");
}

export async function fetchUrl(
  inputUrl: string,
  options: FetchUrlOptions = {},
): Promise<string> {
  const url = assertAllowedFetchUrl(inputUrl);

  const timeoutMs = clampNumber(
    options.timeoutMs,
    1,
    30_000,
    DEFAULT_TIMEOUT_MS,
  );

  const maxChars = clampNumber(
    options.maxChars,
    100,
    16_000,
    DEFAULT_MAX_CHARS,
  );

  const mode: FetchUrlMode = options.mode === "raw" ? "raw" : "readable";

  const userAgent =
    options.userAgent ??
    "SA-AgentDesktop/unknown (+https://github.com/AstAgency/sa-agent-desktop)";

  const response = await requestFollowingRedirects(url, {
    timeoutMs,
    userAgent,
    redirectsRemaining: MAX_REDIRECTS,
  });

  if (response.status >= 400) {
    throw new Error(`Status ${response.status}`);
  }

  const contentType = normalizeContentType(response.headers["content-type"]);

  const extracted = extractReadableContent({
    body: response.body,
    contentType,
    mode,
    maxChars,
    sourceUrl: response.url,
  });

  return formatFetchedTextResult({
    url: response.url.toString(),
    title: extracted.title,
    status: response.status,
    contentType,
    contentLength: response.body.length,
    bodyText: extracted.bodyText,
    truncated: extracted.truncated,
  });
}

async function requestFollowingRedirects(
  url: URL,
  options: {
    timeoutMs: number;
    userAgent: string;
    redirectsRemaining: number;
  },
): Promise<FetchedPayload> {
  const response = await requestOnce(url, options.timeoutMs, options.userAgent);

  const location = response.headers.location;

  if (response.status >= 300 && response.status < 400 && typeof location === "string") {
    if (options.redirectsRemaining <= 0) {
      throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
    }

    const nextUrl = assertAllowedFetchUrl(new URL(location, response.url).toString());

    return requestFollowingRedirects(nextUrl, {
      ...options,
      redirectsRemaining: options.redirectsRemaining - 1,
    });
  }

  return response;
}

async function requestOnce(
  url: URL,
  timeoutMs: number,
  userAgent: string,
): Promise<FetchedPayload> {
  const addresses = await resolvePublicAddresses(url.hostname);
  const selectedAddress = addresses[0];

  if (!selectedAddress) {
    throw new Error(`Failed to resolve public address for host: ${url.hostname}`);
  }

  const transport = url.protocol === "https:" ? https : http;

  return new Promise<FetchedPayload>((resolve, reject) => {
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const req = transport.request(
      url,
      {
        method: "GET",
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/json,text/plain,text/markdown,text/csv;q=0.9,*/*;q=0.1",
          "Accept-Encoding": "identity",
          "User-Agent": userAgent,
        },
        lookup(_hostname, options, callback) {
          const lookupOptions = typeof options === "object" ? options : {};

          if (lookupOptions.all) {
            callback(null, addresses);
            return;
          }

          callback(null, selectedAddress.address, selectedAddress.family);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;

        res.on("data", (chunk: Buffer) => {
          total += chunk.length;

          if (total > MAX_RAW_BODY_BYTES) {
            req.destroy(new Error("Response exceeded 2MB limit"));
            return;
          }

          chunks.push(chunk);
        });

        res.on("end", () => {
          if (settled) return;
          settled = true;

          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
            url,
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timed out after ${timeoutMs}ms`));
    });

    req.on("error", fail);
    req.end();
  });
}

async function resolvePublicAddresses(hostname: string): Promise<ResolvedAddress[]> {
  const directIpType = net.isIP(hostname);

  if (directIpType !== 0) {
    if (isPrivateIpAddress(hostname)) {
      throw new Error(`Refused private address: ${hostname}`);
    }

    return [
      {
        address: hostname,
        family: directIpType === 4 ? 4 : 6,
      },
    ];
  }

  const addresses = await dns.promises.lookup(hostname, {
    all: true,
    verbatim: true,
  });

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error(`Failed to resolve host: ${hostname}`);
  }

  const validAddresses: ResolvedAddress[] = [];

  for (const item of addresses) {
    if (!item?.address || !item?.family) {
      continue;
    }

    if (item.family !== 4 && item.family !== 6) {
      continue;
    }

    if (isPrivateIpAddress(item.address)) {
      throw new Error(`Refused private address: ${item.address}`);
    }

    validAddresses.push({
      address: item.address,
      family: item.family,
    });
  }

  if (validAddresses.length === 0) {
    throw new Error(`No valid public addresses resolved for host: ${hostname}`);
  }

  return validAddresses;
}

function extractReadableContent(input: {
  body: Buffer;
  contentType: string;
  mode: FetchUrlMode;
  maxChars: number;
  sourceUrl: URL;
}): ExtractedContent {
  const mime = input.contentType;
  const rawText = input.body.toString("utf8");

  if (
    mime !== "application/json" &&
    mime !== "text/html" &&
    mime !== "application/xhtml+xml" &&
    !mime.startsWith("text/")
  ) {
    throw new Error(`Refusing to read binary content-type: ${mime}`);
  }

  if (input.mode === "raw") {
    const cleaned = rawText.trim();

    return {
      title: input.sourceUrl.hostname,
      bodyText: truncateForLlm(cleaned, input.maxChars),
      truncated: cleaned.length > input.maxChars,
    };
  }

  if (mime === "application/json") {
    const pretty = prettyPrintJson(rawText);

    return {
      title: input.sourceUrl.hostname,
      bodyText: truncateForLlm(pretty, input.maxChars),
      truncated: pretty.length > input.maxChars,
    };
  }

  if (mime === "text/html" || mime === "application/xhtml+xml") {
    const dom = new JSDOM(rawText, {
      url: input.sourceUrl.toString(),
    });

    const fallbackTitle = cleanText(
      dom.window.document.title,
      input.sourceUrl.hostname,
    );

    const article = new Readability(dom.window.document).parse();

    const extracted = cleanExtractedText(
      article?.textContent ??
      dom.window.document.body?.textContent ??
      dom.window.document.documentElement.textContent ??
      "",
    );

    return {
      title: cleanText(article?.title, fallbackTitle),
      bodyText: truncateForLlm(extracted, input.maxChars),
      truncated: extracted.length > input.maxChars,
    };
  }

  if (mime.startsWith("text/")) {
    const cleaned = rawText.trim();

    return {
      title: input.sourceUrl.hostname,
      bodyText: truncateForLlm(cleaned, input.maxChars),
      truncated: cleaned.length > input.maxChars,
    };
  }

  throw new Error(`Refusing to read binary content-type: ${mime}`);
}

function prettyPrintJson(rawText: string): string {
  try {
    return JSON.stringify(JSON.parse(rawText), null, 2);
  } catch {
    return rawText.trim();
  }
}

function cleanExtractedText(value: string): string {
  return value
  .replace(/\r\n/g, "\n")
  .replace(/[ \t]+\n/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();
}

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeContentType(value: string | string[] | undefined): string {
  const header = Array.isArray(value) ? value[0] : value;

  return header?.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;

  return Math.min(max, Math.max(min, Math.floor(value)));
}

function normalizeIpAddress(value: string): string | null {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed) return null;

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");

  if (parts.length !== 4) return null;

  const parsed = parts.map((part) => Number(part));

  if (parsed.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  return parsed;
}