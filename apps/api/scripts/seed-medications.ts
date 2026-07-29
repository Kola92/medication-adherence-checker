import fs from 'fs';
import path from 'path';
import { pool } from '../src/db';

interface DrugListEntry {
  name: string;
  category: string;
}

interface OpenFdaResult {
  effective_time?: string;
  drug_interactions?: string[];
  generic_name?: string[];
  openfda?: {
    generic_name?: string[];
  };
}

interface OpenFdaResponse {
  results?: OpenFdaResult[];
}

const OPENFDA_BASE = 'https://api.fda.gov/drug/label.json';

async function fetchDrugLabel(drugName: string): Promise<OpenFdaResult | null> {
  const url = `${OPENFDA_BASE}?search=openfda.generic_name:"${encodeURIComponent(drugName)}"&limit=10`;

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`openFDA request failed for ${drugName}: ${response.status}`);
  }

  const data = (await response.json()) as OpenFdaResponse;

  if (!data.results || data.results.length === 0) {
    return null;
  }

  const sorted = data.results
    .filter((r) => r.effective_time)
    .sort((a, b) => (b.effective_time! > a.effective_time! ? 1 : -1));

  return sorted[0] || data.results[0];
}

async function seedMedications() {
  const drugListPath = path.resolve(__dirname, 'drug-list.json');
  const drugList: DrugListEntry[] = JSON.parse(fs.readFileSync(drugListPath, 'utf-8'));

  const succeeded: string[] = [];
  const missed: string[] = [];

  for (const drug of drugList) {
    console.log(`Fetching: ${drug.name}...`);

    try {
      const result = await fetchDrugLabel(drug.name);

      if (!result) {
        console.warn(`  MISS: no openFDA results for "${drug.name}"`);
        missed.push(drug.name);
        continue;
      }

      const interactionNotes = result.drug_interactions
        ? result.drug_interactions.join(' ')
        : null;

      const sourceUrl = `${OPENFDA_BASE}?search=openfda.generic_name:"${encodeURIComponent(drug.name)}"`;
      const fetchedAt = new Date();

      await pool.query(
        `INSERT INTO medications (name, category, interaction_notes, source_url, fetched_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [drug.name, drug.category, interactionNotes, sourceUrl, fetchedAt]
      );

      console.log(`  OK (interaction_notes: ${interactionNotes ? interactionNotes.length + ' chars' : 'NONE'})`);
      succeeded.push(drug.name);
    } catch (err) {
      console.error(`  ERROR fetching "${drug.name}":`, err);
      missed.push(drug.name);
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  console.log('\n--- Seed complete ---');
  console.log(`Succeeded: ${succeeded.length}/${drugList.length}`);
  console.log(`Missed: ${missed.length}`);
  if (missed.length > 0) {
    console.log('Missed drugs (no openFDA match):', missed.join(', '));
  }

  await pool.end();
}

seedMedications().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
