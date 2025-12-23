export enum ProjectType {
  NodeJS = 'nodejs',
  Python = 'python',
  Rust = 'rust',
  Go = 'go',
  PHP = 'php',
  Java = 'java',
  Unknown = 'unknown',
}

export enum TrackingType {
  ProjectPlan = 'project_plan',
  Epics = 'epics',
  Claude = 'claude',
  Todo = 'todo',
  Custom = 'custom',
}

export interface ProjectDirectory {
  name: string
  path: string
  type: ProjectType
  languages: string[]
  hasGit: boolean
  files: string[]
  lastModified: Date
  tag?: string
}

export interface ProjectStatus {
  type: 'phase' | 'stable' | 'active' | 'archived' | 'unknown'
  details: string
  confidence: number
}

export interface TrackingFile {
  path: string
  type: TrackingType
  content: TrackingInfo
  lastModified: Date
}

export interface TrackingInfo {
  phases?: PhaseInfo
  version?: string
  todos?: number
  description?: string
}

export interface PhaseInfo {
  current: number
  total: number
  name?: string
}

export interface GitHeadInfo {
  sha: string
  author: string
  subject: string
  committedAt: number
}

export interface GitBranchSummary {
  name: string
  lastCommitSha: string
  lastCommitDate: number
}

export interface GitStaleBranchInfo {
  total: number
  sample: string[]
  thresholdDays: number
}

export interface GitInsights {
  currentBranch: string
  head: GitHeadInfo
  commitsInWindow: {
    windowDays: number
    count: number
  }
  commitsInShortWindow: {
    windowDays: number
    count: number
  }
  ahead?: number
  behind?: number
  branchSummaries: GitBranchSummary[]
  staleBranches: GitStaleBranchInfo
  collectedAt: number
}

export interface AnalyzedProject extends ProjectDirectory {
  status: ProjectStatus
  description: string
  trackingFiles: TrackingFile[]
  confidence: number
  git?: GitInsights
  tag?: string
}

export interface ScanOptions {
  maxDepth: number
  ignorePatterns: string[]
  followSymlinks: boolean
}

export interface TrackingPattern {
  pattern: string
  type: TrackingType
}

export interface GitInsightsConfig {
  enabled: boolean
  activityWindowDays: number
  shortWindowDays: number
  staleBranchThresholdDays: number
  maxBranches: number
  cacheTtlHours: number
}

export interface ProjectsConfig {
  scanDirectory: string
  maxDepth: number
  trackingPatterns: TrackingPattern[]
  descriptions: Record<string, string>
  ignorePatterns: string[]
  codeFileExtensions: string[]
  // Interactive defaults and shell integration
  defaultInteractive?: boolean
  defaultEditor?: string
  cdSentinel?: string
  // When true, treat any directory containing a package.json as a Node project root
  // and do not descend into its subdirectories during discovery.
  stopAtNodePackageRoot?: boolean
  // Comprehensive root detection configuration
  rootMarkers?: string[]
  monorepoMarkers?: string[]
  lockfilesAsStrong?: boolean
  minCodeFilesToConsider?: number
  stopAtVcsRoot?: boolean
  includeNestedPackages?: 'never' | 'when-monorepo' | 'always'
  respectGitIgnore?: boolean
  denylistPaths?: string[]
  templatesDir?: string
  templates?: TemplateDefinition[]
  colorScheme: ColorScheme
  gitInsights?: GitInsightsConfig
  tags: TagConfig
  ignore?: IgnoreConfig
}

export interface IgnoreConfig {
  // Glob patterns to match project paths or names
  patterns?: string[]
  // Directory basenames to ignore
  directories?: string[]
}

export interface ColorScheme {
  header: string
  phaseStatus: string
  stableStatus: string
  unknownStatus: string
  projectName: string
}

export interface TagColor {
  foreground: string
  background: string
}

export interface TagConfig {
  enabled: boolean
  style: 'badge' | 'inline' | 'suffix'
  maxLength: number
  colorPalette: TagColor[]
}

export interface TemplateDefinition {
  id: string
  name: string
  description?: string
  tags?: string[]
  source: TemplateSource
  variables?: TemplateVariable[]
  postCommands?: string[]
  initGit?: boolean
}

export type TemplateSource =
  | { type: 'builtin'; builtinId: string }
  | { type: 'directory'; path: string }

export interface TemplateVariable {
  key: string
  prompt: string
  default?: string
  required?: boolean
}

export interface CachedGitInsights {
  headSha: string
  branchFingerprint: string
  expiresAt: number
  insights: GitInsights
}
