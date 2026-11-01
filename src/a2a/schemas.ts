import { z } from "zod";

export const TextPartSchema = z.object({
  kind: z.literal("text"),
  text: z.string()
});

export const DataPartSchema = z.object({
  kind: z.literal("data"),
  data: z.record(z.string(), z.unknown())
});

export const PartSchema = z.discriminatedUnion("kind", [TextPartSchema, DataPartSchema]);
export type Part = z.infer<typeof PartSchema>;

export const MessageSchema = z.object({
  kind: z.literal("message"),
  role: z.enum(["user", "agent"]),
  messageId: z.string().min(1),
  parts: z.array(PartSchema),
  taskId: z.string().min(1).optional(),
  contextId: z.string().min(1).optional()
});
export type Message = z.infer<typeof MessageSchema>;

export const TaskStateSchema = z.enum([
  "submitted",
  "working",
  "input-required",
  "completed",
  "failed",
  "canceled"
]);
export type TaskState = z.infer<typeof TaskStateSchema>;

export const TaskStatusSchema = z.object({
  state: TaskStateSchema,
  message: MessageSchema.optional(),
  timestamp: z.string().min(1)
});

export const ArtifactSchema = z.object({
  artifactId: z.string().min(1),
  name: z.string().min(1).optional(),
  parts: z.array(PartSchema)
});

export const TaskSchema = z.object({
  kind: z.literal("task"),
  id: z.string().min(1),
  contextId: z.string().min(1),
  status: TaskStatusSchema,
  artifacts: z.array(ArtifactSchema).optional(),
  history: z.array(MessageSchema).optional()
});
export type Task = z.infer<typeof TaskSchema>;

export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]),
  method: z.string().min(1),
  params: z.unknown()
});
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;

export const JsonRpcErrorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.unknown().optional()
});

export const JsonRpcResponseSchema = z.union([
  z.object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number(), z.null()]),
    result: z.unknown()
  }),
  z.object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number(), z.null()]),
    error: JsonRpcErrorSchema
  })
]);
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;

export const AgentCardSchema = z.object({
  protocolVersion: z.literal("0.3.0"),
  name: z.string().min(1),
  description: z.string(),
  url: z.string().url(),
  preferredTransport: z.literal("JSONRPC"),
  version: z.string().min(1),
  capabilities: z.object({
    streaming: z.literal(false),
    pushNotifications: z.literal(false)
  }),
  defaultInputModes: z.tuple([z.literal("application/json"), z.literal("text/plain")]),
  defaultOutputModes: z.tuple([z.literal("application/json")]),
  skills: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    tags: z.array(z.string())
  }))
});
export type AgentCard = z.infer<typeof AgentCardSchema>;

export const MessageSendParamsSchema = z.object({
  message: MessageSchema
});
export type MessageSendParams = z.infer<typeof MessageSendParamsSchema>;

export const JsonRpcErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  TaskNotFound: -32001
} as const;