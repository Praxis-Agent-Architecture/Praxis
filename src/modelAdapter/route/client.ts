import { Effect } from "effect";
import { randomUUID } from "node:crypto";
import { decodeServerSentEventChunk } from "./framing.js";
import { filterNativeOptions, joinEndpointUrl, type RaxEndpointTemplate } from "./endpoint.js";
import { resolveRaxAuth } from "./auth.js";
import { createFetchTransport, runEffect, type RaxTransport } from "./transport.js";
import {
  foldRaxModelEvents,
  raxModelError,
  type RaxModelError,
  type RaxModelEvent,
  type RaxModelRequest,
  type RaxModelResponse,
  type RaxPreparedModelRequest,
} from "../schema/index.js";
import type { RaxModelProtocol } from "./protocol.js";

export type RaxModelRoute = {
  id: string;
  providerId: string;
  protocol: RaxModelProtocol;
  endpoint: RaxEndpointTemplate;
  transport?: RaxTransport;
};

export type RaxModelClient = {
  registerRoute: (route: RaxModelRoute) => void;
  getRoute: (id: string) => RaxModelRoute | undefined;
  prepare: (request: RaxModelRequest) => Promise<RaxPreparedModelRequest>;
  stream: (request: RaxModelRequest) => AsyncIterable<RaxModelEvent>;
  generate: (request: RaxModelRequest) => Promise<RaxModelResponse>;
};

export function createRaxModelClient(initialRoutes: RaxModelRoute[] = []): RaxModelClient {
  const routes = new Map(initialRoutes.map((route) => [route.id, route]));

  function resolveRoute(request: RaxModelRequest): RaxModelRoute {
    const routeId = request.model.route ?? `${request.model.provider}:${request.model.model}`;
    const route = routes.get(routeId) ?? routes.get(String(request.model.provider));
    if (!route) throw raxModelError("route_not_found", `No model route registered for ${routeId}`, { routeId });
    return route;
  }

  async function prepare(request: RaxModelRequest): Promise<RaxPreparedModelRequest> {
    const route = resolveRoute(request);
    const requestId = request.id ?? randomUUID();
    const protocolResult = await runEffect(
      route.protocol.prepare(request, {
        requestId,
        routeId: route.id,
        protocolId: route.protocol.id,
        providerId: route.providerId,
        modelId: String(request.model.model),
      }),
    );
    const filteredNative = filterNativeOptions(request.providerOptions?.native, route.endpoint.allowedNativeOptions);
    const body = { ...(protocolResult.body as Record<string, unknown>), ...filteredNative };
    const auth = await runEffect(resolveRaxAuth(request.model.auth));
    const url = joinEndpointUrl(route.endpoint, request.model.baseUrl, request.providerOptions?.query, {
      model: String(request.model.model),
    });
    const headers = {
      "content-type": "application/json",
      accept: "text/event-stream, application/json",
      ...route.endpoint.defaultHeaders,
      ...request.providerOptions?.headers,
      ...auth.headers,
    };
    const redactedHeaders = {
      "content-type": "application/json",
      accept: "text/event-stream, application/json",
      ...route.endpoint.defaultHeaders,
      ...request.providerOptions?.headers,
      ...auth.redactedHeaders,
    };

    return {
      id: requestId,
      routeId: route.id,
      protocolId: route.protocol.id,
      url,
      method: "POST",
      headers,
      body,
      redacted: { url, method: "POST", headers: redactedHeaders, body },
      metadata: protocolResult.metadata ?? {},
    };
  }

  async function* stream(request: RaxModelRequest): AsyncIterable<RaxModelEvent> {
    const route = resolveRoute(request);
    const prepared = await prepare(request);
    let state = route.protocol.initialState(prepared);
    yield {
      type: "response.start",
      id: prepared.id,
      provider: route.providerId,
      model: String(request.model.model),
      routeId: route.id,
      protocolId: route.protocol.id,
      createdAt: new Date().toISOString(),
    };
    const transport = route.transport ?? createFetchTransport();
    try {
      for await (const frame of transport.send(prepared, decodeServerSentEventChunk)) {
        const decoded = await runEffect(route.protocol.decodeFrame(frame, state, prepared));
        state = decoded.state;
        for (const event of decoded.events) yield event;
      }
      if (route.protocol.finalize) {
        for (const event of await runEffect(route.protocol.finalize(state, prepared))) yield event;
      }
    } catch (error) {
      const modelError = error instanceof Error && error.name === "RaxModelError"
        ? (error as RaxModelError)
        : raxModelError("transport_error", "Model transport failed", {}, error);
      yield { type: "error", id: prepared.id, code: modelError.code, message: modelError.message, raw: modelError.details };
      throw modelError;
    }
  }

  async function generate(request: RaxModelRequest): Promise<RaxModelResponse> {
    const events: RaxModelEvent[] = [];
    for await (const event of stream(request)) events.push(event);
    return foldRaxModelEvents(events);
  }

  return {
    registerRoute(route) {
      routes.set(route.id, route);
    },
    getRoute(id) {
      return routes.get(id);
    },
    prepare,
    stream,
    generate,
  };
}

export const defaultRaxModelClient = createRaxModelClient();
