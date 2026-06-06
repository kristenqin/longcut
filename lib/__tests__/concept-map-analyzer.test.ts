import test from 'node:test';
import assert from 'node:assert/strict';

import { generateConceptMapFromTranscript } from '../concept-map';
import { createTranscriptResult } from '../platform';

test('Concept Map analyzer anchors evidence and preserves relations after id normalization', async () => {
  const transcript = createTranscriptResult(
    [
      {
        text: 'Gravity starts from mass and motion.',
        start: 0,
        duration: 8,
      },
      {
        text: 'Mass curves spacetime and changes how objects move.',
        start: 8,
        duration: 12,
      },
    ],
    {
      idPrefix: 'youtube-abc123xyz89',
      language: 'en',
      source: 'manual',
      expectedDuration: 20,
    }
  );

  const analysis = await generateConceptMapFromTranscript({
    videoRef: {
      platform: 'youtube',
      platformVideoId: 'abc123xyz89',
      canonicalUrl: 'https://www.youtube.com/watch?v=abc123xyz89',
    },
    transcript,
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    generateAI: async (prompt, options) => {
      assert.match(prompt, /concept map/i);
      assert.ok(options);
      assert.equal(options.provider, 'deepseek');
      assert.equal(options.preferredModel, 'deepseek-v4-flash');

      return {
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        content: JSON.stringify({
          thesis: 'Gravity can be explained from mass, motion, and spacetime.',
          centralQuestion: 'Why do objects move as if gravity pulls them?',
          concepts: [
            {
              id: 'First Principle: Gravity',
              label: 'Gravity',
              role: 'first_principle',
              definition: 'Gravity begins from mass and motion.',
              importance: 0.95,
              evidence: [
                {
                  transcriptSegmentIds: ['youtube-abc123xyz89-0'],
                  quote: 'Gravity starts from mass and motion.',
                  reason: 'This segment states the first-principles premise.',
                  confidence: 0.9,
                },
              ],
            },
            {
              id: 'spacetime consequence',
              label: 'Spacetime curvature',
              role: 'derived_concept',
              definition: 'Mass changes spacetime, which changes motion.',
              importance: 0.8,
              evidence: [
                {
                  quote: 'Mass curves spacetime and changes how objects move.',
                  reason: 'This segment grounds the derived concept.',
                  confidence: 0.8,
                },
              ],
            },
          ],
          relations: [
            {
              id: 'gravity-to-curvature',
              fromConceptId: 'First Principle: Gravity',
              toConceptId: 'spacetime consequence',
              relationType: 'leads_to',
              description: 'The first-principles premise leads to spacetime curvature.',
              confidence: 0.86,
              evidence: [
                {
                  quote: 'Mass curves spacetime and changes how objects move.',
                  reason: 'The transcript connects mass to motion through spacetime.',
                  confidence: 0.8,
                },
              ],
            },
          ],
          warnings: [],
        }),
      };
    },
  });

  assert.equal(analysis.concepts[0].id, 'first-principle-gravity');
  assert.equal(analysis.concepts[0].evidence[0].start, 0);
  assert.equal(analysis.concepts[1].id, 'spacetime-consequence');
  assert.equal(analysis.concepts[1].evidence[0].start, 8);
  assert.equal(analysis.relations.length, 1);
  assert.equal(analysis.relations[0].fromConceptId, 'first-principle-gravity');
  assert.equal(analysis.relations[0].toConceptId, 'spacetime-consequence');
  assert.equal(analysis.relations[0].evidence[0].start, 8);
});
