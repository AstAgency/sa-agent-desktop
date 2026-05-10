export type FetchHandler = (input: string, init?: RequestInit) => Response | Promise<Response> | null | undefined | Promise<Response | null | undefined>;

export function mockFetchRoutes(fetchMock: ReturnType<typeof import("vitest").vi.fn<typeof fetch>>, handlers: FetchHandler[]) {
  fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
    for (const handler of handlers) {
      const response = await handler(String(input), init);
      if (response) return response;
    }
    throw new Error(`Unexpected request: ${input}`);
  });
}
