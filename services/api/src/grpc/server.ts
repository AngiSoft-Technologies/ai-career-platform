import { resolve } from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { calculateMatch } from "../services/matching.js";
import { query } from "../db/pool.js";
import { logger } from "../logger.js";

interface MatchRequest {
  profile_id: string;
  opportunity_id: string;
}

interface MatchResponse {
  opportunity_id: string;
  score: number;
  explanation: string;
  gaps: string[];
  factors: Record<string, number>;
}

const protoPath =
  process.env.MATCHING_PROTO_PATH ??
  resolve(process.cwd(), "../../packages/contracts/proto/matching.proto");

const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const loaded = grpc.loadPackageDefinition(packageDefinition) as unknown as {
  jobradar: {
    matching: {
      v1: {
        MatchingService: grpc.ServiceClientConstructor;
      };
    };
  };
};

const MatchingService = loaded.jobradar.matching.v1.MatchingService;

export interface GrpcHandle {
  port: number;
  stop: () => Promise<void>;
}

export async function startGrpcServer(): Promise<GrpcHandle> {
  const server = new grpc.Server();

  server.addService(MatchingService.service, {
    calculateMatch: async (
      call: grpc.ServerUnaryCall<MatchRequest, MatchResponse>,
      callback: grpc.sendUnaryData<MatchResponse>,
    ): Promise<void> => {
      try {
        const profile = await query<{ user_id: string }>(
          "SELECT user_id FROM candidate_profiles WHERE id = $1",
          [call.request.profile_id],
        );
        const userId = profile.rows[0]?.user_id;
        if (!userId) {
          callback({
            code: grpc.status.NOT_FOUND,
            message: "Profile not found",
          });
          return;
        }

        const result = await calculateMatch(
          userId,
          call.request.opportunity_id,
        );

        callback(null, {
          opportunity_id: result.opportunityId,
          score: result.score,
          explanation: result.explanation,
          gaps: result.gaps,
          factors: result.factors as unknown as Record<string, number>,
        });
      } catch (error) {
        callback({
          code: grpc.status.INTERNAL,
          message: error instanceof Error ? error.message : "Matching failed",
        });
      }
    },
  });

  const port = Number(process.env.GRPC_PORT ?? 50051);
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (error) => {
        if (error) {
          rejectPromise(error);
          return;
        }
        resolvePromise();
      },
    );
  });

  logger.info({ port }, "Matching gRPC server listening");

  return {
    port,
    stop: () =>
      new Promise<void>((resolvePromise) => {
        server.tryShutdown(() => resolvePromise());
      }),
  };
}
