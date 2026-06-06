export type PluginRequirement =
  | 'metadata'
  | 'transcript'
  | 'conceptMap'
  | 'player'
  | 'currentUser'
  | 'storage';

export type PluginMvpStatus = 'available' | 'optional' | 'deferred';

export interface AnalysisPluginManifest {
  id: string;
  label: string;
  description: string;
  requires: PluginRequirement[];
  enabledByDefault: boolean;
  mvpStatus: PluginMvpStatus;
  existingFiles: string[];
}
