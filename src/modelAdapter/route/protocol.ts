import { Effect } from "effect";
import type { RaxModelError, RaxModelEvent, RaxModelRequest, RaxPreparedModelRequest, RaxProtocolId } from "../schema/index.js";

export type RaxProtocolPrepareContext = {
  requestId: string;
  routeId: string;
  protocolId: RaxProtocolId;
  providerId: string;
  modelId: string;
};

export type RaxProtocolStreamState = Record<string, unknown>;

export type RaxProtocolPrepareResult = {
  body: unknown;
  metadata?: Record<string, unknown>;
};

export type RaxProtocolDecodeResult = {
  events: RaxModelEvent[];
  state: RaxProtocolStreamState;
};

export type RaxModelProtocol = {
  id: RaxProtocolId;
  prepare: (
    request: RaxModelRequest,
    context: RaxProtocolPrepareContext,
  ) => Effect.Effect<RaxProtocolPrepareResult, RaxModelError>;
  initialState: (prepared: RaxPreparedModelRequest) => RaxProtocolStreamState;
  decodeFrame: (
    frame: unknown,
    state: RaxProtocolStreamState,
    prepared: RaxPreparedModelRequest,
  ) => Effect.Effect<RaxProtocolDecodeResult, RaxModelError>;
  finalize?: (
    state: RaxProtocolStreamState,
    prepared: RaxPreparedModelRequest,
  ) => Effect.Effect<RaxModelEvent[], RaxModelError>;
};

