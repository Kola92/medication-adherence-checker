import { pool } from '../src/db';

async function seedGliclazide() {
  await pool.query(
    `INSERT INTO medications (name, category, interaction_notes, source_url, fetched_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      'gliclazide',
      'Type 2 Diabetes',
      'Gliclazide is not FDA-approved in the United States and has no openFDA label record. Per UK/EU regulatory labeling: gliclazide (a sulfonylurea) has clinically significant interactions with other drugs affecting blood glucose, including increased hypoglycemia risk when combined with other antidiabetic agents, alcohol, NSAIDs, or beta-blockers (which may also mask hypoglycemia symptoms). Concomitant use with miconazole is contraindicated due to severe hypoglycemia risk. This entry is manually curated from a non-US regulatory source, not openFDA — see source_url.',
      'https://www.medicines.org.uk/emc (Gliclazide, UK Electronic Medicines Compendium — manually reviewed, not an automated openFDA pull)',
      new Date()
    ]
  );
  console.log('gliclazide inserted');
  await pool.end();
}

seedGliclazide().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
