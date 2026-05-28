export type Workspace = {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type Artifact = {
  id: string;
  sessionId: string;
  name: string;
  type: string;
  uri: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type SearchHit = {
  entity: 'project' | 'session' | 'message' | 'artifact';
  id: string;
  projectId?: string;
  sessionId?: string;
  title: string;
  snippet: string;
  highlight: string;
  createdAt: string;
};

export type SearchFilters = {
  projectId?: string;
  sessionId?: string;
  kind?: SearchHit['entity'];
  createdAtFrom?: string;
  createdAtTo?: string;
};

export type ExportedSession = Session & {
  messages: Message[];
  artifacts: Artifact[];
};

export type ExportedProject = {
  workspace: Workspace;
  project: Project;
  sessions: ExportedSession[];
};
