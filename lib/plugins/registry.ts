import type { AnalysisPluginManifest } from './types';

export const analysisPlugins = [
  {
    id: 'highlight-reels',
    label: 'Highlight Reels',
    description: 'Legacy topics, themes, candidate pool, and highlight cards.',
    requires: ['metadata', 'transcript'],
    enabledByDefault: false,
    mvpStatus: 'optional',
    existingFiles: [
      'lib/plugins/highlight-reels/index.ts',
      'lib/ai-processing.ts',
      'app/api/generate-topics/route.ts',
      'app/api/video-analysis/route.ts',
      'components/highlights-panel.tsx',
      'components/topic-card.tsx',
      'components/theme-selector.tsx',
    ],
  },
  {
    id: 'summary',
    label: 'Summary',
    description: 'Transcript-grounded video summary panel and API.',
    requires: ['metadata', 'transcript'],
    enabledByDefault: false,
    mvpStatus: 'optional',
    existingFiles: [
      'app/api/generate-summary/route.ts',
      'components/summary-viewer.tsx',
    ],
  },
  {
    id: 'chat',
    label: 'Chat',
    description: 'Transcript-grounded chat with timestamp citations.',
    requires: ['transcript'],
    enabledByDefault: false,
    mvpStatus: 'optional',
    existingFiles: [
      'app/api/chat/route.ts',
      'components/ai-chat.tsx',
      'components/chat-message.tsx',
      'components/suggested-questions.tsx',
    ],
  },
  {
    id: 'notes',
    label: 'Notes',
    description: 'User notes from transcript selections, chat, and custom text.',
    requires: ['transcript', 'currentUser', 'storage'],
    enabledByDefault: false,
    mvpStatus: 'deferred',
    existingFiles: [
      'app/api/notes/route.ts',
      'app/api/notes/all/route.ts',
      'components/notes-panel.tsx',
      'components/note-editor.tsx',
      'components/selection-actions.tsx',
    ],
  },
  {
    id: 'translation',
    label: 'Translation',
    description: 'Transcript, topic, chat, and general translation flows.',
    requires: ['transcript'],
    enabledByDefault: false,
    mvpStatus: 'deferred',
    existingFiles: [
      'app/api/translate/route.ts',
      'lib/translation/client.ts',
      'lib/translation/llm-translate-client.ts',
      'lib/hooks/use-translation.ts',
    ],
  },
  {
    id: 'top-quotes',
    label: 'Top Quotes',
    description: 'High-impact direct quote extraction from transcript.',
    requires: ['metadata', 'transcript'],
    enabledByDefault: false,
    mvpStatus: 'deferred',
    existingFiles: ['app/api/top-quotes/route.ts'],
  },
  {
    id: 'image',
    label: 'Image Generation',
    description: 'Gemini-backed social image and infographic generation.',
    requires: ['metadata', 'transcript', 'currentUser'],
    enabledByDefault: false,
    mvpStatus: 'deferred',
    existingFiles: [
      'app/api/generate-image/route.ts',
      'components/image-cheatsheet-card.tsx',
      'lib/image-generation-manager.ts',
    ],
  },
  {
    id: 'export',
    label: 'Export',
    description: 'Transcript export as text, SRT, CSV, and related formats.',
    requires: ['transcript'],
    enabledByDefault: false,
    mvpStatus: 'deferred',
    existingFiles: [
      'lib/transcript-export.ts',
      'lib/hooks/use-transcript-export.ts',
      'components/transcript-export-dialog.tsx',
      'components/transcript-export-upsell.tsx',
    ],
  },
  {
    id: 'library',
    label: 'Library',
    description: 'Saved videos, favorites, public pages, and user library browsing.',
    requires: ['storage', 'currentUser'],
    enabledByDefault: false,
    mvpStatus: 'deferred',
    existingFiles: [
      'app/my-videos/page.tsx',
      'app/my-videos/video-grid.tsx',
      'app/api/toggle-favorite/route.ts',
      'app/v/[slug]/page.tsx',
    ],
  },
] satisfies AnalysisPluginManifest[];

export type AnalysisPluginId = (typeof analysisPlugins)[number]['id'];

export function getAnalysisPlugin(id: string): AnalysisPluginManifest | undefined {
  return analysisPlugins.find((plugin) => plugin.id === id);
}
