import { z } from 'zod';

const metadataSchema = z.record(z.unknown());

const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rootPath: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

const projectSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

const messageSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().min(1),
  metadata: metadataSchema,
  createdAt: z.string().min(1)
});

const artifactSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  uri: z.string().min(1),
  metadata: metadataSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

const exportedSessionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  messages: z.array(messageSchema),
  artifacts: z.array(artifactSchema)
});

export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  workspaceId: z.string().min(1).optional()
});

export const createSessionSchema = z.object({
  title: z.string().min(1),
  status: z.string().min(1).optional()
});

export const addMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().min(1),
  metadata: metadataSchema.optional()
});

export const addArtifactSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  uri: z.string().min(1),
  metadata: metadataSchema.optional()
});

export const searchSchema = z.object({
  query: z.string().min(1),
  projectId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  kind: z.enum(['project', 'session', 'message', 'artifact']).optional(),
  createdAtFrom: z.string().min(1).optional(),
  createdAtTo: z.string().min(1).optional()
});

export const importProjectSchema = z.object({
  workspace: workspaceSchema,
  project: projectSchema,
  sessions: z.array(exportedSessionSchema)
});
