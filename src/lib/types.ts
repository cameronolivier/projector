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

export interface AnalyzedProject extends ProjectDirectory {
  status: ProjectStatus
  description: string
  trackingFiles: TrackingFile[]
  confidence: number
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

export interface ProjectsConfig {
  scanDirectory: string
  maxDepth: number
  trackingPatterns: TrackingPattern[]
  descriptions: Record<string, string>
  ignorePatterns: string[]
  codeFileExtensions: string[]
  // When true, treat any directory containing a package.json as a Node project root
  // and do not descend into its subdirectories during discovery.
  stopAtNodePackageRoot?: boolean
  colorScheme: ColorScheme
}

export interface ColorScheme {
  header: string
  phaseStatus: string
  stableStatus: string
  unknownStatus: string
  projectName: string
}
