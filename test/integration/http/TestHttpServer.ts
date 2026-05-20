import http, { type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface RecordedHttpRequest {
  method: string;
  url: URL;
  path: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
  bodyText: string;
}

export interface TestHttpResponse {
  status?: number;
  headers?: Record<string, string>;
  json?: unknown;
  text?: string;
  body?: Uint8Array;
}

export type TestHttpHandler =
  (request: RecordedHttpRequest) => TestHttpResponse | Promise<TestHttpResponse>;

type Route = {
  method: string;
  path: string | RegExp;
  handler: TestHttpHandler;
};

export class TestHttpServer {
  readonly url: string;
  readonly requests: RecordedHttpRequest[] = [];

  private readonly server: Server;
  private readonly routes: Route[] = [];

  private constructor(args: { url: string; server: Server }) {
    this.url = args.url;
    this.server = args.server;
  }

  static async start(): Promise<TestHttpServer> {
    const handlerRef: { current?: TestHttpServer } = {};
    const server = http.createServer((req, res) => {
      void handlerRef.current?.handle(req, res);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address() as AddressInfo;
    const testServer = new TestHttpServer({
      url: `http://127.0.0.1:${address.port}`,
      server,
    });
    handlerRef.current = testServer;
    return testServer;
  }

  on(method: string, path: string | RegExp, handler: TestHttpHandler): void {
    this.routes.push({ method: method.toUpperCase(), path, handler });
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const body = await readBody(req);
    const requestUrl = new URL(req.url ?? "/", this.url);
    const request: RecordedHttpRequest = {
      method: req.method?.toUpperCase() ?? "GET",
      url: requestUrl,
      path: `${requestUrl.pathname}${requestUrl.search}`,
      headers: req.headers,
      body,
      bodyText: body.toString("utf8"),
    };
    this.requests.push(request);

    const route = this.routes.find((candidate) =>
      candidate.method === request.method && pathMatches(candidate.path, request.path)
    );
    const response = route
      ? await route.handler(request)
      : {
          status: 404,
          json: { error: `No mock route for ${request.method} ${request.path}` },
        };

    sendResponse(res, response);
  }
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function pathMatches(pattern: string | RegExp, path: string): boolean {
  return typeof pattern === "string" ? pattern === path : pattern.test(path);
}

function sendResponse(res: http.ServerResponse, response: TestHttpResponse): void {
  const status = response.status ?? 200;
  const headers: Record<string, string> = {
    ...(response.headers ?? {}),
  };
  let body: string | Uint8Array | undefined;

  if (response.json !== undefined) {
    headers["content-type"] ??= "application/json";
    body = JSON.stringify(response.json);
  } else if (response.text !== undefined) {
    headers["content-type"] ??= "text/plain; charset=utf-8";
    body = response.text;
  } else if (response.body !== undefined) {
    body = response.body;
  }

  res.writeHead(status, headers);
  res.end(body);
}
